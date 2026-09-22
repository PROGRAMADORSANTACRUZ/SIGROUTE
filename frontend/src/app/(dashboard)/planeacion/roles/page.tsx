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

export default function RolesPage() {
  const [roles, setRoles] = useState<RolRow[]>([]);
  const [modulos, setModulos] = useState<[string, string[]][]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [permisosRol, setPermisosRol] = useState<RolRow | null>(null);
  const [claves, setClaves] = useState<Set<string>>(new Set());
  const [busquedaPermiso, setBusquedaPermiso] = useState("");
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<RolRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [guardandoForm, setGuardandoForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", descripcion: "", areaProgramacion: "" });
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  function cargar() {
    setLoading(true);
    Promise.all([getRoles(), getRolesModulos()])
      .then(([r, m]) => {
        setRoles(r as unknown as RolRow[]);
        const data = m as { modulos: [string, string[]][]; areas: string[] };
        setModulos(data.modulos);
        setAreas(data.areas);
      })
      .finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  async function abrirPermisos(rol: RolRow) {
    setPermisosRol(rol);
    setBusquedaPermiso("");
    setError(null);
    setClaves(new Set());
    const perms = await getRolPermisos(rol.id);
    setClaves(new Set(perms));
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

  async function guardarPermisos() {
    if (!permisosRol) return;
    setError(null);
    setGuardandoPermisos(true);
    try {
      await setRolPermisos(permisosRol.id, [...claves]);
      setPermisosRol(null);
      showToast("Permisos actualizados.", "success");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setGuardandoPermisos(false);
    }
  }

  function nuevoRol() {
    setEditing(null);
    setForm({ nombre: "", descripcion: "", areaProgramacion: "" });
    setShowForm(true);
  }

  function editarForm(r: RolRow) {
    setEditing(r);
    setForm({ nombre: r.nombre, descripcion: r.descripcion ?? "", areaProgramacion: r.areaProgramacion ?? "" });
    setShowForm(true);
  }

  async function guardarForm() {
    setGuardandoForm(true);
    try {
      const data = { nombre: form.nombre, descripcion: form.descripcion, areaProgramacion: form.areaProgramacion || null };
      if (editing) await editarRol(editing.id, data);
      else await crearRol(data);
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
    .map(([grupo, keys]) => [grupo, keys.filter((k) => {
      const q = busquedaPermiso.trim().toLowerCase();
      return !q || k.toLowerCase().includes(q) || permisoLabel(k).toLowerCase().includes(q) || grupo.toLowerCase().includes(q);
    })] as [string, string[]])
    .filter(([, keys]) => keys.length > 0);

  return (
    <div className="p-6">
      <PageHeader
        icon={IconGear}
        title="Roles y permisos"
        subtitle="Define qué puede ver y hacer cada rol dentro de Planeación y Ejecución."
        actions={
          <button onClick={nuevoRol} className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">
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
                  <tr key={r.id} className="cursor-pointer transition-colors hover:bg-[#f9fbf7]" onClick={() => abrirPermisos(r)}>
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
                        <IconButton title="Editar rol" onClick={() => editarForm(r)}>{IconPencil}</IconButton>
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
      {permisosRol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPermisosRol(null)}>
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 border-b border-[#eceef0] px-6 py-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-[#14352a]">Permisos de {permisosRol.nombre}</h3>
                {ROLES_SISTEMA.has(permisosRol.nombre) && <span className="rounded-full bg-[#e8f3e2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2f8f4e]">Sistema</span>}
              </div>
              <p className="mt-0.5 text-sm text-[#5f7a68]">
                {ROLES_SISTEMA.has(permisosRol.nombre)
                  ? "Acceso total protegido — no se puede modificar."
                  : "Marca los módulos y acciones a los que este rol tiene acceso."}
              </p>
            </div>

            {ROLES_SISTEMA.has(permisosRol.nombre) ? (
              <div className="px-6 py-8 text-center text-sm text-[#7a8794]">El rol ADMIN siempre tiene todos los permisos (acceso total, protegido).</div>
            ) : (
              <>
                <div className="shrink-0 border-b border-[#eceef0] px-6 py-3">
                  <input
                    value={busquedaPermiso}
                    onChange={(e) => setBusquedaPermiso(e.target.value)}
                    placeholder="Buscar permiso o módulo…"
                    className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]"
                  />
                </div>

                <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4">
                  {error && <p className="mb-3 text-sm text-[#b3261e]">{error}</p>}
                  <div className="space-y-4">
                    {modulosFiltrados.map(([grupo, keys]) => {
                      const marcados = keys.filter((k) => claves.has(k)).length;
                      const todos = marcados === keys.length;
                      return (
                        <div key={grupo} className="rounded-xl border border-[#e1e9dd] p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#7a8794]">{grupo}</p>
                            <button
                              onClick={() => toggleGrupo(keys, !todos)}
                              className="text-[11px] font-medium text-[#2f8f4e] hover:underline"
                            >
                              {todos ? "Desmarcar todos" : `Marcar todos (${marcados}/${keys.length})`}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {keys.map((k) => {
                              const activo = claves.has(k);
                              return (
                                <button
                                  key={k}
                                  onClick={() => toggle(k)}
                                  title={k}
                                  className={`rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                                    activo
                                      ? "border-[#2f8f4e] bg-[#e8f3e2] text-[#2f8f4e]"
                                      : "border-[#dfe4e0] bg-white text-[#5f7a68] hover:bg-[#f4f6f3]"
                                  }`}
                                >
                                  {permisoLabel(k)}
                                </button>
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
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#eceef0] px-6 py-4">
                  <span className="text-xs text-[#7a8794]">{claves.size} permiso{claves.size !== 1 ? "s" : ""} seleccionado{claves.size !== 1 ? "s" : ""}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setPermisosRol(null)} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
                    <button onClick={guardarPermisos} disabled={guardandoPermisos} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-60">
                      {guardandoPermisos ? "Guardando…" : "Guardar permisos"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: crear/editar rol */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-[#eceef0] px-6 py-4">
              <h3 className="text-lg font-semibold text-[#14352a]">{editing ? "Editar rol" : "Nuevo rol"}</h3>
              <p className="mt-0.5 text-sm text-[#5f7a68]">{editing ? `Actualiza los datos de ${editing.nombre}.` : "Crea un rol y luego asígnale permisos."}</p>
            </div>
            <div className="flex flex-col gap-3 px-6 py-5">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#7a8794]">Nombre (se guarda en mayúsculas)</span>
                <input
                  placeholder="Ej. SUPERVISOR"
                  value={form.nombre}
                  disabled={!!editing && ROLES_SISTEMA.has(editing.nombre)}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm font-mono outline-none focus:border-[#2f8f4e] disabled:bg-[#f4f6f3]"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#7a8794]">Descripción</span>
                <input
                  placeholder="Descripción breve"
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#7a8794]">Área de Planificación (restricción automática)</span>
                <select
                  value={form.areaProgramacion}
                  disabled={!!editing && ROLES_SISTEMA.has(editing.nombre)}
                  onChange={(e) => setForm((f) => ({ ...f, areaProgramacion: e.target.value }))}
                  className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e] disabled:bg-[#f4f6f3]"
                >
                  <option value="">Sin restricción (todas)</option>
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <span className="text-xs text-[#9aa4af]">Todo usuario con este rol queda restringido a esa área en Planificación (salvo que tenga áreas propias configuradas).</span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
              <button onClick={guardarForm} disabled={guardandoForm} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-60">
                {guardandoForm ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

