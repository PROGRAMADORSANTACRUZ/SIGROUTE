"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

  async function exportarExcel() {
    if (!data) return;
    const { productos, tiendas, celdas, totalesFila } = data.datos;
    const headers = ["SIESA", "Desc PLU", "PLU", ...tiendas.map((t) => t.desc || t.dep), "Total"];
    const filas: (string | number)[][] = productos.map((p) => [
      p.siesa, p.desc, p.plu, ...tiendas.map((t) => celdas[`${p.plu}|${t.dep}`] ?? 0), totalesFila[p.plu] ?? 0,
    ]);
    const totalGeneral = tiendas.reduce((acc, t) => acc + productos.reduce((a, p) => a + (celdas[`${p.plu}|${t.dep}`] ?? 0), 0), 0);
    const granTotalPorTienda = tiendas.map((t) => productos.reduce((acc, p) => acc + (celdas[`${p.plu}|${t.dep}`] ?? 0), 0));
    filas.push(["", "TOTAL", "", ...granTotalPorTienda, totalGeneral]);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "SIGROUTE";
    wb.created = new Date();
    const nombreHoja = data.tipo ?? "Consolidado";
    const ws = wb.addWorksheet(nombreHoja, { views: [{ state: "frozen", ySplit: 3 }] });
    const VERDE_OSCURO = "FF14352A";
    const BLANCO = "FFFFFFFF";

    ws.mergeCells(1, 1, 1, headers.length);
    const tCell = ws.getCell(1, 1);
    tCell.value = `Predistribución — ${nombreHoja} · ${data.ffin ?? ""}`;
    tCell.font = { bold: true, size: 14, color: { argb: BLANCO } };
    tCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_OSCURO } };
    tCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(1).height = 24;

    ws.mergeCells(2, 1, 2, headers.length);
    const gCell = ws.getCell(2, 1);
    gCell.value = `Generado por el software SIGROUTE — Grupo Santacruz · ${new Date().toLocaleString("es-CO")}`;
    gCell.font = { italic: true, size: 10, color: { argb: "FF5F7A68" } };
    gCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(2).height = 18;

    const headerRow = ws.getRow(3);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 12, color: { argb: BLANCO } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_OSCURO } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    headerRow.height = 22;

    for (const fila of filas) {
      const r = ws.addRow(fila);
      r.height = 16;
      r.eachCell((cell) => { cell.font = { size: 11 }; });
    }
    headers.forEach((h, i) => {
      let max = h.length;
      for (const fila of filas) {
        const len = String(fila[i] ?? "").length;
        if (len > max) max = len;
      }
      ws.getColumn(i + 1).width = Math.min(Math.max(max + 2, 10), 60);
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `predistribucion_${data.tipo}_${data.id}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
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
