"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { getPredistribuciones, guardarPredistribucion } from "@/lib/planApi";
import { leerLineasOrdenCompra, pivotarLineas, type LineaOC } from "@/lib/predistribucionImport";
import { ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import SimuladorTabs from "@/components/SimuladorTabs";
import { IconBox, IconHistory, IconUpload } from "@/components/icons";
import { PageLoader } from "@/components/Loading";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";

interface ConsolidadoRow {
  id: number; ffin: string | null; archivo: string | null; usuario: string | null;
  nProductos: number; nTiendas: number; granTotal: number; tipo: string | null; grupo: string | null; createdAt: string;
}

export default function PredistribucionPage() {
  const [historial, setHistorial] = useState<ConsolidadoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [archivo, setArchivo] = useState<{ lineas: LineaOC[]; fechas: string[]; nombre: string } | null>(null);
  const [fechasSel, setFechasSel] = useState<Set<string>>(new Set()); // vacío = "todas"
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  function cargar() {
    setLoading(true);
    getPredistribuciones().then((r) => setHistorial(r as unknown as ConsolidadoRow[])).finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  const undPorFecha = useMemo(() => {
    if (!archivo) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const l of archivo.lineas) m.set(l.ffin, (m.get(l.ffin) ?? 0) + l.cantidad);
    return m;
  }, [archivo]);

  const lineasFiltradas = useMemo(() => {
    if (!archivo) return [];
    if (fechasSel.size === 0) return archivo.lineas; // "todas las fechas"
    return archivo.lineas.filter((l) => fechasSel.has(l.ffin));
  }, [archivo, fechasSel]);

  const preview = useMemo(() => (lineasFiltradas.length ? pivotarLineas(lineasFiltradas) : null), [lineasFiltradas]);

  function toggleFecha(f: string) {
    setFechasSel((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  async function onSubirOrden(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProcesando(true);
    setError(null);
    try {
      const r = await leerLineasOrdenCompra(file);
      if (r.lineas.length === 0) throw new Error("No se encontraron líneas válidas (Dep/Plu/C.Ped) en el archivo.");
      setArchivo({ ...r, nombre: file.name });
      setFechasSel(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar el archivo");
    } finally {
      setProcesando(false);
    }
  }

  async function guardarConsolidado() {
    if (!preview || !archivo) return;
    const grupo = `${Date.now()}`;
    const ffin = fechasSel.size === 0 ? "TODAS" : [...fechasSel].sort().join(",");
    try {
      for (const tipo of ["bovino", "porcino"] as const) {
        const c = preview[tipo];
        if (c.productos.length === 0) continue;
        await guardarPredistribucion({
          archivo: archivo.nombre,
          tipo,
          grupo,
          ffin,
          nProductos: c.productos.length,
          nTiendas: c.tiendas.length,
          granTotal: c.granTotal,
          datos: c,
        });
      }
      setArchivo(null);
      showToast("Consolidado guardado.", "success");
      cargar();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al guardar el consolidado", "error");
    }
  }

  return (
    <div className="p-6">
      <SimuladorTabs active="/planeacion/simulador/predistribucion" />

      <PageHeader
        icon={IconBox}
        title="Predistribución"
        subtitle="Sube la orden de compra (Éxito), elige qué fechas de entrega consolidar y se pivotea producto×tienda separando bovino de porcino por SIESA."
      />

      <label className="mb-4 inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#2f8f4e] px-4 py-2 text-sm font-medium text-[#2f8f4e] hover:bg-[#e8f3e2]">
        {IconUpload} {procesando ? "Procesando…" : "Subir orden de compra (.xlsx/.xlsb)"}
        <input type="file" accept=".xlsx,.xls,.xlsb" onChange={onSubirOrden} disabled={procesando} className="hidden" />
      </label>
      {error && <p className="mb-3 text-sm text-[#b3261e]">{error}</p>}

      {archivo && preview && (
        <div className="mb-6 rounded-xl border border-[#2f8f4e] bg-[#f7fbf5] p-4">
          <h2 className="mb-1 text-sm font-semibold text-[#14352a]">Vista previa — {archivo.nombre}</h2>
          <p className="mb-3 text-xs text-[#7a8794]">{archivo.fechas.length} fecha(s) de entrega · {archivo.lineas.length} líneas en total.</p>

          {archivo.fechas.length > 0 && (
            <div className="mb-3 rounded-lg border border-[#e1e9dd] bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-[#7a8794]">Fechas de entrega — elegí cuáles consolidar</p>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-1.5 rounded-lg border border-[#dfe4e0] px-2.5 py-1 text-xs">
                  <input type="checkbox" checked={fechasSel.size === 0} onChange={() => setFechasSel(new Set())} /> Todas las fechas
                </label>
                {archivo.fechas.map((f) => (
                  <label key={f} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${fechasSel.has(f) ? "border-[#2f8f4e] bg-[#e8f3e2] text-[#2f8f4e]" : "border-[#dfe4e0]"}`}>
                    <input type="checkbox" checked={fechasSel.has(f)} onChange={() => toggleFecha(f)} /> Entrega {f}
                    <span className="ml-1 text-[#9aa4af]">{(undPorFecha.get(f) ?? 0).toLocaleString("es-CO")} und</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mb-3 grid grid-cols-2 gap-3">
            {(["bovino", "porcino"] as const).map((tipo) => (
              <div key={tipo} className="rounded-lg bg-white p-3">
                <p className="text-xs font-semibold uppercase text-[#9aa4af]">{tipo}</p>
                <p className="text-sm">{preview[tipo].productos.length} productos · {preview[tipo].tiendas.length} tiendas</p>
                <p className="text-lg font-bold text-[#2f8f4e]">{preview[tipo].granTotal.toLocaleString("es-CO")} und</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={guardarConsolidado} className="rounded-lg bg-[#2f8f4e] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#277a42]">Guardar consolidado</button>
            <button onClick={() => setArchivo(null)} className="rounded-lg border border-[#dfe4e0] px-4 py-1.5 text-sm">Descartar</button>
          </div>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-[#14352a]">Consolidados guardados</h2>
      {loading ? (
        <PageLoader />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f4f6f3] text-left text-xs font-semibold uppercase text-[#7a8794]">
              <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Fechas</th><th className="px-3 py-2">Archivo</th><th className="px-3 py-2">Productos</th><th className="px-3 py-2">Tiendas</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Usuario</th><th className="px-3 py-2 text-right">Acciones</th></tr>
            </thead>
            <tbody>
              {historial.map((c) => (
                <tr key={c.id} className="border-t border-[#f0f2ee]">
                  <td className="px-3 py-2">{c.id}</td>
                  <td className="px-3 py-2 capitalize"><span className="rounded-full bg-[#e8f3e2] px-2 py-0.5 text-xs text-[#2f8f4e]">{c.tipo}</span></td>
                  <td className="px-3 py-2 text-xs text-[#7a8794]">{c.ffin === "TODAS" ? "Todas" : c.ffin ?? "—"}</td>
                  <td className="px-3 py-2">{c.archivo}</td>
                  <td className="px-3 py-2">{c.nProductos}</td>
                  <td className="px-3 py-2">{c.nTiendas}</td>
                  <td className="px-3 py-2">{c.granTotal.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2">{c.usuario}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/planeacion/simulador/predistribucion/${c.id}`} className="text-[#2f8f4e] hover:underline">Ver</Link>
                  </td>
                </tr>
              ))}
              {historial.length === 0 && <tr><td colSpan={9}><EmptyState icon={IconHistory} title="Aún no hay consolidados guardados" description="Sube una orden de compra arriba para generar el primero." /></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
