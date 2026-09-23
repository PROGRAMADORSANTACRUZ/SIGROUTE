// Dashboard/Tablero — puerto de legacy_fastapi/app/repos/dashboard.py.
import { Router } from "express";
import { prismaPlan as prisma } from "../../lib/prisma";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { CATEGORIAS, INSTANCIA } from "../../lib/planCategorias";

const router = Router();
router.use(requireAuth, requirePermiso("dashboard.ver"));

// GET /api/planeacion/dashboard/comparativo?fecha=YYYY-MM-DD  (solo ADMIN)
// Compara, por vehículo (placa), los kg PLANIFICADOS (Preasignación) contra
// los kg REALES cargados (planillas de despacho en Ejecución).
router.get("/comparativo", async (req, res, next) => {
  try {
    if (req.sessionUser?.role !== "ADMIN") throw new HttpError(403, "Requiere rol administrador");

    const fechaStr = typeof req.query.fecha === "string" && req.query.fecha ? req.query.fecha : new Date().toISOString().slice(0, 10);
    const fechaDate = new Date(fechaStr);
    fechaDate.setHours(0, 0, 0, 0);

    const prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha: fechaDate } } });
    const planificado = new Map<string, number>();
    if (prog) {
      const rutas = await prisma.planRuta.findMany({
        where: { progId: prog.id },
        include: { vehiculo: true, destinos: true },
      });
      for (const r of rutas) {
        const placa = r.vehiculo?.placa;
        if (!placa) continue;
        const kg = r.destinos.reduce((s, x) => s + Number(x.kilos ?? 0), 0);
        planificado.set(placa, (planificado.get(placa) ?? 0) + kg);
      }
    }

    const planillas = await prisma.planillaDespacho.findMany({
      where: { fecha: fechaStr, anulada: false },
      select: { placa: true, kilos: true },
    });
    const ejecutado = new Map<string, number>();
    for (const p of planillas) {
      ejecutado.set(p.placa, (ejecutado.get(p.placa) ?? 0) + p.kilos);
    }

    const placas = new Set([...planificado.keys(), ...ejecutado.keys()]);
    const filas = [...placas].map((placa) => {
      const plan = planificado.get(placa) ?? 0;
      const ejec = ejecutado.get(placa) ?? 0;
      const diferencia = ejec - plan;
      const pctDesviacion = plan > 0 ? Math.round((diferencia / plan) * 100) : (ejec > 0 ? 100 : 0);
      return { placa, planificado: Math.round(plan), ejecutado: Math.round(ejec), diferencia: Math.round(diferencia), pctDesviacion };
    }).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));

    res.json({
      fecha: fechaStr,
      filas,
      totales: {
        planificado: Math.round(filas.reduce((s, f) => s + f.planificado, 0)),
        ejecutado: Math.round(filas.reduce((s, f) => s + f.ejecutado, 0)),
      },
    });
  } catch (err) {
    next(err);
  }
});

function sumaKls(d: Record<string, unknown>): number {
  return CATEGORIAS.reduce((acc, c) => acc + Number(d[c.kls] ?? 0), 0);
}
function sumaCan(d: Record<string, unknown>): number {
  return CATEGORIAS.reduce((acc, c) => acc + Number(d[c.can] ?? 0), 0);
}

// GET /api/planeacion/dashboard?fecha=YYYY-MM-DD
router.get("/", async (req, res, next) => {
  try {
    const fecha = typeof req.query.fecha === "string" ? new Date(req.query.fecha) : new Date();
    fecha.setHours(0, 0, 0, 0);

    const prog = await prisma.programacion.findUnique({
      where: { instancia_fecha: { instancia: INSTANCIA, fecha } },
    });

    if (!prog) {
      return res.json({
        kpis: { kls: 0, canastillas: 0, destinos: 0, rutas: 0, rutasAsignadas: 0, pesoPromedio: 0 },
        klsCategoria: CATEGORIAS.map((c) => ({ label: c.etiqueta, kls: 0 })),
        topDestinos: [],
        tendencia: await tendencia(),
      });
    }

    const detalle = await prisma.progDetalle.findMany({ where: { progId: prog.id }, include: { destino: true } });
    const rutas = await prisma.planRuta.findMany({ where: { progId: prog.id } });

    const kls = detalle.reduce((acc, d) => acc + sumaKls(d as unknown as Record<string, unknown>), 0);
    const canastillas = detalle.reduce((acc, d) => acc + sumaCan(d as unknown as Record<string, unknown>), 0);
    const destinosConKls = detalle.filter((d) => sumaKls(d as unknown as Record<string, unknown>) > 0).length;
    const rutasAsignadas = rutas.filter((r) => r.vehiculoId != null).length;
    const pesoTotal = rutas.reduce((acc, r) => acc + Number(r.pesoTotal ?? 0), 0);

    const klsCategoria = CATEGORIAS.map((c) => ({
      label: c.etiqueta,
      kls: detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0), 0),
    }));

    const topDestinos = await (async () => {
      const conKls = detalle
        .map((d) => ({ clienteId: d.clienteId, nombreLegacy: d.destino?.nombre ?? null, kls: sumaKls(d as unknown as Record<string, unknown>) }))
        .filter((d) => d.kls > 0)
        .sort((a, b) => b.kls - a.kls)
        .slice(0, 8);
      const ids = conKls.map((d) => d.clienteId).filter((x): x is string => !!x);
      const clientes = ids.length
        ? await prisma.cliente.findMany({ where: { id: { in: ids } }, select: { id: true, cliente: true, nombreDireccion: true } })
        : [];
      const clienteById = new Map(clientes.map((c) => [c.id, c]));
      return conKls.map((d) => ({
        nombre: (d.clienteId && (clienteById.get(d.clienteId)?.cliente ?? clienteById.get(d.clienteId)?.nombreDireccion)) || d.nombreLegacy || "(sin nombre)",
        kls: d.kls,
      }));
    })();

    res.json({
      kpis: {
        kls,
        canastillas,
        destinos: destinosConKls,
        rutas: rutas.length,
        rutasAsignadas,
        pesoPromedio: rutas.length ? pesoTotal / rutas.length : 0,
      },
      klsCategoria,
      topDestinos,
      tendencia: await tendencia(),
    });
  } catch (err) {
    next(err);
  }
});

async function tendencia(dias = 14) {
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - (dias - 1));

  const progs = await prisma.programacion.findMany({
    where: { instancia: INSTANCIA, fecha: { gte: desde } },
    include: { detalle: true },
    orderBy: { fecha: "asc" },
  });

  return progs.map((p) => ({
    fecha: p.fecha.toISOString().slice(5, 10),
    kls: p.detalle.reduce((acc, d) => acc + sumaKls(d as unknown as Record<string, unknown>), 0),
  }));
}

export default router;
