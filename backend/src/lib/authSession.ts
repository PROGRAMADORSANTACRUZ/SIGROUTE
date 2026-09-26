// Puerto de legacy_fastapi/app/auth.py — autenticación por sesión (cookie),
// NO JWT. `loadCurrentUser` relee permisos/áreas frescos de la BD en cada
// request, igual que `current_user()` en la app FastAPI original.
import { prismaPlan as prisma } from "./prisma";
import { verifyPassword } from "./security";

export interface SessionUser {
  id: number;
  username: string;
  nombreCompleto: string;
  role: string; // nombre del rol, p.ej. "ADMIN"
  permisos: string[]; // claves de permiso ("programacion.ver", …)
  mustChangePassword: boolean;
  areasVisibles: string[] | null; // null = sin restricción
  areasEditables: string[] | null;
}

export async function authenticate(username: string, password: string): Promise<SessionUser | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { username },
    include: { rol: true },
  });
  if (!usuario || !usuario.activo) return null;
  if (!verifyPassword(password, usuario.passwordHash)) return null;

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoLogin: new Date() },
  });

  return buildSessionUser(usuario.id);
}

export async function loadCurrentUser(userId: number): Promise<SessionUser | null> {
  return buildSessionUserCached(userId);
}

// Cache muy corta (en memoria, por proceso) de buildSessionUser: esta consulta
// (usuario + rol + permisos + columnas) corre en CADA request autenticado, y
// una sola carga de pantalla dispara varios requests en paralelo (visto en
// vivo: 6 GET simultáneos al abrir el dashboard) — cada uno pedía su propia
// conexión de Prisma para la MISMA data del MISMO usuario. Con muchos
// usuarios conectados a la vez esto agotaba el pool de conexiones (15 por
// defecto) y tumbaba el backend entero. TTL corto a propósito: los cambios de
// permisos/desactivación siguen viéndose "casi al instante" (máx. unos
// segundos de rezago), pero las ráfagas de requests paralelos del mismo
// usuario ahora comparten UNA sola consulta en vez de una por request.
const SESSION_CACHE_TTL_MS = 3000;
const sessionCache = new Map<number, { expires: number; promise: Promise<SessionUser | null> }>();

function buildSessionUserCached(userId: number): Promise<SessionUser | null> {
  const now = Date.now();
  const hit = sessionCache.get(userId);
  if (hit && hit.expires > now) return hit.promise;

  const promise = buildSessionUser(userId);
  sessionCache.set(userId, { expires: now + SESSION_CACHE_TTL_MS, promise });
  // Si falla, no dejar la entrada envenenada en cache para el siguiente request.
  promise.catch(() => sessionCache.delete(userId));
  return promise;
}

async function buildSessionUser(userId: number): Promise<SessionUser | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: userId },
    include: {
      rol: { include: { rolPermisos: { include: { permiso: true } } } },
      columnas: true,
    },
  });
  if (!usuario || !usuario.activo) return null;

  const permisos = usuario.rol.rolPermisos.map((rp) => rp.permiso.clave);
  const { visibles, editables } = effectiveAreas(usuario.columnas, usuario.rol.areaProgramacion);

  return {
    id: usuario.id,
    username: usuario.username,
    nombreCompleto: usuario.nombreCompleto,
    role: usuario.rol.nombre,
    permisos,
    mustChangePassword: usuario.mustChangePassword,
    areasVisibles: visibles,
    areasEditables: editables,
  };
}

// Precedencia: 1) config explícita por usuario (usuario_columnas),
// 2) área atada al rol (roles.area_programacion), 3) sin restricción.
function effectiveAreas(
  cols: { area: string; puedeVer: boolean; puedeEditar: boolean }[],
  roleArea: string | null
): { visibles: string[] | null; editables: string[] | null } {
  if (cols.length > 0) {
    return {
      visibles: cols.filter((c) => c.puedeVer).map((c) => c.area),
      editables: cols.filter((c) => c.puedeEditar).map((c) => c.area),
    };
  }
  if (roleArea) {
    return { visibles: [roleArea], editables: [roleArea] };
  }
  return { visibles: null, editables: null };
}

export function hasPermission(user: SessionUser | null | undefined, clave: string): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (!clave) return true;
  return user.permisos.includes(clave);
}

export function areasPermitidas(user: SessionUser | null | undefined): { visibles: string[] | null; editables: string[] | null } {
  if (!user || user.role === "ADMIN") return { visibles: null, editables: null };
  return { visibles: user.areasVisibles, editables: user.areasEditables };
}
