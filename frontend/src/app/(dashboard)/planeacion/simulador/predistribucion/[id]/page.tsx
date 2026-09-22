"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { getPredistribucion } from "@/lib/planApi";
import type { ConsolidadoTipo } from "@/lib/predistribucionImport";
import { PageLoader } from "@/components/Loading";

interface ConsolidadoDetalle {
  id: number; archivo: string | null; tipo: string | null; usuario: string | null; createdAt: string; ffin: string | null;
  datos: ConsolidadoTipo;
}

export default function PredistribucionDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ConsolidadoDetalle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPredistribucion(Number(id))
      .then((r) => setData(r as unknown as ConsolidadoDetalle))
      .finally(() => setLoading(false));
  }, [id]);

  function exportarExcel() {
    if (!data) return;
    const { productos, tiendas, celdas, totalesFila } = data.datos;
    const header = ["SIESA", "Desc PLU", "PLU", ...tiendas.map((t) => t.desc || t.dep), "Total"];
    const rows: (string | number)[][] = [header];
    for (const p of productos) {
      const fila = [p.siesa, p.desc, p.plu, ...tiendas.map((t) => celdas[`${p.plu}|${t.dep}`] ?? 0), totalesFila[p.plu] ?? 0];
      rows.push(fila);
    }
    const totalGeneral = tiendas.reduce((acc, t) => acc + productos.reduce((a, p) => a + (celdas[`${p.plu}|${t.dep}`] ?? 0), 0), 0);
    const granTotalPorTienda = tiendas.map((t) => productos.reduce((acc, p) => acc + (celdas[`${p.plu}|${t.dep}`] ?? 0), 0));
    rows.push(["", "TOTAL", "", ...granTotalPorTienda, totalGeneral]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, data.tipo ?? "Consolidado");
    XLSX.writeFile(wb, `predistribucion_${data.tipo}_${data.id}.xlsx`);
  }

  if (loading) return <PageLoader />;
  if (!data) return <div className="p-6 text-sm text-[#b3261e]">Consolidado no encontrado.</div>;

  const { productos, tiendas, celdas, totalesFila } = data.datos;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#14352a] capitalize">Consolidado {data.tipo} #{data.id}</h1>
          <p className="text-xs text-[#9aa4af]">{data.archivo} · {data.usuario} · {new Date(data.createdAt).toLocaleString("es-CO")}{data.ffin && data.ffin !== "TODAS" ? ` · Fechas: ${data.ffin}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportarExcel} className="rounded-lg bg-[#2f8f4e] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#277a42]">Exportar Excel</button>
          <button onClick={() => router.push("/planeacion/simulador/predistribucion")} className="rounded-lg border border-[#dfe4e0] px-4 py-1.5 text-sm">Volver</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white">
        <table className="w-full text-xs">
          <thead className="bg-[#f4f6f3] text-left font-semibold uppercase text-[#7a8794]">
            <tr>
              <th className="sticky left-0 bg-[#f4f6f3] px-2 py-2">SIESA</th>
              <th className="px-2 py-2">Desc PLU</th>
              <th className="px-2 py-2">PLU</th>
              {tiendas.map((t) => <th key={t.dep} className="px-2 py-2 text-right">{t.desc || t.dep}</th>)}
              <th className="px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.plu} className="border-t border-[#f0f2ee]">
                <td className="sticky left-0 bg-white px-2 py-1">{p.siesa || "—"}</td>
                <td className="px-2 py-1">{p.desc}</td>
                <td className="px-2 py-1">{p.plu}</td>
                {tiendas.map((t) => {
                  const v = celdas[`${p.plu}|${t.dep}`];
                  return <td key={t.dep} className="px-2 py-1 text-right">{v ? v.toLocaleString("es-CO") : "·"}</td>;
                })}
                <td className="px-2 py-1 text-right font-semibold">{(totalesFila[p.plu] ?? 0).toLocaleString("es-CO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[#9aa4af]">«·» = tienda no pidió el producto.</p>
    </div>
  );
}
