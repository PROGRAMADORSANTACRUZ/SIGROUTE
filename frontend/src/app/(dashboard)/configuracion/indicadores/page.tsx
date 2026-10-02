"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getIndicadoresCargue, getIndicadoresNovedades, getIndicadoresCostoFlete,
  type IndicadoresCargue, type IndicadoresNovedades, type IndicadoresCostoFlete,
} from "@/lib/planApi";
import { ApiError } from "@/lib/api";
import { SkeletonStat } from "@/components/Loading";
import { FiltroRangoFecha, diasAtras } from "@/components/FiltroFecha";
import StatCard from "@/components/StatCard";
import { IconBox, IconBarChart, IconAlertTriangle, IconCheckCircle, IconTimer, IconCoin, IconHistory, IconClipboard } from "@/components/icons";

const fmtN = (n: number) => n.toLocaleString("es-CO");
const fmtMoney = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
function fmtMin(n: number): string {
  if (!n) return "0 min";
  if (n >= 60) return `${Math.floor(n / 60)}h ${Math.round(n % 60)}m`;
  return `${Math.round(n)} min`;
}
function fmtFecha(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}
function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

// ── Primitivas de gráficas (mismo estilo que el Dashboard, copiadas acá para
// no acoplar esta página a los componentes privados de dashboard/page.tsx) ──

const PALETA = ["#2f8f4e", "#5b8fd9", "#d9a441", "#b3261e", "#7a5bd9", "#45a89a", "#c76b9e", "#9aa4af"];

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

function Leyenda({ items }: { items: { label: string; value: number; color: string; total: number }[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
          <span className="min-w-0 flex-1 truncate text-[#45505e]">{it.label}</span>
          <span className="shrink-0 font-semibold text-[#14352a]">{fmtN(it.value)}</span>
          <span className="w-9 shrink-0 text-right text-[#9aa4af]">{pct(it.value, it.total)}%</span>
        </div>
      ))}
    </div>
  );
}

function HBar({ label, value, max, color = "#2f8f4e", sub }: {
  label: string; value: number; max: number; color?: string; sub?: string;
}) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs font-medium text-[#45505e]" title={label}>{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#f2f5ef]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${w}%`, background: color }} />
      </div>
      <div className="w-20 shrink-0 text-right">
        <span className="text-xs font-semibold tabular-nums text-[#14352a]">{sub ?? fmtN(value)}</span>
      </div>
    </div>
  );
}

function SerieDoble({ data, labelA, labelB, colorA = "#2f8f4e", colorB = "#5b8fd9" }: {
  data: { fecha: string; a: number; b: number }[];
  labelA: string; labelB: string; colorA?: string; colorB?: string;
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-[#7a8794]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colorA }} />{labelA}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colorB }} />{labelB}</span>
      </div>
      <div className="flex h-32 items-end gap-2">
        {data.map((d) => (
          <div key={d.fecha} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-24 w-full items-end justify-center gap-0.5">
              <div className="relative w-1/2 rounded-t-sm bg-[#f2f5ef]" style={{ height: "96px" }}>
                <div className="absolute bottom-0 w-full rounded-t-sm transition-all duration-500" style={{ height: `${(d.a / max) * 100}%`, background: colorA }} />
              </div>
              <div className="relative w-1/2 rounded-t-sm bg-[#f2f5ef]" style={{ height: "96px" }}>
                <div className="absolute bottom-0 w-full rounded-t-sm transition-all duration-500" style={{ height: `${(d.b / max) * 100}%`, background: colorB }} />
              </div>
            </div>
            <span className="text-center text-[9px] text-[#7a8794]">{fmtFecha(d.fecha)}</span>
          </div>
        ))}
        {data.length === 0 && <p className="w-full text-center text-sm text-[#9aa4af]">Sin datos en el rango</p>}
      </div>
    </div>
  );
}

function SparkBars({ data, color = "#2f8f4e" }: { data: { label: string; value: number; sub?: string }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-28 items-end gap-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          {d.value > 0 && <span className="text-[9px] font-semibold text-[#14352a]">{d.value}</span>}
          <div className="w-full overflow-hidden rounded-t-md bg-[#f2f5ef]" style={{ height: "80px" }}>
            <div className="w-full rounded-t-md transition-all duration-700" title={d.sub} style={{ height: `${(d.value / max) * 100}%`, marginTop: `${100 - (d.value / max) * 100}%`, background: color }} />
          </div>
          <span className="text-center text-[9px] text-[#7a8794]">{d.label}</span>
        </div>
      ))}
      {data.length === 0 && <p className="w-full text-center text-sm text-[#9aa4af]">Sin datos en el rango</p>}
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm ${className}`}>{children}</div>;
}

function PanelHeader({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="border-b border-[#eceef0] px-4 py-3">
      <h2 className="text-sm font-semibold text-[#14352a]">{titulo}</h2>
      {sub && <p className="text-xs text-[#9aa4af]">{sub}</p>}
    </div>
  );
}

function colorDuracion(min: number): string {
  if (min <= 20) return "#2f8f4e";
  if (min <= 45) return "#d9a441";
  return "#b3261e";
}

type Vista = "cargue" | "novedades" | "flete";
const VISTAS: { key: Vista; label: string }[] = [
  { key: "cargue", label: "Tiempos de Cargue" },
  { key: "novedades", label: "Novedades (SLA)" },
  { key: "flete", label: "Costo de Flete" },
];

export default function IndicadoresPage() {
  const [vista, setVista] = useState<Vista>("cargue");

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6 lg:p-8">
      <header className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">Indicadores</h1>
          <p className="text-sm text-[#5f7a68]">
            {vista === "cargue" && "Duración real de cargue por área, cuellos de botella y reaperturas."}
            {vista === "novedades" && "Antigüedad y tiempo de resolución de novedades, motivos y recurrencia."}
            {vista === "flete" && "Costo de flete por kg transportado, real vs ideal, por ruta."}
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-[#dfe4e0] bg-white p-0.5">
          {VISTAS.map((v) => (
            <button
              key={v.key}
              onClick={() => setVista(v.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${vista === v.key ? "bg-[#2f8f4e] text-white" : "text-[#5f7a68] hover:bg-[#f4f6f3]"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>

      {vista === "cargue" && <VistaCargue />}
      {vista === "novedades" && <VistaNovedades />}
      {vista === "flete" && <VistaCostoFlete />}
    </div>
  );
}

function VistaCargue() {
  const [data, setData] = useState<IndicadoresCargue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState(() => diasAtras(6));
  const [hasta, setHasta] = useState(() => diasAtras(0));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await getIndicadoresCargue({ desde, hasta })); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Error al cargar"); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { load(); }, [load]);

  const rankingAreas = data?.rankingAreas ?? [];
  const totalCiclos = data?.resumen.ciclos ?? 0;
  const maxPromedio = Math.max(1, ...rankingAreas.map((a) => a.duracionPromedioMin));
  const maxReap = Math.max(1, ...(data?.rankingReaperturas.map((r) => r.reaperturas) ?? []));

  return (
    <>
      {error && <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      <div className="mb-4"><FiltroRangoFecha desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} /></div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
          : [
            { label: "Ciclos de cargue", value: fmtN(totalCiclos), icon: IconBox, color: "#14352a" },
            { label: "Duración promedio", value: fmtMin(data?.resumen.duracionPromedioMin ?? 0), icon: IconTimer, color: colorDuracion(data?.resumen.duracionPromedioMin ?? 0) },
            { label: "P90", value: fmtMin(data?.resumen.duracionP90Min ?? 0), sub: "9 de cada 10 cierran en este tiempo o menos", icon: IconBarChart, color: colorDuracion(data?.resumen.duracionP90Min ?? 0) },
            { label: "Reaperturas", value: fmtN(data?.resumen.reaperturas ?? 0), sub: "veces que un área se reabrió tras CARGADA", icon: IconAlertTriangle, color: (data?.resumen.reaperturas ?? 0) > 0 ? "#b3261e" : "#2f8f4e" },
          ].map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-2">
          <PanelHeader titulo="Ciclos por área" sub="Qué área concentra más cargues confirmados" />
          <div className="grid grid-cols-2 items-center gap-4 p-4">
            <DonutChart
              segments={rankingAreas.map((a, i) => ({ value: a.ciclos, color: PALETA[i % PALETA.length], label: a.area }))}
              centerLabel={fmtN(totalCiclos)}
              centerSub="ciclos"
            />
            <Leyenda items={rankingAreas.map((a, i) => ({ label: a.area, value: a.ciclos, color: PALETA[i % PALETA.length], total: totalCiclos }))} />
          </div>
        </Panel>

        <Panel className="lg:col-span-3">
          <PanelHeader titulo="Duración promedio por área" sub="Verde ≤20 min · Ámbar ≤45 min · Rojo más de 45 min" />
          <div className="space-y-3 p-4">
            {rankingAreas.length === 0 && !loading && <p className="text-center text-sm text-[#9aa4af]">Sin ciclos de cargue en el rango</p>}
            {rankingAreas.map((a) => (
              <HBar key={a.area} label={a.area} value={a.duracionPromedioMin} max={maxPromedio} color={colorDuracion(a.duracionPromedioMin)} sub={fmtMin(a.duracionPromedioMin)} />
            ))}
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader titulo="Tendencia de duración" sub="Promedio diario de todos los ciclos cerrados ese día" />
          <div className="p-4">
            <SparkBars data={(data?.serie ?? []).map((s) => ({ label: fmtFecha(s.fecha), value: s.duracionPromedioMin, sub: `${s.ciclos} ciclos` }))} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Rutas con más reaperturas" sub="Un área que se reabrió tras confirmar CARGADA" />
          <div className="space-y-3 p-4">
            {(data?.rankingReaperturas.length ?? 0) === 0 && !loading && <p className="text-center text-sm text-[#9aa4af]">Sin reaperturas en el rango</p>}
            {data?.rankingReaperturas.map((r) => (
              <HBar key={r.rutaId} label={`#${r.numeroRuta} · ${r.placa ?? "—"}`} value={r.reaperturas} max={maxReap} color="#b3261e" />
            ))}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader titulo="Detalle de ciclos" sub="Más recientes primero, máximo 100 filas" />
        <div className="nice-scroll max-h-96 overflow-auto">
          <table className="w-full table-auto text-left text-sm">
            <thead className="sticky top-0 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Fecha</th>
                <th className="px-4 py-2.5 font-semibold">Ruta</th>
                <th className="px-4 py-2.5 font-semibold">Placa</th>
                <th className="px-4 py-2.5 font-semibold">Área</th>
                <th className="px-4 py-2.5 font-semibold">Duración</th>
                <th className="px-4 py-2.5 font-semibold">Confirmó</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2ee]">
              {!loading && (data?.detalle.length ?? 0) === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-[#9aa4af]">Sin ciclos en el rango</td></tr>
              )}
              {data?.detalle.slice(0, 100).map((c, i) => (
                <tr key={i} className="hover:bg-[#f9fbf7]">
                  <td className="px-4 py-2.5 text-[#45505e]">{fmtFecha(c.fecha)}</td>
                  <td className="px-4 py-2.5 text-[#45505e]">{c.numeroRuta != null ? `#${c.numeroRuta}` : "—"}</td>
                  <td className="px-4 py-2.5 text-[#45505e]">{c.placa ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[#45505e]">{c.area}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${colorDuracion(c.duracionMin)}1a`, color: colorDuracion(c.duracionMin) }}>
                      {fmtMin(c.duracionMin)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[#45505e]">{c.usuario ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function VistaNovedades() {
  const [data, setData] = useState<IndicadoresNovedades | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState(() => diasAtras(6));
  const [hasta, setHasta] = useState(() => diasAtras(0));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await getIndicadoresNovedades({ desde, hasta })); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Error al cargar"); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { load(); }, [load]);

  const buckets = data?.antiguedadAbiertas;
  const totalAbiertas = data?.resumen.abiertas ?? 0;
  const maxBucket = buckets ? Math.max(buckets["0-1d"], buckets["1-3d"], buckets["3-7d"], buckets["7d+"], 1) : 1;
  const maxMotivo = Math.max(1, ...(data?.topMotivos.map((m) => m.cantidad) ?? []));
  const maxResp = Math.max(1, ...(data?.topResponsabilidad.map((m) => m.cantidad) ?? []));
  const maxPlaca = Math.max(1, ...(data?.topPlacas.map((m) => m.cantidad) ?? []));
  const maxCliente = Math.max(1, ...(data?.topClientes.map((m) => m.cantidad) ?? []));
  const totalReales = data?.resumen.reales ?? 0;

  return (
    <>
      {error && <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      <div className="mb-4"><FiltroRangoFecha desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} /></div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
          : [
            { label: "Novedades reales", value: fmtN(totalReales), sub: `${data?.resumen.total ?? 0} incl. "Sin Novedad"`, icon: IconAlertTriangle, color: "#14352a" },
            { label: "Abiertas", value: fmtN(totalAbiertas), icon: IconClipboard, color: totalAbiertas > 0 ? "#a86a12" : "#2f8f4e" },
            { label: "Resueltas", value: fmtN(data?.resumen.resueltas ?? 0), icon: IconCheckCircle, color: "#2f8f4e" },
            { label: "Tiempo de resolución", value: fmtMin(data?.resumen.tiempoResolucionPromedioMin ?? 0), sub: `P90: ${fmtMin(data?.resumen.tiempoResolucionP90Min ?? 0)}`, icon: IconHistory, color: "#14352a" },
          ].map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-2">
          <PanelHeader titulo="Abiertas vs resueltas" sub="De las novedades reales (excluye Sin Novedad)" />
          <div className="flex items-center justify-center p-4">
            <div className="w-40">
              <DonutChart
                segments={[
                  { value: totalAbiertas, color: "#a86a12", label: "Abiertas" },
                  { value: data?.resumen.resueltas ?? 0, color: "#2f8f4e", label: "Resueltas" },
                ]}
                centerLabel={fmtN(totalReales)}
                centerSub="reales"
              />
            </div>
          </div>
        </Panel>

        <Panel className="lg:col-span-3">
          <PanelHeader titulo="Antigüedad de novedades abiertas" />
          <div className="space-y-3 p-4">
            <HBar label="0-1 día" value={buckets?.["0-1d"] ?? 0} max={maxBucket} color="#2f8f4e" />
            <HBar label="1-3 días" value={buckets?.["1-3d"] ?? 0} max={maxBucket} color="#d9a441" />
            <HBar label="3-7 días" value={buckets?.["3-7d"] ?? 0} max={maxBucket} color="#e07a3f" />
            <HBar label="7+ días" value={buckets?.["7d+"] ?? 0} max={maxBucket} color="#b3261e" />
          </div>
        </Panel>
      </div>

      <div className="mb-4">
        <Panel>
          <PanelHeader titulo="Tendencia diaria" sub="Creadas vs resueltas (novedades reales)" />
          <div className="p-4">
            <SerieDoble data={(data?.serie ?? []).map((s) => ({ fecha: s.fecha, a: s.creadas, b: s.resueltas }))} labelA="Creadas" labelB="Resueltas" />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader titulo="Top motivos" sub={`% sobre ${fmtN(totalReales)} novedades reales`} />
          <div className="space-y-3 p-4">
            {(data?.topMotivos.length ?? 0) === 0 && !loading && <p className="text-center text-sm text-[#9aa4af]">Sin datos en el rango</p>}
            {data?.topMotivos.map((m, i) => (
              <HBar key={m.valor} label={m.valor} value={m.cantidad} max={maxMotivo} color={PALETA[i % PALETA.length]} sub={`${fmtN(m.cantidad)} · ${pct(m.cantidad, totalReales)}%`} />
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Top responsabilidad" sub={`% sobre ${fmtN(totalReales)} novedades reales`} />
          <div className="space-y-3 p-4">
            {(data?.topResponsabilidad.length ?? 0) === 0 && !loading && <p className="text-center text-sm text-[#9aa4af]">Sin datos en el rango</p>}
            {data?.topResponsabilidad.map((m, i) => (
              <HBar key={m.valor} label={m.valor} value={m.cantidad} max={maxResp} color={PALETA[i % PALETA.length]} sub={`${fmtN(m.cantidad)} · ${pct(m.cantidad, totalReales)}%`} />
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Placas con más novedades" />
          <div className="space-y-3 p-4">
            {(data?.topPlacas.length ?? 0) === 0 && !loading && <p className="text-center text-sm text-[#9aa4af]">Sin datos en el rango</p>}
            {data?.topPlacas.map((m, i) => (
              <HBar key={m.valor} label={m.valor} value={m.cantidad} max={maxPlaca} color={PALETA[i % PALETA.length]} />
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Clientes con más novedades" />
          <div className="space-y-3 p-4">
            {(data?.topClientes.length ?? 0) === 0 && !loading && <p className="text-center text-sm text-[#9aa4af]">Sin datos en el rango</p>}
            {data?.topClientes.map((m, i) => (
              <HBar key={m.valor} label={m.valor} value={m.cantidad} max={maxCliente} color={PALETA[i % PALETA.length]} />
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function VistaCostoFlete() {
  const [data, setData] = useState<IndicadoresCostoFlete | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState(() => diasAtras(6));
  const [hasta, setHasta] = useState(() => diasAtras(0));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await getIndicadoresCostoFlete({ desde, hasta })); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Error al cargar"); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { load(); }, [load]);

  const rankingRutas = data?.rankingRutas ?? [];
  const totalCosto = data?.resumen.costoTotal ?? 0;
  const maxCostoKg = Math.max(1, ...rankingRutas.map((r) => r.costoPorKg));

  return (
    <>
      {error && <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      <div className="mb-4"><FiltroRangoFecha desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} /></div>

      {!loading && data && data.resumen.envios === 0 && (
        <div className="mb-4 rounded-lg border border-[#dfe4e0] bg-[#f7faf5] px-4 py-3 text-sm text-[#5f7a68]">
          Sin envíos a Drivin con costo registrado en este rango — el costo de flete se empieza a capturar
          desde que se activó este indicador, no hay datos retroactivos de envíos anteriores.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
          : [
            { label: "Envíos con costo", value: fmtN(data?.resumen.envios ?? 0), icon: IconBox, color: "#14352a" },
            { label: "Costo total", value: fmtMoney(totalCosto), icon: IconCoin, color: "#14352a" },
            { label: "Kg transportados", value: fmtN(data?.resumen.kgTotal ?? 0), icon: IconBarChart, color: "#14352a" },
            { label: "Costo/kg promedio", value: fmtMoney(data?.resumen.costoPorKgPromedio ?? 0), icon: IconCoin, color: "#2f8f4e" },
          ].map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-2">
          <PanelHeader titulo="Costo por ruta" sub="Participación de cada ruta en el costo total" />
          <div className="grid grid-cols-2 items-center gap-4 p-4">
            <DonutChart
              segments={rankingRutas.map((r, i) => ({ value: r.costoTotal, color: PALETA[i % PALETA.length], label: r.ruta }))}
              centerLabel={fmtMoney(totalCosto).replace("COP", "").trim()}
              centerSub="costo total"
            />
            <Leyenda items={rankingRutas.map((r, i) => ({ label: r.ruta, value: r.costoTotal, color: PALETA[i % PALETA.length], total: totalCosto }))} />
          </div>
        </Panel>

        <Panel className="lg:col-span-3">
          <PanelHeader titulo="Costo por kg real" sub="Ordenado de mayor a menor costo por kg transportado" />
          <div className="space-y-3 p-4">
            {rankingRutas.length === 0 && !loading && <p className="text-center text-sm text-[#9aa4af]">Sin datos en el rango</p>}
            {rankingRutas.map((r, i) => (
              <HBar key={r.ruta} label={r.ruta} value={r.costoPorKg} max={maxCostoKg} color={PALETA[i % PALETA.length]} sub={fmtMoney(r.costoPorKg)} />
            ))}
          </div>
        </Panel>
      </div>

      <div className="mb-4">
        <Panel>
          <PanelHeader titulo="Tendencia de costo" sub="Costo total transportado por día (en miles de pesos)" />
          <div className="p-4">
            <SparkBars color="#2f8f4e" data={(data?.serie ?? []).map((s) => ({ label: fmtFecha(s.fecha), value: Math.round(s.costo / 1000), sub: `${fmtMoney(s.costo)} · ${fmtN(s.kg)} kg` }))} />
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader titulo="Ranking de rutas por costo" />
        <div className="nice-scroll overflow-auto">
          <table className="w-full table-auto text-left text-sm">
            <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Ruta</th>
                <th className="px-4 py-2.5 font-semibold">Envíos</th>
                <th className="px-4 py-2.5 font-semibold">% del costo</th>
                <th className="px-4 py-2.5 font-semibold">Costo total</th>
                <th className="px-4 py-2.5 font-semibold">Kg</th>
                <th className="px-4 py-2.5 font-semibold">$/kg real</th>
                <th className="px-4 py-2.5 font-semibold">$/kg ideal (full)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2ee]">
              {!loading && rankingRutas.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-[#9aa4af]">Sin datos en el rango</td></tr>
              )}
              {rankingRutas.map((r) => (
                <tr key={r.ruta} className="hover:bg-[#f9fbf7]">
                  <td className="px-4 py-2.5 font-medium text-[#14352a]">{r.ruta}</td>
                  <td className="px-4 py-2.5 text-[#45505e]">{fmtN(r.envios)}</td>
                  <td className="px-4 py-2.5 text-[#45505e]">{pct(r.costoTotal, totalCosto)}%</td>
                  <td className="px-4 py-2.5 text-[#45505e]">{fmtMoney(r.costoTotal)}</td>
                  <td className="px-4 py-2.5 text-[#45505e]">{fmtN(r.kgTotal)}</td>
                  <td className="px-4 py-2.5 font-medium text-[#14352a]">{fmtMoney(r.costoPorKg)}</td>
                  <td className="px-4 py-2.5 text-[#9aa4af]">{fmtMoney(r.costoPorKgIdeal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
