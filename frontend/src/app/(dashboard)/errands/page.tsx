"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { PageLoader } from "@/components/Loading";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";
import IconButton from "@/components/IconButton";
import SoloLecturaBadge from "@/components/SoloLecturaBadge";
import {
  IconBox, IconUsers, IconMapPin, IconMoto, IconDownload, IconUpload,
  IconTrash, IconPencil, IconCheckCircle, IconAlertTriangle,
} from "@/components/icons";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { usePermiso } from "@/lib/permisos";
import { ApiError } from "@/lib/api";
import {
  type ErrandsCliente, type ErrandsPedido, type ErrandsPuntoVenta, type ErrandsPedidoInput,
  type ErrandsDomiciliario, type ErrandsDomiciliarioInput,
  getErrandsPedidos, getErrandsClientes, getErrandsPuntosVenta,
  crearErrandsPedidosLote, editarErrandsPedido, cambiarEstadoErrandsPedido, eliminarErrandsPedido, borrarTodosErrandsPedidos,
  getErrandsPedidoNextNumero, exportarErrandsFreeOrder,
  crearErrandsCliente, editarErrandsCliente, eliminarErrandsCliente, borrarTodosErrandsClientes, cargaMasivaErrandsClientes,
  crearErrandsPuntoVenta, editarErrandsPuntoVenta, eliminarErrandsPuntoVenta,
  getErrandsDomiciliarios, crearErrandsDomiciliario, editarErrandsDomiciliario, eliminarErrandsDomiciliario,
  borrarTodosErrandsDomiciliarios, cargaMasivaErrandsDomiciliarios,
} from "@/lib/errandsApi";

const ESTADOS: ErrandsPedido["estado"][] = ["PENDIENTE", "EN_PROCESO", "ENTREGADO", "CANCELADO", "EDITADO", "REVISADO"];
function pdvLabel(p: ErrandsPuntoVenta) {
  return `PDV${String(p.indicador).padStart(2, "0")} · ${p.nombre}`;
}
const ESTADO_COLOR: Record<string, string> = {
  PENDIENTE: "bg-[#fdf6e9] text-[#a86a12]",
  EN_PROCESO: "bg-[#e6effb] text-[#1a5fb4]",
  ENTREGADO: "bg-[#e8f3e2] text-[#2f8f4e]",
  CANCELADO: "bg-[#fbeceb] text-[#b3261e]",
  EDITADO: "bg-[#f2f5ef] text-[#5f7a68]",
  REVISADO: "bg-[#e8f3e2] text-[#2f8f4e]",
};

export default function ErrandsPage() {
  const [tab, setTab] = useState<"pedidos" | "clientes" | "domiciliarios" | "pdv">("pedidos");
  const puedeEditar = usePermiso("distrilog.errands.editar");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "clientes" || t === "pdv" || t === "pedidos" || t === "domiciliarios") setTab(t);
  }, []);

  return (
    <div className="p-6">
      <PageHeader
        icon={IconBox}
        title="Run Errands"
        subtitle="Pedidos ad-hoc de un punto de venta hacia un destino, exportables a Excel (Free_Order)."
        actions={
          <div className="flex items-center gap-2">
            {!puedeEditar && <SoloLecturaBadge />}
            <div className="flex items-center gap-0.5 rounded-lg border border-[#dfe4e0] bg-white p-0.5">
              {([
                ["pedidos", "Pedidos"],
                ["clientes", "Clientes"],
                ["domiciliarios", "Domiciliarios"],
                ["pdv", "Puntos de Venta"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${tab === key ? "bg-[#2f8f4e] text-white" : "text-[#5f7a68] hover:bg-[#f4f6f3]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {tab === "pedidos" && <PedidosTab puedeEditar={puedeEditar} />}
      {tab === "clientes" && <ClientesTab puedeEditar={puedeEditar} />}
      {tab === "domiciliarios" && <DomiciliariosTab puedeEditar={puedeEditar} />}
      {tab === "pdv" && <PdvTab puedeEditar={puedeEditar} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PEDIDOS
// ════════════════════════════════════════════════════════════════════════

function PedidosTab({ puedeEditar }: { puedeEditar: boolean }) {
  const [pedidos, setPedidos] = useState<ErrandsPedido[]>([]);
  const [pdvs, setPdvs] = useState<ErrandsPuntoVenta[]>([]);
  const [domiciliarios, setDomiciliarios] = useState<ErrandsDomiciliario[]>([]);
  const [filtroPdv, setFiltroPdv] = useState("TODOS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [modalPedido, setModalPedido] = useState(false);
  const [editando, setEditando] = useState<ErrandsPedido | null>(null);
  const [borrarTodo, setBorrarTodo] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  function cargar() {
    setLoading(true);
    Promise.all([
      getErrandsPedidos({ pdv: filtroPdv, estado: filtroEstado, desde: desde || undefined, hasta: hasta || undefined }),
      getErrandsPuntosVenta(),
      getErrandsDomiciliarios({ todos: true }),
    ]).then(([p, v, d]) => { setPedidos(p); setPdvs(v); setDomiciliarios(d); }).finally(() => setLoading(false));
  }
  useEffect(cargar, [filtroPdv, filtroEstado, desde, hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: number) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function exportar() {
    const ids = seleccion.size > 0 ? [...seleccion] : pedidos.map((p) => p.id);
    if (ids.length === 0) return showToast("No hay pedidos para exportar", "error");
    setExportando(true);
    try {
      await exportarErrandsFreeOrder(ids);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al exportar", "error");
    } finally {
      setExportando(false);
    }
  }

  async function cambiarEstado(p: ErrandsPedido, estado: ErrandsPedido["estado"]) {
    try {
      await cambiarEstadoErrandsPedido(p.id, estado);
      cargar();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al cambiar estado", "error");
    }
  }

  async function eliminar(p: ErrandsPedido) {
    if (await confirm({ title: "¿Eliminar este pedido?", message: `${p.numeroPedido} — ${p.cliente.nombre}`, danger: true, confirmLabel: "Eliminar" })) {
      eliminarErrandsPedido(p.id).then(cargar).catch((err) => showToast(err instanceof ApiError ? err.message : "Error", "error"));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {puedeEditar && (
          <button onClick={() => { setEditando(null); setModalPedido(true); }} className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nuevo pedido
          </button>
        )}
        <button onClick={exportar} disabled={exportando} className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-60">
          {IconDownload} {exportando ? "Generando…" : `Exportar Excel${seleccion.size > 0 ? ` (${seleccion.size})` : ""}`}
        </button>
        {puedeEditar && (
          <button onClick={() => setBorrarTodo(true)} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#f0c4c1] bg-white px-3 py-2 text-xs font-medium text-[#b3261e] hover:bg-[#fbeceb]">
            {IconTrash} Eliminar todos
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={filtroPdv} onChange={(e) => setFiltroPdv(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]">
          <option value="TODOS">Todos los PDV</option>
          {pdvs.map((p) => <option key={p.id} value={p.id}>{pdvLabel(p)}</option>)}
        </select>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]">
          <option value="TODOS">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
        <span className="text-xs text-[#7a8794]">{pedidos.length} pedidos</span>
      </div>

      {loading ? (
        <PageLoader />
      ) : pedidos.length === 0 ? (
        <div className="rounded-2xl border border-[#e1e9dd] bg-white">
          <EmptyState icon={IconBox} title="Sin pedidos" description='Crea el primero con "+ Nuevo pedido".' />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e1e9dd] bg-[#f7faf5] text-left text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
              <tr>
                <th className="px-3 py-2"><input type="checkbox" checked={seleccion.size === pedidos.length} onChange={(e) => setSeleccion(e.target.checked ? new Set(pedidos.map((p) => p.id)) : new Set())} /></th>
                <th className="px-3 py-2">Consecutivo</th>
                <th className="px-3 py-2">PDV origen</th>
                <th className="px-3 py-2">Destino</th>
                <th className="px-3 py-2">Domiciliario</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2 text-center">Kilos</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2ee]">
              {pedidos.map((p) => (
                <tr key={p.id} className="hover:bg-[#f9fbf7]">
                  <td className="px-3 py-2"><input type="checkbox" checked={seleccion.has(p.id)} onChange={() => toggle(p.id)} /></td>
                  <td className="px-3 py-2 font-mono text-xs font-medium text-[#14352a]">{p.numeroPedido}</td>
                  <td className="px-3 py-2 text-[#45505e]">{p.puntoVenta ? pdvLabel(p.puntoVenta) : "—"}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-[#14352a]">{p.cliente.nombre}</p>
                    <p className="text-xs text-[#9aa4af]">{p.cliente.codigo}{p.cliente.ciudad ? ` · ${p.cliente.ciudad}` : ""}</p>
                  </td>
                  <td className="px-3 py-2 text-[#45505e]">{p.domiciliario?.nombre ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-[#7a8794]">{new Date(p.fecha).toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{p.kilos}</td>
                  <td className="px-3 py-2">
                    {puedeEditar ? (
                      <select value={p.estado} onChange={(e) => cambiarEstado(p, e.target.value as ErrandsPedido["estado"])} className={`rounded-full border-0 px-2 py-1 text-xs font-medium outline-none ${ESTADO_COLOR[p.estado]}`}>
                        {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                    ) : (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_COLOR[p.estado]}`}>{p.estado}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {puedeEditar && (
                      <div className="flex items-center justify-end gap-1.5">
                        <IconButton title="Editar" onClick={() => { setEditando(p); setModalPedido(true); }}>{IconPencil}</IconButton>
                        <IconButton title="Eliminar" className="hover:border-[#b3261e] hover:bg-[#fbeceb] hover:text-[#b3261e]" onClick={() => eliminar(p)}>{IconTrash}</IconButton>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalPedido && (
        <PedidoModal
          editando={editando}
          pdvs={pdvs}
          domiciliarios={domiciliarios}
          onClose={() => setModalPedido(false)}
          onSaved={() => { setModalPedido(false); cargar(); }}
        />
      )}

      {borrarTodo && (
        <BorrarTodoModal
          titulo="Eliminar todos los pedidos"
          descripcion="Esta acción eliminará TODOS los pedidos registrados de forma permanente."
          onClose={() => setBorrarTodo(false)}
          onConfirmar={async () => {
            const r = await borrarTodosErrandsPedidos();
            showToast(`Se eliminaron ${r.eliminados} pedidos.`, "success");
            setBorrarTodo(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function PedidoModal({ editando, pdvs, domiciliarios, onClose, onSaved }: {
  editando: ErrandsPedido | null;
  pdvs: ErrandsPuntoVenta[];
  domiciliarios: ErrandsDomiciliario[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [numeroPreview, setNumeroPreview] = useState("");
  const [puntoVentaId, setPuntoVentaId] = useState(editando?.puntoVentaId ? String(editando.puntoVentaId) : "");
  const [domiciliarioId, setDomiciliarioId] = useState(editando?.domiciliarioId ? String(editando.domiciliarioId) : "");
  const [buscarDestino, setBuscarDestino] = useState(editando?.cliente.nombre ?? "");
  const [clienteSel, setClienteSel] = useState<ErrandsCliente | null>(editando?.cliente ?? null);
  const [resultados, setResultados] = useState<ErrandsCliente[]>([]);
  const [estado, setEstado] = useState<ErrandsPedido["estado"]>(editando?.estado ?? "REVISADO");
  const [observaciones, setObservaciones] = useState(editando?.observaciones ?? "");
  const [cola, setCola] = useState<{ label: string; input: ErrandsPedidoInput }[]>([]);
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const { showToast } = useToast();

  const domiciliariosFiltrados = puntoVentaId
    ? domiciliarios.filter((d) => d.activo && d.puntoVentaId === Number(puntoVentaId))
    : domiciliarios.filter((d) => d.activo);

  useEffect(() => {
    // Si el domiciliario elegido ya no aplica al PDV seleccionado, se limpia.
    if (domiciliarioId && !domiciliariosFiltrados.some((d) => d.id === Number(domiciliarioId))) {
      setDomiciliarioId("");
    }
  }, [puntoVentaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editando) getErrandsPedidoNextNumero().then((r) => setNumeroPreview(r.numeroPedido));
  }, [editando]);

  useEffect(() => {
    const q = buscarDestino.trim();
    if (!q || (clienteSel && clienteSel.nombre === q)) { setResultados([]); return; }
    const t = setTimeout(() => {
      getErrandsClientes({ buscar: q }).then(setResultados).catch(() => setResultados([]));
    }, 200);
    return () => clearTimeout(t);
  }, [buscarDestino, clienteSel]);

  function seleccionarCliente(c: ErrandsCliente) {
    setClienteSel(c);
    setBuscarDestino(c.nombre);
    setResultados([]);
  }

  function armarInput(): ErrandsPedidoInput | null {
    if (!clienteSel) return null;
    return {
      clienteId: clienteSel.id,
      puntoVentaId: puntoVentaId ? Number(puntoVentaId) : null,
      domiciliarioId: domiciliarioId ? Number(domiciliarioId) : null,
      estado,
      observaciones: observaciones || undefined,
    };
  }

  function limpiarParaSiguiente() {
    setBuscarDestino("");
    setClienteSel(null);
  }

  function agregarACola() {
    const input = armarInput();
    if (!puntoVentaId) return showToast("Selecciona el PDV de origen", "error");
    if (!input) return showToast("Selecciona un destino válido", "error");
    setCola((prev) => [...prev, { label: `${clienteSel?.nombre} (${clienteSel?.codigo})`, input }]);
    limpiarParaSiguiente();
  }

  function quitarDeCola(i: number) {
    setCola((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    if (!puntoVentaId) return showToast("Selecciona el PDV de origen", "error");
    setGuardando(true);
    try {
      if (editando) {
        await editarErrandsPedido(editando.id, armarInput() ?? {});
        showToast("Pedido actualizado.", "success");
      } else {
        const actual = armarInput();
        const filas = [...cola.map((c) => c.input), ...(actual ? [actual] : [])];
        if (filas.length === 0) return showToast("Selecciona al menos un destino", "error");
        await crearErrandsPedidosLote(filas);
        showToast(`Se crearon ${filas.length} pedido(s).`, "success");
      }
      onSaved();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al guardar", "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#eceef0] px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[#14352a]">{editando ? "Editar pedido" : "Nuevo pedido"}</h3>
            <p className="mt-0.5 text-sm text-[#5f7a68]">{editando ? editando.numeroPedido : "Se genera un consecutivo automático."}</p>
          </div>
          {!editando && <span className="rounded-lg border border-[#2f8f4e] bg-[#e8f3e2] px-3 py-1.5 text-sm font-semibold text-[#2f8f4e]">{numeroPreview || "…"}</span>}
        </div>

        <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#7a8794]">PDV de origen *</span>
              <select value={puntoVentaId} onChange={(e) => setPuntoVentaId(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]">
                <option value="">-- Seleccione PDV --</option>
                {pdvs.map((p) => <option key={p.id} value={p.id}>{pdvLabel(p)}</option>)}
              </select>
            </label>
          </div>

          <div className="mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#7a8794]">Domiciliario {puntoVentaId ? "(del PDV elegido)" : "(todos)"}</span>
              <select value={domiciliarioId} onChange={(e) => setDomiciliarioId(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]">
                <option value="">-- Sin asignar --</option>
                {domiciliariosFiltrados.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
              {puntoVentaId && domiciliariosFiltrados.length === 0 && (
                <span className="text-xs text-[#a86a12]">Este PDV no tiene domiciliarios asignados.</span>
              )}
            </label>
          </div>

          <div className="relative mb-4">
            <span className="mb-1 block text-xs font-medium text-[#7a8794]">Destino * (buscar por nombre o código)</span>
            <input
              value={buscarDestino}
              onChange={(e) => { setBuscarDestino(e.target.value); setClienteSel(null); }}
              placeholder="Escriba el nombre del destino…"
              className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]"
            />
            {resultados.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[#dfe4e0] bg-white shadow-lg">
                {resultados.map((c) => (
                  <button key={c.id} onClick={() => seleccionarCliente(c)} className="flex w-full flex-col items-start gap-0 px-3 py-2 text-left hover:bg-[#f4f6f3]">
                    <span className="text-sm font-medium text-[#14352a]">{c.nombre}</span>
                    <span className="text-xs text-[#9aa4af]">{c.codigo}{c.barrio ? ` · ${c.barrio}` : ""}{c.ciudad ? ` · ${c.ciudad}` : ""}</span>
                  </button>
                ))}
              </div>
            )}
            {buscarDestino.trim() && !clienteSel && resultados.length === 0 && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-3 py-2">
                <span className="text-xs text-[#b3261e]">Destino no encontrado.</span>
                <button onClick={() => setCreandoCliente(true)} className="rounded-lg bg-[#2f8f4e] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#277a42]">+ Crear cliente</button>
              </div>
            )}
          </div>

          {clienteSel && (
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-[#e1e9dd] bg-[#f7faf5] p-3 text-xs sm:grid-cols-4">
              <div><p className="text-[#9aa4af]">Código</p><p className="font-medium text-[#14352a]">{clienteSel.codigo}</p></div>
              <div className="col-span-2"><p className="text-[#9aa4af]">Dirección</p><p className="font-medium text-[#14352a]">{clienteSel.direccion || "—"}</p></div>
              <div><p className="text-[#9aa4af]">Barrio</p><p className="font-medium text-[#14352a]">{clienteSel.barrio || "—"}</p></div>
              <div><p className="text-[#9aa4af]">Ciudad</p><p className="font-medium text-[#14352a]">{clienteSel.ciudad || "—"}</p></div>
              <div><p className="text-[#9aa4af]">Región</p><p className="font-medium text-[#14352a]">{clienteSel.region || "—"}</p></div>
            </div>
          )}

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#7a8794]">Estado</span>
              <select value={estado} onChange={(e) => setEstado(e.target.value as ErrandsPedido["estado"])} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]">
                {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#7a8794]">Observaciones</span>
              <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
            </label>
          </div>

          {!editando && cola.length > 0 && (
            <div className="rounded-xl border border-[#e1e9dd] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7a8794]">Pedidos en cola ({cola.length})</p>
              <div className="flex flex-col gap-1.5">
                {cola.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-[#f7faf5] px-3 py-1.5 text-sm">
                    <span className="truncate text-[#45505e]">{c.label}</span>
                    <button onClick={() => quitarDeCola(i)} className="text-[#9aa4af] hover:text-[#b3261e]">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#eceef0] px-6 py-4">
          <div>
            {!editando && (
              <button onClick={agregarACola} title="Agregar otro pedido a la cola" className="inline-flex items-center gap-1.5 rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-xs font-medium text-[#45505e] hover:bg-[#f4f6f3]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Agregar y seguir
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-60">
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : `Guardar${cola.length > 0 ? ` (${cola.length + (clienteSel ? 1 : 0)})` : ""}`}
            </button>
          </div>
        </div>
      </div>

      {creandoCliente && (
        <ClienteModal
          nombreInicial={buscarDestino}
          onClose={() => setCreandoCliente(false)}
          onSaved={(c) => { setCreandoCliente(false); seleccionarCliente(c); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// CLIENTES (destinos)
// ════════════════════════════════════════════════════════════════════════

function ClientesTab({ puedeEditar }: { puedeEditar: boolean }) {
  const [clientes, setClientes] = useState<ErrandsCliente[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ editando: ErrandsCliente | null } | null>(null);
  const [cargaMasiva, setCargaMasiva] = useState(false);
  const [borrarTodo, setBorrarTodo] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  function cargar() {
    setLoading(true);
    getErrandsClientes({ buscar: busqueda || undefined }).then(setClientes).finally(() => setLoading(false));
  }
  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  async function eliminar(c: ErrandsCliente) {
    if (await confirm({ title: "¿Desactivar este cliente?", message: c.nombre, danger: true, confirmLabel: "Desactivar" })) {
      eliminarErrandsCliente(c.id).then(cargar).catch((err) => showToast(err instanceof ApiError ? err.message : "Error", "error"));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre, código, barrio, ciudad…" className="w-full max-w-sm" />
        {puedeEditar && (
          <>
            <button onClick={() => setModal({ editando: null })} className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Nuevo cliente
            </button>
            <button onClick={() => setCargaMasiva(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">{IconUpload} Carga masiva</button>
            <button onClick={() => setBorrarTodo(true)} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#f0c4c1] bg-white px-3 py-2 text-xs font-medium text-[#b3261e] hover:bg-[#fbeceb]">{IconTrash} Eliminar todos</button>
          </>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : clientes.length === 0 ? (
        <div className="rounded-2xl border border-[#e1e9dd] bg-white">
          <EmptyState icon={IconUsers} title="Sin clientes registrados" description='Crea el primero con "+ Nuevo cliente" o usa la carga masiva.' />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e1e9dd] bg-[#f7faf5] text-left text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Destino</th>
                <th className="px-3 py-2">Dirección</th>
                <th className="px-3 py-2">Barrio</th>
                <th className="px-3 py-2">Ciudad</th>
                <th className="px-3 py-2">Región</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2ee]">
              {clientes.map((c) => (
                <tr key={c.id} className="hover:bg-[#f9fbf7]">
                  <td className="px-3 py-2 font-mono text-xs">{c.codigo}</td>
                  <td className="px-3 py-2 font-medium text-[#14352a]">{c.nombre}</td>
                  <td className="px-3 py-2 text-[#45505e]">{c.direccion || "—"}</td>
                  <td className="px-3 py-2 text-[#45505e]">{c.barrio || "—"}</td>
                  <td className="px-3 py-2 text-[#45505e]">{c.ciudad || "—"}</td>
                  <td className="px-3 py-2 text-[#45505e]">{c.region || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {puedeEditar && (
                      <div className="flex items-center justify-end gap-1.5">
                        <IconButton title="Editar" onClick={() => setModal({ editando: c })}>{IconPencil}</IconButton>
                        <IconButton title="Desactivar" className="hover:border-[#b3261e] hover:bg-[#fbeceb] hover:text-[#b3261e]" onClick={() => eliminar(c)}>{IconTrash}</IconButton>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ClienteModal
          editando={modal.editando}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
        />
      )}

      {cargaMasiva && (
        <CargaMasivaClientesModal onClose={() => setCargaMasiva(false)} onAplicado={() => { setCargaMasiva(false); cargar(); }} />
      )}

      {borrarTodo && (
        <BorrarTodoModal
          titulo="Eliminar todos los clientes"
          descripcion="Esta acción eliminará TODOS los clientes y los pedidos asociados de forma permanente."
          onClose={() => setBorrarTodo(false)}
          onConfirmar={async () => {
            const r = await borrarTodosErrandsClientes();
            showToast(`Se eliminaron ${r.eliminados} clientes.`, "success");
            setBorrarTodo(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function ClienteModal({ editando, nombreInicial, onClose, onSaved }: {
  editando?: ErrandsCliente | null;
  nombreInicial?: string;
  onClose: () => void;
  onSaved: (c: ErrandsCliente) => void;
}) {
  const [form, setForm] = useState({
    nombre: editando?.nombre ?? nombreInicial ?? "",
    direccion: editando?.direccion ?? "",
    referencia: editando?.referencia ?? "",
    barrio: editando?.barrio ?? "",
    ciudad: editando?.ciudad ?? "",
    region: editando?.region ?? "",
    telefono: editando?.telefono ?? "",
    email: editando?.email ?? "",
    observaciones: editando?.observaciones ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const { showToast } = useToast();

  async function guardar() {
    if (!form.nombre.trim()) return showToast("El nombre es requerido", "error");
    setGuardando(true);
    try {
      const cliente = editando ? await editarErrandsCliente(editando.id, form) : await crearErrandsCliente(form);
      showToast(editando ? "Cliente actualizado." : "Cliente creado.", "success");
      onSaved(cliente);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al guardar", "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-[#eceef0] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#14352a]">{editando ? "Editar cliente" : "Nuevo cliente"}</h3>
          <p className="mt-0.5 text-sm text-[#5f7a68]">{editando ? editando.codigo : "El código se genera automáticamente."}</p>
        </div>
        <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-[#7a8794]">Destino / Nombre *</span>
              <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-[#7a8794]">Dirección</span>
              <input value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-[#7a8794]">Referencia</span>
              <input value={form.referencia} onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))} placeholder="Punto de referencia, torre, local…" className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#7a8794]">Barrio</span>
              <input value={form.barrio} onChange={(e) => setForm((f) => ({ ...f, barrio: e.target.value }))} list="errands-barrios" className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#7a8794]">Ciudad</span>
              <input value={form.ciudad} onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))} list="errands-ciudades" className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#7a8794]">Región</span>
              <input value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} list="errands-regiones" className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#7a8794]">Teléfono</span>
              <input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#7a8794]">Email</span>
              <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-[#7a8794]">Observaciones</span>
              <input value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
            </label>
          </div>
          <datalist id="errands-ciudades">
            <option value="Barranquilla" /><option value="Soledad" /><option value="Malambo" /><option value="Puerto Colombia" />
          </datalist>
          <datalist id="errands-regiones">
            <option value="Atlántico" />
          </datalist>
          <datalist id="errands-barrios" />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-60">{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}

function CargaMasivaClientesModal({ onClose, onAplicado }: { onClose: () => void; onAplicado: () => void }) {
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{ total: number; insertados: number; actualizados: number; errores: number; detalleErrores: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCargando(true);
    setError(null);
    try {
      setResultado(await cargaMasivaErrandsClientes(file));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo procesar el archivo");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#eceef0] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#14352a]">Carga masiva de clientes</h3>
          <p className="mt-0.5 text-sm text-[#5f7a68]">Excel con columnas: nombre*, codigo, direccion, referencia, barrio, ciudad, region, telefono, email, observaciones.</p>
        </div>
        <div className="px-6 py-5">
          {!resultado && (
            <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#2f8f4e] px-4 py-2 text-sm text-[#2f8f4e] hover:bg-[#e8f3e2]">
              {IconUpload} {cargando ? "Leyendo archivo…" : "Elegir archivo .xlsx"}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={cargando} className="hidden" />
            </label>
          )}
          {error && <p className="mt-2 text-sm text-[#b3261e]">{error}</p>}
          {resultado && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-[#f7faf5] p-2 text-center"><p className="text-xs text-[#7a8794]">Total filas</p><p className="text-lg font-bold text-[#14352a]">{resultado.total}</p></div>
              <div className="rounded-lg bg-[#e8f3e2] p-2 text-center"><p className="text-xs text-[#7a8794]">Nuevos</p><p className="text-lg font-bold text-[#2f8f4e]">{resultado.insertados}</p></div>
              <div className="rounded-lg bg-[#e6effb] p-2 text-center"><p className="text-xs text-[#7a8794]">Actualizados</p><p className="text-lg font-bold text-[#1a5fb4]">{resultado.actualizados}</p></div>
              <div className="rounded-lg bg-[#fdf6e9] p-2 text-center"><p className="text-xs text-[#7a8794]">Errores</p><p className="text-lg font-bold text-[#a86a12]">{resultado.errores}</p></div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cerrar</button>
          {resultado && <button onClick={onAplicado} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">Listo</button>}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// DOMICILIARIOS
// ════════════════════════════════════════════════════════════════════════

function DomiciliariosTab({ puedeEditar }: { puedeEditar: boolean }) {
  const [domiciliarios, setDomiciliarios] = useState<ErrandsDomiciliario[]>([]);
  const [pdvs, setPdvs] = useState<ErrandsPuntoVenta[]>([]);
  const [filtroPdv, setFiltroPdv] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ editando: ErrandsDomiciliario | null } | null>(null);
  const [cargaMasiva, setCargaMasiva] = useState(false);
  const [borrarTodo, setBorrarTodo] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  function cargar() {
    setLoading(true);
    Promise.all([
      getErrandsDomiciliarios({ pdv: filtroPdv, todos: true }),
      getErrandsPuntosVenta(),
    ]).then(([d, v]) => { setDomiciliarios(d); setPdvs(v); }).finally(() => setLoading(false));
  }
  useEffect(cargar, [filtroPdv]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = domiciliarios.filter((d) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return d.nombre.toLowerCase().includes(q) || (d.cedula ?? "").includes(q) || (d.telefono ?? "").includes(q);
  });

  async function eliminar(d: ErrandsDomiciliario) {
    if (await confirm({ title: "¿Desactivar este domiciliario?", message: d.nombre, danger: true, confirmLabel: "Desactivar" })) {
      eliminarErrandsDomiciliario(d.id).then(cargar).catch((err) => showToast(err instanceof ApiError ? err.message : "Error", "error"));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre, cédula o celular…" className="w-full max-w-sm" />
        <select value={filtroPdv} onChange={(e) => setFiltroPdv(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]">
          <option value="TODOS">Todos los PDV</option>
          <option value="SIN">Sin PDV asignado</option>
          {pdvs.map((p) => <option key={p.id} value={p.id}>{pdvLabel(p)}</option>)}
        </select>
        {puedeEditar && (
          <>
            <button onClick={() => setModal({ editando: null })} className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Nuevo domiciliario
            </button>
            <button onClick={() => setCargaMasiva(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">{IconUpload} Carga masiva</button>
            <button onClick={() => setBorrarTodo(true)} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#f0c4c1] bg-white px-3 py-2 text-xs font-medium text-[#b3261e] hover:bg-[#fbeceb]">{IconTrash} Eliminar todos</button>
          </>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-[#e1e9dd] bg-white">
          <EmptyState icon={IconMoto} title="Sin domiciliarios registrados" description='Crea el primero con "+ Nuevo domiciliario" o usa la carga masiva.' />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e1e9dd] bg-[#f7faf5] text-left text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Cédula</th>
                <th className="px-3 py-2">Celular</th>
                <th className="px-3 py-2">Punto de venta</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2ee]">
              {visibles.map((d) => (
                <tr key={d.id} className="hover:bg-[#f9fbf7]">
                  <td className="px-3 py-2 font-medium text-[#14352a]">{d.nombre}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[#45505e]">{d.cedula || "—"}</td>
                  <td className="px-3 py-2 text-[#45505e]">{d.telefono || "—"}</td>
                  <td className="px-3 py-2 text-[#45505e]">{d.puntoVenta ? pdvLabel(d.puntoVenta) : "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${d.activo ? "bg-[#e8f3e2] text-[#2f8f4e]" : "bg-[#f0f1f2] text-[#6b7683]"}`}>{d.activo ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {puedeEditar && (
                      <div className="flex items-center justify-end gap-1.5">
                        <IconButton title="Editar" onClick={() => setModal({ editando: d })}>{IconPencil}</IconButton>
                        {d.activo && <IconButton title="Desactivar" className="hover:border-[#b3261e] hover:bg-[#fbeceb] hover:text-[#b3261e]" onClick={() => eliminar(d)}>{IconTrash}</IconButton>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <DomiciliarioModal
          editando={modal.editando}
          pdvs={pdvs}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
        />
      )}

      {cargaMasiva && (
        <CargaMasivaDomiciliariosModal onClose={() => setCargaMasiva(false)} onAplicado={() => { setCargaMasiva(false); cargar(); }} />
      )}

      {borrarTodo && (
        <BorrarTodoModal
          titulo="Eliminar todos los domiciliarios"
          descripcion="Esta acción eliminará TODOS los domiciliarios registrados de forma permanente."
          onClose={() => setBorrarTodo(false)}
          onConfirmar={async () => {
            const r = await borrarTodosErrandsDomiciliarios();
            showToast(`Se eliminaron ${r.eliminados} domiciliarios.`, "success");
            setBorrarTodo(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function DomiciliarioModal({ editando, pdvs, onClose, onSaved }: {
  editando: ErrandsDomiciliario | null;
  pdvs: ErrandsPuntoVenta[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ErrandsDomiciliarioInput>({
    nombre: editando?.nombre ?? "",
    telefono: editando?.telefono ?? "",
    cedula: editando?.cedula ?? "",
    email: editando?.email ?? "",
    puntoVentaId: editando?.puntoVentaId ?? null,
  });
  const [activo, setActivo] = useState(editando?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const { showToast } = useToast();

  async function guardar() {
    if (!form.nombre.trim()) return showToast("El nombre es requerido", "error");
    setGuardando(true);
    try {
      if (editando) await editarErrandsDomiciliario(editando.id, { ...form, activo });
      else await crearErrandsDomiciliario(form);
      showToast(editando ? "Domiciliario actualizado." : "Domiciliario creado.", "success");
      onSaved();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al guardar", "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#eceef0] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#14352a]">{editando ? "Editar domiciliario" : "Nuevo domiciliario"}</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 px-6 py-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-medium text-[#7a8794]">Nombre completo *</span>
            <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Cédula</span>
            <input value={form.cedula} onChange={(e) => setForm((f) => ({ ...f, cedula: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Celular</span>
            <input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Email</span>
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Punto de venta</span>
            <select value={form.puntoVentaId ?? ""} onChange={(e) => setForm((f) => ({ ...f, puntoVentaId: e.target.value ? Number(e.target.value) : null }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]">
              <option value="">-- Sin asignar --</option>
              {pdvs.map((p) => <option key={p.id} value={p.id}>{pdvLabel(p)}</option>)}
            </select>
          </label>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-[#45505e] sm:col-span-2">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="accent-[#2f8f4e]" />
              Activo
            </label>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-60">{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}

function CargaMasivaDomiciliariosModal({ onClose, onAplicado }: { onClose: () => void; onAplicado: () => void }) {
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{ total: number; insertados: number; actualizados: number; sinPdv: number; errores: number; detalleErrores: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCargando(true);
    setError(null);
    try {
      setResultado(await cargaMasivaErrandsDomiciliarios(file));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo procesar el archivo");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#eceef0] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#14352a]">Carga masiva de domiciliarios</h3>
          <p className="mt-0.5 text-sm text-[#5f7a68]">Excel con columnas: Nombres, Apellidos, Celular, DNI, Correo electrónico, Depósitos (punto de venta), Activo.</p>
        </div>
        <div className="px-6 py-5">
          {!resultado && (
            <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#2f8f4e] px-4 py-2 text-sm text-[#2f8f4e] hover:bg-[#e8f3e2]">
              {IconUpload} {cargando ? "Leyendo archivo…" : "Elegir archivo .xlsx"}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={cargando} className="hidden" />
            </label>
          )}
          {error && <p className="mt-2 text-sm text-[#b3261e]">{error}</p>}
          {resultado && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-[#f7faf5] p-2 text-center"><p className="text-xs text-[#7a8794]">Total filas</p><p className="text-lg font-bold text-[#14352a]">{resultado.total}</p></div>
              <div className="rounded-lg bg-[#e8f3e2] p-2 text-center"><p className="text-xs text-[#7a8794]">Nuevos</p><p className="text-lg font-bold text-[#2f8f4e]">{resultado.insertados}</p></div>
              <div className="rounded-lg bg-[#e6effb] p-2 text-center"><p className="text-xs text-[#7a8794]">Actualizados</p><p className="text-lg font-bold text-[#1a5fb4]">{resultado.actualizados}</p></div>
              <div className="rounded-lg bg-[#fdf6e9] p-2 text-center"><p className="text-xs text-[#7a8794]">Sin PDV</p><p className="text-lg font-bold text-[#a86a12]">{resultado.sinPdv}</p></div>
              <div className="rounded-lg bg-[#fbeceb] p-2 text-center"><p className="text-xs text-[#7a8794]">Errores</p><p className="text-lg font-bold text-[#b3261e]">{resultado.errores}</p></div>
            </div>
          )}
          {resultado && resultado.detalleErrores.length > 0 && (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-[#b3261e]">
              {resultado.detalleErrores.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cerrar</button>
          {resultado && <button onClick={onAplicado} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">Listo</button>}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PUNTOS DE VENTA
// ════════════════════════════════════════════════════════════════════════

function PdvTab({ puedeEditar }: { puedeEditar: boolean }) {
  const [pdvs, setPdvs] = useState<ErrandsPuntoVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ editando: ErrandsPuntoVenta | null } | null>(null);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  function cargar() {
    setLoading(true);
    getErrandsPuntosVenta(true).then(setPdvs).finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  async function desactivar(p: ErrandsPuntoVenta) {
    if (await confirm({ title: "¿Desactivar este punto de venta?", message: p.nombre, danger: true, confirmLabel: "Desactivar" })) {
      eliminarErrandsPuntoVenta(p.id).then(cargar).catch((err) => showToast(err instanceof ApiError ? err.message : "Error", "error"));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {puedeEditar && (
        <div>
          <button onClick={() => setModal({ editando: null })} className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nuevo punto de venta
          </button>
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : pdvs.length === 0 ? (
        <div className="rounded-2xl border border-[#e1e9dd] bg-white">
          <EmptyState icon={IconMapPin} title="Sin puntos de venta" description='Crea el primero con "+ Nuevo punto de venta".' />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e1e9dd] bg-[#f7faf5] text-left text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
              <tr><th className="px-3 py-2">PDV</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2 text-right">Acciones</th></tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2ee]">
              {pdvs.map((p) => (
                <tr key={p.id} className="hover:bg-[#f9fbf7]">
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-[#14352a]">PDV{String(p.indicador).padStart(2, "0")}</td>
                  <td className="px-3 py-2 font-medium text-[#14352a]">{p.nombre}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${p.activo ? "bg-[#e8f3e2] text-[#2f8f4e]" : "bg-[#f0f1f2] text-[#6b7683]"}`}>{p.activo ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {puedeEditar && (
                      <div className="flex items-center justify-end gap-1.5">
                        <IconButton title="Editar" onClick={() => setModal({ editando: p })}>{IconPencil}</IconButton>
                        {p.activo && <IconButton title="Desactivar" className="hover:border-[#b3261e] hover:bg-[#fbeceb] hover:text-[#b3261e]" onClick={() => desactivar(p)}>{IconTrash}</IconButton>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <PdvModal
          editando={modal.editando}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
        />
      )}
    </div>
  );
}

function PdvModal({ editando, onClose, onSaved }: { editando: ErrandsPuntoVenta | null; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(editando?.nombre ?? "");
  const [activo, setActivo] = useState(editando?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const { showToast } = useToast();

  async function guardar() {
    if (!nombre.trim()) return showToast("El nombre es requerido", "error");
    setGuardando(true);
    try {
      if (editando) await editarErrandsPuntoVenta(editando.id, { nombre, activo });
      else await crearErrandsPuntoVenta(nombre);
      showToast(editando ? "Punto de venta actualizado." : "Punto de venta creado.", "success");
      onSaved();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al guardar", "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#eceef0] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#14352a]">{editando ? "Editar punto de venta" : "Nuevo punto de venta"}</h3>
          {editando && <p className="mt-0.5 text-sm text-[#5f7a68]">PDV{String(editando.indicador).padStart(2, "0")}</p>}
        </div>
        <div className="flex flex-col gap-3 px-6 py-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Carnes Santacruz La 93" className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
          </label>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-[#45505e]">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="accent-[#2f8f4e]" />
              Activo
            </label>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-60">{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Confirmación con texto "ELIMINAR" para borrados masivos (solo ADMIN)
// ════════════════════════════════════════════════════════════════════════

function BorrarTodoModal({ titulo, descripcion, onClose, onConfirmar }: {
  titulo: string;
  descripcion: string;
  onClose: () => void;
  onConfirmar: () => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [ejecutando, setEjecutando] = useState(false);
  const { showToast } = useToast();

  async function confirmar() {
    setEjecutando(true);
    try {
      await onConfirmar();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error", "error");
    } finally {
      setEjecutando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#eceef0] px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-[#b3261e]">{IconAlertTriangle}</span>
            <h3 className="text-lg font-semibold text-[#b3261e]">{titulo}</h3>
          </div>
          <p className="mt-1 text-sm text-[#5f7a68]">{descripcion} Esta acción no se puede deshacer.</p>
        </div>
        <div className="px-6 py-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Escribe ELIMINAR para confirmar</span>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#b3261e]" />
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
          <button
            onClick={confirmar}
            disabled={texto !== "ELIMINAR" || ejecutando}
            className="inline-flex items-center gap-2 rounded-lg bg-[#b3261e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#8f1e18] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {IconCheckCircle} {ejecutando ? "Eliminando…" : "Eliminar todo"}
          </button>
        </div>
      </div>
    </div>
  );
}

