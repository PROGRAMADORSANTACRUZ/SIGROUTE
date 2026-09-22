"use client";

// Helpers de permisos granulares ver/editar por módulo para el frontend.
// El backend YA rechaza (403) cualquier mutación sin el permiso ".editar"
// correspondiente — esto solo controla qué ve/puede tocar el usuario en la UI
// (ocultar botones de crear/editar/eliminar y mostrar un aviso de solo lectura).
import { useEffect, useState } from "react";
import { getUser, type AuthUser } from "./api";

// Mismo patrón que Sidebar.tsx: sessionStorage no existe en el render de
// servidor, así que se lee en un efecto para evitar mismatches de hidratación.
export function useAuthUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => { setUser(getUser()); }, []);
  return user;
}

// ADMIN siempre puede todo. Sin usuario cargado aún (primer render), asume que
// NO puede editar — evita parpadeo de botones que luego se ocultan.
export function usePermiso(clave: string): boolean {
  const user = useAuthUser();
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return user.permisos.includes(clave);
}

// Azúcar sintáctica para el caso típico: un módulo con clave.ver + clave.editar.
// Devuelve `puedeEditar` (para mostrar/ocultar botones) y `soloLectura` (para
// mostrar el aviso "estás viendo en modo solo lectura").
export function useModuloPermiso(claveEditar: string): { puedeEditar: boolean; soloLectura: boolean } {
  const puedeEditar = usePermiso(claveEditar);
  return { puedeEditar, soloLectura: !puedeEditar };
}
