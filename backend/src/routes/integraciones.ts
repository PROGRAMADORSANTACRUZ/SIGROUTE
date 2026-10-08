import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { env } from "../config/env";
import { prismaPlan as prisma } from "../lib/prisma";
import { CANASTILLA_KG, CATEGORIAS, INSTANCIA } from "../lib/planCategorias";
import { calcularFlete } from "../lib/fletes";

const router = Router();
const redondearKg = (kg: number) => Math.round((kg + Number.EPSILON) * 100) / 100;

function fechaHoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function fechaDate(fecha: string): Date {
  const [year, month, day] = fecha.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function tokenValido(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function filasPorTipo(detalle: Record<string, unknown>) {
  const mapeo = [
    { columna: "klsBovino", canastillas: "canastillasBovino", tipo: "bovino", categoria: "bovino" },
    { columna: "klsVisceraBovino", canastillas: "canastillasVisceraBovino", tipo: "bovino", categoria: "viscera_bovino" },
    { columna: "klsPorcino", canastillas: "canastillasPorcino", tipo: "porcino", categoria: "porcino" },
    { columna: "klsVisceraPorcino", canastillas: "canastillasVisceraPorcino", tipo: "porcino", categoria: "viscera_porcino" },
    { columna: "klsInversion", canastillas: "canastillasInversion", tipo: "embutido", categoria: "inversiones" },
    { columna: "klsTat", canastillas: "canastillasTat", tipo: "tat", categoria: "tat" },
    { columna: "klsOtros", canastillas: "canastillasOtros", tipo: "otros", categoria: "otros" },
  ];

  return mapeo.flatMap((m) => {
    const kilosProgramados = Number(detalle[m.columna] ?? 0);
    const canastillas = Number(detalle[m.canastillas] ?? 0);
    if (kilosProgramados <= 0 && canastillas <= 0) return [];
    const kilosCanastillas = redondearKg(canastillas * CANASTILLA_KG);
    return [{
      tipo: m.tipo,
      categoriaPlanificacion: m.categoria,
      kilosProgramados,
      canastillas,
      kilosCanastillas,
      kilosTotales: redondearKg(kilosProgramados + kilosCanastillas),
    }];
  });
}

router.get("/control-carga/planificacion", async (req, res, next) => {
  try {
    const tokenEsperado = env.PLANIFICACION_CONTROL_CARGA_TOKEN;
    if (!tokenEsperado) return res.status(503).json({ error: "Integración no configurada" });

    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!tokenValido(token, tokenEsperado)) return res.status(401).json({ error: "No autorizado" });

    const fecha = typeof req.query.fecha === "string" ? req.query.fecha : fechaHoyBogota();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ error: "fecha debe tener formato YYYY-MM-DD" });
    }
    if (fechaDate(fecha).toISOString().slice(0, 10) !== fecha) {
      return res.status(400).json({ error: "fecha no es un dia valido" });
    }

    const programacion = await prisma.programacion.findUnique({
      where: { instancia_fecha: { instancia: INSTANCIA, fecha: fechaDate(fecha) } },
      select: { id: true, fecha: true, consecutivo: true, estado: true, updatedAt: true },
    });
    if (!programacion) return res.status(404).json({ error: "No existe planificación para la fecha solicitada", fecha });

    const [rutasDb, detallesDb] = await Promise.all([
      prisma.planRuta.findMany({
        where: { progId: programacion.id },
        include: { vehiculo: true, conductor: true, destinos: { orderBy: { orden: "asc" } } },
        orderBy: { numeroRuta: "asc" },
      }),
      prisma.progDetalle.findMany({ where: { progId: programacion.id, clienteId: { not: null } } }),
    ]);

    const clienteIds = [...new Set([
      ...detallesDb.map((d) => d.clienteId).filter((id): id is string => !!id),
      ...rutasDb.flatMap((r) => r.destinos.map((d) => d.clienteId).filter((id): id is string => !!id)),
    ])];
    const [clientes, estadosAreas] = await Promise.all([
      clienteIds.length ? prisma.cliente.findMany({
        where: { id: { in: clienteIds } },
        select: { id: true, codigoDireccion: true, cliente: true, nombreDireccion: true, direccion: true, comuna: true, provincia: true },
      }) : Promise.resolve([]),
      prisma.areaEstado.findMany({ where: { progId: programacion.id }, select: { area: true, cerrado: true, cerradoAt: true } }),
    ]);

    const clientePorId = new Map(clientes.map((c) => [c.id, c]));
    const detallePorCliente = new Map(detallesDb.map((d) => [d.clienteId as string, d as unknown as Record<string, unknown>]));
    const destino = (clienteId: string | null) => {
      if (!clienteId) return null;
      const cliente = clientePorId.get(clienteId);
      const detalle = detallePorCliente.get(clienteId);
      return {
        clienteId,
        codigoCliente: cliente?.codigoDireccion ?? null,
        cliente: cliente?.cliente || cliente?.nombreDireccion || null,
        destino: cliente?.nombreDireccion || cliente?.cliente || null,
        direccion: cliente?.direccion ?? null,
        ciudad: cliente?.comuna || cliente?.provincia || null,
        cargas: filasPorTipo(detalle ?? {}),
      };
    };

    const rutas = rutasDb.map((ruta) => {
      const capacidadKg = Number(ruta.vehiculo?.capacidadKg ?? 0) || null;
      const destinos = ruta.destinos.map((d) => ({ orden: d.orden, ...destino(d.clienteId) }));
      return {
        rutaId: ruta.id,
        numeroRuta: ruta.numeroRuta,
        nombreRuta: ruta.ruta,
        vehiculoId: ruta.vehiculoId,
        placa: ruta.vehiculo?.placa ?? null,
        capacidadKg,
        conductorId: ruta.conductorId,
        conductor: ruta.conductor?.nombre ?? null,
        horaCargue: ruta.horaCargue,
        valorFlete: ruta.ruta && capacidadKg ? calcularFlete(ruta.ruta, capacidadKg) : null,
        kilosTotales: redondearKg(destinos.reduce((total, d) => total + (d?.cargas ?? []).reduce((s, c) => s + c.kilosTotales, 0), 0)),
        destinos,
      };
    });

    const clienteEnRuta = new Set(rutasDb.flatMap((r) => r.destinos.map((d) => d.clienteId).filter((id): id is string => !!id)));
    const destinosSinRuta = detallesDb
      .filter((d) => d.clienteId && !clienteEnRuta.has(d.clienteId))
      .map((d) => destino(d.clienteId));

    const categoriasConDato = new Set(CATEGORIAS.filter((categoria) =>
      detallesDb.some((d) => {
        const fila = d as unknown as Record<string, unknown>;
        return Number(fila[categoria.kls] ?? 0) > 0 || Number(fila[categoria.can] ?? 0) > 0;
      })
    ).map((c) => c.etiqueta));

    res.set("Cache-Control", "no-store");
    res.json({
      sistema: "SIGROUTE",
      version: 1,
      actualizadoEn: new Date().toISOString(),
      planificacion: {
        fecha,
        consecutivo: programacion.consecutivo,
        estado: programacion.estado,
        actualizadaEn: programacion.updatedAt,
        rutas,
        destinosSinRuta,
        areas: estadosAreas.map((a) => ({ area: a.area, cerrada: !!a.cerrado, cerradaEn: a.cerradoAt })),
        categoriasConDato: [...categoriasConDato],
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;