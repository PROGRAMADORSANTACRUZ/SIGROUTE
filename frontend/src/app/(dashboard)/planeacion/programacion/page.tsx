"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { cerrarArea, getGrid, guardarGrid, reabrirArea } from "@/lib/planApi";
import { ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { PageLoader } from "@/components/Loading";
import StatCard from "@/components/StatCard";
import { IconBox, IconDiagrama, IconLock, IconLockOpen, IconPrinter, IconUsers } from "@/components/icons";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import SearchInput from "@/components/SearchInput";
import PegarExcelModal from "@/components/planeacion/PegarExcelModal";
import type { ResultadoPegado } from "@/lib/pegarProgramacion";

const CANASTILLA_KG = 1.9; // cada canastilla suma 1.9 kg al total (igual que el original)
const POR_PAGINA = 50;

// Fondo alterno (zebra) por bloque de categoría, sutil y neutro, solo para
// separar visualmente las columnas sin llenar la grilla de colores.
const zebraCategoria = (i: number) => (i % 2 === 0 ? "#ffffff" : "#f6f8f5");

interface Categoria { clave: string; etiqueta: string; kls: string; can: string }
// "Destino" aquí es en realidad un Cliente del maestro de Ejecución (id = cuid).
interface Destino { id: string; numero: string | null; nombre: string; canal: string | null }
interface GridData {
  prog: { id: number; consecutivo: number | null; estado: string | null };
  destinos: Destino[];
  detalle: Record<string, Record<string, number>>;
  categorias: Categoria[];
  editables: string[] | null;
  cerradas: Record<string, string>;
  misAreas: string[];
  canCerrar: boolean;
  canReabrir: boolean;
  canEditar: boolean;
  totales: { kls: number; canastillas: number };
  esAdmin: boolean;
  todasCerradas: boolean;
}

export default function ProgramacionPage() {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<GridData | null>(null);
  const [valores, setValores] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [canalFiltro, setCanalFiltro] = useState("");
  const [soloConCarga, setSoloConCarga] = useState(false);
  const [orden, setOrden] = useState<"nombre" | "kg_desc" | "kg_asc">("nombre");
  const [pagina, setPagina] = useState(1);
  const [pegarAbierto, setPegarAbierto] = useState(false);
  const tablaRef = useRef<HTMLTableElement>(null);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  function cargar() {
    setLoading(true);
    getGrid(fecha)
      .then((d) => {
        const gd = d as GridData;
        setData(gd);
        const v: Record<string, Record<string, string>> = {};
        for (const dest of gd.destinos) {
          const row = gd.detalle[dest.id] ?? {};
          v[dest.id] = {};
          for (const c of gd.categorias) {
            v[dest.id][c.kls] = String(row[c.kls] ?? 0);
            v[dest.id][c.can] = String(row[c.can] ?? 0);
          }
        }
        setValores(v);
        setPagina(1);
      })
      .finally(() => setLoading(false));
  }
  useEffect(cargar, [fecha]);

  const editableCols = useMemo(() => {
    if (!data) return new Set<string>();
    const cols = new Set<string>();
    for (const c of data.categorias) {
      const esMia = data.misAreas.includes(c.etiqueta);
      const cerrada = c.etiqueta in data.cerradas;
      if (esMia && !cerrada) {
        cols.add(c.kls);
        cols.add(c.can);
      }
    }
    return cols;
  }, [data]);

  const canales = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.destinos.map((d) => d.canal).filter(Boolean))] as string[];
  }, [data]);

  const destinosFiltrados = useMemo(() => {
    if (!data) return [];
    const q = busqueda.trim().toLowerCase();
    let lista = data.destinos.filter((d) => {
      if (canalFiltro && d.canal !== canalFiltro) return false;
      if (q && !d.nombre.toLowerCase().includes(q) && !String(d.numero ?? "").toLowerCase().includes(q)) return false;
      if (soloConCarga && totalFila(d.id) <= 0) return false;
      return true;
    });
    if (orden === "kg_desc") lista = [...lista].sort((a, b) => totalFila(b.id) - totalFila(a.id));
    else if (orden === "kg_asc") lista = [...lista].sort((a, b) => totalFila(a.id) - totalFila(b.id));
    return lista;
  }, [data, busqueda, canalFiltro, soloConCarga, orden, valores]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resetea a la página 1 cuando cambia el filtro (búsqueda/canal), no cuando
  // solo se escribe en la grilla — así nunca se pierde de vista lo que se edita.
  useEffect(() => { setPagina(1); }, [busqueda, canalFiltro, soloConCarga, orden]);

  const totalPaginas = Math.max(1, Math.ceil(destinosFiltrados.length / POR_PAGINA));
  const destinosPagina = useMemo(
    () => destinosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA),
    [destinosFiltrados, pagina]
  );

  // Totales en vivo (recalculados con cada input, igual que el JS original).
  function totalFila(destinoId: string): number {
    if (!data) return 0;
    let t = 0;
    for (const c of data.categorias) {
      t += Number(valores[destinoId]?.[c.kls] ?? 0);
      t += Number(valores[destinoId]?.[c.can] ?? 0) * CANASTILLA_KG;
    }
    return t;
  }
  const totalesVivo = useMemo(() => {
    if (!data) return { kls: 0, canastillas: 0 };
    let kls = 0;
    let can = 0;
    for (const d of data.destinos) {
      for (const c of data.categorias) {
        kls += Number(valores[d.id]?.[c.kls] ?? 0);
        can += Number(valores[d.id]?.[c.can] ?? 0);
      }
    }
    return { kls: kls + can * CANASTILLA_KG, canastillas: can };
  }, [data, valores]);

  async function guardar() {
    if (!data) return;
    // Se env\u00edan TODOS los destinos cargados (no solo la p\u00e1gina visible), as\u00ed
    // que cambiar de p\u00e1gina o filtrar nunca pierde una edici\u00f3n sin guardar.
    const filas = data.destinos.map((d) => ({
      clienteId: d.id,
      valores: Object.fromEntries(Object.entries(valores[d.id] ?? {}).map(([k, v]) => [k, Number(v) || 0])),
    }));
    try {
      await guardarGrid(fecha, filas);
      showToast("Guardado correctamente.", "success");
      cargar();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al guardar", "error");
    }
  }

  // Aplica lo detectado en el modal "Pegar desde Excel" a la grilla en
  // memoria (no guarda solo): el usuario revisa y luego pulsa Guardar, igual
  // que si hubiera tecleado los valores a mano.
  function aplicarPegado(r: ResultadoPegado) {
    if (!data) return;
    setValores((prev) => {
      const next = { ...prev };
      for (const fila of r.filas) {
        if (!fila.destinoId) continue;
        const actual = { ...(next[fila.destinoId] ?? {}) };
        for (const [campo, valor] of Object.entries(fila.valores)) {
          if (editableCols.has(campo)) actual[campo] = String(valor);
        }
        next[fila.destinoId] = actual;
      }
      return next;
    });
    const n = r.filas.filter((f) => f.destinoId).length;
    showToast(`${n} destino(s) actualizados en la grilla — revisa y pulsa Guardar.`, "success");
    setPegarAbierto(false);
  }

  // Enter salta a la siguiente celda editable visible de la grilla (igual que el original).
  function onEnterNext(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !tablaRef.current) return;
    e.preventDefault();
    const inputs = [...tablaRef.current.querySelectorAll<HTMLInputElement>("input:not(:disabled)")];
    const idx = inputs.indexOf(e.currentTarget);
    inputs[idx + 1]?.focus();
    inputs[idx + 1]?.select();
  }

  return (
    <div className="p-6">
      <PageHeader
        icon={IconDiagrama}
        title="Planificación"
        subtitle="Kilos y canastillas por destino y categoría para la fecha seleccionada."
        actions={
          <>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
            {data?.canEditar && (
              <button onClick={() => setPegarAbierto(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>
                Pegar desde Excel
              </button>
            )}
            {data?.canEditar && (
              <button onClick={guardar} className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                Guardar
              </button>
            )}
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">{IconPrinter} Imprimir</button>
          </>
        }
      />
      <p className="mb-3 hidden text-sm text-[#45505e] print:block">Fecha: {fecha}</p>
      {pegarAbierto && data && (
        <PegarExcelModal
          categorias={data.categorias}
          destinos={data.destinos}
          onAplicar={aplicarPegado}
          onClose={() => setPegarAbierto(false)}
        />
      )}

      {loading || !data ? (
        <PageLoader />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
            <StatCard label="Destinos visibles" value={destinosFiltrados.length.toLocaleString("es-CO")} icon={IconUsers} />
            <StatCard label="Total kilos" value={totalesVivo.kls.toLocaleString("es-CO", { maximumFractionDigits: 0 })} color="#2f8f4e" icon={IconBox} />
            <StatCard label="Canastillas" value={totalesVivo.canastillas.toLocaleString("es-CO")}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="1.5" /><path d="M3 8l2.5-4h13L21 8" /><path d="M9 13h6" /></svg>} />
            <StatCard label="Áreas abiertas" value={`${data.categorias.length - Object.keys(data.cerradas).length}/${data.categorias.length}`} icon={IconLockOpen} />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
            {data.categorias.map((c) => {
              const cerrada = c.etiqueta in data.cerradas;
              const puedeGestionar = data.misAreas.includes(c.etiqueta);
              return (
                <div key={c.clave} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${cerrada ? "border-[#f0c4c1] bg-[#fbeceb] text-[#b3261e]" : "border-[#dfe4e0] bg-white text-[#45505e]"}`}>
                  <span className="font-medium">{c.etiqueta}</span>
                  <span className="inline-flex items-center gap-1">{cerrada ? IconLock : IconLockOpen} {cerrada ? "Cerrada" : "Abierta"}</span>
                  {puedeGestionar && data.canCerrar && !cerrada && (
                    <button onClick={async () => { if (await confirm({ title: `¿Cerrar el área ${c.etiqueta}?` })) cerrarArea(fecha, c.etiqueta).then(cargar); }} className="font-medium text-[#2f8f4e] hover:underline">Cerrar</button>
                  )}
                  {data.canReabrir && cerrada && (
                    <button onClick={async () => { if (await confirm({ title: `¿Reabrir el área ${c.etiqueta}?` })) reabrirArea(fecha, c.etiqueta).then(cargar); }} className="font-medium text-[#2f8f4e] hover:underline">Reabrir</button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
            <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar destino…" className="w-64" />
            {canales.length > 0 && (
              <div className="flex items-center gap-0.5 rounded-lg border border-[#dfe4e0] bg-white p-0.5">
                <button
                  onClick={() => setCanalFiltro("")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${canalFiltro === "" ? "bg-[#2f8f4e] text-white" : "text-[#5f7a68] hover:bg-[#f4f6f3]"}`}
                >
                  Todos
                </button>
                {canales.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCanalFiltro(c)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${canalFiltro === c ? "bg-[#2f8f4e] text-white" : "text-[#5f7a68] hover:bg-[#f4f6f3]"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <span className="text-xs text-[#7a8794]">
              {destinosFiltrados.length.toLocaleString("es-CO")} clientes · página {pagina} de {totalPaginas}
            </span>
            <label className="ml-auto flex cursor-pointer select-none items-center gap-2 text-xs text-[#45505e]">
              Solo con carga
              <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors" style={{ backgroundColor: soloConCarga ? "#2f8f4e" : "#d7dcd8" }}>
                <input
                  type="checkbox"
                  checked={soloConCarga}
                  onChange={(e) => setSoloConCarga(e.target.checked)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${soloConCarga ? "translate-x-[18px]" : "translate-x-0.5"}`} />
              </span>
            </label>
            <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-xs text-[#45505e] outline-none focus:border-[#2f8f4e]">
              <option value="nombre">Orden: nombre</option>
              <option value="kg_desc">Orden: mayor kg</option>
              <option value="kg_asc">Orden: menor kg</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
            <table ref={tablaRef} className="w-full text-xs">
              <thead className="sticky top-0 z-10 border-b border-[#e1e9dd] bg-[#f7faf5] text-left font-semibold uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="sticky left-0 z-20 bg-[#f7faf5] px-3 py-2.5">Destino</th>
                  {data.categorias.map((c, i) => {
                    const editable = editableCols.has(c.kls);
                    return (
                      <th
                        key={c.clave}
                        className="border-l border-[#e1e9dd] px-2 py-2.5 text-center"
                        style={{ backgroundColor: zebraCategoria(i) }}
                        colSpan={editable ? 2 : 1}
                      >
                        <span className="inline-flex items-center justify-center gap-1">
                          {c.etiqueta} {c.etiqueta in data.cerradas && IconLock}
                        </span>
                      </th>
                    );
                  })}
                  <th className="border-l border-[#e1e9dd] px-3 py-2.5 text-right">Total kls</th>
                </tr>
                <tr className="text-[10px] normal-case tracking-normal text-[#9aa4af]">
                  <th className="sticky left-0 z-20 bg-[#f7faf5]"></th>
                  {data.categorias.map((c, i) => {
                    const editable = editableCols.has(c.kls);
                    return editable ? (
                      <React.Fragment key={c.clave}>
                        <th className="border-l border-[#e1e9dd] px-1.5 pb-2 text-center font-normal" style={{ backgroundColor: zebraCategoria(i) }}>Kls</th>
                        <th className="px-1.5 pb-2 text-center font-normal" style={{ backgroundColor: zebraCategoria(i) }}>Can</th>
                      </React.Fragment>
                    ) : (
                      <th key={c.clave} className="border-l border-[#e1e9dd] px-1.5 pb-2 text-center font-normal" style={{ backgroundColor: zebraCategoria(i) }}>Solo lectura</th>
                    );
                  })}
                  <th className="border-l border-[#e1e9dd]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {destinosPagina.map((d) => (
                  <tr key={d.id} className={totalFila(d.id) > 0 ? "bg-[#f7fbf5] hover:bg-[#eef6ea]" : "hover:bg-[#f9fbf7]"}>
                    <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5 font-medium text-[#14352a]">{d.numero} {d.nombre}</td>
                    {data.categorias.map((c, i) => {
                      const editable = editableCols.has(c.kls);
                      const zebra = zebraCategoria(i);
                      if (!editable) {
                        const kls = Number(valores[d.id]?.[c.kls] ?? 0);
                        const can = Number(valores[d.id]?.[c.can] ?? 0);
                        return (
                          <td key={c.clave} className="border-l border-[#eceef0] px-2 py-1.5 text-center text-[#7a8794]" style={{ backgroundColor: zebra }}>
                            {kls || can ? `${kls.toLocaleString("es-CO")} kg · ${can} can` : "—"}
                          </td>
                        );
                      }
                      return (
                        <React.Fragment key={c.clave}>
                          <td className="border-l border-[#eceef0] px-1 py-1" style={{ backgroundColor: zebra }}>
                            <input
                              value={valores[d.id]?.[c.kls] ?? "0"}
                              onFocus={(e) => e.currentTarget.select()}
                              onKeyDown={onEnterNext}
                              onChange={(e) => setValores((v) => ({ ...v, [d.id]: { ...v[d.id], [c.kls]: e.target.value } }))}
                              className="w-16 rounded border border-[#dfe4e0] px-1 py-1 text-center focus:border-[#2f8f4e] focus:outline-none"
                            />
                          </td>
                          <td className="px-1 py-1" style={{ backgroundColor: zebra }}>
                            <input
                              value={valores[d.id]?.[c.can] ?? "0"}
                              onFocus={(e) => e.currentTarget.select()}
                              onKeyDown={onEnterNext}
                              onChange={(e) => setValores((v) => ({ ...v, [d.id]: { ...v[d.id], [c.can]: e.target.value } }))}
                              className="w-16 rounded border border-[#dfe4e0] px-1 py-1 text-center focus:border-[#2f8f4e] focus:outline-none"
                            />
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td className="border-l border-[#eceef0] px-3 py-1.5 text-right">
                      <span className="inline-flex rounded-full bg-[#e8f3e2] px-2 py-0.5 font-semibold text-[#2f8f4e]">
                        {totalFila(d.id).toLocaleString("es-CO", { maximumFractionDigits: 1 })}
                      </span>
                    </td>
                  </tr>
                ))}
                {destinosFiltrados.length === 0 && (
                  <tr><td colSpan={data.categorias.length * 2 + 2} className="px-3 py-6 text-center text-[#9aa4af]">Sin destinos que coincidan con el filtro</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="mt-3 flex items-center justify-between print:hidden">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-1.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3] disabled:cursor-not-allowed disabled:opacity-50"
              >
                ← Anterior
              </button>
              <span className="text-xs text-[#7a8794]">Página {pagina} de {totalPaginas}</span>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-1.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente →
              </button>
            </div>
          )}
          <p className="mt-3 text-sm text-[#45505e]">
            Total: <strong>{totalesVivo.kls.toLocaleString("es-CO", { maximumFractionDigits: 1 })}</strong> kls · <strong>{totalesVivo.canastillas}</strong> canastillas
          </p>
        </>
      )}
    </div>
  );
}
