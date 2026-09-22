"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { PageLoader } from "@/components/Loading";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";
import StatCard from "@/components/StatCard";
import { IconBox, IconClipboard, IconMapPin } from "@/components/icons";
import { getPreplanificacion, type Preplanificacion, type PreplanCliente } from "@/lib/planApi";
import { ApiError } from "@/lib/api";

const fmtN = (n: number) => n.toLocaleString("es-CO");
const fmtMoney = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

// Pre-planificación: trae las facturas TAT (mismo origen Siesa/apiconsulta que
// usa Ejecución) del rango de fechas y las agrupa por ciudad/barrio, para
// decidir rutas ANTES de que se carguen una a una en Cargar Órdenes.
export default function PreplanificacionPage() {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().slice(0, 10));
  const [origen, setOrigen] = useState<"TODOS" | "AGROPECUARIA" | "INVERSIONES">("TODOS");
  const [agrupar, setAgrupar] = useState<"ciudad" | "barrio">("ciudad");
  const [buscar, setBuscar] = useState("");
  const [producto, setProducto] = useState("");
  const [kgMin, setKgMin] = useState("");
  const [data, setData] = useState<Preplanificacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [clienteModal, setClienteModal] = useState<PreplanCliente | null>(null);

  function cargar() {
    setLoading(true);
    setError(null);
    getPreplanificacion({ fecha, fechaFin, origen, agrupar, buscar: buscar || undefined, producto: producto || undefined, kgMin: kgMin ? Number(kgMin) : undefined })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error al consultar Siesa"))
      .finally(() => setLoading(false));
  }
  useEffect(cargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6">
      <PageHeader
        icon={IconMapPin}
        title="Pre-planificación"
        subtitle="Facturas TAT del rango seleccionado, agrupadas por ciudad o barrio — para planear rutas antes de cargarlas en Ejecución."
      />

      <div className="mb-4 rounded-2xl border border-[#e1e9dd] bg-white p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#9aa4af]">Filtros</p>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Desde</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Hasta</span>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Origen</span>
            <div className="flex items-center gap-0.5 rounded-lg border border-[#dfe4e0] bg-white p-0.5">
              {(["TODOS", "AGROPECUARIA", "INVERSIONES"] as const).map((o) => (
                <button key={o} onClick={() => setOrigen(o)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${origen === o ? "bg-[#2f8f4e] text-white" : "text-[#5f7a68] hover:bg-[#f4f6f3]"}`}>
                  {o === "TODOS" ? "Todos" : o.charAt(0) + o.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Agrupar</span>
            <div className="flex items-center gap-0.5 rounded-lg border border-[#dfe4e0] bg-white p-0.5">
              {(["ciudad", "barrio"] as const).map((a) => (
                <button key={a} onClick={() => setAgrupar(a)} className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${agrupar === a ? "bg-[#2f8f4e] text-white" : "text-[#5f7a68] hover:bg-[#f4f6f3]"}`}>
                  Por {a}
                </button>
              ))}
            </div>
          </label>

          <div className="my-1 h-9 w-px shrink-0 self-end bg-[#eceef0]" />

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Buscar</span>
            <SearchInput value={buscar} onChange={setBuscar} placeholder="Cliente, NIT o # documento…" className="w-64" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Producto</span>
            <select value={producto} onChange={(e) => setProducto(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]">
              <option value="">Todos los productos</option>
              {(data?.productosDisponibles ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Kg mínimo</span>
            <input type="number" min={0} value={kgMin} onChange={(e) => setKgMin(e.target.value)} placeholder="0" className="w-24 rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
          </label>

          <button onClick={cargar} className="rounded-lg bg-[#2f8f4e] px-5 py-2 text-sm font-medium text-white hover:bg-[#277a42]">Consultar</button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      {loading ? (
        <PageLoader />
      ) : !data || data.grupos.length === 0 ? (
        <div className="rounded-2xl border border-[#e1e9dd] bg-white">
          <EmptyState icon={IconMapPin} title="Sin facturas en el rango" description="Ajusta los filtros y vuelve a consultar." />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard label="Facturas" value={fmtN(data.totalFacturas)} icon={IconClipboard} />
            <StatCard label="Kilos" value={fmtN(data.totalKg)} color="#2f8f4e" icon={IconBox} />
            <StatCard label="Valor" value={fmtMoney(data.totalValor)}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 15.5c.5 1 1.4 1.5 2.5 1.5 1.4 0 2.5-.8 2.5-2s-1-1.6-2.5-2-2.5-.8-2.5-2 1.1-2 2.5-2c1.1 0 2 .5 2.5 1.5" /><path d="M12 6.5v11" /></svg>} />
            <StatCard label={data.criterio === "barrio" ? "Barrios" : "Ciudades"} value={data.grupos.length} icon={IconMapPin} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.grupos.map((g) => {
              const abierto = expandido === g.nombre;
              const pct = data.totalKg > 0 ? Math.round((g.kg / data.totalKg) * 100) : 0;
              return (
                <div key={g.nombre} className="overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
                  <button onClick={() => setExpandido(abierto ? null : g.nombre)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#f9fbf7]">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#14352a]">{g.nombre}</p>
                      <p className="text-xs text-[#7a8794]">{g.clientes.length} clientes · {pct}% del total</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold text-[#2f8f4e]">{fmtN(g.kg)} kg</p>
                      <p className="text-xs text-[#9aa4af]">{fmtMoney(g.valor)}</p>
                    </div>
                  </button>
                  <div className="h-1.5 w-full bg-[#f2f5ef]">
                    <div className="h-full bg-[#2f8f4e]" style={{ width: `${pct}%` }} />
                  </div>
                  {abierto && (
                    <div className="nice-scroll max-h-64 overflow-y-auto border-t border-[#eceef0] px-4 py-2">
                      {g.clientes.map((cl) => (
                        <button
                          key={`${cl.nombre}|${cl.nit}`}
                          onClick={() => setClienteModal(cl)}
                          className="flex w-full items-center justify-between gap-2 border-b border-[#f0f2ee] py-1.5 text-xs last:border-0 hover:bg-[#f7faf5]"
                        >
                          <span className="truncate text-left text-[#45505e]">{cl.nombre}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-[#14352a]">{fmtN(cl.kg)} kg</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {clienteModal && <ClienteDetalleModal cliente={clienteModal} onClose={() => setClienteModal(null)} />}
    </div>
  );
}

// Modal: todas las remisiones/documentos del cliente en el rango, con su
// desglose completo de productos — fecha, sucursal, dirección, kg y valor.
function ClienteDetalleModal({ cliente, onClose }: { cliente: PreplanCliente; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-[#eceef0] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#14352a]">{cliente.nombre}</h3>
          <p className="mt-0.5 text-sm text-[#5f7a68]">NIT/Cédula {cliente.nit} · {cliente.documentos.length} remisión{cliente.documentos.length === 1 ? "" : "es"} en el rango</p>
        </div>

        <div className="shrink-0 grid grid-cols-2 gap-2.5 border-b border-[#eceef0] bg-[#fbfdfa] px-6 py-3">
          <div className="rounded-lg bg-white p-2 text-center shadow-sm">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#9aa4af]">Kilos totales</p>
            <p className="text-lg font-bold text-[#2f8f4e]">{fmtN(cliente.kg)}</p>
          </div>
          <div className="rounded-lg bg-white p-2 text-center shadow-sm">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#9aa4af]">Valor total</p>
            <p className="text-lg font-bold text-[#14352a]">{fmtMoney(cliente.valor)}</p>
          </div>
        </div>

        <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-3">
            {cliente.documentos.map((d) => (
              <div key={`${d.origen}-${d.numero}`} className="overflow-hidden rounded-xl border border-[#e1e9dd]">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f7faf5] px-4 py-2.5">
                  <div>
                    <p className="font-mono text-sm font-semibold text-[#14352a]">{d.numero}</p>
                    <p className="text-xs text-[#7a8794]">{d.fecha} · {d.origen === "INVERSIONES" ? "Inversiones" : "Agropecuaria"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#2f8f4e]">{fmtN(d.kg)} kg</p>
                    <p className="text-xs text-[#9aa4af]">{fmtMoney(d.valor)}</p>
                  </div>
                </div>
                {(d.sucursal || d.direccion) && (
                  <div className="border-b border-[#f0f2ee] px-4 py-2 text-xs text-[#45505e]">
                    {d.sucursal && <p className="font-medium">{d.sucursal}</p>}
                    {d.direccion && <p className="text-[#7a8794]">{d.direccion}</p>}
                  </div>
                )}
                <table className="w-full text-xs">
                  <thead className="bg-white text-left font-semibold uppercase tracking-wide text-[#9aa4af]">
                    <tr><th className="px-4 py-1.5">Producto</th><th className="px-4 py-1.5 text-right">Kg</th><th className="px-4 py-1.5 text-right">Valor</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f2ee]">
                    {d.productos.map((p, i) => (
                      <tr key={i}>
                        <td className="px-4 py-1.5 text-[#45505e]">{p.tipoComercial}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums text-[#14352a]">{fmtN(p.kg)}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums text-[#14352a]">{fmtMoney(p.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end border-t border-[#eceef0] px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
