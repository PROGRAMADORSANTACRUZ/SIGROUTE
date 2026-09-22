// Autenticación por SESIÓN (cookie firmada vía `cookie-session`), NO JWT —
// puerto de legacy_fastapi/app/auth.py. `req.session.userId` guarda solo el id;
// el resto (permisos, áreas, rol) se relee de la BD en cada request con
// `loadCurrentUser`, igual que `current_user()` en la app FastAPI original:
// los cambios de permisos/desactivación se reflejan al instante.
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./errorHandler";
import { loadCurrentUser, hasPermission, type SessionUser } from "../lib/authSession";

export interface AuthPayload {
  sub: string;
  username: string;
  role: string;
  permisos: string[] | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
      sessionUser?: SessionUser;
      session: { userId?: number } & Record<string, unknown>;
    }
  }
}

function toAuthPayload(u: SessionUser): AuthPayload {
  return { sub: String(u.id), username: u.username, role: u.role, permisos: u.permisos };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) return next(new HttpError(401, "No autorizado"));

  const user = await loadCurrentUser(userId);
  if (!user) {
    // El usuario fue desactivado o eliminado: limpia la sesión.
    req.session = null as unknown as Request["session"];
    return next(new HttpError(401, "Sesión inválida"));
  }

  req.sessionUser = user;
  req.user = toAuthPayload(user);
  next();
}

// Exige que el usuario tenga permiso sobre un módulo. ADMIN tiene acceso total.
export function requirePermiso(clave: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.sessionUser;
    if (!u) return next(new HttpError(401, "No autorizado"));
    if (hasPermission(u, clave)) return next();
    next(new HttpError(403, "No tienes permiso para este módulo"));
  };
}
