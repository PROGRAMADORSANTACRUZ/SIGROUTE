"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { PageLoader } from "@/components/Loading";
import EmptyState from "@/components/EmptyState";
import SoloLecturaBadge from "@/components/SoloLecturaBadge";
import { IconRuta } from "@/components/icons";
import { usePermiso } from "@/lib/permisos";
import { tc } from "@/lib/utils";
import { ApiError, getColoresRuta, getOrdenes, setColorRuta, type Orden } from "@/lib/api";

const fmtKg = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

interface ClienteRuta {
  cliente: string;
  destino: string;
  cantidadKg: number;
  vehiculo: string | null;
}

interface GrupoRuta {
  ruta: string;
  clientes: ClienteRuta[];
  totalKg: number;
}

export default function ClientesRutaPage() {
  const puedeEditar = usePermiso("distrilog.planes.editar");
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [colores, setColores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setLoading(true);
    setError(null);
    Promise.all([getOrdenes(true), getColoresRuta()])
      .then(([ords, cols]) => { setOrdenes(ords); setColores(cols); })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  const grupos = useMemo<GrupoRuta[]>(() => {
    const activas = ordenes.filter((o) => o.ruta?.trim() && o.estado !== "Entregado" && o.estado !== "Rechazado");
    const porRuta = new Map<string, Map<string, ClienteRuta>>();
    for (const o of activas) {
      const ruta = o.ruta!.trim();
      const clientesMap = porRuta.get(ruta) ?? new Map<string, ClienteRuta>();
      const key = `${o.cliente}|${o.destino}`;
      const ex = clientesMap.get(key);
      if (ex) ex.cantidadKg += o.cantidadKg;
      else clientesMap.set(key, { cliente: o.cliente, destino: o.destino, cantidadKg: o.cantidadKg, vehiculo: o.asignadoVehiculo });
      porRuta.set(ruta, clientesMap);
    }
    return Array.from(porRuta.entries())
      .map(([ruta, clientesMap]) => {
        const clientes = Array.from(clientesMap.values()).sort((a, b) => a.cliente.localeCompare(b.cliente));
        return { ruta, clientes, totalKg: clientes.reduce((s, c) => s + c.cantidadKg, 0) };
      })
      .sort((a, b) => a.ruta.localeCompare(b.ruta, undefined, { numeric: true }));
  }, [ordenes]);

  async function cambiarColor(ruta: string, color: string) {
    setColores((prev) => ({ ...prev, [ruta]: color }));
    try {
      await setColorRuta(ruta, color);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el color");
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        icon={IconRuta}
        title="Clientes por Ruta"
        subtitle="Clientes y destinos del día agrupados por ruta; el color asignado se ve también en Diagrama."
        actions={!puedeEditar ? <SoloLecturaBadge /> : undefined}
      />

      {error && <div className="mb-4 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      {loading ? (
        <PageLoader />
      ) : grupos.length === 0 ? (
        <div className="rounded-2xl border border-[#e1e9dd] bg-white">
          <EmptyState icon={IconRuta} title="Sin rutas asignadas" description="Asigna una ruta a las órdenes desde Cargar Órdenes o Asignación de órdenes." />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map((g) => {
            const color = colores[g.ruta] ?? "";
            return (
              <div key={g.ruta} className="overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm" style={color ? { borderLeft: `6px solid ${color}` } : undefined}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceef0] bg-[#f7faf5] px-5 py-3">
                  <div className="flex items-center gap-3">
                    {puedeEditar && (
                      <input
                        type="color"
                        value={color || "#2f8f4e"}
                        onChange={(e) => cambiarColor(g.ruta, e.target.value)}
                        title="Color de la ruta"
                        className="h-8 w-8 cursor-pointer rounded border border-[#dfe4e0] bg-white p-0.5"
                      />
                    )}
                    <div>
                      <p className="text-sm font-bold text-[#14352a]">{g.ruta}</p>
                      <p className="text-xs text-[#7a8794]">{g.clientes.length} clientes · {fmtKg(g.totalKg)} kg</p>
                    </div>
                  </div>
                  {puedeEditar && color && (
                    <button onClick={() => cambiarColor(g.ruta, "")} className="text-xs font-medium text-[#7a8794] hover:text-[#b3261e]">
                      Quitar color
                    </button>
                  )}
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
                    <tr>
                      <th className="px-5 py-2">Cliente</th>
                      <th className="px-5 py-2">Destino</th>
                      <th className="px-5 py-2">Vehículo</th>
                      <th className="px-5 py-2 text-right">Kg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f2ee]">
                    {g.clientes.map((c) => (
                      <tr key={`${c.cliente}|${c.destino}`} className="hover:bg-[#f9fbf7]">
                        <td className="px-5 py-2 text-[#14352a]">{tc(c.cliente)}</td>
                        <td className="px-5 py-2 text-[#45505e]">{tc(c.destino)}</td>
                        <td className="px-5 py-2 text-[#45505e]">{c.vehiculo ?? "—"}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-[#14352a]">{fmtKg(c.cantidadKg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
