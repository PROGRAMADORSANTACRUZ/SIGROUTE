"use client";

import { useEffect, useState } from "react";
import { crearRol, editarRol, eliminarRol, getRolPermisos, getRoles, getRolesModulos, setRolPermisos } from "@/lib/planApi";
import { ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { PageLoader } from "@/components/Loading";
import { IconGear, IconPencil, IconTrash, IconUsers } from "@/components/icons";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import IconButton from "@/components/IconButton";

interface RolRow {
  id: number; nombre: string; descripcion: string | null; areaProgramacion: string | null;
  nUsuarios: number; nPermisos: number;
}

const ROLES_SISTEMA = new Set(["ADMIN"]);

// La clave técnica de cada permiso es "modulo.accion" (ej. "programacion.cerrar_area").
// Como ya se agrupan visualmente por módulo, el chip solo necesita mostrar la acción.
const ACCION_LABELS: Record<string, string> = {
  ver: "Ver",
  editar: "Crear / editar",
  crear: "Crear",
  eliminar: "Eliminar",
  exportar: "Exportar",
  roles: "Gestionar roles y permisos",
  cerrar_area: "Cerrar área",
  reabrir_area: "Reabrir área",
  confirmar_carga: "Confirmar carga",
  reabrir_carga: "Reabrir carga (súper admin)",
  editar_kls: "Editar kilos / canastillas",
};

function permisoLabel(clave: string): string {
  const accion = clave.split(".").pop() ?? clave;
  return ACCION_LABELS[accion] ?? accion.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// Switch tipo iPhone reutilizable para activar/desactivar un permiso o un
// grupo completo de permisos (módulo/submódulo).
function Switch({ checked, onChange, size = "md" }: { checked: boolean; onChange: (v: boolean) => void; size?: "sm" | "md" }) {
  const dims = size === "sm" ? { track: "h-5 w-9", knob: "h-4 w-4", on: 18, off: 2 } : { track: "h-6 w-11", knob: "h-5 w-5", on: 22, off: 2 };
  return (
    <label className="relative inline-flex shrink-0 cursor-pointer select-none items-center">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        className={`${dims.track} rounded-full transition-colors duration-200`}
        style={{ backgroundColor: checked ? "#2f8f4e" : "#d7dcd8" }}
      >
        <span
          className={`block ${dims.knob} translate-y-[1.5px] transform rounded-full bg-white shadow-sm transition-transform duration-200`}
          style={{ transform: `translate(${checked ? dims.on : dims.off}px, 1.5px)` }}
        />
      </span>
    </label>
  );
}

interface SubModulo { label: string; claves: string[] }
interface ModuloGrupo { label: string; submodulos: SubModulo[] }

export default function RolesPage() {
  const [roles, setRoles] = useState<RolRow[]>([]);
  const [modulos, setModulos] = useState<ModuloGrupo[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [claves, setClaves] = useState<Set<string>>(new Set());
  const [busquedaPermiso, setBusquedaPermiso] = useState("");

  const [editing, setEditing] = useState<RolRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [guardandoForm, setGuardandoForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", descripcion: "", areaProgramacion: "" });
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // El modal único de crear/editar ya trae el árbol de permisos; para el rol
  // ADMIN (protegido) no se muestra el árbol ni se guardan permisos.
  const editandoEsSistema = !!editing && ROLES_SISTEMA.has(editing.nombre);

  function cargar() {
    setLoading(true);
    Promise.all([getRoles(), getRolesModulos()])
      .then(([r, m]) => {
        setRoles(r as unknown as RolRow[]);
        const data = m as { modulos: ModuloGrupo[]; areas: string[] };
        setModulos(data.modulos);
        setAreas(data.areas);
      })
      .finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  // Abre el modal único de crear/editar rol; si viene un rol existente,
  // también precarga sus permisos actuales para el árbol de switches.
  async function abrirEditor(rol: RolRow | null) {
    setEditing(rol);
    setForm({ nombre: rol?.nombre ?? "", descripcion: rol?.descripcion ?? "", areaProgramacion: rol?.areaProgramacion ?? "" });
    setBusquedaPermiso("");
    setClaves(new Set());
    setShowForm(true);
    if (rol && !ROLES_SISTEMA.has(rol.nombre)) {
      const perms = await getRolPermisos(rol.id);
      setClaves(new Set(perms));
    }
  }

  function toggle(clave: string) {
    setClaves((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  }

  function toggleGrupo(keys: string[], marcarTodos: boolean) {
    setClaves((prev) => {
      const next = new Set(prev);
      for (const k of keys) marcarTodos ? next.add(k) : next.delete(k);
      return next;
    });
  }

  async function guardarForm() {
    setGuardandoForm(true);
    try {
      const data = { nombre: form.nombre, descripcion: form.descripcion, areaProgramacion: form.areaProgramacion || null };
      const rolId = editing ? editing.id : ((await crearRol(data)) as { id: number }).id;
      if (editing) await editarRol(editing.id, data);
      if (!editandoEsSistema) await setRolPermisos(rolId, [...claves]);
      setShowForm(false);
      showToast(editing ? "Rol actualizado." : "Rol creado.", "success");
      cargar();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error al guardar rol", "error");
    } finally {
      setGuardandoForm(false);
    }
  }


  const modulosFiltrados = modulos
    .map((mod) => ({
      label: mod.label,
      submodulos: mod.submodulos
        .map((sm) => ({
          label: sm.label,
          claves: sm.claves.filter((k) => {
            const q = busquedaPermiso.trim().toLowerCase();
            return !q || k.toLowerCase().includes(q) || permisoLabel(k).toLowerCase().includes(q) || sm.label.toLowerCase().includes(q) || mod.label.toLowerCase().includes(q);
          }),
        }))
        .filter((sm) => sm.claves.length > 0),
    }))
    .filter((mod) => mod.submodulos.length > 0);

  return (
    <div className="p-6">
      <PageHeader
        icon={IconGear}
        title="Roles y permisos"
        subtitle="Define qué puede ver y hacer cada rol dentro de Planeación y Ejecución."
        actions={
          <button onClick={() => abrirEditor(null)} className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nuevo rol
          </button>
        }
      />

      {loading ? (
        <PageLoader />
      ) : roles.length === 0 ? (
        <div className="rounded-2xl border border-[#e1e9dd] bg-white">
          <EmptyState icon={IconGear} title="Sin roles registrados" description='Crea el primero con "+ Nuevo rol".' />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e1e9dd] bg-[#f7faf5] text-left text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
              <tr>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Área de Planificación</th>
                <th className="px-4 py-3 text-center">Usuarios</th>
                <th className="px-4 py-3 text-center">Permisos</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2ee]">
              {roles.map((r) => {
                const esSistema = ROLES_SISTEMA.has(r.nombre);
                return (
                  <tr key={r.id} className="cursor-pointer transition-colors hover:bg-[#f9fbf7]" onClick={() => abrirEditor(r)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#14352a]">{r.nombre}</span>
                        {esSistema && <span className="rounded-full bg-[#e8f3e2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2f8f4e]">Sistema</span>}
                      </div>
                      {r.descripcion && <p className="mt-0.5 truncate text-xs text-[#7a8794]">{r.descripcion}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-[#f2f5ef] px-2.5 py-0.5 text-xs font-medium text-[#5f7a68]">{r.areaProgramacion ?? "Todas"}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1.5 text-[#45505e]">
                        {IconUsers}
                        <span className="font-semibold tabular-nums text-[#14352a]">{r.nUsuarios}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full bg-[#e6effb] px-2.5 py-0.5 text-xs font-semibold text-[#1a5fb4]">
                        {esSistema ? "Todos" : r.nPermisos}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <IconButton title="Editar rol" onClick={() => abrirEditor(r)}>{IconPencil}</IconButton>
                        {!esSistema && r.nUsuarios === 0 && (
                          <IconButton
                            title="Eliminar rol"
                            className="hover:border-[#b3261e] hover:bg-[#fbeceb] hover:text-[#b3261e]"
                            onClick={async () => {
                              if (await confirm({ title: "¿Eliminar este rol?", message: "Esta acción no se puede deshacer.", danger: true, confirmLabel: "Eliminar" })) {
                                eliminarRol(r.id).then(cargar).catch((err) => showToast(err instanceof ApiError ? err.message : "Error", "error"));
                              }
                            }}
                          >
                            {IconTrash}
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-[#9aa4af]">Haz clic en un rol para ver o editar sus permisos.</p>

      {/* Modal: permisos del rol */}
      {/* Modal único: crear/editar rol + árbol de permisos */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowForm(false)}>
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 border-b border-[#eceef0] px-6 py-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-[#14352a]">{editing ? `Editar rol: ${editing.nombre}` : "Nuevo rol"}</h3>
                {editandoEsSistema && <span className="rounded-full bg-[#e8f3e2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2f8f4e]">Sistema</span>}
              </div>
              <p className="mt-0.5 text-sm text-[#5f7a68]">
                {editandoEsSistema
                  ? "Acceso total protegido — no se puede modificar."
                  : "Define el nombre, la descripción y marca los módulos y acciones a los que este rol tiene acceso."}
              </p>
            </div>

            <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-[#7a8794]">Nombre (se guarda en mayúsculas)</span>
                  <input
                    placeholder="Ej. SUPERVISOR"
                    value={form.nombre}
                    disabled={editandoEsSistema}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm font-mono outline-none focus:border-[#2f8f4e] disabled:bg-[#f4f6f3]"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-[#7a8794]">Descripción</span>
                  <input
                    placeholder="Descripción breve"
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                    className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]"
                  />
                </label>
              </div>

              {editandoEsSistema ? (
                <div className="mt-6 px-6 py-8 text-center text-sm text-[#7a8794]">El rol ADMIN siempre tiene todos los permisos (acceso total, protegido).</div>
              ) : (
                <>
                  <input
                    value={busquedaPermiso}
                    onChange={(e) => setBusquedaPermiso(e.target.value)}
                    placeholder="Buscar permiso o módulo…"
                    className="mt-4 w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]"
                  />

                  <div className="mt-4 space-y-4">
                    {modulosFiltrados.map((mod) => {
                      const clavesModulo = mod.submodulos.flatMap((sm) => sm.claves);
                      const marcadosModulo = clavesModulo.filter((k) => claves.has(k)).length;
                      const todoModulo = marcadosModulo === clavesModulo.length;
                      return (
                        <div key={mod.label} className="overflow-hidden rounded-2xl border border-[#c8d6cd] bg-[#f7faf5]">
                          <div className="flex items-center justify-between gap-3 border-b border-[#c8d6cd] bg-[#eaf3e4] px-4 py-2.5">
                            <div>
                              <p className="text-sm font-bold text-[#14352a]">{mod.label}</p>
                              <p className="text-[11px] text-[#5f7a68]">{marcadosModulo} de {clavesModulo.length} permisos activos</p>
                            </div>
                            <Switch checked={todoModulo} onChange={(v) => toggleGrupo(clavesModulo, v)} />
                          </div>
                          {mod.label === "Planeación" && (
                            <div className="border-b border-[#c8d6cd] bg-white px-4 py-3">
                              <label className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-[#7a8794]">Área de Planificación (restricción automática)</span>
                                <select
                                  value={form.areaProgramacion}
                                  onChange={(e) => setForm((f) => ({ ...f, areaProgramacion: e.target.value }))}
                                  className="w-full max-w-xs rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]"
                                >
                                  <option value="">Sin restricción (todas)</option>
                                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                                </select>
                                <span className="text-xs text-[#9aa4af]">Todo usuario con este rol queda restringido a esa área en Planificación y las demás páginas de Planeación (salvo que tenga áreas propias configuradas).</span>
                              </label>
                            </div>
                          )}
                          <div className="space-y-2.5 p-3">
                            {mod.submodulos.map((sm) => {
                              const marcados = sm.claves.filter((k) => claves.has(k)).length;
                              const todos = marcados === sm.claves.length;
                              return (
                                <div key={sm.label} className="rounded-xl border border-[#e1e9dd] bg-white">
                                  <div className="flex items-center justify-between gap-3 border-b border-[#eceef0] px-3 py-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-[#7a8794]">{sm.label}</p>
                                    <Switch size="sm" checked={todos} onChange={(v) => toggleGrupo(sm.claves, v)} />
                                  </div>
                                  <div className="divide-y divide-[#f0f2ee]">
                                    {sm.claves.map((k) => {
                                      const activo = claves.has(k);
                                      return (
                                        <label key={k} title={k} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm text-[#45505e] hover:bg-[#f9fbf7]">
                                          <span>{permisoLabel(k)}</span>
                                          <Switch size="sm" checked={activo} onChange={() => toggle(k)} />
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {modulosFiltrados.length === 0 && (
                      <p className="py-8 text-center text-sm text-[#9aa4af]">Sin permisos que coincidan con la búsqueda.</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#eceef0] px-6 py-4">
              <span className="text-xs text-[#7a8794]">
                {editandoEsSistema ? "" : `${claves.size} permiso${claves.size !== 1 ? "s" : ""} seleccionado${claves.size !== 1 ? "s" : ""}`}
              </span>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowForm(false)} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
                <button onClick={guardarForm} disabled={guardandoForm} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-60">
                  {guardandoForm ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

