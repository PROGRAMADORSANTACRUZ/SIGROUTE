// Dashboard/Tablero — puerto de legacy_fastapi/app/repos/dashboard.py.
import { Router } from "express";
import { prismaPlan as prisma } from "../../lib/prisma";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { CATEGORIAS, CANASTILLA_KG, INSTANCIA } from "../../lib/planCategorias";

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

// ── Comparativo por CLIENTE (planificado en Programación vs ejecutado/cargado
// en Órdenes-Diagrama) ─────────────────────────────────────────────────────
function isoToDMY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// Clasifica una línea de Orden ejecutada en una de las 7 categorías de
// Programación — confirmado en vivo 2026-09-24 con datos reales: Bovino/
// Porcino se distinguen por el prefijo B/P de numeroOrden (import Excel), TAT
// vs Inversiones por distribucion="TAT" + tatOrigen, "víscera" por texto en
// el producto (ej. "VISCERA ROJA COMPLETA").
function categoriaDeOrden(o: { distribucion: string; tatOrigen: string | null; numeroOrden: string; producto: string }): { kls: string; can: string; clave: string } {
  if (o.distribucion === "TAT") {
    return o.tatOrigen === "INVERSIONES"
      ? { kls: "klsInversion", can: "canastillasInversion", clave: "inversion" }
      : { kls: "klsTat", can: "canastillasTat", clave: "tat" };
  }
  const esViscera = /viscera/i.test(o.producto);
  const prefijo = /^([A-Za-z]+)/.exec(o.numeroOrden)?.[1]?.toUpperCase() ?? "";
  if (prefijo.startsWith("B")) return esViscera ? { kls: "klsVisceraBovino", can: "canastillasVisceraBovino", clave: "viscera_bovino" } : { kls: "klsBovino", can: "canastillasBovino", clave: "bovino" };
  if (prefijo.startsWith("P")) return esViscera ? { kls: "klsVisceraPorcino", can: "canastillasVisceraPorcino", clave: "viscera_porcino" } : { kls: "klsPorcino", can: "canastillasPorcino", clave: "porcino" };
  return { kls: "klsOtros", can: "canastillasOtros", clave: "otros" };
}

// GET /api/planeacion/dashboard/comparativo-clientes?fecha=YYYY-MM-DD
// A diferencia de /comparativo (por vehículo/placa), este cruza por CLIENTE:
// ProgDetalle.clienteId === Orden.clienteSistemaId (mismo Cliente.id, BD ya
// unificada). Da kg planificados vs realmente cargados, por cliente y por
// categoría, con % de cumplimiento/desviación y lo "perdido" (planificado sin
// ejecutar) — para todos los usuarios con permiso de dashboard, no solo ADMIN.
router.get("/comparativo-clientes", async (req, res, next) => {
  try {
    const fechaStr = typeof req.query.fecha === "string" && req.query.fecha ? req.query.fecha : new Date().toISOString().slice(0, 10);
    const fechaDate = new Date(fechaStr);
    fechaDate.setHours(0, 0, 0, 0);

    const prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha: fechaDate } } });
    const detalle = prog ? await prisma.progDetalle.findMany({ where: { progId: prog.id } }) : [];

    const ordenes = await prisma.orden.findMany({
      where: { fecha: isoToDMY(fechaStr) },
      select: { clienteSistemaId: true, cliente: true, cantidadKg: true, distribucion: true, tatOrigen: true, numeroOrden: true, producto: true },
    });

    const planPorCliente = new Map<string, { total: number; porCategoria: Record<string, number> }>();
    for (const d of detalle) {
      if (!d.clienteId) continue;
      const porCategoria: Record<string, number> = {};
      let total = 0;
      for (const c of CATEGORIAS) {
        const v = Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0);
        porCategoria[c.clave] = v;
        total += v;
      }
      planPorCliente.set(d.clienteId, { total, porCategoria });
    }

    const ejecPorCliente = new Map<string, { total: number; porCategoria: Record<string, number>; nombre: string }>();
    let sinClienteKg = 0;
    for (const o of ordenes) {
      const kg = o.cantidadKg;
      if (!o.clienteSistemaId) { sinClienteKg += kg; continue; }
      const cat = categoriaDeOrden(o);
      const ex = ejecPorCliente.get(o.clienteSistemaId) ?? { total: 0, porCategoria: {}, nombre: o.cliente };
      ex.total += kg;
      ex.porCategoria[cat.clave] = (ex.porCategoria[cat.clave] ?? 0) + kg;
      ejecPorCliente.set(o.clienteSistemaId, ex);
    }

    const clienteIds = new Set([...planPorCliente.keys(), ...ejecPorCliente.keys()]);
    const clientesInfo = clienteIds.size
      ? await prisma.cliente.findMany({ where: { id: { in: [...clienteIds] } }, select: { id: true, cliente: true, nombreDireccion: true } })
      : [];
    const nombrePorId = new Map(clientesInfo.map((c) => [c.id, c.cliente || c.nombreDireccion || "(sin nombre)"]));

    const filas = [...clienteIds].map((id) => {
      const plan = planPorCliente.get(id)?.total ?? 0;
      const ejec = ejecPorCliente.get(id)?.total ?? 0;
      const diferencia = ejec - plan;
      const pctDesviacion = plan > 0 ? Math.round((diferencia / plan) * 100) : (ejec > 0 ? 100 : 0);
      return {
        clienteId: id,
        nombre: nombrePorId.get(id) ?? ejecPorCliente.get(id)?.nombre ?? "(sin nombre)",
        planificado: Math.round(plan * 10) / 10,
        ejecutado: Math.round(ejec * 10) / 10,
        diferencia: Math.round(diferencia * 10) / 10,
        pctDesviacion,
      };
    }).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));

    const totalPlan = filas.reduce((s, f) => s + f.planificado, 0);
    const totalEjec = filas.reduce((s, f) => s + f.ejecutado, 0);
    // "Perdido" = lo planificado que no llegó a ejecutarse (no cuenta lo
    // ejecutado sin plan previo — eso es "extra", no una pérdida).
    const perdido = filas.reduce((s, f) => s + Math.max(0, f.planificado - f.ejecutado), 0);
    const extra = filas.reduce((s, f) => s + Math.max(0, f.ejecutado - f.planificado), 0);

    const porCategoria = CATEGORIAS.map((c) => ({
      clave: c.clave,
      etiqueta: c.etiqueta,
      planificado: Math.round([...planPorCliente.values()].reduce((s, p) => s + (p.porCategoria[c.clave] ?? 0), 0)),
      ejecutado: Math.round([...ejecPorCliente.values()].reduce((s, e) => s + (e.porCategoria[c.clave] ?? 0), 0)),
    }));

    res.json({
      fecha: fechaStr,
      hayPlanificacion: detalle.some((d) => CATEGORIAS.some((c) => Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0) > 0)),
      totales: {
        planificado: Math.round(totalPlan),
        ejecutado: Math.round(totalEjec),
        diferencia: Math.round(totalEjec - totalPlan),
        pctCumplimiento: totalPlan > 0 ? Math.round((totalEjec / totalPlan) * 100) : (totalEjec > 0 ? 100 : 0),
        perdido: Math.round(perdido),
        extra: Math.round(extra),
        sinClienteKg: Math.round(sinClienteKg),
      },
      porCategoria,
      filas: filas.slice(0, 200),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/planeacion/dashboard/rellenar-ejecutado  body: { fecha }
// Si Programación no tiene datos planificados para esa fecha, rellena
// ProgDetalle con lo YA ejecutado (Órdenes cargadas en Diagrama) para que el
// comparativo tenga con qué comparar mientras no se planifique a mano — solo
// toca clientes que todavía no tienen ningún kg planificado (no pisa datos
// reales ya cargados).
router.post("/rellenar-ejecutado", requirePermiso("programacion.editar"), async (req, res, next) => {
  try {
    const fechaStr = typeof req.body?.fecha === "string" && req.body.fecha ? req.body.fecha : new Date().toISOString().slice(0, 10);
    const fechaDate = new Date(fechaStr);
    fechaDate.setHours(0, 0, 0, 0);

    let prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha: fechaDate } } });
    if (!prog) {
      const max = await prisma.programacion.aggregate({ where: { instancia: INSTANCIA }, _max: { consecutivo: true } });
      prog = await prisma.programacion.create({ data: { instancia: INSTANCIA, fecha: fechaDate, usuario: req.user!.username, consecutivo: (max._max.consecutivo ?? 0) + 1 } });
    }

    const existentes = await prisma.progDetalle.findMany({ where: { progId: prog.id, clienteId: { not: null } } });
    const yaConPlan = new Set(
      existentes.filter((d) => CATEGORIAS.some((c) => Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0) > 0)).map((d) => d.clienteId as string)
    );

    const ordenes = await prisma.orden.findMany({
      where: { fecha: isoToDMY(fechaStr) },
      select: { clienteSistemaId: true, cantidadKg: true, distribucion: true, tatOrigen: true, numeroOrden: true, producto: true },
    });

    const porCliente = new Map<string, Record<string, number>>();
    for (const o of ordenes) {
      if (!o.clienteSistemaId || yaConPlan.has(o.clienteSistemaId)) continue;
      const cat = categoriaDeOrden(o);
      const data = porCliente.get(o.clienteSistemaId) ?? {};
      data[cat.kls] = (data[cat.kls] ?? 0) + o.cantidadKg;
      // Canastillas: no hay conteo real de unidades para lo ejecutado; se
      // estima con la misma equivalencia que ya usa la grilla (1.9 kg/canastilla).
      data[cat.can] = (data[cat.can] ?? 0) + o.cantidadKg / CANASTILLA_KG;
      porCliente.set(o.clienteSistemaId, data);
    }

    let rellenados = 0;
    for (const [clienteId, data] of porCliente) {
      const redondeado: Record<string, number> = {};
      for (const k in data) redondeado[k] = Math.round(data[k] * 10) / 10;
      await prisma.progDetalle.upsert({
        where: { progId_clienteId: { progId: prog.id, clienteId } },
        update: redondeado,
        create: { progId: prog.id, clienteId, ...redondeado },
      });
      rellenados++;
    }

    res.json({ ok: true, fecha: fechaStr, clientesRellenados: rellenados });
  } catch (err) {
    next(err);
  }
});

export default router;
