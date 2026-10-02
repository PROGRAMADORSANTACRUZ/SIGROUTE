"use client";

import { useState } from "react";
import { descargarReporte, TipoReporte } from "@/lib/planApi";
import PageHeader from "@/components/PageHeader";
import { IconDownload, IconHistory } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

interface Reporte { tipo: TipoReporte; titulo: string; descripcion: string; rango?: boolean }
interface Grupo { label: string; descripcion: string; reportes: Reporte[] }

// Reportes de los 2 dominios (Planeación + Ejecución) en un solo lugar, más
// los comparativos entre ambos — antes solo vivían los de Planeación.
const GRUPOS: Grupo[] = [
  {
    label: "Planeación",
    descripcion: "Programación, rutas y áreas de cargue.",
    reportes: [
      { tipo: "programacion", titulo: "Programación (kilos por destino)", descripcion: "Kilos y canastillas por destino y categoría, tal como quedó cargada la programación." },
      { tipo: "rutas", titulo: "Rutas del Día", descripcion: "Vehículo, conductor, hora de cargue, peso total, auxiliares y destinos de cada ruta." },
      { tipo: "resumen", titulo: "Resumen del Día (consolidado)", descripcion: "Totales por categoría, conteos generales y el detalle de rutas en un solo Excel." },
      { tipo: "areas-carga", titulo: "Áreas para Cargar", descripcion: "Avance de cargue por área y ruta (PENDIENTE / PROCESO / CARGADA), con la hora en que cada una quedó cargada." },
      { tipo: "cierres-area", titulo: "Cierres de área (histórico)", descripcion: "A qué hora y quién cerró cada área de Programación, día por día — usa el rango de fechas.", rango: true },
    ],
  },
  {
    label: "Ejecución",
    descripcion: "Órdenes, envíos a Drivin y nivel de servicio.",
    reportes: [
      { tipo: "ordenes-ejecucion", titulo: "Órdenes de Ejecución", descripcion: "Todas las órdenes del día (Cargar Órdenes/Diagrama): cliente, producto, kg, valor, estado, vehículo y ruta." },
      { tipo: "envios-drivin", titulo: "Envíos a Drivin (histórico)", descripcion: "Cada envío real a Drivin desde Diagrama, éxito o error, con el detalle factura por factura — usa el rango de fechas.", rango: true },
      { tipo: "novedades", titulo: "Nivel de Servicio (Novedades)", descripcion: "Incidencias/novedades reportadas para la fecha seleccionada." },
    ],
  },
  {
    label: "Comparativos",
    descripcion: "Cruce entre lo planificado y lo realmente ejecutado.",
    reportes: [
      { tipo: "comparativo-clientes", titulo: "Planificado vs Ejecutado por Cliente", descripcion: "Kg planificados en Programación contra kg realmente enviados a Drivin, por cliente y por categoría." },
    ],
  },
];

export default function ReportesPage() {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const { showToast } = useToast();

  async function descargar(tipo: TipoReporte) {
    setLoading(tipo);
    try {
      await descargarReporte(tipo, fecha, fechaFin || undefined);
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
        subtitle="Descarga en Excel los reportes de Planeación, Ejecución y sus comparativos para la fecha seleccionada."
        actions={
          <>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
            <div className="flex flex-col">
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} placeholder="Fecha fin" className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
              <span className="mt-0.5 text-[10px] text-[#9aa4af]">Fecha fin (solo para reportes de rango)</span>
            </div>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        {GRUPOS.map((g) => (
          <div key={g.label}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#7a8794]">{g.label}</h2>
            <p className="mb-2 text-xs text-[#9aa4af]">{g.descripcion}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.reportes.map((r) => (
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
                    {r.rango && <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[#d9a441]">Usa fecha inicio + fecha fin</p>}
                    <p className="mt-1 text-sm font-medium text-[#2f8f4e]">{loading === r.tipo ? "Generando…" : "Descargar Excel"}</p>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
