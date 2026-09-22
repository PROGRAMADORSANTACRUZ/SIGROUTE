"use client";

import { useState } from "react";
import { descargarReporte, TipoReporte } from "@/lib/planApi";
import PageHeader from "@/components/PageHeader";
import { IconDownload, IconHistory } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

const REPORTES: { tipo: TipoReporte; titulo: string; descripcion: string }[] = [
  { tipo: "programacion", titulo: "Programación (kilos por destino)", descripcion: "Kilos y canastillas por destino y categoría, tal como quedó cargada la programación." },
  { tipo: "rutas", titulo: "Rutas del Día", descripcion: "Vehículo, conductor, hora de cargue, peso total, auxiliares y destinos de cada ruta." },
  { tipo: "resumen", titulo: "Resumen del Día (consolidado)", descripcion: "Totales por categoría, conteos generales y el detalle de rutas en un solo Excel." },
  { tipo: "areas-carga", titulo: "Áreas para Cargar", descripcion: "Avance de cargue por área y ruta (PENDIENTE / PROCESO / CARGADA) para rutas cerradas." },
  { tipo: "auditoria", titulo: "Auditoría del día", descripcion: "Bitácora de acciones realizadas por los usuarios durante la fecha seleccionada." },
];

export default function ReportesPage() {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState<string | null>(null);
  const { showToast } = useToast();

  async function descargar(tipo: TipoReporte) {
    setLoading(tipo);
    try {
      await descargarReporte(tipo, fecha);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al generar el reporte", "error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        icon={IconHistory}
        title="Reportes"
        subtitle="Descarga los reportes de Planeación en Excel para la fecha seleccionada."
        actions={<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTES.map((r) => (
          <button
            key={r.tipo}
            onClick={() => descargar(r.tipo)}
            disabled={loading === r.tipo}
            className="flex items-start gap-3 rounded-2xl border border-[#e1e9dd] bg-white p-4 text-left shadow-sm transition-colors hover:border-[#2f8f4e] disabled:opacity-60"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f3e2] text-[#2f8f4e]">{IconDownload}</span>
            <span>
              <p className="font-semibold text-[#14352a]">{r.titulo}</p>
              <p className="mt-0.5 text-xs text-[#7a8794]">{r.descripcion}</p>
              <p className="mt-1 text-sm font-medium text-[#2f8f4e]">{loading === r.tipo ? "Generando…" : "Descargar Excel"}</p>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
