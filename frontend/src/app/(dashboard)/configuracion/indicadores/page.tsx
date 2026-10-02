"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getIndicadoresCargue, getIndicadoresNovedades, getIndicadoresCostoFlete,
  type IndicadoresCargue, type IndicadoresNovedades, type IndicadoresCostoFlete,
} from "@/lib/planApi";
import { ApiError } from "@/lib/api";
import { SkeletonStat } from "@/components/Loading";
import { FiltroRangoFecha, diasAtras } from "@/components/FiltroFecha";

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

type Vista = "cargue" | "novedades" | "flete";
const VISTAS: { key: Vista; label: string }[] = [
  { key: "cargue", label: "Tiempos de Cargue" },
  { key: "novedades", label: "Novedades (SLA)" },
  { key: "flete", label: "Costo de Flete" },
];

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-[#7a8794]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#14352a]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#9aa4af]">{sub}</p>}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">{children}</div>;
}

function PanelHeader({ titulo }: { titulo: string }) {
  return <div className="border-b border-[#eceef0] px-4 py-3"><h2 className="text-sm font-semibold text-[#14352a]">{titulo}</h2></div>;
}

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

  return (
    <>
      {error && <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      <div className="mb-4"><FiltroRangoFecha desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} /></div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
          : [
            { label: "Ciclos de cargue", value: fmtN(data?.resumen.ciclos ?? 0) },
            { label: "Duración promedio", value: fmtMin(data?.resumen.duracionPromedioMin ?? 0) },
            { label: "P90", value: fmtMin(data?.resumen.duracionP90Min ?? 0), sub: "9 de cada 10 ciclos cierran en este tiempo o menos" },
            { label: "Reaperturas", value: fmtN(data?.resumen.reaperturas ?? 0), sub: "veces que un área se reabrió tras CARGADA" },
          ].map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader titulo="Áreas más lentas" />
          <div className="nice-scroll overflow-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr><th className="px-4 py-2.5 font-semibold">Área</th><th className="px-4 py-2.5 font-semibold">Ciclos</th><th className="px-4 py-2.5 font-semibold">Promedio</th><th className="px-4 py-2.5 font-semibold">P90</th></tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {!loading && (data?.rankingAreas.length ?? 0) === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-[#9aa4af]">Sin ciclos de cargue en el rango</td></tr>
                )}
                {data?.rankingAreas.map((a) => (
                  <tr key={a.area} className="hover:bg-[#f9fbf7]">
                    <td className="px-4 py-2.5 font-medium text-[#14352a]">{a.area}</td>
                    <td className="px-4 py-2.5 text-[#45505e]">{fmtN(a.ciclos)}</td>
                    <td className="px-4 py-2.5 text-[#45505e]">{fmtMin(a.duracionPromedioMin)}</td>
                    <td className="px-4 py-2.5 text-[#45505e]">{fmtMin(a.duracionP90Min)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Rutas con más reaperturas" />
          <div className="nice-scroll overflow-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr><th className="px-4 py-2.5 font-semibold">Ruta</th><th className="px-4 py-2.5 font-semibold">Placa</th><th className="px-4 py-2.5 font-semibold">Reaperturas</th></tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {!loading && (data?.rankingReaperturas.length ?? 0) === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-[#9aa4af]">Sin reaperturas en el rango</td></tr>
                )}
                {data?.rankingReaperturas.map((r) => (
                  <tr key={r.rutaId} className="hover:bg-[#f9fbf7]">
                    <td className="px-4 py-2.5 font-medium text-[#14352a]">#{r.numeroRuta}</td>
                    <td className="px-4 py-2.5 text-[#45505e]">{r.placa ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[#45505e]">{fmtN(r.reaperturas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel>
          <PanelHeader titulo="Detalle de ciclos (más recientes)" />
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
                    <td className="px-4 py-2.5 font-medium text-[#14352a]">{fmtMin(c.duracionMin)}</td>
                    <td className="px-4 py-2.5 text-[#45505e]">{c.usuario ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}

function BarraAntiguedad({ label, valor, total }: { label: string; valor: number; total: number }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs text-[#7a8794]">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#eceef0]">
        <div className="h-full rounded-full bg-[#2f8f4e]" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-medium text-[#45505e]">{valor}</span>
    </div>
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
  const maxBucket = buckets ? Math.max(buckets["0-1d"], buckets["1-3d"], buckets["3-7d"], buckets["7d+"], 1) : 1;

  return (
    <>
      {error && <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      <div className="mb-4"><FiltroRangoFecha desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} /></div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
          : [
            { label: "Novedades reales", value: fmtN(data?.resumen.reales ?? 0), sub: `${data?.resumen.total ?? 0} incl. "Sin Novedad"` },
            { label: "Abiertas", value: fmtN(data?.resumen.abiertas ?? 0) },
            { label: "Resueltas", value: fmtN(data?.resumen.resueltas ?? 0) },
            { label: "Tiempo de resolución", value: fmtMin(data?.resumen.tiempoResolucionPromedioMin ?? 0), sub: `P90: ${fmtMin(data?.resumen.tiempoResolucionP90Min ?? 0)}` },
          ].map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader titulo="Antigüedad de novedades abiertas" />
          <div className="space-y-3 p-4">
            <BarraAntiguedad label="0-1 día" valor={buckets?.["0-1d"] ?? 0} total={maxBucket} />
            <BarraAntiguedad label="1-3 días" valor={buckets?.["1-3d"] ?? 0} total={maxBucket} />
            <BarraAntiguedad label="3-7 días" valor={buckets?.["3-7d"] ?? 0} total={maxBucket} />
            <BarraAntiguedad label="7+ días" valor={buckets?.["7d+"] ?? 0} total={maxBucket} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Top motivos" />
          <div className="divide-y divide-[#f0f2ee]">
            {!loading && (data?.topMotivos.length ?? 0) === 0 && <p className="px-4 py-6 text-center text-sm text-[#9aa4af]">Sin datos en el rango</p>}
            {data?.topMotivos.map((m) => (
              <div key={m.valor} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-[#45505e]">{m.valor}</span>
                <span className="font-semibold text-[#14352a]">{fmtN(m.cantidad)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Top responsabilidad" />
          <div className="divide-y divide-[#f0f2ee]">
            {!loading && (data?.topResponsabilidad.length ?? 0) === 0 && <p className="px-4 py-6 text-center text-sm text-[#9aa4af]">Sin datos en el rango</p>}
            {data?.topResponsabilidad.map((m) => (
              <div key={m.valor} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-[#45505e]">{m.valor}</span>
                <span className="font-semibold text-[#14352a]">{fmtN(m.cantidad)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Placas con más novedades" />
          <div className="divide-y divide-[#f0f2ee]">
            {!loading && (data?.topPlacas.length ?? 0) === 0 && <p className="px-4 py-6 text-center text-sm text-[#9aa4af]">Sin datos en el rango</p>}
            {data?.topPlacas.map((m) => (
              <div key={m.valor} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-[#45505e]">{m.valor}</span>
                <span className="font-semibold text-[#14352a]">{fmtN(m.cantidad)}</span>
              </div>
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
            { label: "Envíos con costo", value: fmtN(data?.resumen.envios ?? 0) },
            { label: "Costo total", value: fmtMoney(data?.resumen.costoTotal ?? 0) },
            { label: "Kg transportados", value: fmtN(data?.resumen.kgTotal ?? 0) },
            { label: "Costo/kg promedio", value: fmtMoney(data?.resumen.costoPorKgPromedio ?? 0) },
          ].map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <Panel>
        <PanelHeader titulo="Ranking de rutas por costo" />
        <div className="nice-scroll overflow-auto">
          <table className="w-full table-auto text-left text-sm">
            <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Ruta</th>
                <th className="px-4 py-2.5 font-semibold">Envíos</th>
                <th className="px-4 py-2.5 font-semibold">Costo total</th>
                <th className="px-4 py-2.5 font-semibold">Kg</th>
                <th className="px-4 py-2.5 font-semibold">$/kg real</th>
                <th className="px-4 py-2.5 font-semibold">$/kg ideal (full)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2ee]">
              {!loading && (data?.rankingRutas.length ?? 0) === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-[#9aa4af]">Sin datos en el rango</td></tr>
              )}
              {data?.rankingRutas.map((r) => (
                <tr key={r.ruta} className="hover:bg-[#f9fbf7]">
                  <td className="px-4 py-2.5 font-medium text-[#14352a]">{r.ruta}</td>
                  <td className="px-4 py-2.5 text-[#45505e]">{fmtN(r.envios)}</td>
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
