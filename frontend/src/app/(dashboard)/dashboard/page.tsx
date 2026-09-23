"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  getNovedades,
  getPlanillas,
  getResumen,
  getVehiculosExternos,
  type Novedad,
  type OrdenesResumen,
  type Planilla,
  type VehiculoExterno,
} from "@/lib/api";
import { getDashboardPlan, getResumen as getResumenPlan, getComparativoAdmin, type ComparativoAdmin } from "@/lib/planApi";
import { getErrandsDashboard, type ErrandsDashboard } from "@/lib/errandsApi";
import { PageLoader } from "@/components/Loading";
import EmptyState from "@/components/EmptyState";
import { IconRuta } from "@/components/icons";
import { usePermiso } from "@/lib/permisos";

// -"€-"€ Formatters -"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€
const fmtKg = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
const fmtN  = (n: number) => n.toLocaleString("es-CO");

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Compara una fecha (ISO datetime o yyyy-mm-dd) contra un rango [desde, hasta] inclusive.
function enRango(fechaOIso: string, desde: string, hasta: string): boolean {
  const f = fechaOIso.slice(0, 10);
  return f >= desde && f <= hasta;
}

function labelDia(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric" });
}

// -"€-"€ Componentes visuales -"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€

function StatCard({ label, value, sub, color = "#14352a", bg = "bg-white", icon }: {
  label: string; value: string | number; sub?: string; color?: string; bg?: string; icon?: React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border border-[#e1e9dd] ${bg} px-4 py-3 shadow-sm`}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-[#7a8794]">{label}</p>
        <p className="text-3xl font-bold leading-none tabular-nums" style={{ color }}>{value}</p>
        {sub && <p className="truncate text-[11px] text-[#7a8794]">{sub}</p>}
      </div>
      {icon && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f2f5ef] text-[#7a8794]">
          {icon}
        </span>
      )}
    </div>
  );
}

function DonutChart({ segments, centerLabel, centerSub }: {
  segments: { value: number; color: string; label: string }[];
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  const cx = 50, cy = 50, r = 36, sw = 14;
  const circ = 2 * Math.PI * r;
  let off = 0;
  const arcs = segments.map((seg) => {
    const dl = total > 0 ? (seg.value / total) * circ : 0;
    const a = { ...seg, dashLength: dl, offset: off };
    off += dl;
    return a;
  });
  return (
    <div className="relative">
      <svg viewBox="0 0 100 100" className="w-full">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f2f5ef" strokeWidth={sw} />
        {arcs.map((a, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={a.color} strokeWidth={sw}
            strokeDasharray={`${a.dashLength} ${circ}`}
            strokeDashoffset={-(a.offset - circ / 4)}
            className="transition-all duration-500"
          />
        ))}
        {centerLabel && (
          <>
            <text x="50" y="47" textAnchor="middle" className="fill-[#14352a]" fontSize="14" fontWeight="bold">{centerLabel}</text>
            {centerSub && <text x="50" y="58" textAnchor="middle" className="fill-[#7a8794]" fontSize="6">{centerSub}</text>}
          </>
        )}
      </svg>
    </div>
  );
}

function SparkBars({ data }: { data: { label: string; value: number; kg?: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-28 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          {d.value > 0 && <span className="text-[9px] font-semibold text-[#14352a]">{d.value}</span>}
          <div className="w-full overflow-hidden rounded-t-md bg-[#f2f5ef]" style={{ height: "80px" }}>
            <div
              className="w-full rounded-t-md bg-[#2f8f4e] transition-all duration-700"
              title={d.kg ? `${fmtKg(d.kg)} kg` : undefined}
              style={{ height: `${(d.value / max) * 100}%`, marginTop: `${100 - (d.value / max) * 100}%` }}
            />
          </div>
          <span className="text-center text-[9px] text-[#7a8794]">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function HBar({ label, value, max, color = "#2f8f4e", sub }: {
  label: string; value: number; max: number; color?: string; sub?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-xs font-medium text-[#45505e]">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#f2f5ef]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-14 shrink-0 text-right">
        <span className="text-xs font-semibold tabular-nums text-[#14352a]">{sub ?? fmtN(value)}</span>
      </div>
    </div>
  );
}

function RingProgress({ value, max, color = "#2f8f4e", label }: { value: number; max: number; color?: string; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const r = 28, circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#f2f5ef" strokeWidth="8" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            className="transition-all duration-700"
          />
        </svg>
        <span className="text-sm font-bold text-[#14352a]">{Math.round(pct)}%</span>
      </div>
      <span className="text-center text-[10px] text-[#7a8794]">{label}</span>
    </div>
  );
}

const ESTADO_COLOR: Record<string, string> = {
  "Pendiente":  "#b5941e",
  "Enviado":    "#1a5fb4",
  "Entregado":  "#2f8f4e",
  "Rechazado":  "#b3261e",
  "Sin Novedad":"#2f8f4e",
  "Con Novedad":"#b3261e",
  "Doc.Pendiente":"#a86a12",
  "Reenvio":    "#4a6fa5",
};

interface DashboardPlanData {
  kpis: { kls: number; canastillas: number; destinos: number; rutas: number; rutasAsignadas: number; pesoPromedio: number };
  klsCategoria: { label: string; kls: number }[];
  topDestinos: { nombre: string; kls: number }[];
  tendencia: { fecha: string; kls: number }[];
}

// Igual a MAX_RUTAS.GENERAL en el backend (asignacion.ts) — solo para el KPI "de N posibles".
const MAX_RUTAS_DIA = 26;

interface ResumenPlan {
  totalesCategoria: { categoria: string; kls: number; canastillas: number }[];
  totales: { kls: number; canastillas: number };
  conteos: { destinos: number; rutas: number; rutasAsignadas: number };
  rutas: { id: number; numeroRuta: number; horaCargue: string | null; vehiculo: string | null; conductor: string | null; cerrada: boolean; destinos: { numero: string | null; nombre: string; kilos: number }[]; auxiliares: string[] }[];
}

export default function DashboardPage() {
  const puedeVerEjecucion = usePermiso("dashboard.ejecucion.ver");
  const puedeVerPlaneacion = usePermiso("dashboard.planeacion.ver");
  const puedeVerErrands = usePermiso("dashboard.errands.ver");
  const puedeVerComparativo = usePermiso("dashboard.comparativo.ver");
  const [vista, setVista] = useState<"ejecucion" | "planeacion" | "run-errands" | "comparativo">("ejecucion");

  // Si la pestaña activa deja de estar permitida (o al cargar el usuario), se
  // mueve a la primera pestaña a la que sí tenga acceso.
  useEffect(() => {
    const permitido: Record<typeof vista, boolean> = {
      ejecucion: puedeVerEjecucion, planeacion: puedeVerPlaneacion,
      "run-errands": puedeVerErrands, comparativo: puedeVerComparativo,
    };
    if (permitido[vista]) return;
    const primero = (Object.keys(permitido) as (typeof vista)[]).find((v) => permitido[v]);
    if (primero) setVista(primero);
  }, [puedeVerEjecucion, puedeVerPlaneacion, puedeVerErrands, puedeVerComparativo]); // eslint-disable-line react-hooks/exhaustive-deps
  const [resumen, setResumen] = useState<OrdenesResumen | null>(null);
  const [planillas, setPlanillas] = useState<Planilla[]>([]);
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoExterno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Rango de fechas para las métricas históricas de la pestaña Ejecución
  // (planillas/novedades). Las métricas de órdenes vivas son estado actual y
  // no aplican rango (no tienen una fecha propia que filtrar).
  const [ejecDesde, setEjecDesde] = useState(() => new Date().toISOString().slice(0, 10));
  const [ejecHasta, setEjecHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const ejecEsHoy = ejecDesde === new Date().toISOString().slice(0, 10) && ejecHasta === ejecDesde;
  const rangoLabel = ejecEsHoy ? "hoy" : "en el rango";

  // ── Planeación (antes "Tablero de Planificación" + "Resumen del Día", fusionados aquí) ──
  const [planFecha, setPlanFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [planData, setPlanData] = useState<DashboardPlanData | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [resumenPlan, setResumenPlan] = useState<ResumenPlan | null>(null);

  useEffect(() => {
    setPlanLoading(true);
    Promise.all([
      getDashboardPlan(planFecha).catch((err) => { console.error(err); return null; }),
      getResumenPlan(planFecha).catch((err) => { console.error(err); return null; }),
    ])
      .then(([d, r]) => {
        if (d) setPlanData(d as DashboardPlanData);
        if (r) setResumenPlan(r as ResumenPlan);
      })
      .finally(() => setPlanLoading(false));
  }, [planFecha]);

  // ── Run Errands ──
  const [errandsDesde, setErrandsDesde] = useState("");
  const [errandsHasta, setErrandsHasta] = useState("");
  const [errandsData, setErrandsData] = useState<ErrandsDashboard | null>(null);
  const [errandsLoading, setErrandsLoading] = useState(true);

  const cargarErrands = useCallback(() => {
    setErrandsLoading(true);
    getErrandsDashboard({ desde: errandsDesde || undefined, hasta: errandsHasta || undefined })
      .then(setErrandsData)
      .finally(() => setErrandsLoading(false));
  }, [errandsDesde, errandsHasta]);

  useEffect(() => {
    if (vista === "run-errands") cargarErrands();
  }, [vista, cargarErrands]);

  // ── Comparativo Planeación vs Ejecución (solo ADMIN) ──
  const [compFecha, setCompFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [compData, setCompData] = useState<ComparativoAdmin | null>(null);
  const [compLoading, setCompLoading] = useState(true);

  const cargarComparativo = useCallback(() => {
    setCompLoading(true);
    getComparativoAdmin(compFecha)
      .then(setCompData)
      .catch(() => setCompData(null))
      .finally(() => setCompLoading(false));
  }, [compFecha]);

  useEffect(() => {
    if (vista === "comparativo") cargarComparativo();
  }, [vista, cargarComparativo]);

  const rutasCerradas = resumenPlan?.rutas.filter((r) => r.cerrada).length ?? 0;
  const pctRutasAsignadas = resumenPlan && resumenPlan.conteos.rutas > 0 ? Math.round((resumenPlan.conteos.rutasAsignadas / resumenPlan.conteos.rutas) * 100) : 0;
  const pctRutasCerradas = resumenPlan && resumenPlan.conteos.rutas > 0 ? Math.round((rutasCerradas / resumenPlan.conteos.rutas) * 100) : 0;
  const tendenciaBars = useMemo(
    () => (planData?.tendencia ?? []).map((t) => ({ label: t.fecha.slice(3), value: Math.round(t.kls), kg: t.kls })),
    [planData]
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [res, plans, novs, vehs] = await Promise.all([
        getResumen(),
        getPlanillas(),
        getNovedades().catch((err) => { console.error(err); return [] as Novedad[]; }),
        getVehiculosExternos().catch((err) => { console.error(err); return [] as VehiculoExterno[]; }),
      ]);
      setResumen(res);
      setPlanillas(plans);
      setNovedades(novs);
      setVehiculos(vehs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const m = useMemo(() => {
    // Métricas de órdenes agregadas en el backend (evita traer miles de filas).
    const vivas      = resumen?.vivas ?? 0;
    const asignadas  = resumen?.asignadas ?? 0;
    const sinAsig    = resumen?.sinAsig ?? 0;
    const enviadas   = resumen?.enviadas ?? 0;
    const entregadas = resumen?.entregadas ?? 0;
    const rechazadas = resumen?.rechazadas ?? 0;
    const reenviadas = resumen?.reenviadas ?? 0;
    const kilosVivas = resumen?.kilosVivas ?? 0;
    const kilosEnv   = resumen?.kilosEnviadas ?? 0;
    const totalOrdenes = resumen?.totalOrdenes ?? 0;
    const tat  = resumen?.tat ?? 0;
    const agro = resumen?.agro ?? 0;
    const conCarga = resumen?.vehiculosConCarga ?? 0;

    // Planillas (filtradas por el rango de fechas seleccionado; por defecto = hoy)
    const planillasHoy    = planillas.filter((p) => enRango(p.fecha || p.createdAt, ejecDesde, ejecHasta) && !p.anulada);
    const planillasAnulHoy= planillas.filter((p) => enRango(p.fecha || p.createdAt, ejecDesde, ejecHasta) && p.anulada);
    const planillasImprHoy= planillas.filter((p) => enRango(p.fecha || p.createdAt, ejecDesde, ejecHasta) && !p.anulada && p.impresa);
    const kilosHoy        = planillasHoy.reduce((s, p) => s + p.kilos, 0);
    const sinImpHoy       = planillasHoy.filter((p) => !p.impresa).length;

    // Novedades del rango seleccionado (antes eran de TODA la historia, sin filtrar).
    const novedadesRango = novedades.filter((n) => enRango(n.fecha || n.createdAt, ejecDesde, ejecHasta));

    // Últimos 7 días de planillas (tendencia fija, independiente del rango elegido)
    const dias7 = Array.from({ length: 7 }, (_, i) => {
      const fecha = diasAtras(6 - i);
      const ps = planillas.filter((p) => (p.fecha || p.createdAt.slice(0, 10)) === fecha && !p.anulada);
      return { label: labelDia(fecha), value: ps.length, kg: ps.reduce((s, p) => s + p.kilos, 0) };
    });

    // Capacidad por placa (kg) desde la flota externa.
    const capPorPlaca = new Map<string, number>();
    for (const v of vehiculos) {
      const cap = v.capacidadReal ? parseFloat(v.capacidadReal) : v.capacidad ? parseFloat(v.capacidad) : 0;
      if (cap > 0) capPorPlaca.set(v.placa.toUpperCase(), cap);
    }

    // Top vehículos kg hoy
    const porPlaca = new Map<string, { kg: number; docs: number }>();
    for (const p of planillasHoy) {
      const cur = porPlaca.get(p.placa) ?? { kg: 0, docs: 0 };
      cur.kg += p.kilos; cur.docs += p.docs;
      porPlaca.set(p.placa, cur);
    }
    const topPlacas = Array.from(porPlaca.entries())
      .sort((a, b) => b[1].kg - a[1].kg)
      .slice(0, 7)
      .map(([label, v]) => {
        const cap = capPorPlaca.get(label.toUpperCase()) ?? 0;
        const pct = cap > 0 ? Math.round((v.kg / cap) * 100) : 0;
        return { label, value: Math.round(v.kg), cap, pct, sub: cap > 0 ? `${fmtKg(v.kg)} kg · ${pct}%` : `${fmtKg(v.kg)} kg` };
      });

    // Vehículos
    const activos   = vehiculos.filter((v) => v.estado === "Activo");

    // Capacidad total vs cargado
    const capTotal  = activos.reduce((s, v) => s + (v.capacidadReal ? parseFloat(v.capacidadReal) : v.capacidad ? parseFloat(v.capacidad) : 0), 0);
    // Ocupación de flota hoy: kg cargados vs capacidad de los vehículos con planilla.
    const capEnRuta = Array.from(porPlaca.keys()).reduce((s, placa) => s + (capPorPlaca.get(placa.toUpperCase()) ?? 0), 0);
    const pctOcupacion = capEnRuta > 0 ? Math.round((kilosHoy / capEnRuta) * 100) : 0;

    // Novedades (del rango seleccionado)
    const novConNov  = novedadesRango.filter((n) => n.estadoEntrega === "Con Novedad").length;
    const novPendDoc = novedadesRango.filter((n) => n.estadoEntrega === "Doc.Pendiente").length;
    const novReenvio = novedadesRango.filter((n) => n.estadoEntrega === "Reenvio").length;
    const novSinNov  = novedadesRango.filter((n) => n.estadoEntrega === "Sin Novedad" || !n.estadoEntrega).length;

    // Top novedades por tipo
    const novPorTipo = new Map<string, number>();
    for (const n of novedadesRango) { if (n.novedad) novPorTipo.set(n.novedad, (novPorTipo.get(n.novedad) ?? 0) + 1); }
    const topNovedades = Array.from(novPorTipo.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Top responsabilidades
    const novPorResp = new Map<string, number>();
    for (const n of novedadesRango) { if (n.responsabilidad) novPorResp.set(n.responsabilidad, (novPorResp.get(n.responsabilidad) ?? 0) + 1); }
    const topResp = Array.from(novPorResp.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Top despachos (placas) con más novedades Con Novedad
    const novPorPlaca = new Map<string, number>();
    for (const n of novedadesRango) {
      if (n.estadoEntrega === "Con Novedad" || n.estadoEntrega === "Rechazado" || n.estadoEntrega === "Parcial Con Novedad") {
        if (n.placa) novPorPlaca.set(n.placa, (novPorPlaca.get(n.placa) ?? 0) + 1);
      }
    }
    const topDespachosNov = Array.from(novPorPlaca.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

    return {
      // Órdenes
      totalOrdenes, vivas, asignadas,
      sinAsig, enviadas, entregadas,
      rechazadas, reenviadas,
      kilosVivas, kilosEnv,
      pctAsig: vivas > 0 ? Math.round((asignadas / vivas) * 100) : 0,
      // Planillas
      planillasHoy: planillasHoy.length, planillasAnulHoy: planillasAnulHoy.length,
      planillasImprHoy: planillasImprHoy.length, sinImpHoy, kilosHoy,
      dias7,
      // Distribución
      tat, agro,
      // Vehículos
      activos: activos.length, conCarga, capTotal,
      capEnRuta, pctOcupacion,
      topPlacas,
      // Novedades
      novConNov, novPendDoc, novReenvio, novSinNov,
      topNovedades, topResp, topDespachosNov,
      totalNovedades: novedadesRango.length,
    };
  }, [resumen, planillas, novedades, vehiculos, ejecDesde, ejecHasta]);

  return (
    <div className="flex h-full flex-col overflow-auto p-3 sm:p-4">
      <header className="mb-2.5 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">Dashboard</h1>
          <p className="text-sm text-[#5f7a68]">Resumen operativo en tiempo real · Santa Cruz</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-[#dfe4e0] bg-white p-0.5">
            {puedeVerEjecucion && (
              <button
                onClick={() => setVista("ejecucion")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${vista === "ejecucion" ? "bg-[#2f8f4e] text-white" : "text-[#5f7a68] hover:bg-[#f4f6f3]"}`}
              >
                Ejecución
              </button>
            )}
            {puedeVerPlaneacion && (
              <button
                onClick={() => setVista("planeacion")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${vista === "planeacion" ? "bg-[#2f8f4e] text-white" : "text-[#5f7a68] hover:bg-[#f4f6f3]"}`}
              >
                Planeación
              </button>
            )}
            {puedeVerErrands && (
              <button
                onClick={() => setVista("run-errands")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${vista === "run-errands" ? "bg-[#2f8f4e] text-white" : "text-[#5f7a68] hover:bg-[#f4f6f3]"}`}
              >
                Run Errands
              </button>
            )}
            {puedeVerComparativo && (
              <button
                onClick={() => setVista("comparativo")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${vista === "comparativo" ? "bg-[#2f8f4e] text-white" : "text-[#5f7a68] hover:bg-[#f4f6f3]"}`}
              >
                Comparativo
              </button>
            )}
          </div>
          <button onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
            </svg>
          </button>
        </div>
      </header>

      {error && <div className="mb-4 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      {vista === "ejecucion" ? (
        loading ? (
          <div className="flex flex-1"><PageLoader /></div>
        ) : (
          <div className="flex flex-col gap-2.5">

          {/* Filtro de fechas: aplica a planillas/novedades (órdenes vivas son estado actual, no filtran por fecha) */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e1e9dd] bg-white px-3 py-2">
            <span className="text-xs font-medium text-[#7a8794]">Planillas y novedades:</span>
            <label className="flex items-center gap-1.5 text-xs text-[#7a8794]">
              Desde
              <input type="date" value={ejecDesde} onChange={(e) => setEjecDesde(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1 text-xs text-[#14352a] outline-none focus:border-[#2f8f4e]" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#7a8794]">
              Hasta
              <input type="date" value={ejecHasta} onChange={(e) => setEjecHasta(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1 text-xs text-[#14352a] outline-none focus:border-[#2f8f4e]" />
            </label>
            <div className="flex items-center gap-1">
              {[
                { label: "Hoy", d: diasAtras(0), h: diasAtras(0) },
                { label: "Ayer", d: diasAtras(1), h: diasAtras(1) },
                { label: "7 días", d: diasAtras(6), h: diasAtras(0) },
                { label: "30 días", d: diasAtras(29), h: diasAtras(0) },
              ].map((p) => {
                const activo = ejecDesde === p.d && ejecHasta === p.h;
                return (
                  <button key={p.label} onClick={() => { setEjecDesde(p.d); setEjecHasta(p.h); }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${activo ? "border-[#2f8f4e] bg-[#e8f3e2] text-[#2f8f4e]" : "border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]"}`}>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <span className="ml-auto text-[11px] text-[#9aa4af]">Órdenes activas: estado en vivo (no aplica rango)</span>
          </div>

          {/* Row 1: KPIs principales */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Órdenes activas" value={fmtN(m.vivas)} sub={`${fmtKg(m.kilosVivas)} kg total`}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>} />
            <StatCard label="Sin asignar" value={fmtN(m.sinAsig)} sub="pendientes de vehículo"
              color={m.sinAsig > 0 ? "#a86a12" : "#2f8f4e"}
              bg={m.sinAsig > 0 ? "bg-[#fdf6e9]" : "bg-white"}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} />
            <StatCard label={`Planillas ${rangoLabel}`} value={fmtN(m.planillasHoy)} sub={`${fmtKg(m.kilosHoy)} kg despachados`}
              color="#2f8f4e"
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>} />
            <StatCard label="Con novedad" value={fmtN(m.novConNov)} sub={`${m.novPendDoc} doc.pendiente · ${m.novReenvio} reenvío`}
              color={m.novConNov > 0 ? "#b3261e" : "#2f8f4e"}
              bg={m.novConNov > 0 ? "bg-[#fbeceb]" : "bg-white"}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
            <StatCard label={`Sin imprimir ${rangoLabel}`} value={fmtN(m.sinImpHoy)} sub={`${m.planillasImprHoy} impresas · ${m.planillasAnulHoy} anuladas`}
              color={m.sinImpHoy > 0 ? "#a86a12" : "#2f8f4e"}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>} />
          </div>

          {/* Fila 0: Accesos rápidos (botones pill debajo de los KPIs) */}
          <div className="nice-scroll flex flex-nowrap gap-2 overflow-x-auto pb-1">
            {[
              { href: "/asignacion-vehiculos", label: "Asignación de órdenes", sub: `${m.sinAsig} sin asignar`, color: "bg-[#f7faf5]" },
              { href: "/planificacion-dl", label: "Planificación D.L.", sub: `${m.sinImpHoy} sin imprimir hoy`, color: "bg-[#f7faf5]" },
              { href: "/nivel-de-servicio", label: "Nivel de servicio", sub: `${m.novConNov} con novedad`, color: m.novConNov > 0 ? "bg-[#fbeceb]" : "bg-[#f7faf5]" },
              { href: "/planes", label: "Diagrama", sub: `${m.conCarga} vehículos en ruta`, color: "bg-[#f7faf5]" },
              { href: "/ordenes", label: "Cargar órdenes", sub: `${m.totalOrdenes} en el sistema`, color: "bg-[#f7faf5]" },
            ].map((item) => (
              <Link key={item.href} href={item.href} className={`flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#e1e9dd] ${item.color} px-4 py-2 transition-all hover:border-[#2f8f4e] hover:shadow-sm lg:flex-1`}>
                <span className="whitespace-nowrap text-xs font-semibold text-[#14352a]">{item.label}</span>
                <span className="shrink-0 whitespace-nowrap rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-[#7a8794]">{item.sub}</span>
              </Link>
            ))}
          </div>

          {/* Fila 1: Nivel de servicio · Despachos con más novedades · Responsabilidades */}
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">

            {/* Nivel de servicio */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Nivel de servicio</h2>
                <Link href="/nivel-de-servicio" className="text-[10px] font-medium text-[#2f8f4e] hover:underline">Ver detalle →</Link>
              </div>
              {m.totalNovedades === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin registros</div>
              ) : (
                <>
                  <div className="mb-4 flex justify-around">
                    {[
                      { l: "Sin nov.", v: m.novSinNov, c: "#2f8f4e" },
                      { l: "Con nov.", v: m.novConNov, c: "#b3261e" },
                      { l: "Doc.Pend.", v: m.novPendDoc, c: "#a86a12" },
                      { l: "Reenvío", v: m.novReenvio, c: "#4a6fa5" },
                    ].map((x) => (
                      <div key={x.l} className="flex flex-col items-center gap-0.5">
                        <span className="text-xl font-bold tabular-nums" style={{ color: x.c }}>{x.v}</span>
                        <span className="text-[10px] text-[#7a8794]">{x.l}</span>
                      </div>
                    ))}
                  </div>
                  {m.topNovedades.length > 0 && (
                    <>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7a8794]">Tipos frecuentes</p>
                      <div className="flex flex-col gap-1.5">
                        {m.topNovedades.slice(0, 4).map(([label, value]) => (
                          <HBar key={label} label={label} value={value} max={m.topNovedades[0][1]} color="#b3261e" />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Despachos con más novedades */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Despachos con más novedades</h2>
                <Link href="/nivel-de-servicio" className="text-[10px] font-medium text-[#2f8f4e] hover:underline">Ver →</Link>
              </div>
              {m.topDespachosNov.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin registros</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {m.topDespachosNov.map(([label, value]) => (
                    <HBar key={label} label={label} value={value} max={m.topDespachosNov[0][1]} color="#b3261e" />
                  ))}
                </div>
              )}
            </div>

            {/* Responsabilidades de novedades */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Responsabilidades de novedades</h2>
              {m.topResp.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin registros</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {m.topResp.map(([label, value]) => (
                    <HBar key={label} label={label} value={value} max={m.topResp[0][1]} color="#a86a12" />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Fila 2: Distribución · Estado de órdenes · Plantillas últimos 7 días */}
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">

            {/* Distribución TAT vs Agropecuaria */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Distribución de carga activa</h2>
              <div className="flex items-center gap-4">
                <div className="w-32 shrink-0">
                  <DonutChart
                    centerLabel={fmtN(m.vivas)}
                    centerSub="total"
                    segments={[
                      { label: "TAT", value: m.tat, color: "#4a6fa5" },
                      { label: "Agropecuaria", value: m.agro, color: "#2f8f4e" },
                    ].filter((s) => s.value > 0)}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  {[
                    { l: "TAT", v: m.tat, c: "#4a6fa5" },
                    { l: "Agropecuaria", v: m.agro, c: "#2f8f4e" },
                  ].map((x) => (
                    <div key={x.l}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.c }} />
                          <span className="text-[#5f7a68]">{x.l}</span>
                        </div>
                        <span className="font-bold tabular-nums text-[#14352a]">{fmtN(x.v)}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f2f5ef]">
                        <div className="h-full rounded-full" style={{ width: `${m.vivas > 0 ? (x.v / m.vivas) * 100 : 0}%`, background: x.c }} />
                      </div>
                    </div>
                  ))}
                  <div className="mt-1 rounded-lg bg-[#f7faf5] px-3 py-2 text-xs text-[#5f7a68]">
                    <p><span className="font-semibold text-[#14352a]">{fmtKg(m.kilosEnv)}</span> kg en tránsito a Drivin</p>
                    <p><span className="font-semibold text-[#14352a]">{m.totalOrdenes}</span> órdenes totales en el sistema</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Donut — Estado de órdenes */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Estado de órdenes</h2>
              <div className="flex items-center gap-4">
                <div className="w-32 shrink-0">
                  <DonutChart
                    centerLabel={fmtN(m.vivas)}
                    centerSub="activas"
                    segments={[
                      { label: "Sin asignar", value: m.sinAsig, color: "#f0d9b0" },
                      { label: "Asignadas", value: m.asignadas - m.enviadas, color: "#b5941e" },
                      { label: "Enviadas", value: m.enviadas, color: "#1a5fb4" },
                      { label: "Entregadas", value: m.entregadas, color: "#2f8f4e" },
                      { label: "Rechazadas", value: m.rechazadas, color: "#b3261e" },
                    ].filter((s) => s.value > 0)}
                  />
                </div>
                <div className="flex flex-col gap-1.5 text-xs">
                  {[
                    { l: "Sin asignar", v: m.sinAsig, c: "#f0d9b0" },
                    { l: "Asignadas", v: m.asignadas - m.enviadas, c: "#b5941e" },
                    { l: "Enviadas", v: m.enviadas, c: "#1a5fb4" },
                    { l: "Entregadas", v: m.entregadas, c: "#2f8f4e" },
                    { l: "Rechazadas", v: m.rechazadas, c: "#b3261e" },
                  ].map((x) => (
                    <div key={x.l} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: x.c }} />
                      <span className="text-[#5f7a68]">{x.l}</span>
                      <span className="ml-auto font-semibold tabular-nums text-[#14352a]">{fmtN(x.v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Barras verticales — últimos 7 días */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Planillas últimos 7 días</h2>
                <span className="text-xs text-[#7a8794]">total: {m.dias7.reduce((s, d) => s + d.value, 0)}</span>
              </div>
              <SparkBars data={m.dias7} />
            </div>
          </div>

          {/* Fila 3: Vehículos y capacidad · Top vehículos (% carga) · Ocupación de flota */}
          <div className="grid grid-cols-1 items-stretch gap-2.5 lg:grid-cols-3">

            {/* Rings — capacidad y asignación */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Vehículos y capacidad</h2>
              <div className="flex justify-around">
                <RingProgress value={m.conCarga} max={m.activos} color="#2f8f4e" label={`${m.conCarga}/${m.activos} en ruta`} />
                <RingProgress value={m.asignadas} max={m.vivas} color="#1a5fb4" label={`${m.pctAsig}% asignado`} />
                <RingProgress value={m.planillasImprHoy} max={m.planillasHoy} color="#b5941e" label={`${m.planillasHoy > 0 ? Math.round((m.planillasImprHoy / m.planillasHoy) * 100) : 0}% impresas`} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-[#7a8794]">
                <div><p className="text-lg font-bold text-[#14352a]">{m.activos}</p><p>vehículos</p></div>
                <div><p className="text-lg font-bold text-[#14352a]">{m.reenviadas}</p><p>reenviadas</p></div>
                <div><p className="text-lg font-bold text-[#14352a]">{m.rechazadas}</p><p>rechazadas</p></div>
              </div>
            </div>

            {/* Top vehículos con % de carga */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Top vehículos {rangoLabel} (% carga)</h2>
                <Link href="/planificacion-dl" className="text-[10px] font-medium text-[#2f8f4e] hover:underline">Ver planillas →</Link>
              </div>
              {m.topPlacas.length === 0 ? (
                <p className="text-sm text-[#7a8794]">Sin planillas en el rango seleccionado.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {m.topPlacas.map((d) => {
                    const barColor = d.pct >= 90 ? "#b3261e" : d.pct >= 70 ? "#a86a12" : "#2f8f4e";
                    const width = d.cap > 0 ? Math.min(100, d.pct) : (d.value / m.topPlacas[0].value) * 100;
                    return (
                      <div key={d.label} className="flex items-center gap-3">
                        <span className="w-16 shrink-0 truncate text-xs font-medium text-[#45505e]">{d.label}</span>
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#f2f5ef]">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${width}%`, background: barColor }} />
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-xs font-semibold tabular-nums text-[#14352a]">{fmtKg(d.value)}</span>
                          {d.cap > 0 && <span className="ml-1 text-[10px] font-semibold" style={{ color: barColor }}>{d.pct}%</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Ocupación de flota (kg cargados vs capacidad) */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Ocupación de flota {rangoLabel}</h2>
                <span className="text-[10px] text-[#7a8794]">{m.conCarga} en ruta</span>
              </div>
              {m.capEnRuta === 0 ? (
                <div className="flex h-24 items-center justify-center text-center text-sm text-[#7a8794]">Sin capacidad registrada para los vehículos en ruta.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold tabular-nums" style={{ color: m.pctOcupacion >= 90 ? "#b3261e" : m.pctOcupacion >= 70 ? "#a86a12" : "#2f8f4e" }}>{m.pctOcupacion}%</span>
                    <span className="text-xs text-[#7a8794]">capacidad utilizada</span>
                  </div>
                  <div className="h-4 w-full overflow-hidden rounded-full bg-[#f2f5ef]">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, m.pctOcupacion)}%`, background: m.pctOcupacion >= 90 ? "#b3261e" : m.pctOcupacion >= 70 ? "#a86a12" : "#2f8f4e" }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs text-[#7a8794]">
                    <div><p className="text-sm font-bold text-[#14352a]">{fmtKg(m.kilosHoy)}</p><p>kg cargados</p></div>
                    <div><p className="text-sm font-bold text-[#14352a]">{fmtKg(m.capEnRuta)}</p><p>kg capacidad</p></div>
                    <div><p className="text-sm font-bold text-[#14352a]">{fmtKg(Math.max(0, m.capEnRuta - m.kilosHoy))}</p><p>kg disponible</p></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          </div>
        )
      ) : vista === "planeacion" ? (
        <div className="flex flex-col gap-2.5">

          {/* Row 1: KPIs principales */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Destinos con producto" value={planLoading || !resumenPlan ? "—" : fmtN(resumenPlan.conteos.destinos)}
              sub="clientes con kilos hoy"
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>} />
            <StatCard label="Rutas" value={planLoading || !resumenPlan ? "—" : fmtN(resumenPlan.conteos.rutas)}
              sub={`de ${MAX_RUTAS_DIA} posibles`}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>} />
            <StatCard label="Rutas asignadas" value={planLoading || !resumenPlan ? "—" : fmtN(resumenPlan.conteos.rutasAsignadas)}
              sub={resumenPlan && resumenPlan.conteos.rutas > 0 ? `${Math.round((resumenPlan.conteos.rutasAsignadas / resumenPlan.conteos.rutas) * 100)}% del total` : "sin rutas aún"}
              color={pctRutasAsignadas < 60 ? "#a86a12" : "#2f8f4e"}
              bg={pctRutasAsignadas < 60 ? "bg-[#fdf6e9]" : "bg-white"}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>} />
            <StatCard label="Rutas cerradas" value={planLoading || !resumenPlan ? "—" : fmtN(rutasCerradas)}
              sub={resumenPlan && resumenPlan.conteos.rutas > 0 ? `${pctRutasCerradas}% del total` : "sin rutas aún"}
              color={pctRutasCerradas < 60 ? "#a86a12" : "#2f8f4e"}
              bg={pctRutasCerradas < 60 ? "bg-[#fdf6e9]" : "bg-white"}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>} />
            <StatCard label="Peso total" value={planLoading || !resumenPlan ? "—" : fmtN(resumenPlan.totales.kls)} sub="kilos programados hoy"
              color="#2f8f4e"
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 3h11l3.5 7-9 11L3 10Z"/><path d="M3 10h18"/></svg>} />
          </div>

          {/* Fila 0: Accesos rápidos */}
          <div className="nice-scroll flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
            <input
              type="date"
              value={planFecha}
              onChange={(e) => setPlanFecha(e.target.value)}
              className="shrink-0 rounded-full border border-[#dfe4e0] bg-white px-3.5 py-2 text-xs font-medium text-[#14352a] outline-none focus:border-[#2f8f4e]"
            />
            {[
              { href: "/planeacion/programacion", label: "Planificación", sub: `${resumenPlan?.conteos.destinos ?? 0} destinos hoy`, color: "bg-[#f7faf5]" },
              { href: "/planeacion/asignacion", label: "Preasignación", sub: `${resumenPlan?.conteos.rutas ?? 0} rutas`, color: "bg-[#f7faf5]" },
              { href: "/planeacion/distribucion-produccion", label: "Distribución Producción", sub: "previsualizar / exportar", color: "bg-[#f7faf5]" },
              { href: "/planeacion/simulador", label: "Simulador de Producción", sub: "corridas de perfil", color: "bg-[#f7faf5]" },
              { href: "/planeacion/reportes", label: "Reportes", sub: "descargar Excel", color: "bg-[#f7faf5]" },
            ].map((item) => (
              <Link key={item.href} href={item.href} className={`flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#e1e9dd] ${item.color} px-4 py-2 transition-all hover:border-[#2f8f4e] hover:shadow-sm lg:flex-1`}>
                <span className="whitespace-nowrap text-xs font-semibold text-[#14352a]">{item.label}</span>
                <span className="shrink-0 whitespace-nowrap rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-[#7a8794]">{item.sub}</span>
              </Link>
            ))}
          </div>

          {/* Fila 1: Estado de rutas · Kilos por categoría · Top destinos */}
          <div className="grid grid-cols-1 items-stretch gap-2.5 lg:grid-cols-3">

            {/* Rings — asignación y cierre de rutas */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Estado de rutas</h2>
              {planLoading || !resumenPlan || resumenPlan.conteos.rutas === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin rutas aún.</div>
              ) : (
                <>
                  <div className="flex justify-around">
                    <RingProgress value={resumenPlan.conteos.rutasAsignadas} max={resumenPlan.conteos.rutas} color="#1a5fb4" label={`${pctRutasAsignadas}% asignadas`} />
                    <RingProgress value={rutasCerradas} max={resumenPlan.conteos.rutas} color="#2f8f4e" label={`${pctRutasCerradas}% cerradas`} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-[#7a8794]">
                    <div><p className="text-lg font-bold text-[#14352a]">{resumenPlan.conteos.rutas}</p><p>rutas</p></div>
                    <div><p className="text-lg font-bold text-[#14352a]">{fmtN(resumenPlan.totales.kls)}</p><p>kg totales</p></div>
                    <div><p className="text-lg font-bold text-[#14352a]">{fmtN(resumenPlan.totales.canastillas)}</p><p>canastillas</p></div>
                  </div>
                </>
              )}
            </div>

            {/* Kilos por categoría */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Kilos por categoría</h2>
                <Link href="/planeacion/programacion" className="text-[10px] font-medium text-[#2f8f4e] hover:underline">Ver planificación →</Link>
              </div>
              {planLoading || !planData ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Cargando…</div>
              ) : planData.klsCategoria.every((c) => c.kls === 0) ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin datos aún.</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {planData.klsCategoria.map((c) => (
                    <HBar key={c.label} label={c.label} value={c.kls} max={Math.max(1, ...planData.klsCategoria.map((x) => x.kls))} sub={fmtN(c.kls)} color="#2f8f4e" />
                  ))}
                </div>
              )}
            </div>

            {/* Top destinos */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Top 8 destinos</h2>
                <Link href="/planeacion/programacion" className="text-[10px] font-medium text-[#2f8f4e] hover:underline">Ver destinos →</Link>
              </div>
              {planLoading || !planData ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Cargando…</div>
              ) : planData.topDestinos.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin datos aún.</div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {planData.topDestinos.map((d) => (
                    <li key={d.nombre} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-[#45505e]">{d.nombre}</span>
                      <span className="shrink-0 rounded-full bg-[#f7faf5] px-2 py-0.5 text-xs font-semibold tabular-nums text-[#2f8f4e]">{fmtN(d.kls)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Fila 2: Rutas cerradas vs abiertas · Tendencia de kilos · Peso promedio por ruta */}
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">

            {/* Donut — rutas cerradas vs abiertas */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Rutas: cerradas vs abiertas</h2>
              {planLoading || !resumenPlan || resumenPlan.conteos.rutas === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin rutas aún.</div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-32 shrink-0">
                    <DonutChart
                      centerLabel={fmtN(resumenPlan.conteos.rutas)}
                      centerSub="rutas"
                      segments={[
                        { label: "Cerradas", value: rutasCerradas, color: "#2f8f4e" },
                        { label: "Abiertas", value: resumenPlan.conteos.rutas - rutasCerradas, color: "#f0d9b0" },
                      ].filter((s) => s.value > 0)}
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    {[
                      { l: "Cerradas", v: rutasCerradas, c: "#2f8f4e" },
                      { l: "Abiertas", v: resumenPlan.conteos.rutas - rutasCerradas, c: "#f0d9b0" },
                    ].map((x) => (
                      <div key={x.l}>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.c }} />
                            <span className="text-[#5f7a68]">{x.l}</span>
                          </div>
                          <span className="font-bold tabular-nums text-[#14352a]">{fmtN(x.v)}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f2f5ef]">
                          <div className="h-full rounded-full" style={{ width: `${resumenPlan.conteos.rutas > 0 ? (x.v / resumenPlan.conteos.rutas) * 100 : 0}%`, background: x.c }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tendencia de kilos programados */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Tendencia de kilos (14 días)</h2>
                <span className="text-xs text-[#7a8794]">total: {fmtN(tendenciaBars.reduce((s, d) => s + d.value, 0))}</span>
              </div>
              {planLoading || !planData ? (
                <div className="flex h-28 items-center justify-center text-sm text-[#7a8794]">Cargando…</div>
              ) : tendenciaBars.every((d) => d.value === 0) ? (
                <div className="flex h-28 items-center justify-center text-sm text-[#7a8794]">Sin datos aún.</div>
              ) : (
                <SparkBars data={tendenciaBars} />
              )}
            </div>

            {/* Peso promedio por ruta */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Peso promedio por ruta</h2>
                <span className="text-[10px] text-[#7a8794]">{resumenPlan?.conteos.rutas ?? 0} rutas</span>
              </div>
              {planLoading || !planData || !resumenPlan || resumenPlan.conteos.rutas === 0 ? (
                <div className="flex h-24 items-center justify-center text-center text-sm text-[#7a8794]">Sin rutas para calcular el promedio.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold tabular-nums text-[#2f8f4e]">{fmtN(Math.round(planData.kpis.pesoPromedio))}</span>
                    <span className="text-xs text-[#7a8794]">kg / ruta</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs text-[#7a8794]">
                    <div><p className="text-sm font-bold text-[#14352a]">{fmtN(resumenPlan.totales.kls)}</p><p>kg totales</p></div>
                    <div><p className="text-sm font-bold text-[#14352a]">{resumenPlan.conteos.rutas}</p><p>rutas</p></div>
                    <div><p className="text-sm font-bold text-[#14352a]">{resumenPlan.conteos.destinos}</p><p>destinos</p></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Rutas del día (antes página "Resumen del Día") */}
          <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#14352a]">
                Rutas del día{resumenPlan ? ` (${rutasCerradas} cerradas de ${resumenPlan.conteos.rutas})` : ""}
              </h2>
              <Link href="/planeacion/asignacion" className="text-[10px] font-medium text-[#2f8f4e] hover:underline">Ver preasignación →</Link>
            </div>
            {planLoading || !resumenPlan ? (
              <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Cargando…</div>
            ) : resumenPlan.rutas.length === 0 ? (
              <EmptyState icon={IconRuta} title="Sin rutas para esta fecha" description="Crea rutas en Preasignación para verlas reflejadas aquí." />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {resumenPlan.rutas.map((r) => {
                  const kilosRuta = r.destinos.reduce((acc, d) => acc + Number(d.kilos ?? 0), 0);
                  return (
                    <div key={r.id} className="overflow-hidden rounded-2xl border border-[#e1e9dd] shadow-sm">
                      <div className="flex items-center gap-3 bg-[#14352a] px-4 py-3">
                        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-[#3a5a4a] bg-[#1c4433] px-3 py-1.5">
                          <span className="text-[9px] font-medium uppercase tracking-wide text-[#a7c4b5]">Ruta</span>
                          <span className="text-lg font-bold leading-none text-white">#{r.numeroRuta}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{r.vehiculo ?? "Sin vehículo"}</p>
                          <p className="truncate text-xs text-[#a7c4b5]">{r.conductor ?? "Sin conductor"}{r.horaCargue ? ` · ${r.horaCargue}` : ""}</p>
                        </div>
                        <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${r.cerrada ? "bg-[#e8f3e2] text-[#2f8f4e]" : "bg-[#3a4a3f] text-[#c0cabf]"}`}>
                          {r.cerrada ? "Cerrada" : "Abierta"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 border-b border-[#f0f2ee] px-4 py-2 text-center text-xs">
                        <div><p className="font-semibold text-[#14352a]">{r.destinos.length}</p><p className="text-[#9aa4af]">Destinos</p></div>
                        <div><p className="font-semibold text-[#14352a]">{fmtN(kilosRuta)}</p><p className="text-[#9aa4af]">Kls</p></div>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-xs text-[#7a8794]">Aux: {r.auxiliares.join(", ") || "—"}</p>
                        <p className="mt-1 line-clamp-3 text-xs text-[#45505e]">{r.destinos.map((d) => `${d.numero ?? ""} ${d.nombre}`).join(" → ") || "Sin destinos"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      ) : vista === "run-errands" ? (
        errandsLoading || !errandsData ? (
          <div className="flex flex-1"><PageLoader /></div>
        ) : (
          <div className="flex flex-col gap-2.5">

          {(() => {
            const pendientes = errandsData.porEstado.find((e) => e.label === "PENDIENTE")?.value ?? 0;
            const enProceso = errandsData.porEstado.find((e) => e.label === "EN_PROCESO")?.value ?? 0;
            const promedioKg = errandsData.totalPedidos > 0 ? errandsData.totalKilos / errandsData.totalPedidos : 0;
            const ESTADO_COLOR_DONUT: Record<string, string> = {
              PENDIENTE: "#e3a53b", EN_PROCESO: "#1a5fb4", ENTREGADO: "#2f8f4e",
              CANCELADO: "#b3261e", EDITADO: "#9aa4af", REVISADO: "#57b17a",
            };
            return (
              <>
                {/* Row 1: KPIs principales */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                  <StatCard label="Pedidos" value={fmtN(errandsData.totalPedidos)} sub="en el rango seleccionado"
                    icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 3h11l3.5 7-9 11L3 10Z"/><path d="M3 10h18"/></svg>} />
                  <StatCard label="Pendientes" value={fmtN(pendientes)} sub={`${fmtN(enProceso)} en proceso`}
                    color={pendientes > 0 ? "#a86a12" : "#2f8f4e"}
                    bg={pendientes > 0 ? "bg-[#fdf6e9]" : "bg-white"}
                    icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
                  <StatCard label="Kilos" value={fmtKg(errandsData.totalKilos)} sub={`${promedioKg.toFixed(1)} kg / pedido`}
                    color="#2f8f4e"
                    icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 3h11l3.5 7-9 11L3 10Z"/></svg>} />
                  <StatCard label="Puntos de venta" value={fmtN(errandsData.totalPuntosVenta)} sub="activos"
                    icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/></svg>} />
                  <StatCard label="Clientes" value={fmtN(errandsData.totalClientes)} sub="destinos activos"
                    icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
                </div>

                {/* Fila 0: Accesos rápidos */}
                <div className="nice-scroll flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                  <input type="date" value={errandsDesde} onChange={(e) => setErrandsDesde(e.target.value)}
                    className="shrink-0 rounded-full border border-[#dfe4e0] bg-white px-3.5 py-2 text-xs font-medium text-[#14352a] outline-none focus:border-[#2f8f4e]" />
                  <input type="date" value={errandsHasta} onChange={(e) => setErrandsHasta(e.target.value)}
                    className="shrink-0 rounded-full border border-[#dfe4e0] bg-white px-3.5 py-2 text-xs font-medium text-[#14352a] outline-none focus:border-[#2f8f4e]" />
                  {(errandsDesde || errandsHasta) && (
                    <button onClick={() => { setErrandsDesde(""); setErrandsHasta(""); }} className="shrink-0 text-xs font-medium text-[#2f8f4e] hover:underline">Limpiar</button>
                  )}
                  {[
                    { href: "/errands?tab=pedidos", label: "Pedidos", sub: `${fmtN(pendientes)} pendientes`, color: pendientes > 0 ? "bg-[#fdf6e9]" : "bg-[#f7faf5]" },
                    { href: "/errands?tab=clientes", label: "Clientes", sub: `${fmtN(errandsData.totalClientes)} activos`, color: "bg-[#f7faf5]" },
                    { href: "/errands?tab=pdv", label: "Puntos de venta", sub: `${fmtN(errandsData.totalPuntosVenta)} activos`, color: "bg-[#f7faf5]" },
                  ].map((item) => (
                    <Link key={item.href} href={item.href} className={`flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#e1e9dd] ${item.color} px-4 py-2 transition-all hover:border-[#2f8f4e] hover:shadow-sm lg:flex-1`}>
                      <span className="whitespace-nowrap text-xs font-semibold text-[#14352a]">{item.label}</span>
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-[#7a8794]">{item.sub}</span>
                    </Link>
                  ))}
                </div>

                {/* Fila 1: Estado de pedidos · Por punto de venta · Tendencia 14 días */}
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
                  <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
                    <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Estado de pedidos</h2>
                    {errandsData.totalPedidos === 0 ? (
                      <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin registros</div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="w-32 shrink-0">
                          <DonutChart
                            centerLabel={fmtN(errandsData.totalPedidos)}
                            centerSub="pedidos"
                            segments={errandsData.porEstado.filter((e) => e.value > 0).map((e) => ({ label: e.label, value: e.value, color: ESTADO_COLOR_DONUT[e.label] ?? "#9aa4af" }))}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 text-xs">
                          {errandsData.porEstado.filter((e) => e.value > 0).map((e) => (
                            <div key={e.label} className="flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ESTADO_COLOR_DONUT[e.label] ?? "#9aa4af" }} />
                              <span className="text-[#5f7a68]">{e.label}</span>
                              <span className="ml-auto font-semibold tabular-nums text-[#14352a]">{fmtN(e.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
                    <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Pedidos por punto de venta</h2>
                    {errandsData.porPdv.length === 0 ? (
                      <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin registros</div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {errandsData.porPdv.slice(0, 8).map((d) => (
                          <HBar key={d.label} label={d.label} value={d.value} max={errandsData.porPdv[0].value} color="#2f8f4e" />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-[#14352a]">Pedidos por día (14 días)</h2>
                      <span className="text-xs text-[#7a8794]">total: {fmtN(errandsData.porDia.reduce((s, d) => s + d.value, 0))}</span>
                    </div>
                    {errandsData.porDia.every((d) => d.value === 0) ? (
                      <div className="flex h-28 items-center justify-center text-sm text-[#7a8794]">Sin datos aún.</div>
                    ) : (
                      <SparkBars data={errandsData.porDia} />
                    )}
                  </div>
                </div>

                {/* Fila 2: Top clientes · Resumen operativo */}
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
                  <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm lg:col-span-2">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-[#14352a]">Top 10 clientes</h2>
                      <Link href="/errands?tab=clientes" className="text-[10px] font-medium text-[#2f8f4e] hover:underline">Ver clientes →</Link>
                    </div>
                    {errandsData.porCliente.length === 0 ? (
                      <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin registros</div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {errandsData.porCliente.map((d) => (
                          <HBar key={d.label} label={d.label} value={d.value} max={errandsData.porCliente[0].value} color="#1a5fb4" />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
                    <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Resumen operativo</h2>
                    <div className="grid grid-cols-2 gap-3 text-center text-xs text-[#7a8794]">
                      <div><p className="text-lg font-bold text-[#14352a]">{fmtN(errandsData.totalPedidos)}</p><p>pedidos</p></div>
                      <div><p className="text-lg font-bold text-[#14352a]">{fmtKg(errandsData.totalKilos)}</p><p>kg totales</p></div>
                      <div><p className="text-lg font-bold text-[#14352a]">{errandsData.totalPuntosVenta}</p><p>PDV activos</p></div>
                      <div><p className="text-lg font-bold text-[#14352a]">{errandsData.totalClientes}</p><p>clientes activos</p></div>
                    </div>
                    <Link href="/errands" className="mt-3 flex items-center justify-center rounded-lg border border-[#dfe4e0] bg-[#f7faf5] px-3 py-2 text-xs font-semibold text-[#2f8f4e] hover:border-[#2f8f4e]">Ir a Run Errands →</Link>
                  </div>
                </div>
              </>
            );
          })()}

          </div>
        )
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={compFecha} onChange={(e) => setCompFecha(e.target.value)}
              className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
            <button onClick={cargarComparativo} className="rounded-lg border border-[#dfe4e0] bg-white px-4 py-2 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Actualizar</button>
            <span className="text-xs text-[#7a8794]">Kg planificados en Preasignación vs kg reales en planillas de despacho, por vehículo.</span>
          </div>

          {compLoading || !compData ? (
            <div className="flex flex-1"><PageLoader /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <StatCard label="Kg planificados" value={fmtN(compData.totales.planificado)} color="#1a5fb4"
                  icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} />
                <StatCard label="Kg ejecutados" value={fmtN(compData.totales.ejecutado)} color="#2f8f4e"
                  icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>} />
                <StatCard label="Diferencia total" value={fmtN(compData.totales.ejecutado - compData.totales.planificado)}
                  sub={compData.totales.planificado > 0 ? `${Math.round(((compData.totales.ejecutado - compData.totales.planificado) / compData.totales.planificado) * 100)}%` : undefined}
                  color={compData.totales.ejecutado - compData.totales.planificado > 0 ? "#a86a12" : "#2f8f4e"}
                  bg={compData.totales.ejecutado - compData.totales.planificado > 0 ? "bg-[#fdf6e9]" : "bg-white"}
                  icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
              </div>

              <div className="rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
                {compData.filas.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin datos para esta fecha.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-[#e1e9dd] bg-[#f7faf5] text-left text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
                      <tr>
                        <th className="px-3 py-2.5">Placa</th>
                        <th className="px-3 py-2.5 text-right">Planificado (kg)</th>
                        <th className="px-3 py-2.5 text-right">Ejecutado (kg)</th>
                        <th className="px-3 py-2.5 text-right">Diferencia</th>
                        <th className="px-3 py-2.5 text-right">Desviación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f0f2ee]">
                      {compData.filas.map((f) => {
                        const alerta = Math.abs(f.pctDesviacion) >= 15;
                        return (
                          <tr key={f.placa} className={alerta ? "bg-[#fdf6e9]" : "hover:bg-[#f9fbf7]"}>
                            <td className="px-3 py-2 font-mono text-xs font-semibold text-[#14352a]">{f.placa}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#1a5fb4]">{fmtN(f.planificado)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#2f8f4e]">{fmtN(f.ejecutado)}</td>
                            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${f.diferencia > 0 ? "text-[#a86a12]" : f.diferencia < 0 ? "text-[#b3261e]" : "text-[#5f7a68]"}`}>
                              {f.diferencia > 0 ? "+" : ""}{fmtN(f.diferencia)}
                            </td>
                            <td className={`px-3 py-2 text-right text-xs font-semibold ${alerta ? "text-[#a86a12]" : "text-[#9aa4af]"}`}>{f.pctDesviacion}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
