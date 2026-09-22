"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { PageLoader } from "@/components/Loading";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";
import { IconRuta } from "@/components/icons";
import { cerrarRuta, crearRuta, editarRuta, eliminarRuta, getAsignacion, getAsignacionMaestros, getRutaDetalle, reabrirRuta } from "@/lib/planApi";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { IconLock, IconLockOpen, IconPencil } from "@/components/icons";

interface RutaRow {
  id: number; numeroRuta: number; horaCargue: string | null; vehiculo: string | null; conductor: string | null;
  nDestinos: number; nAux: number; kls: number; canastillas: number; cerrada: boolean; cerradaPor: string | null;
}
interface MaestroVehiculo { id: number; placa: string; capacidadKg: number | null; disponibilidad: string | null; kgOtrasRutas: number }
interface Maestros {
  vehiculos: MaestroVehiculo[];
  conductores: { id: number; nombre: string }[];
  auxiliares: { id: number; nombre: string }[];
  // "destinos" acá son en realidad Clientes del maestro de Ejecución (id cuid), filtrados a
  // solo los que llevan kilos planificados (Programación) para la fecha consultada.
  destinos: { id: string; numero: string | null; nombre: string; canal: string | null; kg: number }[];
  destinosOcupados: string[];
  sinProgramacion: boolean;
}

const fmtKg = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

export default function AsignacionPage() {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [rutas, setRutas] = useState<RutaRow[]>([]);
  const [maxRutas, setMaxRutas] = useState(26);
  const [maestros, setMaestros] = useState<Maestros | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);
  const [ocupadosOtras, setOcupadosOtras] = useState<string[]>([]);
  const [buscarDestino, setBuscarDestino] = useState("");
  const [vehiculoPicker, setVehiculoPicker] = useState(false);
  const [buscarVehiculo, setBuscarVehiculo] = useState("");
  const [form, setForm] = useState<{ vehiculoId: string; conductorId: string; horaCargue: string; destinoIds: string[]; auxiliarIds: number[] }>({
    vehiculoId: "", conductorId: "", horaCargue: "", destinoIds: [], auxiliarIds: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  function cargar() {
    setLoading(true);
    return Promise.all([getAsignacion(fecha), getAsignacionMaestros(fecha)])
      .then(([a, m]) => {
        const ar = a as { rutas: RutaRow[]; maxRutas: number };
        setRutas(ar.rutas);
        setMaxRutas(ar.maxRutas);
        setMaestros(m as Maestros);
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => { cargar(); }, [fecha]); // eslint-disable-line react-hooks/exhaustive-deps

  function formVacio(): typeof form {
    return { vehiculoId: "", conductorId: "", horaCargue: "", destinoIds: [], auxiliarIds: [] };
  }

  // Abre el modal en modo "crear": todavía NO se persiste nada en el servidor,
  // solo se crea la ruta cuando el usuario confirma el formulario completo.
  function abrirCreacion() {
    setError(null);
    setEditId(null);
    setCreando(true);
    setBuscarDestino("");
    setBuscarVehiculo("");
    setOcupadosOtras(maestros?.destinosOcupados ?? []);
    setForm(formVacio());
  }

  async function abrirEdicion(id: number) {
    const [d, m] = await Promise.all([
      getRutaDetalle(id) as Promise<{ vehiculoId: number | null; conductorId: number | null; horaCargue: string | null; destinoIds: string[]; auxiliarIds: number[]; destinosOcupadosOtras: string[] }>,
      getAsignacionMaestros(fecha, id) as Promise<Maestros>,
    ]);
    setMaestros(m);
    setError(null);
    setCreando(false);
    setEditId(id);
    setBuscarDestino("");
    setBuscarVehiculo("");
    setOcupadosOtras(d.destinosOcupadosOtras);
    setForm({
      vehiculoId: d.vehiculoId ? String(d.vehiculoId) : "",
      conductorId: d.conductorId ? String(d.conductorId) : "",
      horaCargue: d.horaCargue ?? "",
      destinoIds: d.destinoIds,
      auxiliarIds: d.auxiliarIds,
    });
  }

  function cerrarModal() {
    setEditId(null);
    setCreando(false);
    setVehiculoPicker(false);
  }

  async function guardar() {
    setError(null);
    if (excedeCapacidad) {
      const ok = await confirm({
        title: "La carga supera la capacidad del vehículo",
        message: `Esta ruta lleva ${fmtKg(kgSeleccion)} kg y el vehículo tiene ${fmtKg(disponibleVehiculo + kgSeleccion)} kg disponibles. ¿Asignar de todas formas?`,
        danger: true,
        confirmLabel: "Asignar de todas formas",
      });
      if (!ok) return;
    }
    const payload = {
      vehiculoId: form.vehiculoId ? Number(form.vehiculoId) : null,
      conductorId: form.conductorId ? Number(form.conductorId) : null,
      horaCargue: form.horaCargue || null,
      destinoIds: form.destinoIds,
      auxiliarIds: form.auxiliarIds,
    };
    try {
      if (creando) {
        await crearRuta({ fecha, ...payload });
      } else if (editId) {
        await editarRuta(editId, payload);
      }
      cerrarModal();
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    }
  }

  function agregarDestino(id: string) {
    setForm((f) => (f.destinoIds.includes(id) ? f : { ...f, destinoIds: [...f.destinoIds, id] }));
  }
  function quitarDestino(id: string) {
    setForm((f) => ({ ...f, destinoIds: f.destinoIds.filter((x) => x !== id) }));
  }
  function toggleAux(id: number) {
    setForm((f) => ({ ...f, auxiliarIds: f.auxiliarIds.includes(id) ? f.auxiliarIds.filter((x) => x !== id) : [...f.auxiliarIds, id] }));
  }

  const destinosSeleccionados = useMemo(() => {
    if (!maestros) return [];
    return form.destinoIds
      .map((id) => maestros.destinos.find((d) => d.id === id))
      .filter((d): d is Maestros["destinos"][number] => !!d);
  }, [form.destinoIds, maestros]);

  const kgSeleccion = useMemo(() => destinosSeleccionados.reduce((s, d) => s + (d.kg ?? 0), 0), [destinosSeleccionados]);

  const vehiculoElegido = useMemo(
    () => maestros?.vehiculos.find((v) => String(v.id) === form.vehiculoId) ?? null,
    [maestros, form.vehiculoId]
  );
  const capacidadVehiculo = vehiculoElegido?.capacidadKg ?? null;
  const kgOtrasRutasVehiculo = vehiculoElegido?.kgOtrasRutas ?? 0;
  const disponibleVehiculo = capacidadVehiculo != null ? capacidadVehiculo - kgOtrasRutasVehiculo - kgSeleccion : Infinity;
  const excedeCapacidad = !!vehiculoElegido && capacidadVehiculo != null && disponibleVehiculo < 0;

  const resultadosBusqueda = useMemo(() => {
    if (!maestros) return [];
    const q = buscarDestino.trim().toLowerCase();
    if (!q) return [];
    return maestros.destinos
      .filter((d) => !form.destinoIds.includes(d.id) && !ocupadosOtras.includes(d.id))
      .filter((d) => d.nombre.toLowerCase().includes(q) || String(d.numero ?? "").toLowerCase().includes(q))
      .slice(0, 15);
  }, [maestros, buscarDestino, form.destinoIds, ocupadosOtras]);


  return (
    <div className="p-6">
      <PageHeader
        icon={IconRuta}
        title="Preasignación de rutas"
        subtitle="Asigna vehículo, conductor, destinos y auxiliares a cada ruta del día."
        actions={
          <>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
            {rutas.length < maxRutas ? (
              <button onClick={abrirCreacion} className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Nueva ruta
              </button>
            ) : (
              <span className="text-xs text-[#9aa4af]">Máximo de rutas alcanzado ({maxRutas})</span>
            )}
          </>
        }
      />

      {loading ? (
        <PageLoader />
      ) : (
        <>
          <p className="mb-3 text-xs font-medium text-[#7a8794]">{rutas.length}/{maxRutas} rutas</p>
          {rutas.length === 0 ? (
            <div className="rounded-2xl border border-[#e1e9dd] bg-white">
              <EmptyState icon={IconRuta} title="Aún no hay rutas para este día" description={`Usa "+ Nueva ruta" para crear la primera (máximo ${maxRutas}).`} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rutas.map((r) => (
                <div key={r.id} className="flex flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-center gap-3 bg-[#14352a] px-4 py-3">
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-[#3a5a4a] bg-[#1c4433] px-3 py-1.5">
                      <span className="text-[9px] font-medium uppercase tracking-wide text-[#a7c4b5]">Ruta</span>
                      <span className="text-lg font-bold leading-none text-white">#{r.numeroRuta}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{r.vehiculo ?? "Sin vehículo"}</p>
                      <p className="truncate text-xs text-[#a7c4b5]">{r.conductor ?? "Sin conductor"}{r.horaCargue ? ` · ${r.horaCargue}` : ""}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${r.cerrada ? "bg-[#3a4a3f] text-[#c0cabf]" : "bg-[#e8f3e2] text-[#2f8f4e]"}`}>
                      {r.cerrada ? IconLock : IconLockOpen} {r.cerrada ? "Cerrada" : "Abierta"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 divide-x divide-[#f0f2ee] border-b border-[#f0f2ee]">
                    <div className="flex flex-col gap-0.5 px-3 py-2.5">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-[#9aa4af]">Destinos</span>
                      <span className="text-base font-bold text-[#14352a]">{r.nDestinos}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-2.5">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-[#9aa4af]">Aux.</span>
                      <span className="text-base font-bold text-[#14352a]">{r.nAux}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-2.5">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-[#9aa4af]">Kilos</span>
                      <span className="text-base font-bold text-[#2f8f4e]">{r.kls.toLocaleString("es-CO")}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs text-[#7a8794]">{r.cerrada ? `Cerrada por ${r.cerradaPor ?? "—"}` : "Pendiente de cerrar"}</span>
                    <div className="flex items-center gap-1.5">
                      {!r.cerrada && (
                        <button onClick={() => abrirEdicion(r.id)} title="Editar ruta" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#dfe4e0] text-[#45505e] hover:border-[#2f8f4e] hover:bg-[#f2f8ef] hover:text-[#2f8f4e]">
                          {IconPencil}
                        </button>
                      )}
                      {!r.cerrada ? (
                        <button
                          onClick={async () => {
                            if (!r.vehiculo || !r.conductor || r.nDestinos === 0) return showToast("Asigna vehículo, conductor y destinos para poder cerrar.", "error");
                            if (await confirm({ title: `¿Cerrar la ruta #${r.numeroRuta}?`, message: "Ya no se podrá editar hasta reabrirla." })) {
                              cerrarRuta(r.id).then(cargar).catch((err) => showToast(err instanceof ApiError ? err.message : "Error", "error"));
                            }
                          }}
                          title="Cerrar ruta"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#dfe4e0] text-[#45505e] hover:border-[#a86a12] hover:bg-[#fdf6e9] hover:text-[#a86a12]"
                        >
                          {IconLock}
                        </button>
                      ) : (
                        <button
                          onClick={async () => { if (await confirm({ title: "¿Reabrir esta ruta?" })) reabrirRuta(r.id).then(cargar); }}
                          title="Reabrir ruta"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#dfe4e0] text-[#45505e] hover:border-[#2f8f4e] hover:bg-[#f2f8ef] hover:text-[#2f8f4e]"
                        >
                          {IconLockOpen}
                        </button>
                      )}
                      {!r.cerrada && (
                        <button
                          onClick={async () => { if (await confirm({ title: `¿Eliminar la ruta #${r.numeroRuta}?`, danger: true, confirmLabel: "Eliminar" })) eliminarRuta(r.id).then(cargar); }}
                          title="Eliminar ruta"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#dfe4e0] text-[#45505e] hover:border-[#b3261e] hover:bg-[#fbeceb] hover:text-[#b3261e]"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {(editId || creando) && maestros && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cerrarModal}>
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 border-b border-[#eceef0] px-6 py-4">
              <h2 className="text-lg font-semibold text-[#14352a]">{creando ? "Nueva ruta" : `Ruta #${rutas.find((r) => r.id === editId)?.numeroRuta ?? ""}`}</h2>
              <p className="mt-0.5 text-sm text-[#5f7a68]">Vehículo, conductor, destinos y auxiliares para esta ruta.</p>
            </div>

            <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {error && <p className="mb-3 text-sm text-[#b3261e]">{error}</p>}
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1 sm:col-span-1">
                  <span className="text-xs font-medium text-[#7a8794]">Vehículo</span>
                  <button
                    type="button"
                    onClick={() => setVehiculoPicker(true)}
                    className="flex items-center justify-between rounded-lg border border-[#dfe4e0] px-3 py-2 text-left text-sm outline-none hover:border-[#2f8f4e] focus:border-[#2f8f4e]"
                  >
                    <span className={vehiculoElegido ? "font-medium text-[#14352a]" : "text-[#9aa4af]"}>
                      {vehiculoElegido ? vehiculoElegido.placa : "Elegir vehículo…"}
                    </span>
                    <svg className="h-4 w-4 shrink-0 text-[#9aa4af]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {vehiculoElegido && vehiculoElegido.disponibilidad === "NO DISPONIBLE" && (
                    <span className="text-[11px] font-medium text-[#a86a12]">⚠ Marcado como NO DISPONIBLE</span>
                  )}
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-[#7a8794]">Conductor</span>
                  <select value={form.conductorId} onChange={(e) => setForm((f) => ({ ...f, conductorId: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]">
                    <option value="">Sin asignar</option>
                    {maestros.conductores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-[#7a8794]">Hora de cargue</span>
                  <input placeholder="Ej. 06:30" value={form.horaCargue} onChange={(e) => setForm((f) => ({ ...f, horaCargue: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
                </label>
              </div>

              {vehiculoElegido && (
                <div className={`mb-4 rounded-xl border p-3 ${excedeCapacidad ? "border-[#f0c4c1] bg-[#fbeceb]" : "border-[#e1e9dd] bg-[#f7faf5]"}`}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-[#45505e]">Capacidad de {vehiculoElegido.placa}</span>
                    <span className={`font-semibold tabular-nums ${excedeCapacidad ? "text-[#b3261e]" : "text-[#2f8f4e]"}`}>
                      {fmtKg(kgOtrasRutasVehiculo + kgSeleccion)} / {capacidadVehiculo != null ? `${fmtKg(capacidadVehiculo)} kg` : "sin capacidad registrada"}
                    </span>
                  </div>
                  {capacidadVehiculo != null && capacidadVehiculo > 0 && (
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#e1e9dd]">
                      <div className="h-full bg-[#9aa8a0]" style={{ width: `${Math.min(100, (kgOtrasRutasVehiculo / capacidadVehiculo) * 100)}%` }} title={`Ya comprometido en otras rutas: ${fmtKg(kgOtrasRutasVehiculo)} kg`} />
                      <div className={`h-full ${excedeCapacidad ? "bg-[#b3261e]" : "bg-[#2f8f4e]"}`} style={{ width: `${Math.min(100 - Math.min(100, (kgOtrasRutasVehiculo / capacidadVehiculo) * 100), (kgSeleccion / capacidadVehiculo) * 100)}%` }} title={`Esta ruta: ${fmtKg(kgSeleccion)} kg`} />
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] text-[#7a8794]">
                    {kgOtrasRutasVehiculo > 0 && `${fmtKg(kgOtrasRutasVehiculo)} kg en otras rutas · `}
                    {fmtKg(kgSeleccion)} kg en esta ruta
                    {excedeCapacidad && <span className="ml-1 font-semibold text-[#b3261e]">· Excede la capacidad en {fmtKg(-disponibleVehiculo)} kg</span>}
                  </p>
                </div>
              )}

              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#7a8794]">Destinos con carga planificada (orden de entrega)</p>
              {maestros.sinProgramacion && (
                <p className="mb-2 text-xs text-[#a86a12]">No hay Programación creada para esta fecha, así que no hay destinos con carga para elegir.</p>
              )}
              <div className="relative mb-2">
                <input
                  placeholder="Buscar destino para agregar…"
                  value={buscarDestino}
                  onChange={(e) => setBuscarDestino(e.target.value)}
                  className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]"
                />
                {resultadosBusqueda.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#dfe4e0] bg-white shadow-lg">
                    {resultadosBusqueda.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => { agregarDestino(d.id); setBuscarDestino(""); }}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-[#f4f6f3]"
                      >
                        <span>{d.numero} {d.nombre}</span>
                        <span className="shrink-0 text-xs font-medium text-[#2f8f4e]">{fmtKg(d.kg)} kg</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mb-4 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[#e1e9dd] p-2">
                {destinosSeleccionados.length === 0 && <p className="px-1 py-1 text-xs text-[#9aa4af]">Sin destinos aún, búscalos arriba.</p>}
                {destinosSeleccionados.map((d, i) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-[#f4f6f3]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e8f3e2] text-[10px] font-bold text-[#2f8f4e]">{i + 1}</span>
                    <span className="flex-1">{d.numero} {d.nombre}</span>
                    <span className="shrink-0 text-xs font-medium text-[#7a8794]">{fmtKg(d.kg)} kg</span>
                    <button onClick={() => quitarDestino(d.id)} className="text-[#9aa4af] hover:text-[#b3261e]">✕</button>
                  </div>
                ))}
              </div>

              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#7a8794]">Auxiliares</p>
              <div className="flex flex-wrap gap-2">
                {maestros.auxiliares.map((a) => (
                  <label key={a.id} className="flex items-center gap-1.5 rounded-lg border border-[#dfe4e0] px-2.5 py-1.5 text-xs">
                    <input type="checkbox" checked={form.auxiliarIds.includes(a.id)} onChange={() => toggleAux(a.id)} className="accent-[#2f8f4e]" />
                    {a.nombre}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
              <button onClick={cerrarModal} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
              <button onClick={guardar} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">{creando ? "Crear ruta" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {vehiculoPicker && maestros && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setVehiculoPicker(false)}>
          <div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#eceef0] px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-[#14352a]">Elegir vehículo</h3>
                <p className="text-xs text-[#7a8794]">{fmtKg(kgSeleccion)} kg a cargar en esta ruta</p>
              </div>
              <button onClick={() => setVehiculoPicker(false)} className="rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="shrink-0 border-b border-[#eceef0] px-5 py-3">
              <SearchInput value={buscarVehiculo} onChange={setBuscarVehiculo} placeholder="Buscar por placa…" className="w-full" />
            </div>
            <div className="nice-scroll min-h-0 flex-1 overflow-auto">
              <button
                onClick={() => { setForm((f) => ({ ...f, vehiculoId: "" })); setVehiculoPicker(false); }}
                className="flex w-full items-center justify-between border-b border-[#f0f2ee] px-5 py-3 text-left text-sm hover:bg-[#f4f6f3]"
              >
                <span className="text-[#7a8794]">Sin asignar</span>
              </button>
              {maestros.vehiculos
                .filter((v) => !buscarVehiculo.trim() || v.placa.toLowerCase().includes(buscarVehiculo.trim().toLowerCase()))
                .map((v) => {
                  const cap = v.capacidadKg ?? null;
                  const disponible = cap != null ? cap - v.kgOtrasRutas - kgSeleccion : null;
                  const cabe = cap == null || disponible! >= 0;
                  const wOtras = cap ? Math.min(100, (v.kgOtrasRutas / cap) * 100) : 0;
                  const wSel = cap ? Math.min(100 - wOtras, (kgSeleccion / cap) * 100) : 0;
                  const pct = cap ? ((v.kgOtrasRutas + kgSeleccion) / cap) * 100 : 0;
                  return (
                    <button
                      key={v.id}
                      onClick={() => { setForm((f) => ({ ...f, vehiculoId: String(v.id) })); setVehiculoPicker(false); }}
                      className="flex w-full flex-col gap-1.5 border-b border-[#f0f2ee] px-5 py-3 text-left hover:bg-[#f0f9f4]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-yellow-300 px-2 py-0.5 text-sm font-bold tracking-wider text-[#14352a] border border-yellow-400">{v.placa}</span>
                          {v.disponibilidad === "NO DISPONIBLE" && <span className="text-[10px] font-medium text-[#a86a12]">NO DISPONIBLE</span>}
                        </div>
                        <span className={`text-xs font-semibold tabular-nums ${!cabe ? "text-[#b3261e]" : "text-[#2f8f4e]"}`}>
                          {disponible != null ? `${fmtKg(disponible)} kg disp.` : "sin capacidad"}
                        </span>
                      </div>
                      {cap != null && cap > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-[#e1e9dd]">
                            <div className="h-full bg-[#9aa8a0]" style={{ width: `${wOtras}%` }} title={`Otras rutas: ${fmtKg(v.kgOtrasRutas)} kg`} />
                            <div className={`h-full ${cabe ? "bg-[#2f8f4e]" : "bg-[#b3261e]"}`} style={{ width: `${wSel}%` }} title={`Esta ruta: ${fmtKg(kgSeleccion)} kg`} />
                          </div>
                          <span className={`w-10 shrink-0 text-right text-xs font-semibold tabular-nums ${!cabe ? "text-[#b3261e]" : pct > 90 ? "text-[#b5941e]" : "text-[#2f8f4e]"}`}>{pct.toFixed(0)}%</span>
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
