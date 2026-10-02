"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SearchInput from "@/components/SearchInput";
import { SkeletonStat, SkeletonTable } from "@/components/Loading";
import { ApiError, getPlanillas, type Planilla } from "@/lib/api";
import {
  getEnviosDrivinHistorico, getHistoricoPlaneacion,
  type EnvioDrivinHistorico, type HistoricoPlaneacionDia,
} from "@/lib/planApi";
import { docRI, docRIT, imprimirDocumento } from "@/lib/planillaDocs";
import { dlLabel } from "@/lib/utils";
import { FiltroRangoFecha, diasAtras } from "@/components/FiltroFecha";

const fmtKg = (n: number) =>
  n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (n: number) => n.toLocaleString("es-CO");
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO");

type Vista = "planillas" | "ejecutadas" | "planeacion";
const VISTAS: { key: Vista; label: string }[] = [
  { key: "planillas", label: "Planillas" },
  { key: "ejecutadas", label: "Órdenes Ejecutadas" },
  { key: "planeacion", label: "Planeación" },
];

// Modal para elegir qué documento imprimir (igual que en Planificación D.L).
function ImprimirModal({ planilla, onClose }: { planilla: Planilla; onClose: () => void }) {
  function handleImprimir(doc: () => void) {
    doc();
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f3e2] text-[#2f8f4e]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#14352a]">Imprimir documentos</h3>
            <p className="text-xs text-[#7a8794]">Plantilla {dlLabel(planilla.consecutivo)} · {planilla.placa}</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-[#5f7a68]">¿Qué deseas imprimir?</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => handleImprimir(() => imprimirDocumento(docRI(planilla)))} className="rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]">
            Imprimir R.I
          </button>
          <button onClick={() => handleImprimir(() => imprimirDocumento(docRIT(planilla)))} className="rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]">
            Imprimir R.I.T
          </button>
        </div>
        <button
          onClick={() => handleImprimir(() => { imprimirDocumento(docRI(planilla)); setTimeout(() => imprimirDocumento(docRIT(planilla)), 700); })}
          className="mt-2 w-full rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#277a42]"
        >
          Imprimir ambos
        </button>
        <button onClick={onClose} className="mt-2 w-full rounded-lg px-4 py-2 text-sm font-medium text-[#7a8794] transition-colors hover:bg-[#f4f6f3]">Cerrar</button>
      </div>
    </div>
  );
}

export default function HistoricosPage() {
  const [vista, setVista] = useState<Vista>("planillas");

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6 lg:p-8">
      <header className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">Históricos</h1>
          <p className="text-sm text-[#5f7a68]">
            {vista === "planillas" && "Todas las plantillas de despacho generadas."}
            {vista === "ejecutadas" && "Órdenes realmente enviadas a Drivin — histórico que nunca se borra."}
            {vista === "planeacion" && "Kilos planificados, destinos y cierres de área por día."}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Link href="/planificacion-dl" className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Carga de hoy
          </Link>
        </div>
      </header>

      {vista === "planillas" && <VistaPlanillas />}
      {vista === "ejecutadas" && <VistaEjecutadas />}
      {vista === "planeacion" && <VistaPlaneacion />}
    </div>
  );
}

function VistaPlanillas() {
  const [planillas, setPlanillas] = useState<Planilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [imprimir, setImprimir] = useState<Planilla | null>(null);
  const POR_PAGINA = 20;

  const load = useCallback(async () => {
    setError(null);
    try { setPlanillas(await getPlanillas()); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Error al cargar"); }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const filtrado = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    return planillas.filter((p) => {
      if (t && ![String(p.consecutivo), p.placa, p.conductor, p.ruta, p.auxiliarRuta, p.tipoDespacho].some((f) => f?.toLowerCase().includes(t))) return false;
      const iso = p.fecha || new Date(p.createdAt).toISOString().slice(0, 10);
      if (desde && iso < desde) return false;
      if (hasta && iso > hasta) return false;
      return true;
    });
  }, [planillas, buscar, desde, hasta]);

  // Resetear a página 1 cuando cambia el filtro
  useEffect(() => { setPagina(1); }, [buscar, desde, hasta]);

  const totalPaginas = Math.max(1, Math.ceil(filtrado.length / POR_PAGINA));
  const pagActual = Math.min(pagina, totalPaginas);
  const paginado = useMemo(
    () => filtrado.slice((pagActual - 1) * POR_PAGINA, pagActual * POR_PAGINA),
    [filtrado, pagActual]
  );

  const totalKilos = useMemo(() => filtrado.reduce((s, p) => s + p.kilos, 0), [filtrado]);
  const totalDocs  = useMemo(() => filtrado.reduce((s, p) => s + p.docs,  0), [filtrado]);

  return (
    <>
      {error && <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
          : [
          { label: "Plantillas", value: filtrado.length },
          { label: "Documentos", value: totalDocs },
          { label: "Kilos",      value: fmtKg(totalKilos) },
          { label: "Vehículos",  value: new Set(filtrado.map((p) => p.placa)).size },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[#7a8794]">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-[#14352a]">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceef0] px-4 py-3">
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar consecutivo, placa, conductor, ruta…" className="w-full sm:w-72" />
          <FiltroRangoFecha desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} compacto />
        </div>

        {loading ? (
          <div className="nice-scroll overflow-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Placa</th>
                  <th className="px-4 py-3 font-semibold">Conductor</th>
                  <th className="px-4 py-3 font-semibold">Auxiliar</th>
                  <th className="px-4 py-3 font-semibold">Ruta</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 text-right font-semibold">Docs</th>
                  <th className="px-4 py-3 text-right font-semibold">Kilos</th>
                  <th className="px-4 py-3 text-center font-semibold">Acciones</th>
                </tr>
              </thead>
              <SkeletonTable rows={8} cols={10} />
            </table>
          </div>
        ) : filtrado.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#5f7a68]">No hay plantillas para el filtro.</p>
        ) : (
          <div className="nice-scroll overflow-x-auto">
            <table className="w-full min-w-[860px] table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-3 py-3 font-semibold">#</th>
                  <th className="px-3 py-3 font-semibold">Fecha</th>
                  <th className="px-3 py-3 font-semibold">Placa</th>
                  <th className="px-3 py-3 font-semibold">Conductor</th>
                  <th className="px-3 py-3 font-semibold">Auxiliar</th>
                  <th className="px-3 py-3 font-semibold">Ruta</th>
                  <th className="px-3 py-3 font-semibold">Tipo</th>
                  <th className="px-3 py-3 text-right font-semibold">Docs</th>
                  <th className="px-3 py-3 text-right font-semibold">Kilos</th>
                  <th className="px-3 py-3 text-center font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {paginado.map((p) => (
                  <tr key={p.id} className={`hover:bg-[#f9fbf7] ${p.anulada ? "opacity-50" : ""}`}>
                    <td className="px-3 py-3 font-semibold text-[#14352a]">
                      {dlLabel(p.consecutivo)}
                      {p.anulada && <span className="ml-1.5 rounded bg-[#fbeceb] px-1.5 py-0.5 text-[10px] font-bold text-[#b3261e]">ANULADA</span>}
                      {p.anulada && p.reemplazadaPorConsecutivo && (
                        <div className="text-[10px] text-[#7a8794]">Reemplazada por {dlLabel(p.reemplazadaPorConsecutivo)}</div>
                      )}
                      {p.reemplazaDeConsecutivo && (
                        <div className="text-[10px] text-[#2f8f4e]">En reemplazo de {dlLabel(p.reemplazaDeConsecutivo)}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{p.fecha || new Date(p.createdAt).toLocaleDateString("es-CO")}</td>
                    <td className="px-3 py-3"><span className="rounded bg-yellow-300 px-2 py-0.5 text-xs font-bold tracking-wider text-[#14352a] ring-1 ring-yellow-400">{p.placa}</span></td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{p.conductor || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{p.auxiliarRuta || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{p.ruta || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{p.tipoDespacho || "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#45505e]">{p.docs}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#14352a]">{fmtKg(p.kilos)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center">
                        <button onClick={() => setImprimir(p)} title="Imprimir" aria-label="Imprimir" className="inline-flex items-center justify-center rounded-lg border border-[#dfe4e0] bg-white p-2 text-[#45505e] transition-colors hover:bg-[#f4f6f3]">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {!loading && filtrado.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t border-[#eceef0] px-4 py-3">
            <p className="text-xs text-[#7a8794]">
              Mostrando {((pagActual - 1) * POR_PAGINA) + 1}–{Math.min(pagActual * POR_PAGINA, filtrado.length)} de {filtrado.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagina(1)}
                disabled={pagActual === 1}
                className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-xs text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-40"
              >
                «
              </button>
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagActual === 1}
                className="rounded-lg border border-[#dfe4e0] bg-white px-2.5 py-1.5 text-xs text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-40"
              >
                ‹
              </button>
              {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPaginas || Math.abs(p - pagActual) <= 2)
                .reduce<(number | "...")[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`dots-${i}`} className="px-1 text-xs text-[#7a8794]">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPagina(p as number)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${pagActual === p ? "bg-[#2f8f4e] text-white" : "border border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]"}`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagActual === totalPaginas}
                className="rounded-lg border border-[#dfe4e0] bg-white px-2.5 py-1.5 text-xs text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-40"
              >
                ›
              </button>
              <button
                onClick={() => setPagina(totalPaginas)}
                disabled={pagActual === totalPaginas}
                className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-xs text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-40"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>

      {imprimir && <ImprimirModal planilla={imprimir} onClose={() => setImprimir(null)} />}
    </>
  );
}

function VistaEjecutadas() {
  const [envios, setEnvios] = useState<EnvioDrivinHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  // Mismo rango de 30 días que ya aplicaba el backend por defecto, pero ahora
  // visible en los inputs (antes quedaba oculto detrás de un campo en blanco).
  const [desde, setDesde] = useState(() => diasAtras(29));
  const [hasta, setHasta] = useState(() => diasAtras(0));
  const [expandido, setExpandido] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setEnvios(await getEnviosDrivinHistorico({ desde: desde || undefined, hasta: hasta || undefined, buscar: buscar || undefined })); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Error al cargar"); }
    finally { setLoading(false); }
  }, [desde, hasta, buscar]);

  useEffect(() => { load(); }, [load]);

  const totalKg = useMemo(() => envios.reduce((s, e) => s + e.totalKg, 0), [envios]);
  const totalFacturas = useMemo(() => envios.reduce((s, e) => s + e.totalFacturas, 0), [envios]);
  const exitosos = useMemo(() => envios.filter((e) => e.exitoso).length, [envios]);
  const errores = useMemo(() => envios.filter((e) => !e.exitoso).length, [envios]);

  return (
    <>
      {error && <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
          : [
          { label: "Envíos", value: envios.length },
          { label: "Éxitos / Errores", value: `${exitosos} / ${errores}` },
          { label: "Facturas", value: fmtN(totalFacturas) },
          { label: "Kilos enviados", value: fmtN(totalKg) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[#7a8794]">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-[#14352a]">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceef0] px-4 py-3">
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar placa, usuario, N° orden, cliente…" className="w-full sm:w-72" />
          <div className="flex items-center gap-2 text-sm">
            <FiltroRangoFecha desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} compacto />
          </div>
        </div>

        {loading ? (
          <div className="nice-scroll overflow-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Usuario</th>
                  <th className="px-4 py-3 font-semibold">Resultado</th>
                  <th className="px-4 py-3 font-semibold">Placas</th>
                  <th className="px-4 py-3 text-right font-semibold">Facturas</th>
                  <th className="px-4 py-3 text-right font-semibold">Kg</th>
                  <th className="px-4 py-3 text-center font-semibold">Detalle</th>
                </tr>
              </thead>
              <SkeletonTable rows={8} cols={7} />
            </table>
          </div>
        ) : envios.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#5f7a68]">No hay envíos a Drivin para el filtro.</p>
        ) : (
          <div className="nice-scroll overflow-x-auto">
            <table className="w-full min-w-[760px] table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-3 py-3 font-semibold">Fecha</th>
                  <th className="px-3 py-3 font-semibold">Usuario</th>
                  <th className="px-3 py-3 font-semibold">Resultado</th>
                  <th className="px-3 py-3 font-semibold">Placas</th>
                  <th className="px-3 py-3 text-right font-semibold">Facturas</th>
                  <th className="px-3 py-3 text-right font-semibold">Kg</th>
                  <th className="px-3 py-3 text-center font-semibold">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {envios.map((e) => (
                  <Fragment key={e.id}>
                    <tr key={e.id} className="hover:bg-[#f9fbf7]">
                      <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{fmtFecha(e.createdAt)} · {fmtHora(e.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{e.usuarioNombre || "—"}</td>
                      <td className="px-3 py-3">
                        {e.exitoso ? (
                          <span className="rounded-full bg-[#e8f3e2] px-2 py-0.5 text-xs font-semibold text-[#2f8f4e]">Éxito</span>
                        ) : (
                          <span className="rounded-full bg-[#fbeceb] px-2 py-0.5 text-xs font-semibold text-[#b3261e]" title={e.errorMensaje ?? ""}>Error</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{e.placas || "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#45505e]">{e.totalFacturas}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#14352a]">{fmtN(e.totalKg)}</td>
                      <td className="px-3 py-3 text-center">
                        {e.facturas.length > 0 && (
                          <button onClick={() => setExpandido(expandido === e.id ? null : e.id)} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1 text-xs font-medium text-[#45505e] hover:bg-[#f4f6f3]">
                            {expandido === e.id ? "Ocultar" : `Ver (${e.facturas.length})`}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandido === e.id && (
                      <tr>
                        <td colSpan={7} className="bg-[#f7faf5] px-3 py-3">
                          {e.errorMensaje && <p className="mb-2 text-xs text-[#b3261e]">{e.errorMensaje}</p>}
                          <table className="w-full text-xs">
                            <thead className="text-[#7a8794]">
                              <tr>
                                <th className="px-2 py-1 text-left font-semibold">N° Orden</th>
                                <th className="px-2 py-1 text-left font-semibold">Cliente</th>
                                <th className="px-2 py-1 text-left font-semibold">Destino</th>
                                <th className="px-2 py-1 text-left font-semibold">Placa</th>
                                <th className="px-2 py-1 text-right font-semibold">Kg</th>
                                <th className="px-2 py-1 text-right font-semibold">Valor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white">
                              {e.facturas.map((f, i) => (
                                <tr key={i}>
                                  <td className="px-2 py-1 font-medium text-[#14352a]">{f.numeroOrden}</td>
                                  <td className="px-2 py-1 text-[#45505e]">{f.cliente || "—"}</td>
                                  <td className="px-2 py-1 text-[#45505e]">{f.destino || "—"}</td>
                                  <td className="px-2 py-1 text-[#45505e]">{f.placa || "—"}</td>
                                  <td className="px-2 py-1 text-right tabular-nums text-[#45505e]">{fmtKg(f.cantidadKg)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums text-[#45505e]">{fmtN(f.valor)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function VistaPlaneacion() {
  const [dias, setDias] = useState<HistoricoPlaneacionDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState(() => diasAtras(29));
  const [hasta, setHasta] = useState(() => diasAtras(0));
  const [expandida, setExpandida] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setDias(await getHistoricoPlaneacion({ desde: desde || undefined, hasta: hasta || undefined })); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Error al cargar"); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { load(); }, [load]);

  const totalKg = useMemo(() => dias.reduce((s, d) => s + d.totalKg, 0), [dias]);
  const totalDestinos = useMemo(() => dias.reduce((s, d) => s + d.destinosConCarga, 0), [dias]);
  const totalRutas = useMemo(() => dias.reduce((s, d) => s + d.rutas, 0), [dias]);

  return (
    <>
      {error && <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
          : [
          { label: "Días con datos", value: dias.length },
          { label: "Kilos planificados", value: fmtN(totalKg) },
          { label: "Destinos con carga", value: fmtN(totalDestinos) },
          { label: "Rutas", value: fmtN(totalRutas) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[#7a8794]">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-[#14352a]">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-[#eceef0] px-4 py-3">
          <FiltroRangoFecha desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} compacto />
        </div>

        {loading ? (
          <div className="nice-scroll overflow-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Kg planificado</th>
                  <th className="px-4 py-3 text-right font-semibold">Canastillas</th>
                  <th className="px-4 py-3 text-right font-semibold">Destinos</th>
                  <th className="px-4 py-3 text-right font-semibold">Rutas</th>
                  <th className="px-4 py-3 text-center font-semibold">Áreas</th>
                </tr>
              </thead>
              <SkeletonTable rows={8} cols={7} />
            </table>
          </div>
        ) : dias.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#5f7a68]">No hay programación para el filtro.</p>
        ) : (
          <div className="nice-scroll overflow-x-auto">
            <table className="w-full min-w-[760px] table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-3 py-3 font-semibold">Fecha</th>
                  <th className="px-3 py-3 font-semibold">Estado</th>
                  <th className="px-3 py-3 text-right font-semibold">Kg planificado</th>
                  <th className="px-3 py-3 text-right font-semibold">Canastillas</th>
                  <th className="px-3 py-3 text-right font-semibold">Destinos</th>
                  <th className="px-3 py-3 text-right font-semibold">Rutas</th>
                  <th className="px-3 py-3 text-center font-semibold">Áreas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {dias.map((d) => (
                  <Fragment key={d.fecha}>
                    <tr key={d.fecha} className="hover:bg-[#f9fbf7]">
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#14352a]">{fmtFecha(d.fecha)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{d.estado || "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#14352a]">{fmtN(d.totalKg)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#45505e]">{fmtN(d.totalCanastillas)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#45505e]">{d.destinosConCarga}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#45505e]">{d.rutasAsignadas}/{d.rutas} <span className="text-[10px] text-[#9aa4af]">({d.rutasCerradas} cerradas)</span></td>
                      <td className="px-3 py-3 text-center">
                        {d.areas.length > 0 && (
                          <button onClick={() => setExpandida(expandida === d.fecha ? null : d.fecha)} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1 text-xs font-medium text-[#45505e] hover:bg-[#f4f6f3]">
                            {expandida === d.fecha ? "Ocultar" : `Ver (${d.areas.length})`}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandida === d.fecha && (
                      <tr>
                        <td colSpan={7} className="bg-[#f7faf5] px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            {d.areas.map((a) => (
                              <div key={a.area} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${a.cerrado ? "border-[#f0c4c1] bg-[#fbeceb] text-[#b3261e]" : "border-[#dfe4e0] bg-white text-[#45505e]"}`}>
                                <span className="font-medium">{a.area}</span>
                                <span>{a.cerrado ? "Cerrada" : "Abierta"}</span>
                                {a.cerrado && a.cerradoAt && <span className="text-[#8a5a56]">· {a.cerradoPor ?? "?"} a las {fmtHora(a.cerradoAt)}</span>}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
