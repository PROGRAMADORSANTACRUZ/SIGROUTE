"use client";

import { useEffect, useState } from "react";
import {
  crearUsuarioPlan, editarUsuarioPlan, getAreasUsuario, getColumnasUsuario, getRoles,
  getUsuariosPlan, resetPasswordUsuarioPlan, setColumnasUsuario, toggleActivoUsuarioPlan,
} from "@/lib/planApi";
import { ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { PageLoader } from "@/components/Loading";
import EmptyState from "@/components/EmptyState";
import { IconUsers } from "@/components/icons";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import IconButton from "@/components/IconButton";
import { IconPencil, IconLock, IconLockOpen } from "@/components/icons";

interface UsuarioRow {
  id: number; username: string; nombreCompleto: string; email: string | null;
  rol: string; instancia: string | null; canal: string | null; activo: boolean; ultimoLogin: string | null;
}
type Columna = { area: string; ver: boolean; editar: boolean };

export default function UsuariosPlaneacionPage() {
  const [items, setItems] = useState<UsuarioRow[]>([]);
  const [roles, setRoles] = useState<{ id: number; nombre: string }[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UsuarioRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Modal de áreas (ver/editar) por usuario
  const [areasUser, setAreasUser] = useState<UsuarioRow | null>(null);
  const [columnas, setColumnas] = useState<Columna[]>([]);
  const { showToast } = useToast();
  const { confirm, prompt } = useConfirm();

  function cargar() {
    setLoading(true);
    Promise.all([getUsuariosPlan(), getRoles(), getAreasUsuario()])
      .then(([u, r, a]) => {
        setItems(u as unknown as UsuarioRow[]);
        setRoles(r as { id: number; nombre: string }[]);
        setAreas(a as string[]);
      })
      .finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  async function guardar() {
    setError(null);
    try {
      if (editing) {
        await editarUsuarioPlan(editing.id, {
          nombreCompleto: form.nombreCompleto, email: form.email || null, rol: form.rol, canal: form.canal || null,
        });
      } else {
        await crearUsuarioPlan({
          username: form.username, password: form.password, nombreCompleto: form.nombreCompleto,
          email: form.email || null, rol: form.rol,
        });
      }
      setShowForm(false);
      setEditing(null);
      setForm({});
      showToast(editing ? "Usuario actualizado." : "Usuario creado.", "success");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    }
  }

  async function abrirAreas(u: UsuarioRow) {
    setAreasUser(u);
    const existentes = await getColumnasUsuario(u.id);
    setColumnas(
      areas.map((area) => {
        const found = existentes.find((c) => c.area === area);
        return { area, ver: found?.ver ?? false, editar: found?.editar ?? false };
      })
    );
  }

  function toggleColumna(area: string, campo: "ver" | "editar") {
    setColumnas((prev) =>
      prev.map((c) => {
        if (c.area !== area) return c;
        if (campo === "editar") {
          const editar = !c.editar;
          return { ...c, editar, ver: editar ? true : c.ver }; // editar implica ver
        }
        const ver = !c.ver;
        return { ...c, ver, editar: ver ? c.editar : false };
      })
    );
  }

  async function guardarAreas() {
    if (!areasUser) return;
    await setColumnasUsuario(areasUser.id, columnas);
    showToast("Áreas actualizadas.", "success");
    setAreasUser(null);
  }

  return (
    <div className="p-6">
      <PageHeader
        icon={IconUsers}
        title="Usuarios"
        subtitle="Cuentas con acceso a Planeación y sus áreas asignadas."
        actions={
          <button
            onClick={() => { setEditing(null); setForm({ rol: "OPERADOR" }); setShowForm(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nuevo usuario
          </button>
        }
      />

      {loading ? (
        <PageLoader />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f4f6f3] text-left text-xs font-semibold uppercase text-[#7a8794]">
              <tr><th className="px-3 py-2">Usuario</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Rol</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Último acceso</th><th className="px-3 py-2 text-right">Acciones</th></tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={6}><EmptyState icon={IconUsers} title="Sin usuarios registrados" description='Crea el primero con "+ Nuevo usuario".' /></td></tr>
              )}
              {items.map((u) => (
                <tr key={u.id} className="border-t border-[#f0f2ee]">
                  <td className="px-3 py-2 font-mono text-xs">{u.username}</td>
                  <td className="px-3 py-2">{u.nombreCompleto}{u.canal ? ` · ${u.canal}` : ""}</td>
                  <td className="px-3 py-2"><span className="rounded-full bg-[#e8f3e2] px-2 py-0.5 text-xs font-semibold text-[#2f8f4e]">{u.rol}</span></td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${u.activo ? "bg-[#e8f3e2] text-[#2f8f4e]" : "bg-[#f0f1f2] text-[#6b7683]"}`}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[#7a8794]">{u.ultimoLogin ? new Date(u.ultimoLogin).toLocaleString("es-CO") : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <IconButton
                        title="Editar usuario"
                        onClick={() => { setEditing(u); setForm({ nombreCompleto: u.nombreCompleto, email: u.email ?? "", rol: u.rol, canal: u.canal ?? "" }); setShowForm(true); }}
                      >
                        {IconPencil}
                      </IconButton>
                      <IconButton title="Áreas asignadas" onClick={() => abrirAreas(u)}>
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                      </IconButton>
                      {u.username !== "admin" && (
                        <IconButton
                          title={u.activo ? "Desactivar usuario" : "Activar usuario"}
                          onClick={async () => {
                            if (await confirm({ title: u.activo ? "¿Desactivar este usuario?" : "¿Activar este usuario?", danger: u.activo, confirmLabel: u.activo ? "Desactivar" : "Activar" })) {
                              toggleActivoUsuarioPlan(u.id).then(cargar).catch((err) => showToast(err instanceof ApiError ? err.message : "Error", "error"));
                            }
                          }}
                        >
                          {u.activo ? IconLock : IconLockOpen}
                        </IconButton>
                      )}
                      <IconButton
                        title="Restablecer contraseña"
                        className="hover:border-[#b3261e] hover:bg-[#fbeceb] hover:text-[#b3261e]"
                        onClick={async () => {
                          const p = await prompt({ title: "Restablecer contraseña", message: `Se asignará una nueva contraseña temporal para ${u.username}.`, input: { label: "Nueva contraseña temporal", type: "password", placeholder: "Mínimo 8 caracteres" }, confirmLabel: "Restablecer" });
                          if (p) resetPasswordUsuarioPlan(u.id, p).then(() => showToast("Contraseña restablecida.", "success")).catch((err) => showToast(err instanceof ApiError ? err.message : "Error", "error"));
                        }}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-[#eceef0] px-6 py-4">
              <h3 className="text-lg font-semibold text-[#14352a]">{editing ? "Editar usuario" : "Nuevo usuario"}</h3>
              <p className="mt-0.5 text-sm text-[#5f7a68]">{editing ? `Actualiza los datos de ${editing.username}.` : "Crea una cuenta de acceso a Planeación."}</p>
            </div>

            <div className="px-6 py-5">
              {error && <p className="mb-3 text-sm text-[#b3261e]">{error}</p>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {!editing && (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-[#7a8794]">Usuario</span>
                      <input placeholder="username" value={form.username ?? ""} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-[#7a8794]">Contraseña temporal</span>
                      <input placeholder="contraseña temporal" type="password" value={form.password ?? ""} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
                    </label>
                  </>
                )}
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs font-medium text-[#7a8794]">Nombre completo</span>
                  <input placeholder="Nombre completo" value={form.nombreCompleto ?? ""} onChange={(e) => setForm((f) => ({ ...f, nombreCompleto: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-[#7a8794]">Email</span>
                  <input placeholder="Email" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-[#7a8794]">Rol</span>
                  <select value={form.rol ?? ""} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]">
                    {roles.map((r) => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
                  </select>
                </label>
              </div>
              {!editing && <p className="mt-3 text-xs text-[#9aa4af]">El usuario deberá cambiar esta contraseña en su primer ingreso.</p>}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
              <button onClick={guardar} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {areasUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAreasUser(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-[#eceef0] px-6 py-4">
              <h3 className="text-lg font-semibold text-[#14352a]">Áreas de {areasUser.nombreCompleto}</h3>
              <p className="mt-0.5 text-sm text-[#5f7a68]">Si no marcas ninguna área, el usuario ve todas sin restricción.</p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-semibold uppercase text-[#7a8794]">
                  <tr><th className="py-1">Área</th><th className="py-1 text-center">Ver</th><th className="py-1 text-center">Editar</th></tr>
                </thead>
                <tbody>
                  {columnas.map((c) => (
                    <tr key={c.area} className="border-t border-[#f0f2ee]">
                      <td className="py-1.5">{c.area}</td>
                      <td className="py-1.5 text-center"><input type="checkbox" checked={c.ver} onChange={() => toggleColumna(c.area, "ver")} className="accent-[#2f8f4e]" /></td>
                      <td className="py-1.5 text-center"><input type="checkbox" checked={c.editar} onChange={() => toggleColumna(c.area, "editar")} className="accent-[#2f8f4e]" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
              <button onClick={() => setAreasUser(null)} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
              <button onClick={guardarAreas} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">Guardar áreas</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
