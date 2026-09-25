// Preasignación (asignación de rutas: vehículo/conductor/destinos/auxiliares)
// — puerto de legacy_fastapi/app/repos/asignacion.py + routers/asignacion.py.
import { Router } from "express";
import { z } from "zod";
import { prismaPlan as prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import { INSTANCIA } from "../../lib/planCategorias";
import { log as auditLog } from "../../lib/auditoria";
import { sincronizarSiVencido } from "../../lib/syncMaestros";
import { capacidadEfectiva } from "../../lib/fletes";

const router = Router();
router.use(requireAuth, requirePermiso("asignacion.ver"));

const MAX_RUTAS: Record<string, number> = { GENERAL: 26 };

function parseFecha(s: unknown): Date {
  const d = typeof s === "string" && s ? new Date(s) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getProg(fecha: Date) {
  const prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha } } });
  if (!prog) throw new HttpError(404, "No existe programación para esa fecha (crea primero en Planificación)");
  return prog;
}

function sumaKlsDetalle(d: Record<string, unknown>): number {
  const cols = ["klsBovino", "klsVisceraBovino", "klsPorcino", "klsVisceraPorcino", "klsInversion", "klsTat", "klsOtros"];
  return cols.reduce((acc, c) => acc + Number(d[c] ?? 0), 0);
}
function sumaCanDetalle(d: Record<string, unknown>): number {
  const cols = ["canastillasBovino", "canastillasVisceraBovino", "canastillasPorcino", "canastillasVisceraPorcino", "canastillasInversion", "canastillasTat", "canastillasOtros"];
  return cols.reduce((acc, c) => acc + Number(d[c] ?? 0), 0);
}

// GET /api/planeacion/asignacion?fecha=
router.get("/", async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const prog = await getProg(fecha).catch(() => null);
    if (!prog) return res.json({ prog: null, rutas: [], maxRutas: MAX_RUTAS[INSTANCIA] ?? 12 });

    const rutas = await prisma.planRuta.findMany({
      where: { progId: prog.id },
      include: { vehiculo: true, conductor: true, destinos: true, auxiliares: true },
      orderBy: { numeroRuta: "asc" },
    });
    const detalleRows = await prisma.progDetalle.findMany({ where: { progId: prog.id, clienteId: { not: null } } });
    const detalleByCliente = new Map(detalleRows.map((d) => [d.clienteId as string, d as unknown as Record<string, unknown>]));

    // Precio de flete y capacidad efectiva: viven en el Vehiculo de Ejecución
    // (capacidadReal/capacidad de Drivin/precioFlete), NO en PlanVehiculo (que
    // solo tiene una capacidadKg propia de Planeación) — se cruzan por placa.
    const placas = [...new Set(rutas.map((r) => r.vehiculo?.placa).filter((p): p is string => !!p))];
    const vehiculosEjec = placas.length
      ? await prisma.vehiculo.findMany({ where: { placa: { in: placas } }, select: { placa: true, capacidad: true, capacidadReal: true, precioFlete: true } })
      : [];
    const fletePorPlaca = new Map(vehiculosEjec.map((v) => [v.placa, { precioFlete: v.precioFlete ? Number(v.precioFlete) : null, capacidad: capacidadEfectiva(v) || null }]));

    const out = rutas.map((r) => {
      let kls = 0;
      let can = 0;
      for (const rd of r.destinos) {
        if (!rd.clienteId) continue;
        const det = detalleByCliente.get(rd.clienteId);
        if (det) {
          kls += sumaKlsDetalle(det);
          can += sumaCanDetalle(det);
        }
      }
      const flete = r.vehiculo?.placa ? fletePorPlaca.get(r.vehiculo.placa) : null;
      return {
        id: r.id,
        numeroRuta: r.numeroRuta,
        horaCargue: r.horaCargue,
        vehiculo: r.vehiculo?.placa ?? null,
        conductor: r.conductor?.nombre ?? null,
        nDestinos: r.destinos.length,
        nAux: r.auxiliares.length,
        kls,
        canastillas: can,
        cerrada: !!r.cerrada,
        cerradaPor: r.cerradaPor,
        precioFlete: flete?.precioFlete ?? null,
        capacidadVehiculo: flete?.capacidad ?? null,
      };
    });

    res.json({ prog: { id: prog.id, fecha: prog.fecha }, rutas: out, maxRutas: MAX_RUTAS[INSTANCIA] ?? 12 });
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/asignacion/maestros?fecha=&excluirRutaId= — listas para los selects.
// Los destinos solo incluyen clientes que SÍ llevan kilos planificados (Programación) para
// esa fecha — si un cliente no tiene carga planificada, no tiene sentido poder asignarlo a
// una ruta. También expone cuánto kg ya está comprometido por vehículo en OTRAS rutas del
// mismo día, para poder mostrar la barra de capacidad (igual que en Ejecución).
router.get("/maestros", async (req, res, next) => {
  try {
    await sincronizarSiVencido();
    const fecha = parseFecha(req.query.fecha);
    const excluirRutaId = req.query.excluirRutaId ? Number(req.query.excluirRutaId) : null;
    const prog = await getProg(fecha).catch(() => null);

    const [vehiculos, conductores, auxiliares] = await Promise.all([
      prisma.planVehiculo.findMany({ where: { activo: true }, orderBy: { placa: "asc" } }),
      prisma.planConductor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
      prisma.planAuxiliar.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    ]);

    let destinos: { id: string; numero: string | null; nombre: string; canal: string; kg: number }[] = [];
    let destinosOcupados: string[] = [];
    const kgOtrasRutasPorVehiculo = new Map<number, number>();

    if (prog) {
      const detalleRows = await prisma.progDetalle.findMany({ where: { progId: prog.id, clienteId: { not: null } } });
      const kgByCliente = new Map(
        detalleRows
          .map((d) => [d.clienteId as string, sumaKlsDetalle(d as unknown as Record<string, unknown>)] as const)
          .filter(([, kg]) => kg > 0)
      );

      if (kgByCliente.size) {
        const clientes = await prisma.cliente.findMany({
          where: { id: { in: [...kgByCliente.keys()] }, activo: true },
          select: { id: true, codigoDireccion: true, cliente: true, nombreDireccion: true, tipo: true },
        });
        destinos = clientes
          .map((c) => ({
            id: c.id,
            numero: c.codigoDireccion,
            nombre: c.cliente || c.nombreDireccion || "(sin nombre)",
            canal: c.tipo === "TAT" ? "TAT" : "Distribución",
            kg: Math.round((kgByCliente.get(c.id) ?? 0) * 100) / 100,
          }))
          .sort((a, b) => b.kg - a.kg);
      }

      const rutasProg = await prisma.planRuta.findMany({
        where: { progId: prog.id },
        select: { id: true, vehiculoId: true, destinos: { select: { clienteId: true } } },
      });
      destinosOcupados = rutasProg.flatMap((r) => r.destinos.map((d) => d.clienteId).filter((x): x is string => !!x));
      for (const r of rutasProg) {
        if (!r.vehiculoId || r.id === excluirRutaId) continue;
        const kg = r.destinos.reduce((s, d) => s + (d.clienteId ? kgByCliente.get(d.clienteId) ?? 0 : 0), 0);
        kgOtrasRutasPorVehiculo.set(r.vehiculoId, (kgOtrasRutasPorVehiculo.get(r.vehiculoId) ?? 0) + kg);
      }
    }

    const vehiculosOut = vehiculos.map((v) => ({
      ...v,
      kgOtrasRutas: Math.round((kgOtrasRutasPorVehiculo.get(v.id) ?? 0) * 100) / 100,
    }));

    res.json({ vehiculos: vehiculosOut, conductores, auxiliares, destinos, destinosOcupados, sinProgramacion: !prog });
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/asignacion/:id — detalle de una ruta (para el modal de edición)
router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ruta = await prisma.planRuta.findUnique({
      where: { id },
      include: { destinos: { orderBy: { orden: "asc" } }, auxiliares: true },
    });
    if (!ruta) throw new HttpError(404, "Ruta no encontrada");

    const otras = await prisma.planRutaDestino.findMany({
      where: { ruta: { progId: ruta.progId }, NOT: { rutaId: id } },
      select: { clienteId: true },
    });
    res.json({
      id: ruta.id,
      vehiculoId: ruta.vehiculoId,
      conductorId: ruta.conductorId,
      horaCargue: ruta.horaCargue,
      destinoIds: ruta.destinos.map((d) => d.clienteId).filter((x): x is string => !!x),
      auxiliarIds: ruta.auxiliares.map((a) => a.auxiliarId),
      destinosOcupadosOtras: otras.map((o) => o.clienteId).filter((x): x is string => !!x),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/planeacion/asignacion — crea una ruta YA configurada (vehículo, conductor,
// destinos, auxiliares) en un solo paso atómico. Nada se persiste si el usuario cancela
// el modal antes de enviarlo (antes se creaba la ruta vacía apenas se hacía clic en "Crear").
const createSchema = z.object({
  fecha: z.string(),
  vehiculoId: z.number().nullable().optional(),
  conductorId: z.number().nullable().optional(),
  horaCargue: z.string().nullable().optional(),
  destinoIds: z.array(z.string()).default([]),
  auxiliarIds: z.array(z.number()).default([]),
});
router.post("/", requirePermiso("asignacion.editar"), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const fecha = parseFecha(data.fecha);
    const prog = await getProg(fecha);

    const max = MAX_RUTAS[INSTANCIA] ?? 12;
    const count = await prisma.planRuta.count({ where: { progId: prog.id } });
    if (count >= max) throw new HttpError(400, "Máximo " + max + " rutas por día");

    const detalleRows = data.destinoIds.length
      ? await prisma.progDetalle.findMany({ where: { progId: prog.id, clienteId: { in: data.destinoIds } } })
      : [];
    const klsByCliente = new Map(detalleRows.map((d) => [d.clienteId as string, sumaKlsDetalle(d as unknown as Record<string, unknown>)]));
    const peso = data.destinoIds.reduce((acc, id2) => acc + (klsByCliente.get(id2) ?? 0), 0);

    const maxNum = await prisma.planRuta.aggregate({ where: { progId: prog.id }, _max: { numeroRuta: true } });
    const ruta = await prisma.planRuta.create({
      data: {
        progId: prog.id,
        numeroRuta: (maxNum._max.numeroRuta ?? 0) + 1,
        vehiculoId: data.vehiculoId ?? null,
        conductorId: data.conductorId ?? null,
        horaCargue: data.horaCargue?.trim() || null,
        pesoTotal: peso,
        destinos: data.destinoIds.length
          ? { createMany: { data: data.destinoIds.map((clienteId, i) => ({ clienteId, orden: i + 1, kilos: klsByCliente.get(clienteId) ?? 0 })) } }
          : undefined,
        auxiliares: data.auxiliarIds.length
          ? { createMany: { data: data.auxiliarIds.map((auxiliarId, i) => ({ auxiliarId, posicion: i + 1 })) } }
          : undefined,
      },
    });
    await auditLog(req.user!.username, "CREAR", "Preasignación", "Ruta #" + ruta.numeroRuta, INSTANCIA);
    res.status(201).json(ruta);
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  vehiculoId: z.number().nullable().optional(),
  conductorId: z.number().nullable().optional(),
  horaCargue: z.string().nullable().optional(),
  destinoIds: z.array(z.string()),
  auxiliarIds: z.array(z.number()),
});

// PUT /api/planeacion/asignacion/:id
router.put("/:id", requirePermiso("asignacion.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = updateSchema.parse(req.body);
    const ruta = await prisma.planRuta.findUnique({ where: { id } });
    if (!ruta) throw new HttpError(404, "Ruta no encontrada");
    if (ruta.cerrada) throw new HttpError(400, "La ruta está cerrada");

    const detalleRows = await prisma.progDetalle.findMany({ where: { progId: ruta.progId, clienteId: { in: data.destinoIds } } });
    const klsByCliente = new Map(detalleRows.map((d) => [d.clienteId as string, sumaKlsDetalle(d as unknown as Record<string, unknown>)]));
    const peso = data.destinoIds.reduce((acc, id2) => acc + (klsByCliente.get(id2) ?? 0), 0);

    await prisma.planRuta.update({
      where: { id },
      data: { vehiculoId: data.vehiculoId ?? null, conductorId: data.conductorId ?? null, horaCargue: data.horaCargue?.trim() || null, pesoTotal: peso },
    });
    await prisma.planRutaDestino.deleteMany({ where: { rutaId: id } });
    if (data.destinoIds.length) {
      await prisma.planRutaDestino.createMany({
        data: data.destinoIds.map((clienteId, i) => ({ rutaId: id, clienteId, orden: i + 1, kilos: klsByCliente.get(clienteId) ?? 0 })),
      });
    }
    await prisma.planRutaAuxiliar.deleteMany({ where: { rutaId: id } });
    if (data.auxiliarIds.length) {
      await prisma.planRutaAuxiliar.createMany({
        data: data.auxiliarIds.map((auxiliarId, i) => ({ rutaId: id, auxiliarId, posicion: i + 1 })),
      });
    }
    await auditLog(req.user!.username, "EDITAR", "Preasignación", `Ruta #${ruta.numeroRuta}`, INSTANCIA);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/planeacion/asignacion/:id
router.delete("/:id", requirePermiso("asignacion.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.planRuta.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/planeacion/asignacion/:id/cerrar — requiere vehículo+conductor+≥1 destino.
router.post("/:id/cerrar", requirePermiso("asignacion.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ruta = await prisma.planRuta.findUnique({ where: { id }, include: { destinos: true } });
    if (!ruta) throw new HttpError(404, "Ruta no encontrada");
    if (!ruta.vehiculoId || !ruta.conductorId || ruta.destinos.length === 0) {
      throw new HttpError(400, "La ruta necesita vehículo, conductor y al menos un destino para cerrarse");
    }
    await prisma.planRuta.update({ where: { id }, data: { cerrada: true, cerradaPor: req.user!.username } });
    await auditLog(req.user!.username, "CERRAR RUTA", "Preasignación", `Ruta #${ruta.numeroRuta}`, INSTANCIA);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/planeacion/asignacion/:id/reabrir
router.post("/:id/reabrir", requirePermiso("asignacion.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.planRuta.update({ where: { id }, data: { cerrada: false, cerradaPor: null } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
