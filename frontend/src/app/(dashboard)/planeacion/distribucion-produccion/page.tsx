"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { guardarDistribucion } from "@/lib/planApi";
import { ApiError } from "@/lib/api";
import { useEffect } from "react";
import { getDistribucionHistorial } from "@/lib/planApi";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { IconAlertTriangle, IconBox, IconCheckCircle, IconClipboard, IconHistory, IconUpload } from "@/components/icons";
import { useToast } from "@/components/ui/ToastProvider";
import EmptyState from "@/components/EmptyState";

interface Fila { dep: string; tienda: string; plu: string; producto: string; pedido: number; planta: number; distribuido: number; enOrden: boolean; excluido?: boolean }
interface HistRow { id: number; fecha: string; nit: string | null; totalPedido: number | null; totalPlanta: number | null; totalDistribuido: number | null; totalExcedente: number | null; totalFaltante: number | null }

function col(row: Record<string, unknown>, candidates: string[]): string {
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase();
    if (candidates.some((c) => k.includes(c))) return String(row[key] ?? "");
  }
  return "";
}
function num(row: Record<string, unknown>, candidates: string[]): number {
  const v = col(row, candidates);
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
async function parseArchivo(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

type Vista = "tienda" | "producto" | "ajustar";

export default function DistribucionProduccionPage() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [ordenNombre, setOrdenNombre] = useState("");
  const [plantaNombre, setPlantaNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState<Vista>("tienda");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [historial, setHistorial] = useState<HistRow[]>([]);
  const { showToast } = useToast();

  useEffect(() => { getDistribucionHistorial().then((r) => setHistorial(r as HistRow[])); }, []);

  async function onOrden(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOrdenNombre(file.name);
    const rows = await parseArchivo(file);
    setFilas((prev) => cruzar(rows, prev, "orden"));
  }
  async function onPlanta(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPlantaNombre(file.name);
    const rows = await parseArchivo(file);
    setFilas((prev) => cruzar(rows, prev, "planta"));
  }

  function cruzar(rows: Record<string, unknown>[], prevFilas: Fila[], origen: "orden" | "planta"): Fila[] {
    const map = new Map(prevFilas.map((f) => [`${f.dep}|${f.plu}`, { ...f }]));
    for (const row of rows) {
      const dep = col(row, ["dep", "tienda cod", "codigo tienda"]);
      const tienda = col(row, ["tienda", "nombre tienda", "cliente"]);
      const plu = col(row, ["plu", "codigo", "cod producto"]);
      const producto = col(row, ["producto", "descripcion", "articulo"]);
      const cantidad = num(row, ["cantidad", "pedido", "cant"]);
      const key = `${dep}|${plu}`;
      const existing = map.get(key) ?? { dep, tienda, plu, producto, pedido: 0, planta: 0, distribuido: 0, enOrden: false };
      if (origen === "orden") {
        existing.pedido = cantidad;
        existing.enOrden = true;
        existing.tienda = tienda || existing.tienda;
        existing.producto = producto || existing.producto;
      } else {
        existing.planta = cantidad;
      }
      existing.distribuido = Math.min(existing.planta, existing.pedido);
      map.set(key, existing);
    }
    return [...map.values()];
  }

  function setDistribuido(dep: string, plu: string, val: number) {
    setFilas((prev) => prev.map((f) => (f.dep === dep && f.plu === plu ? { ...f, distribuido: val } : f)));
  }
  function toggleExcluido(dep: string, plu: string) {
    setFilas((prev) => prev.map((f) => (f.dep === dep && f.plu === plu ? { ...f, excluido: !f.excluido, distribuido: f.excluido ? Math.min(f.planta, f.pedido) : 0 } : f)));
  }
  function toggleAbierto(key: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      await guardarDistribucion({ ordenArchivo: ordenNombre, plantaArchivo: plantaNombre, detalle: filas.filter((f) => !f.excluido) });
      showToast("Guardado correctamente.", "success");
      getDistribucionHistorial().then((r) => setHistorial(r as HistRow[]));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  const totales = useMemo(
    () => filas.reduce(
      (acc, f) => ({
        pedido: acc.pedido + f.pedido,
        planta: acc.planta + f.planta,
        distribuido: acc.distribuido + (f.excluido ? 0 : f.distribuido),
      }),
      { pedido: 0, planta: 0, distribuido: 0 }
    ),
    [filas]
  );
  const excedente = Math.max(0, totales.planta - totales.pedido);
  const faltante = Math.max(0, totales.pedido - totales.distribuido);

  const porTienda = useMemo(() => {
    const map = new Map<string, Fila[]>();
    for (const f of filas) {
      const arr = map.get(f.dep) ?? [];
      arr.push(f);
      map.set(f.dep, arr);
    }
    return [...map.entries()];
  }, [filas]);

  const porProducto = useMemo(() => {
    const map = new Map<string, Fila[]>();
    for (const f of filas) {
      const arr = map.get(f.plu) ?? [];
      arr.push(f);
      map.set(f.plu, arr);
    }
    return [...map.entries()];
  }, [filas]);

  const tiendas = useMemo(() => [...new Set(filas.map((f) => f.dep))], [filas]);
  const productos = useMemo(() => [...new Set(filas.map((f) => f.plu))], [filas]);

  return (
    <div className="p-6">
      <PageHeader
        icon={IconBox}
        title="Distribución Producción"
        subtitle="Pedido → Planta despachó → Se distribuye (tope = la orden). Sube ambos archivos para cruzar."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <ArchivoDropzone
          paso={1}
          titulo="Orden de compra"
          descripcion="Pedido del cliente. Formatos .xlsx, .xlsb o .xls."
          accept=".xlsx,.xlsb,.xls"
          nombreArchivo={ordenNombre}
          onFile={onOrden}
        />
        <ArchivoDropzone
          paso={2}
          titulo="Despacho de planta"
          descripcion="Lo que la planta realmente despachó. Formato .xlsx."
          accept=".xlsx,.xls"
          nombreArchivo={plantaNombre}
          onFile={onPlanta}
        />
      </div>

      {error && <p className="mb-2 text-sm text-[#b3261e]">{error}</p>}

      {filas.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label="Pedido" value={totales.pedido.toLocaleString("es-CO")} icon={IconClipboard} />
            <StatCard label="Planta despachó" value={totales.planta.toLocaleString("es-CO")} icon={IconBox} />
            <StatCard label="A distribuir" value={totales.distribuido.toLocaleString("es-CO")} color="#2f8f4e" bg="bg-[#f2f8ef]" icon={IconCheckCircle} />
            <StatCard label="Excedente" value={excedente.toLocaleString("es-CO")} color="#a86a12" bg="bg-[#fdf8ef]"
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>} />
            <StatCard label="Faltante" value={faltante.toLocaleString("es-CO")} color="#b3261e" bg="bg-[#fdf1f0]" icon={IconAlertTriangle} />
          </div>

          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1 rounded-lg border border-[#e1e9dd] bg-white p-1">
              {([["tienda", "Por tienda"], ["producto", "Por producto"], ["ajustar", "Ajustar"]] as [Vista, string][]).map(([v, label]) => (
                <button key={v} onClick={() => setVista(v)} className={`rounded-md px-3 py-1 text-xs font-medium ${vista === v ? "bg-[#2f8f4e] text-white" : "text-[#7a8794]"}`}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={guardar} disabled={guardando} className="rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#277a42] disabled:opacity-60">
              {guardando ? "Guardando…" : "Guardar cruce"}
            </button>
          </div>

          {vista === "tienda" && (
            <div className="space-y-2">
              {porTienda.map(([dep, items]) => {
                const key = `t-${dep}`;
                const abierto = abiertos.has(key);
                const total = items.reduce((a, f) => a + (f.excluido ? 0 : f.distribuido), 0);
                const pedido = items.reduce((a, f) => a + f.pedido, 0);
                const pct = pedido > 0 ? Math.min(100, Math.round((total / pedido) * 100)) : 0;
                return (
                  <div key={dep} className="rounded-2xl border border-[#e1e9dd] bg-white p-3">
                    <button onClick={() => toggleAbierto(key)} className="flex w-full items-center justify-between text-left">
                      <span className="font-medium">{items[0]?.tienda || dep} <span className="text-xs text-[#9aa4af]">({dep})</span></span>
                      <span className="flex items-center gap-2 text-xs">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[#f0f2ee]"><span className="block h-full bg-[#2f8f4e]" style={{ width: `${pct}%` }} /></span>
                        {total}/{pedido} ({pct}%)
                      </span>
                    </button>
                    {abierto && (
                      <table className="mt-2 w-full text-xs">
                        <tbody>
                          {items.map((f) => (
                            <tr key={f.plu} className="border-t border-[#f0f2ee]">
                              <td className="py-1">{f.producto}</td>
                              <td className="py-1 text-right">{f.pedido}</td>
                              <td className="py-1 text-right">{f.planta}</td>
                              <td className="py-1 text-right font-semibold text-[#2f8f4e]">{f.distribuido}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {vista === "producto" && (
            <div className="space-y-2">
              {porProducto.map(([plu, items]) => {
                const key = `p-${plu}`;
                const abierto = abiertos.has(key);
                const total = items.reduce((a, f) => a + (f.excluido ? 0 : f.distribuido), 0);
                const planta = items.reduce((a, f) => a + f.planta, 0);
                return (
                  <div key={plu} className="rounded-2xl border border-[#e1e9dd] bg-white p-3">
                    <button onClick={() => toggleAbierto(key)} className="flex w-full items-center justify-between text-left">
                      <span className="font-medium">{items[0]?.producto} <span className="text-xs text-[#9aa4af]">({plu})</span></span>
                      <span className="text-xs">{total} distribuido / {planta} producidos</span>
                    </button>
                    {abierto && (
                      <table className="mt-2 w-full text-xs">
                        <tbody>
                          {items.map((f) => (
                            <tr key={f.dep} className="border-t border-[#f0f2ee]">
                              <td className="py-1">{f.tienda} {!f.enOrden && <span className="text-[#a86a12]">(fuera de orden)</span>}</td>
                              <td className="py-1 text-right">{f.pedido}</td>
                              <td className="py-1 text-right font-semibold text-[#2f8f4e]">{f.distribuido}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {vista === "ajustar" && (
            <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white">
              <table className="w-full text-xs">
                <thead className="bg-[#f4f6f3] text-left font-semibold uppercase text-[#7a8794]">
                  <tr><th className="px-2 py-2">Incluir</th><th className="px-2 py-2">Producto</th><th className="px-2 py-2">Tienda</th><th className="px-2 py-2 text-right">Pedido</th><th className="px-2 py-2 text-right">Planta</th><th className="px-2 py-2 text-right">Distribuido</th></tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const excede = f.distribuido > f.pedido;
                    return (
                      <tr key={`${f.dep}-${f.plu}`} className={`border-t border-[#f0f2ee] ${f.excluido ? "opacity-40" : ""}`}>
                        <td className="px-2 py-1"><input type="checkbox" checked={!f.excluido} onChange={() => toggleExcluido(f.dep, f.plu)} /></td>
                        <td className="px-2 py-1">{f.producto}</td>
                        <td className="px-2 py-1">{f.tienda}</td>
                        <td className="px-2 py-1 text-right">{f.pedido}</td>
                        <td className="px-2 py-1 text-right">{f.planta}</td>
                        <td className="px-2 py-1 text-right">
                          <input
                            type="number"
                            disabled={f.excluido}
                            value={f.distribuido}
                            onChange={(e) => setDistribuido(f.dep, f.plu, Number(e.target.value) || 0)}
                            className={`w-20 rounded border px-1.5 py-1 text-right ${excede ? "border-[#e3948e] bg-[#fbeceb]" : "border-[#dfe4e0]"}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="p-2 text-xs text-[#9aa4af]">{tiendas.length} tiendas · {productos.length} productos · en rojo: celdas que exceden el pedido.</p>
            </div>
          )}
        </>
      )}

      <h2 className="mb-2 mt-8 text-sm font-semibold text-[#14352a]">Historial</h2>
      <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#f4f6f3] text-left text-xs font-semibold uppercase text-[#7a8794]">
            <tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">NIT</th><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Planta</th><th className="px-3 py-2">Distribuido</th><th className="px-3 py-2">Excedente</th><th className="px-3 py-2">Faltante</th><th className="px-3 py-2 text-right">Acciones</th></tr>
          </thead>
          <tbody>
            {historial.map((h) => (
              <tr key={h.id} className="border-t border-[#f0f2ee]">
                <td className="px-3 py-2">{new Date(h.fecha).toLocaleDateString("es-CO")}</td>
                <td className="px-3 py-2">{h.nit ?? "—"}</td>
                <td className="px-3 py-2">{(h.totalPedido ?? 0).toLocaleString("es-CO")}</td>
                <td className="px-3 py-2">{(h.totalPlanta ?? 0).toLocaleString("es-CO")}</td>
                <td className="px-3 py-2">{(h.totalDistribuido ?? 0).toLocaleString("es-CO")}</td>
                <td className="px-3 py-2">{(h.totalExcedente ?? 0).toLocaleString("es-CO")}</td>
                <td className="px-3 py-2">{(h.totalFaltante ?? 0).toLocaleString("es-CO")}</td>
                <td className="px-3 py-2 text-right"><Link href={`/planeacion/distribucion-produccion/${h.id}`} className="text-[#2f8f4e] hover:underline">Ver</Link></td>
              </tr>
            ))}
            {historial.length === 0 && <tr><td colSpan={8}><EmptyState icon={IconHistory} title="Aún no hay cruces guardados" description="Sube la orden de compra y el despacho de planta para generar el primero." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArchivoDropzone({ paso, titulo, descripcion, accept, nombreArchivo, onFile }: {
  paso: number;
  titulo: string;
  descripcion: string;
  accept: string;
  nombreArchivo: string;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const listo = !!nombreArchivo;
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
        listo ? "border-[#bfe3cc] bg-[#f2faf4]" : "border-dashed border-[#dfe4e0] bg-white hover:border-[#2f8f4e] hover:bg-[#f7faf5]"
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${listo ? "bg-[#2f8f4e] text-white" : "bg-[#f2f5ef] text-[#7a8794]"}`}>
        {listo ? IconCheckCircle : paso}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#14352a]">{titulo}</p>
        <p className="mt-0.5 text-xs text-[#7a8794]">{descripcion}</p>
        {listo ? (
          <p className="mt-2 flex items-center gap-1.5 truncate text-xs font-medium text-[#2f8f4e]">
            {nombreArchivo}
            <span className="font-normal text-[#7a8794] underline">Cambiar archivo</span>
          </p>
        ) : (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#2f8f4e] px-3 py-1.5 text-xs font-medium text-[#2f8f4e]">
            {IconUpload} Elegir archivo
          </span>
        )}
      </div>
      <input type="file" accept={accept} onChange={onFile} className="hidden" />
    </label>
  );
}
