"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { PageLoader } from "@/components/Loading";
import EmptyState from "@/components/EmptyState";
import SoloLecturaBadge from "@/components/SoloLecturaBadge";
import { IconClipboard, IconDownload, IconLock } from "@/components/icons";
import { useToast } from "@/components/ui/ToastProvider";
import { ApiError } from "@/lib/api";
import { descargarReporte, getAreasCarga, setEstadoAreaCarga } from "@/lib/planApi";
import { usePermiso } from "@/lib/permisos";

type Estado = "PENDIENTE" | "PROCESO" | "CARGADA";
const ESTADOS: Estado[] = ["PENDIENTE", "PROCESO", "CARGADA"];
const ESTADO_COLOR: Record<Estado, string> = {
  PENDIENTE: "bg-[#f0f2ee] text-[#5f7a68] border-[#dfe4e0]",
  PROCESO: "bg-[#fdf6e9] text-[#a86a12] border-[#f3d19b]",
  CARGADA: "bg-[#e8f3e2] text-[#2f8f4e] border-[#cfe4d6]",
};

interface RutaAreaCarga {
  id: number;
  numeroRuta: number;
  horaCargue: string | null;
  vehiculo: string | null;
  conductor: string | null;
  cargada: boolean;
  kls: number;
  canastillas: number;
  celdas: Record<string, Estado>;
}

interface AreasCargaData {
  prog: { id: number; fecha: string } | null;
  rutas: RutaAreaCarga[];
  columnas: string[];
}

// Post-cargue por área: cada área (Bovino/Porcino/TAT/Inversiones/…) confirma
// qué vehículos ya cargó y con cuánto, cruzado contra lo planificado.
export default function AreasParaCargarPage() {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<AreasCargaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const puedeConfirmar = usePermiso("areas.confirmar_carga");
  const { showToast } = useToast();

  function cargar() {
    setLoading(true);
    getAreasCarga(fecha)
      .then((d) => setData(d as AreasCargaData))
      .finally(() => setLoading(false));
  }
  useEffect(cargar, [fecha]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cambiarEstado(rutaId: number, area: string, estado: Estado) {
    try {
      await setEstadoAreaCarga(rutaId, area, estado);
      cargar();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al actualizar", "error");
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      await descargarReporte("areas-carga", fecha);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al exportar", "error");
    } finally {
      setExportando(false);
    }
  }

  const totalRutas = data?.rutas.length ?? 0;
  const rutasCompletas = data?.rutas.filter((r) => r.cargada).length ?? 0;

  return (
    <div className="p-6">
      <PageHeader
        icon={IconClipboard}
        title="Áreas para Cargar"
        subtitle="Cada área confirma qué vehículo cargó y con cuánto — cruzado contra lo planificado."
        actions={
          <div className="flex items-center gap-2">
            {!puedeConfirmar && <SoloLecturaBadge />}
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
            <button onClick={exportar} disabled={exportando} className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-60">
              {IconDownload} {exportando ? "Generando…" : "Exportar"}
            </button>
          </div>
        }
      />

      {loading || !data ? (
        <PageLoader />
      ) : !data.prog || data.rutas.length === 0 ? (
        <div className="rounded-2xl border border-[#e1e9dd] bg-white">
          <EmptyState icon={IconClipboard} title="Sin rutas cerradas" description="Aún no hay rutas cerradas en Preasignación para esta fecha." />
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 text-sm text-[#45505e]">
            <span className="rounded-full bg-[#f7faf5] px-3 py-1 font-medium text-[#2f8f4e]">{rutasCompletas} de {totalRutas} rutas completamente cargadas</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-[#e1e9dd] bg-[#f7faf5] text-left text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-3 py-2.5">Ruta</th>
                  <th className="px-3 py-2.5">Vehículo</th>
                  <th className="px-3 py-2.5">Conductor</th>
                  <th className="px-3 py-2.5 text-right">Kls</th>
                  <th className="px-3 py-2.5 text-right">Can</th>
                  {data.columnas.map((c) => <th key={c} className="px-3 py-2.5 text-center">{c}</th>)}
                  <th className="px-3 py-2.5 text-center">Estado ruta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {data.rutas.map((r) => (
                  <tr key={r.id} className="hover:bg-[#f9fbf7]">
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-[#14352a]">#{r.numeroRuta}</td>
                    <td className="px-3 py-2 text-[#45505e]">{r.vehiculo ?? "—"}</td>
                    <td className="px-3 py-2 text-[#45505e]">{r.conductor ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.kls.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.canastillas.toLocaleString("es-CO")}</td>
                    {data.columnas.map((c) => {
                      const estado = r.celdas[c];
                      if (!estado) return <td key={c} className="px-3 py-2 text-center text-[#c8d0c9]">—</td>;
                      return (
                        <td key={c} className="px-3 py-2 text-center">
                          {puedeConfirmar ? (
                            <select
                              value={estado}
                              onChange={(e) => cambiarEstado(r.id, c, e.target.value as Estado)}
                              className={`rounded-full border px-2 py-1 text-xs font-medium outline-none ${ESTADO_COLOR[estado]}`}
                            >
                              {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                            </select>
                          ) : (
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${ESTADO_COLOR[estado]}`}>{estado}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${r.cargada ? "bg-[#e8f3e2] text-[#2f8f4e]" : "bg-[#f0f2ee] text-[#5f7a68]"}`}>
                        {r.cargada && IconLock} {r.cargada ? "Completa" : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
