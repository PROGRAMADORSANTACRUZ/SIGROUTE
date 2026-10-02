// Indicadores operativos — analítica nueva sobre datos que ya se capturaban
// pero no tenían ningún reporte encima: tiempos reales de cargue por área
// (RutaAreaCargaEvento), SLA/antigüedad de novedades, y costo de flete
// histórico (EnvioFlete). Todo de solo lectura, en rango de fechas.
import { Router } from "express";
import { prismaPlan as prisma } from "../../lib/prisma";
import { requireAuth, requirePermiso } from "../../middleware/auth";

const router = Router();
router.use(requireAuth, requirePermiso("indicadores.ver"));

function rangoFechas(query: Record<string, unknown>, diasDefault: number): { desde: Date; hasta: Date } {
  const hasta = typeof query.hasta === "string" && query.hasta ? new Date(query.hasta as string) : new Date();
  hasta.setHours(23, 59, 59, 999);
  const desde = typeof query.desde === "string" && query.desde ? new Date(query.desde as string) : new Date(hasta);
  if (!query.desde) desde.setDate(desde.getDate() - (diasDefault - 1));
  desde.setHours(0, 0, 0, 0);
  return { desde, hasta };
}

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const idx = Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1));
  return ordenados[idx];
}

function promedio(valores: number[]): number {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0;
}

// ───────────────────────── Tiempos de Cargue ─────────────────────────

interface CicloCargue {
  rutaId: number;
  area: string;
  inicio: Date;
  fin: Date;
  duracionMin: number;
  usuario: string | null;
}

// Empareja la secuencia de eventos (PENDIENTE/PROCESO/CARGADA) de UNA sola
// ruta+área en ciclos inicio→CARGADA. Si el área se reabre después de una
// CARGADA (vuelve a PENDIENTE/PROCESO), eso cuenta como "reapertura" y arranca
// un ciclo nuevo separado — no se suma al ciclo original.
function calcularCiclos(
  rutaId: number,
  area: string,
  eventosOrdenados: { estado: string; usuario: string | null; at: Date }[]
): { ciclos: CicloCargue[]; reaperturas: number } {
  const ciclos: CicloCargue[] = [];
  let inicioCiclo: Date | null = null;
  let vieneDeCargada = false;
  let reaperturas = 0;
  for (const e of eventosOrdenados) {
    if (e.estado === "CARGADA") {
      if (inicioCiclo) {
        const duracionMin = Math.round((e.at.getTime() - inicioCiclo.getTime()) / 60000);
        ciclos.push({ rutaId, area, inicio: inicioCiclo, fin: e.at, duracionMin, usuario: e.usuario });
        inicioCiclo = null;
      }
      vieneDeCargada = true;
    } else {
      if (vieneDeCargada && !inicioCiclo) reaperturas++;
      if (!inicioCiclo) inicioCiclo = e.at;
      vieneDeCargada = false;
    }
  }
  return { ciclos, reaperturas };
}

// GET /api/planeacion/indicadores/cargue?desde=&hasta=
router.get("/cargue", async (req, res, next) => {
  try {
    const { desde, hasta } = rangoFechas(req.query, 7);
    const eventos = await prisma.rutaAreaCargaEvento.findMany({
      where: { at: { gte: desde, lte: hasta } },
      include: { ruta: { include: { vehiculo: true } } },
      orderBy: { at: "asc" },
    });

    const porGrupo = new Map<string, { rutaId: number; area: string; numeroRuta: number; placa: string | null; eventos: { estado: string; usuario: string | null; at: Date }[] }>();
    for (const e of eventos) {
      const key = `${e.rutaId}|${e.area}`;
      let g = porGrupo.get(key);
      if (!g) {
        g = { rutaId: e.rutaId, area: e.area, numeroRuta: e.ruta.numeroRuta, placa: e.ruta.vehiculo?.placa ?? null, eventos: [] };
        porGrupo.set(key, g);
      }
      g.eventos.push({ estado: e.estado, usuario: e.usuario, at: e.at });
    }

    const todosCiclos: CicloCargue[] = [];
    const reaperturasPorRuta = new Map<string, { rutaId: number; numeroRuta: number; placa: string | null; reaperturas: number }>();
    for (const g of porGrupo.values()) {
      const { ciclos, reaperturas } = calcularCiclos(g.rutaId, g.area, g.eventos);
      todosCiclos.push(...ciclos);
      if (reaperturas > 0) {
        const key = String(g.rutaId);
        const acc = reaperturasPorRuta.get(key) ?? { rutaId: g.rutaId, numeroRuta: g.numeroRuta, placa: g.placa, reaperturas: 0 };
        acc.reaperturas += reaperturas;
        reaperturasPorRuta.set(key, acc);
      }
    }

    // Serie diaria: duración promedio de ciclos cerrados ese día (por fecha de cierre).
    const porDia = new Map<string, number[]>();
    for (const c of todosCiclos) {
      const dia = c.fin.toISOString().slice(0, 10);
      const arr = porDia.get(dia) ?? [];
      arr.push(c.duracionMin);
      porDia.set(dia, arr);
    }
    const serie = [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, duraciones]) => ({ fecha, duracionPromedioMin: Math.round(promedio(duraciones)), ciclos: duraciones.length }));

    // Ranking de áreas más lentas.
    const porArea = new Map<string, number[]>();
    for (const c of todosCiclos) {
      const arr = porArea.get(c.area) ?? [];
      arr.push(c.duracionMin);
      porArea.set(c.area, arr);
    }
    const rankingAreas = [...porArea.entries()]
      .map(([area, duraciones]) => ({
        area,
        ciclos: duraciones.length,
        duracionPromedioMin: Math.round(promedio(duraciones)),
        duracionP90Min: Math.round(percentil(duraciones, 90)),
      }))
      .sort((a, b) => b.duracionPromedioMin - a.duracionPromedioMin);

    const rankingReaperturas = [...reaperturasPorRuta.values()].sort((a, b) => b.reaperturas - a.reaperturas).slice(0, 20);

    const detalle = todosCiclos
      .sort((a, b) => b.fin.getTime() - a.fin.getTime())
      .slice(0, 500)
      .map((c) => {
        const g = porGrupo.get(`${c.rutaId}|${c.area}`);
        return {
          fecha: c.fin.toISOString().slice(0, 10),
          numeroRuta: g?.numeroRuta ?? null,
          placa: g?.placa ?? null,
          area: c.area,
          inicio: c.inicio.toISOString(),
          fin: c.fin.toISOString(),
          duracionMin: c.duracionMin,
          usuario: c.usuario,
        };
      });

    res.json({
      desde: desde.toISOString().slice(0, 10),
      hasta: hasta.toISOString().slice(0, 10),
      resumen: {
        ciclos: todosCiclos.length,
        duracionPromedioMin: Math.round(promedio(todosCiclos.map((c) => c.duracionMin))),
        duracionP90Min: Math.round(percentil(todosCiclos.map((c) => c.duracionMin), 90)),
        reaperturas: [...reaperturasPorRuta.values()].reduce((s, r) => s + r.reaperturas, 0),
      },
      serie,
      rankingAreas,
      rankingReaperturas,
      detalle,
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────── Novedades (SLA) ─────────────────────────

// GET /api/planeacion/indicadores/novedades?desde=&hasta=
router.get("/novedades", async (req, res, next) => {
  try {
    const { desde, hasta } = rangoFechas(req.query, 7);
    const desdeStr = desde.toISOString().slice(0, 10);
    const hastaStr = hasta.toISOString().slice(0, 10);
    // Novedad.fecha siempre se guarda en ISO (YYYY-MM-DD) desde el origen —
    // comparación lexicográfica de string es válida para este formato.
    const novedades = await prisma.novedad.findMany({
      where: { fecha: { gte: desdeStr, lte: hastaStr } },
      orderBy: { createdAt: "asc" },
    });

    // "Sin Novedad" son registros auto-creados al enviar con éxito (ver
    // lib/nivel.ts) — NO son incidentes reales, se excluyen de los cálculos de
    // tiempo (antigüedad/resolución) pero sí se cuentan en la volumetría total.
    const reales = novedades.filter((n) => n.estadoEntrega !== "Sin Novedad");

    const ahora = Date.now();
    const abiertas = reales.filter((n) => n.estado === "Pendiente" || n.estado === "En tramitación");
    const buckets = { "0-1d": 0, "1-3d": 0, "3-7d": 0, "7d+": 0 };
    for (const n of abiertas) {
      const diasAbierta = (ahora - n.createdAt.getTime()) / 86400000;
      if (diasAbierta <= 1) buckets["0-1d"]++;
      else if (diasAbierta <= 3) buckets["1-3d"]++;
      else if (diasAbierta <= 7) buckets["3-7d"]++;
      else buckets["7d+"]++;
    }

    const resueltas = reales.filter((n) => n.resueltaAt);
    const tiemposResolucionMin = resueltas.map((n) => (n.resueltaAt!.getTime() - n.createdAt.getTime()) / 60000);

    function topConteo(valores: (string | null)[], top = 10): { valor: string; cantidad: number }[] {
      const mapa = new Map<string, number>();
      for (const v of valores) {
        const k = (v ?? "").trim();
        if (!k) continue;
        mapa.set(k, (mapa.get(k) ?? 0) + 1);
      }
      return [...mapa.entries()].map(([valor, cantidad]) => ({ valor, cantidad })).sort((a, b) => b.cantidad - a.cantidad).slice(0, top);
    }

    // Serie diaria: abiertas (creadas) vs resueltas ese día.
    const porDiaAbiertas = new Map<string, number>();
    const porDiaResueltas = new Map<string, number>();
    for (const n of reales) {
      const dia = n.fecha;
      porDiaAbiertas.set(dia, (porDiaAbiertas.get(dia) ?? 0) + 1);
      if (n.resueltaAt) {
        const diaR = n.resueltaAt.toISOString().slice(0, 10);
        porDiaResueltas.set(diaR, (porDiaResueltas.get(diaR) ?? 0) + 1);
      }
    }
    const dias = [...new Set([...porDiaAbiertas.keys(), ...porDiaResueltas.keys()])].sort();
    const serie = dias.map((fecha) => ({ fecha, creadas: porDiaAbiertas.get(fecha) ?? 0, resueltas: porDiaResueltas.get(fecha) ?? 0 }));

    res.json({
      desde: desdeStr,
      hasta: hastaStr,
      resumen: {
        total: novedades.length,
        reales: reales.length,
        abiertas: abiertas.length,
        resueltas: resueltas.length,
        tiempoResolucionPromedioMin: Math.round(promedio(tiemposResolucionMin)),
        tiempoResolucionP90Min: Math.round(percentil(tiemposResolucionMin, 90)),
      },
      antiguedadAbiertas: buckets,
      serie,
      topMotivos: topConteo(reales.map((n) => n.novedad || n.tipo)),
      topResponsabilidad: topConteo(reales.map((n) => n.responsabilidad)),
      topPlacas: topConteo(reales.map((n) => n.placa)),
      topClientes: topConteo(reales.map((n) => n.cliente)),
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────── Costo de Flete ─────────────────────────

// GET /api/planeacion/indicadores/costo-flete?desde=&hasta=
router.get("/costo-flete", async (req, res, next) => {
  try {
    const { desde, hasta } = rangoFechas(req.query, 7);
    const filas = await prisma.envioFlete.findMany({
      where: { createdAt: { gte: desde, lte: hasta } },
      orderBy: { createdAt: "desc" },
    });

    const costoTotal = filas.reduce((s, f) => s + f.precioFlete, 0);
    const kgTotal = filas.reduce((s, f) => s + f.kgCargado, 0);
    const costoPorKgPromedio = kgTotal > 0 ? costoTotal / kgTotal : 0;

    const porDia = new Map<string, { costo: number; kg: number }>();
    for (const f of filas) {
      const dia = f.createdAt.toISOString().slice(0, 10);
      const acc = porDia.get(dia) ?? { costo: 0, kg: 0 };
      acc.costo += f.precioFlete;
      acc.kg += f.kgCargado;
      porDia.set(dia, acc);
    }
    const serie = [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, v]) => ({ fecha, costo: Math.round(v.costo), kg: Math.round(v.kg), costoPorKg: v.kg > 0 ? Math.round((v.costo / v.kg) * 100) / 100 : 0 }));

    const porRuta = new Map<string, { ruta: string; costo: number; kg: number; capacidad: number; envios: number }>();
    for (const f of filas) {
      const key = f.ruta ?? "Sin ruta";
      const acc = porRuta.get(key) ?? { ruta: key, costo: 0, kg: 0, capacidad: 0, envios: 0 };
      acc.costo += f.precioFlete;
      acc.kg += f.kgCargado;
      acc.capacidad += f.capacidadVehiculo;
      acc.envios += 1;
      porRuta.set(key, acc);
    }
    const rankingRutas = [...porRuta.values()]
      .map((r) => ({
        ruta: r.ruta,
        envios: r.envios,
        costoTotal: Math.round(r.costo),
        kgTotal: Math.round(r.kg),
        costoPorKg: r.kg > 0 ? Math.round((r.costo / r.kg) * 100) / 100 : 0,
        // Costo ideal: si el vehículo saliera siempre a capacidad llena.
        costoPorKgIdeal: r.capacidad > 0 ? Math.round((r.costo / r.capacidad) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.costoTotal - a.costoTotal);

    res.json({
      desde: desde.toISOString().slice(0, 10),
      hasta: hasta.toISOString().slice(0, 10),
      resumen: {
        envios: filas.length,
        costoTotal: Math.round(costoTotal),
        kgTotal: Math.round(kgTotal),
        costoPorKgPromedio: Math.round(costoPorKgPromedio * 100) / 100,
      },
      serie,
      rankingRutas,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
