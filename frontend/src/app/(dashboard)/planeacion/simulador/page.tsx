"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import {
  agregarProductoPerfil, agregarTiendaPerfil, calcularSimulacion, editarProductoPerfil, eliminarProductoPerfil,
  eliminarTiendaPerfil, getPerfil, getPerfiles, getPerfilVigente, guardarCorrida, guardarPerfil, setSurtidoPerfil,
} from "@/lib/planApi";
import { ApiError } from "@/lib/api";
import { leerPerfilExcel, type PerfilImportado } from "@/lib/simuladorImport";
import PageHeader from "@/components/PageHeader";
import SimuladorTabs from "@/components/SimuladorTabs";
import StatCard from "@/components/StatCard";
import { IconDiagrama, IconUpload, IconAlertTriangle, IconPencil, IconBox, IconMapPin, IconCheck, IconBarChart, IconTrash, IconClipboard } from "@/components/icons";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import IconButton from "@/components/IconButton";
import EmptyState from "@/components/EmptyState";

interface Perfil {
  id: number;
  productos: { plu: string; nombrePlanta: string | null; unidad: string; kgRes: number; precio: number }[];
  tiendas: { dep: string; nombre: string | null }[];
  surtido: Record<string, string[]>;
}
interface PerfilResumen { id: number; nombre: string; vigenteDesde: string; nProductos: number; nTiendas: number }
interface DetalleCalc { dep: string; tienda: string | null; plu: string; producto: string | null; unidad: string; reses: number; cantidad: number; valor: number }

export default function SimuladorPage() {
  const [perfiles, setPerfiles] = useState<PerfilResumen[]>([]);
  const [perfilId, setPerfilId] = useState<number | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [reses, setReses] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<{ detalle: DetalleCalc[]; totales: { reses: number; kg: number; und: number; valor: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [preview, setPreview] = useState<PerfilImportado | null>(null);
  const [vigenteDesde, setVigenteDesde] = useState("");
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [nuevoProducto, setNuevoProducto] = useState({ plu: "", nombrePlanta: "", unidad: "KG", kgRes: "", precio: "" });
  const [nuevaTienda, setNuevaTienda] = useState({ dep: "", nombre: "" });
  const { showToast } = useToast();
  const { confirm, prompt } = useConfirm();

  function recargarPerfil() {
    if (!perfilId) return;
    getPerfil(perfilId).then((p) => setPerfil(p as Perfil));
  }

  useEffect(() => {
    Promise.all([getPerfiles(), getPerfilVigente()]).then(([lista, vig]) => {
      setPerfiles(lista as PerfilResumen[]);
      const v = (vig as { perfilId: number | null }).perfilId;
      if (v) setPerfilId(v);
    });
  }, []);

  useEffect(() => {
    if (!perfilId) return;
    getPerfil(perfilId).then((p) => setPerfil(p as Perfil));
  }, [perfilId]);

  async function calcular() {
    if (!perfilId) return;
    setError(null);
    try {
      const r = await calcularSimulacion(perfilId, Object.fromEntries(Object.entries(reses).map(([k, v]) => [k, Number(v) || 0])));
      setResultado(r as { detalle: DetalleCalc[]; totales: { reses: number; kg: number; und: number; valor: number } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al calcular");
    }
  }

  async function guardar() {
    if (!perfilId || !resultado) return;
    try {
      await guardarCorrida({ perfilId, detalle: resultado.detalle, totales: resultado.totales });
      showToast("Orden de producción guardada.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al guardar", "error");
    }
  }

  async function crearPerfilVacio() {
    const nombre = await prompt({ title: "Nuevo perfil", input: { label: "Nombre del perfil", placeholder: "Ej. Perfil 2026" }, confirmLabel: "Crear" });
    if (!nombre) return;
    const { id } = await guardarPerfil({ nombre, productos: [], tiendas: [], surtido: {} });
    const lista = await getPerfiles();
    setPerfiles(lista as PerfilResumen[]);
    setPerfilId(id);
    setEditorAbierto(true);
  }

  async function onAgregarProducto() {
    if (!perfilId || !nuevoProducto.plu.trim()) return;
    try {
      await agregarProductoPerfil(perfilId, {
        plu: nuevoProducto.plu.trim(),
        nombrePlanta: nuevoProducto.nombrePlanta.trim() || undefined,
        unidad: nuevoProducto.unidad,
        kgRes: Number(nuevoProducto.kgRes) || 0,
        precio: Number(nuevoProducto.precio) || 0,
      });
      setNuevoProducto({ plu: "", nombrePlanta: "", unidad: "KG", kgRes: "", precio: "" });
      recargarPerfil();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al agregar el producto", "error");
    }
  }

  async function onEditarProducto(plu: string, campo: "kgRes" | "precio" | "unidad", valor: string) {
    if (!perfilId) return;
    const data = campo === "unidad" ? { unidad: valor } : { [campo]: Number(valor) || 0 };
    await editarProductoPerfil(perfilId, plu, data);
    recargarPerfil();
  }

  async function onEliminarProducto(plu: string) {
    if (!perfilId || !(await confirm({ title: `¿Quitar el producto ${plu}?`, message: "Se quitará del perfil junto con su surtido asignado.", danger: true, confirmLabel: "Quitar" }))) return;
    await eliminarProductoPerfil(perfilId, plu);
    recargarPerfil();
  }

  async function onAgregarTienda() {
    if (!perfilId || !nuevaTienda.dep.trim()) return;
    try {
      await agregarTiendaPerfil(perfilId, { dep: nuevaTienda.dep.trim(), nombre: nuevaTienda.nombre.trim() || undefined });
      setNuevaTienda({ dep: "", nombre: "" });
      recargarPerfil();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al agregar la tienda", "error");
    }
  }

  async function onEliminarTienda(dep: string) {
    if (!perfilId || !(await confirm({ title: `¿Quitar la tienda ${dep}?`, message: "Se quitará del perfil junto con su surtido asignado.", danger: true, confirmLabel: "Quitar" }))) return;
    await eliminarTiendaPerfil(perfilId, dep);
    recargarPerfil();
  }

  async function onToggleSurtido(plu: string, dep: string, activo: boolean) {
    if (!perfilId) return;
    await setSurtidoPerfil(perfilId, plu, dep, activo);
    recargarPerfil();
  }

  async function onImportarExcel(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportando(true);
    setError(null);
    try {
      const p = await leerPerfilExcel(file);
      setPreview(p);
      setVigenteDesde(new Date().toISOString().slice(0, 10));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo");
    } finally {
      setImportando(false);
    }
  }

  async function confirmarImportacion() {
    if (!preview) return;
    setGuardandoPerfil(true);
    try {
      const { id } = await guardarPerfil({
        nombre: preview.nombre,
        origen: preview.origen,
        vigenteDesde: vigenteDesde || undefined,
        productos: preview.productos,
        tiendas: preview.tiendas,
        surtido: preview.surtido,
      });
      setPreview(null);
      const lista = await getPerfiles();
      setPerfiles(lista as PerfilResumen[]);
      setPerfilId(id);
      showToast("Perfil guardado.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al guardar el perfil", "error");
    } finally {
      setGuardandoPerfil(false);
    }
  }

  return (
    <div className="p-6">
      <SimuladorTabs active="/planeacion/simulador" />

      <PageHeader
        icon={IconDiagrama}
        title="Simulador de Producción"
        subtitle="kg(producto,tienda) = kg/res × reses(tienda), si la tienda está en el surtido del producto."
      />

      <div className="mb-5 rounded-2xl border border-[#e1e9dd] bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="flex min-w-[260px] flex-1 flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#7a8794]">Perfil de rendimiento activo</span>
            <select
              value={perfilId ?? ""}
              onChange={(e) => setPerfilId(Number(e.target.value) || null)}
              className="w-full rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
            >
              <option value="">Selecciona un perfil…</option>
              {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.nProductos} productos, {p.nTiendas} tiendas)</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={crearPerfilVacio} className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Nuevo perfil vacío
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#2f8f4e] bg-white px-4 py-2.5 text-sm font-medium text-[#2f8f4e] hover:bg-[#e8f3e2]">
              {IconUpload} {importando ? "Leyendo archivo…" : "Recargar modelo desde un Excel"}
              <input type="file" accept=".xlsx,.xls" onChange={onImportarExcel} disabled={importando} className="hidden" />
            </label>
          </div>
        </div>
        {perfil && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#f0f2ee] pt-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f5ef] px-2.5 py-1 text-[#45505e]">{IconBox} {perfil.productos.length} productos</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f5ef] px-2.5 py-1 text-[#45505e]">{IconMapPin} {perfil.tiendas.length} tiendas</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f5ef] px-2.5 py-1 text-[#45505e]">{IconCheck} {Object.values(perfil.surtido).reduce((s, v) => s + v.length, 0)} vínculos de surtido</span>
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-[#b3261e]">{error}</p>}

      {preview && (
        <div className="mb-4 rounded-2xl border border-[#e1e9dd] bg-[#f7faf5] p-4">
          <h2 className="mb-2 text-sm font-semibold text-[#14352a]">Vista previa del perfil importado ({preview.origen})</h2>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-white p-2 text-center"><p className="text-xs text-[#9aa4af]">Productos</p><p className="text-lg font-bold text-[#2f8f4e]">{preview.productos.length}</p></div>
            <div className="rounded-lg bg-white p-2 text-center"><p className="text-xs text-[#9aa4af]">Tiendas</p><p className="text-lg font-bold text-[#2f8f4e]">{preview.tiendas.length}</p></div>
            <div className="rounded-lg bg-white p-2 text-center"><p className="text-xs text-[#9aa4af]">Por unidad</p><p className="text-lg font-bold text-[#2f8f4e]">{preview.productos.filter((p) => p.unidad === "UND").length}</p></div>
            <div className="rounded-lg bg-white p-2 text-center"><p className="text-xs text-[#9aa4af]">Avisos</p><p className="text-lg font-bold text-[#a86a12]">{preview.avisos.length}</p></div>
          </div>

          {preview.avisos.length > 0 && (
            <div className="mb-3 max-h-32 overflow-y-auto rounded-lg bg-[#fdf6e9] p-2 text-xs text-[#a86a12]">
              {preview.avisos.map((a, i) => <p key={i} className="flex items-center gap-1.5">{IconAlertTriangle} {a}</p>)}
            </div>
          )}

          <div className="mb-3 max-h-64 overflow-y-auto rounded-lg border border-[#e1e9dd] bg-white">
            <table className="w-full text-xs">
              <thead className="bg-[#f4f6f3] text-left font-semibold uppercase text-[#7a8794]"><tr><th className="px-2 py-1">PLU</th><th className="px-2 py-1">SIESA</th><th className="px-2 py-1">Producto</th><th className="px-2 py-1">Unidad</th><th className="px-2 py-1">Rinde/res</th><th className="px-2 py-1">Precio</th><th className="px-2 py-1">Tiendas</th></tr></thead>
              <tbody>
                {preview.productos.map((p) => (
                  <tr key={p.plu} className="border-t border-[#f0f2ee]">
                    <td className="px-2 py-1">{p.plu}</td>
                    <td className="px-2 py-1">{p.siesa || "—"}</td>
                    <td className="px-2 py-1">{p.nombreExito}</td>
                    <td className="px-2 py-1">{p.unidad}</td>
                    <td className="px-2 py-1">{p.kgRes}</td>
                    <td className="px-2 py-1">${p.precio.toLocaleString("es-CO")}</td>
                    <td className="px-2 py-1">{preview.surtido[p.plu]?.length ?? 0}/{preview.tiendas.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-[#45505e]">
              Nombre del perfil
              <input value={preview.nombre} onChange={(e) => setPreview({ ...preview, nombre: e.target.value })} className="mt-0.5 block rounded-lg border border-[#dfe4e0] px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-[#45505e]">
              Vigente desde
              <input type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} className="mt-0.5 block rounded-lg border border-[#dfe4e0] px-2 py-1.5 text-sm" />
            </label>
            <button onClick={confirmarImportacion} disabled={guardandoPerfil} className="rounded-lg bg-[#2f8f4e] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#277a42] disabled:opacity-60">
              {guardandoPerfil ? "Guardando…" : "Guardar perfil"}
            </button>
            <button onClick={() => setPreview(null)} className="rounded-lg border border-[#dfe4e0] px-4 py-1.5 text-sm">Descartar</button>
          </div>
        </div>
      )}

      {!perfil && !preview && (
        <div className="rounded-2xl border border-[#e1e9dd] bg-white">
          <EmptyState
            icon={IconDiagrama}
            title="Selecciona o crea un perfil para empezar"
            description="Un perfil define qué productos rinden por res, en qué tiendas se venden y a qué precio. Elige uno arriba, créalo vacío o impórtalo desde un Excel de reparto."
            className="py-16"
          />
        </div>
      )}

      {perfil && (
        <>
          <div className="mb-4 rounded-2xl border border-[#e1e9dd] bg-white p-4">
            <button onClick={() => setEditorAbierto((v) => !v)} className="flex w-full items-center justify-between text-left">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#14352a]">{IconPencil} Editar productos, tiendas y surtido ({perfil.productos.length} productos, {perfil.tiendas.length} tiendas)</h2>
              <span className="text-xs text-[#2f8f4e]">{editorAbierto ? "Ocultar ▲" : "Mostrar ▼"}</span>
            </button>

            {editorAbierto && (
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#7a8794]">{IconBox} Productos</h3>
                  <div className="mb-2 max-h-64 overflow-y-auto rounded-lg border border-[#e1e9dd]">
                    <table className="w-full text-xs">
                      <thead className="bg-[#f7faf5] text-left font-semibold uppercase text-[#7a8794]">
                        <tr><th className="px-2 py-1.5">PLU</th><th className="px-2 py-1.5">Producto</th><th className="px-2 py-1.5">Un.</th><th className="px-2 py-1.5">Rinde/res</th><th className="px-2 py-1.5">Precio</th><th /></tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0f2ee]">
                        {perfil.productos.map((p) => (
                          <tr key={p.plu} className="hover:bg-[#f9fbf7]">
                            <td className="px-2 py-1.5 font-medium text-[#14352a]">{p.plu}</td>
                            <td className="px-2 py-1.5">{p.nombrePlanta ?? "—"}</td>
                            <td className="px-2 py-1.5">
                              <select defaultValue={p.unidad} onChange={(e) => onEditarProducto(p.plu, "unidad", e.target.value)} className="rounded border border-[#dfe4e0] px-1 py-0.5">
                                <option value="KG">KG</option>
                                <option value="UND">UND</option>
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" defaultValue={p.kgRes} onBlur={(e) => onEditarProducto(p.plu, "kgRes", e.target.value)} className="w-16 rounded border border-[#dfe4e0] px-1 py-0.5" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" defaultValue={p.precio} onBlur={(e) => onEditarProducto(p.plu, "precio", e.target.value)} className="w-20 rounded border border-[#dfe4e0] px-1 py-0.5" />
                            </td>
                            <td className="px-2 py-1.5"><IconButton title="Quitar producto" onClick={() => onEliminarProducto(p.plu)} className="hover:border-[#b3261e] hover:bg-[#fbeceb] hover:text-[#b3261e]">{IconTrash}</IconButton></td>
                          </tr>
                        ))}
                        {perfil.productos.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-center text-[#9aa4af]">Sin productos aún</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-end gap-1.5 rounded-lg bg-[#f7faf5] p-2">
                    <input placeholder="PLU" value={nuevoProducto.plu} onChange={(e) => setNuevoProducto((f) => ({ ...f, plu: e.target.value }))} className="w-20 rounded border border-[#dfe4e0] px-2 py-1 text-xs" />
                    <input placeholder="Nombre" value={nuevoProducto.nombrePlanta} onChange={(e) => setNuevoProducto((f) => ({ ...f, nombrePlanta: e.target.value }))} className="w-28 rounded border border-[#dfe4e0] px-2 py-1 text-xs" />
                    <select value={nuevoProducto.unidad} onChange={(e) => setNuevoProducto((f) => ({ ...f, unidad: e.target.value }))} className="rounded border border-[#dfe4e0] px-2 py-1 text-xs">
                      <option value="KG">KG</option>
                      <option value="UND">UND</option>
                    </select>
                    <input placeholder="Rinde/res" type="number" value={nuevoProducto.kgRes} onChange={(e) => setNuevoProducto((f) => ({ ...f, kgRes: e.target.value }))} className="w-20 rounded border border-[#dfe4e0] px-2 py-1 text-xs" />
                    <input placeholder="Precio" type="number" value={nuevoProducto.precio} onChange={(e) => setNuevoProducto((f) => ({ ...f, precio: e.target.value }))} className="w-24 rounded border border-[#dfe4e0] px-2 py-1 text-xs" />
                    <button onClick={onAgregarProducto} className="rounded bg-[#2f8f4e] px-3 py-1 text-xs font-semibold text-white hover:bg-[#277a42]">+ Agregar</button>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#7a8794]">{IconMapPin} Tiendas</h3>
                  <div className="mb-2 max-h-64 overflow-y-auto rounded-lg border border-[#e1e9dd]">
                    <table className="w-full text-xs">
                      <thead className="bg-[#f7faf5] text-left font-semibold uppercase text-[#7a8794]"><tr><th className="px-2 py-1.5">Dep</th><th className="px-2 py-1.5">Nombre</th><th /></tr></thead>
                      <tbody className="divide-y divide-[#f0f2ee]">
                        {perfil.tiendas.map((t) => (
                          <tr key={t.dep} className="hover:bg-[#f9fbf7]">
                            <td className="px-2 py-1.5 font-medium text-[#14352a]">{t.dep}</td>
                            <td className="px-2 py-1.5">{t.nombre ?? "—"}</td>
                            <td className="px-2 py-1.5"><IconButton title="Quitar tienda" onClick={() => onEliminarTienda(t.dep)} className="hover:border-[#b3261e] hover:bg-[#fbeceb] hover:text-[#b3261e]">{IconTrash}</IconButton></td>
                          </tr>
                        ))}
                        {perfil.tiendas.length === 0 && <tr><td colSpan={3} className="px-2 py-3 text-center text-[#9aa4af]">Sin tiendas aún</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-end gap-1.5 rounded-lg bg-[#f7faf5] p-2">
                    <input placeholder="Dep (código)" value={nuevaTienda.dep} onChange={(e) => setNuevaTienda((f) => ({ ...f, dep: e.target.value }))} className="w-24 rounded border border-[#dfe4e0] px-2 py-1 text-xs" />
                    <input placeholder="Nombre" value={nuevaTienda.nombre} onChange={(e) => setNuevaTienda((f) => ({ ...f, nombre: e.target.value }))} className="w-32 rounded border border-[#dfe4e0] px-2 py-1 text-xs" />
                    <button onClick={onAgregarTienda} className="rounded bg-[#2f8f4e] px-3 py-1 text-xs font-semibold text-white hover:bg-[#277a42]">+ Agregar</button>
                  </div>
                </div>

                {perfil.productos.length > 0 && perfil.tiendas.length > 0 && (
                  <div className="lg:col-span-2">
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#7a8794]">{IconCheck} Surtido (qué producto va a qué tienda)</h3>
                    <div className="max-h-80 overflow-auto rounded-lg border border-[#e1e9dd]">
                      <table className="w-full text-xs">
                        <thead className="bg-[#f7faf5] text-left font-semibold uppercase text-[#7a8794]">
                          <tr>
                            <th className="sticky left-0 z-10 bg-[#f7faf5] px-2 py-1.5">PLU</th>
                            {perfil.tiendas.map((t) => <th key={t.dep} className="px-2 py-1.5 text-center">{t.dep}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f0f2ee]">
                          {perfil.productos.map((p) => (
                            <tr key={p.plu} className="hover:bg-[#f9fbf7]">
                              <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium text-[#14352a]">{p.plu}</td>
                              {perfil.tiendas.map((t) => (
                                <td key={t.dep} className="px-2 py-1.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={perfil.surtido[p.plu]?.includes(t.dep) ?? false}
                                    onChange={(e) => onToggleSurtido(p.plu, t.dep, e.target.checked)}
                                    className="accent-[#2f8f4e]"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mb-4 rounded-2xl border border-[#e1e9dd] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#14352a]">{IconBarChart} Reses por tienda</h2>
              {perfil.tiendas.length > 0 && (
                <span className="text-xs text-[#7a8794]">{Object.values(reses).filter((v) => Number(v) > 0).length}/{perfil.tiendas.length} tiendas con reses</span>
              )}
            </div>
            {perfil.tiendas.length === 0 ? (
              <EmptyState
                icon={IconMapPin}
                title="Este perfil aún no tiene tiendas/productos cargados"
                description='Usa "Editar productos, tiendas y surtido" arriba, o importa el Excel de reparto.'
                className="py-8"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {perfil.tiendas.map((t) => (
                  <label key={t.dep} className="flex flex-col gap-1 rounded-lg border border-[#dfe4e0] px-2.5 py-2 focus-within:border-[#2f8f4e]">
                    <span className="truncate text-[11px] font-medium text-[#7a8794]" title={t.nombre ?? t.dep}>{t.nombre ?? t.dep}</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={reses[t.dep] ?? ""}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setReses((r) => ({ ...r, [t.dep]: e.target.value }))}
                      className="w-full rounded border-0 p-0 text-sm font-semibold text-[#14352a] outline-none"
                    />
                  </label>
                ))}
              </div>
            )}
            <button onClick={calcular} className="mt-4 rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#277a42]">Calcular</button>
          </div>

          {resultado && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Reses" value={resultado.totales.reses} color="#2f8f4e"
                  icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 3h11l3.5 7-9 11L3 10Z" /></svg>} />
                <StatCard label="Kg" value={resultado.totales.kg.toFixed(0)} color="#2f8f4e" icon={IconBox} />
                <StatCard label="Und" value={resultado.totales.und.toFixed(0)} color="#2f8f4e" icon={IconClipboard} />
                <StatCard label="Valor" value={`$${resultado.totales.valor.toLocaleString("es-CO")}`} color="#2f8f4e"
                  icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 15.5c.5 1 1.4 1.5 2.5 1.5 1.4 0 2.5-.8 2.5-2s-1-1.6-2.5-2-2.5-.8-2.5-2 1.1-2 2.5-2c1.1 0 2 .5 2.5 1.5" /><path d="M12 6.5v11" /></svg>} />
              </div>
              <div className="mb-3 overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="border-b border-[#e1e9dd] bg-[#f7faf5] text-left text-xs font-semibold uppercase tracking-wide text-[#7a8794]"><tr><th className="px-3 py-2.5">Tienda</th><th className="px-3 py-2.5">Producto</th><th className="px-3 py-2.5 text-right">Reses</th><th className="px-3 py-2.5 text-right">Cantidad</th><th className="px-3 py-2.5 text-right">Valor</th></tr></thead>
                  <tbody className="divide-y divide-[#f0f2ee]">
                    {resultado.detalle.map((d, i) => (
                      <tr key={i} className="hover:bg-[#f9fbf7]">
                        <td className="px-3 py-2 font-medium text-[#14352a]">{d.tienda}</td>
                        <td className="px-3 py-2 text-[#45505e]">{d.producto}</td>
                        <td className="px-3 py-2 text-right text-[#45505e]">{d.reses}</td>
                        <td className="px-3 py-2 text-right font-medium text-[#14352a]">{d.cantidad.toFixed(1)} {d.unidad}</td>
                        <td className="px-3 py-2 text-right text-[#45505e]">${d.valor.toLocaleString("es-CO")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={guardar} className="rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#277a42]">Guardar Orden de Producción</button>
            </>
          )}
        </>
      )}
    </div>
  );
}
