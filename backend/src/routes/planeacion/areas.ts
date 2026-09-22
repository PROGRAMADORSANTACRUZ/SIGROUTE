// Áreas para Cargar — puerto de legacy_fastapi/app/repos/cargar.py +
// routers/areas.py. Rutas CERRADAS (en Preasignación) listas para cargar;
// estado por (ruta, área) en `ruta_area_carga`.
import { Router } from "express";
import { z } from "zod";
import { prismaPlan as prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import { areasPermitidas } from "../../lib/authSession";
import { CATEGORIAS, INSTANCIA } from "../../lib/planCategorias";
import { log as auditLog } from "../../lib/auditoria";

const router = Router();
router.use(requireAuth, requirePermiso("areas.ver"));

const ESTADOS = ["PENDIENTE", "PROCESO", "CARGADA"] as const;

function parseFecha(s: unknown): Date {
  const d = typeof s === "string" && s ? new Date(s) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function sumaDetalle(d: Record<string, unknown>, cols: string[]): number {
  return cols.reduce((acc, c) => acc + Number(d[c] ?? 0), 0);
}
const KLS_ALL = CATEGORIAS.map((c) => c.kls);
const CAN_ALL = CATEGORIAS.map((c) => c.can);

async function areasDeRuta(rutaId: number, progId: number): Promise<string[]> {
  const rutaDestinos = await prisma.planRutaDestino.findMany({ where: { rutaId }, select: { destinoId: true, clienteId: true } });
  const destinoIds = rutaDestinos.map((d) => d.destinoId).filter((x): x is number => x != null);
  const clienteIds = rutaDestinos.map((d) => d.clienteId).filter((x): x is string => x != null);
  if (!destinoIds.length && !clienteIds.length) return [];
  const detalle = await prisma.progDetalle.findMany({
    where: { progId, OR: [{ destinoId: { in: destinoIds } }, { clienteId: { in: clienteIds } }] },
  });
  const areas: string[] = [];
  for (const c of CATEGORIAS) {
    const kls = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0), 0);
    const can = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.can] ?? 0), 0);
    if (kls > 0 || can > 0) areas.push(c.etiqueta);
  }
  return areas;
}

async function syncRutaCargada(rutaId: number, progId: number, usuario: string) {
  const aplicables = await areasDeRuta(rutaId, progId);
  const estados = await prisma.rutaAreaCarga.findMany({ where: { rutaId } });
  const estMap = new Map(estados.map((e) => [e.area, e.estado]));
  const completo = aplicables.length > 0 && aplicables.every((a) => estMap.get(a) === "CARGADA");
  await prisma.planRuta.update({
    where: { id: rutaId },
    data: completo
      ? { cargada: true, cargadaPor: usuario, cargadaAt: new Date() }
      : { cargada: false, cargadaPor: null, cargadaAt: null },
  });
  return completo;
}

// GET /api/planeacion/areas?fecha=
router.get("/", async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha } } });
    if (!prog) return res.json({ prog: null, rutas: [], columnas: [] });

    const rutas = await prisma.planRuta.findMany({
      where: { progId: prog.id, cerrada: true },
      include: { vehiculo: true, conductor: true, destinos: true, areaCarga: true },
      orderBy: { numeroRuta: "asc" },
    });

    const { visibles } = areasPermitidas(req.sessionUser);
    const presentes = new Set<string>();
    const filas = [];
    for (const r of rutas) {
      const destinoIds = r.destinos.map((d) => d.destinoId).filter((x): x is number => x != null);
      const clienteIds = r.destinos.map((d) => d.clienteId).filter((x): x is string => x != null);
      const detalle = destinoIds.length || clienteIds.length
        ? await prisma.progDetalle.findMany({ where: { progId: prog.id, OR: [{ destinoId: { in: destinoIds } }, { clienteId: { in: clienteIds } }] } })
        : [];
      const kls = detalle.reduce((acc, d) => acc + sumaDetalle(d as unknown as Record<string, unknown>, KLS_ALL), 0);
      const can = detalle.reduce((acc, d) => acc + sumaDetalle(d as unknown as Record<string, unknown>, CAN_ALL), 0);

      const celdas: Record<string, string> = {};
      for (const c of CATEGORIAS) {
        const k = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0), 0);
        const cc = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.can] ?? 0), 0);
        if (k > 0 || cc > 0) {
          if (visibles === null || visibles.includes(c.etiqueta)) {
            const est = r.areaCarga.find((a) => a.area === c.etiqueta);
            celdas[c.etiqueta] = est?.estado ?? "PENDIENTE";
            presentes.add(c.etiqueta);
          }
        }
      }

      filas.push({
        id: r.id,
        numeroRuta: r.numeroRuta,
        horaCargue: r.horaCargue,
        cerradaPor: r.cerradaPor,
        vehiculo: r.vehiculo?.placa ?? null,
        conductor: r.conductor?.nombre ?? null,
        cargada: !!r.cargada,
        cargadaPor: r.cargadaPor,
        kls,
        canastillas: can,
        celdas,
      });
    }
    const columnas = CATEGORIAS.map((c) => c.etiqueta).filter((l) => presentes.has(l));
    res.json({ prog: { id: prog.id, fecha: prog.fecha }, rutas: filas, columnas });
  } catch (err) {
    next(err);
  }
});

const estadoSchema = z.object({ area: z.string(), estado: z.enum(ESTADOS) });

// POST /api/planeacion/areas/:rutaId/estado
router.post("/:rutaId/estado", requirePermiso("areas.confirmar_carga"), async (req, res, next) => {
  try {
    const rutaId = Number(req.params.rutaId);
    const { area, estado } = estadoSchema.parse(req.body);
    const { editables } = areasPermitidas(req.sessionUser);
    if (editables !== null && !editables.includes(area)) throw new HttpError(403, "No puedes editar esta área");

    const ruta = await prisma.planRuta.findUnique({ where: { id: rutaId } });
    if (!ruta) throw new HttpError(404, "Ruta no encontrada");
    if (estado === "PENDIENTE" || estado === "CARGADA") {
      const actual = await prisma.rutaAreaCarga.findUnique({ where: { rutaId_area: { rutaId, area } } });
      if (actual?.estado === "CARGADA" && estado !== "CARGADA") {
        // Reversar una carga ya confirmada requiere permiso especial.
        const puede = req.sessionUser?.role === "ADMIN" || req.sessionUser?.permisos.includes("areas.reabrir_carga");
        if (!puede) throw new HttpError(403, "Reabrir una carga ya confirmada requiere permiso especial");
      }
    }
    await prisma.rutaAreaCarga.upsert({
      where: { rutaId_area: { rutaId, area } },
      update: { estado, actualizadoPor: req.user!.username, actualizadoAt: new Date() },
      create: { rutaId, area, estado, actualizadoPor: req.user!.username, actualizadoAt: new Date() },
    });
    const completo = await syncRutaCargada(rutaId, ruta.progId, req.user!.username);
    await auditLog(req.user!.username, "CARGA", "Áreas para Cargar", `Ruta #${ruta.numeroRuta} · ${area} → ${estado}`, INSTANCIA);
    res.json({ ok: true, rutaCargada: completo });
  } catch (err) {
    next(err);
  }
});

export default router;
