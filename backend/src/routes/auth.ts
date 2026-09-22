// Auth por sesión (cookie), puerto de las rutas /login, /logout de
// legacy_fastapi/app/main.py + app/auth.py. Sustituye por completo el login
// JWT de DISTRILOG (cédula/token) — aquí se usa username/password como en
// rutas_web original.
import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { authenticate, loadCurrentUser } from "../lib/authSession";
import { hashPassword } from "../lib/security";
import { prismaPlan as prisma } from "../lib/prisma";
import { versiculoDelDia } from "../lib/versiculo";

const router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, "El usuario es obligatorio"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

// GET /api/auth/versiculo — público (se muestra en el login, antes de autenticar).
router.get("/versiculo", (_req, res) => {
  res.json(versiculoDelDia());
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);

    const user = await authenticate(parsed.data.username, parsed.data.password);
    if (!user) throw new HttpError(401, "Usuario o contraseña incorrectos");

    req.session = { userId: user.id };
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session = null as unknown as typeof req.session;
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await loadCurrentUser(Number(req.user!.sub));
    if (!user) throw new HttpError(404, "Usuario no encontrado");
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password — puerto de POST /cambiar-password de
// legacy_fastapi/app/main.py (mismas reglas: mínimo 8 caracteres, confirmación
// igual, y no reutilizar la contraseña temporal semilla).
const changePasswordSchema = z.object({
  nueva: z.string().trim().min(8, "La contraseña debe tener al menos 8 caracteres"),
  confirmar: z.string(),
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const { nueva, confirmar } = parsed.data;

    if (nueva !== confirmar) throw new HttpError(400, "Las contraseñas no coinciden");
    if (nueva === "Admin2024*") throw new HttpError(400, "No puedes reutilizar la contraseña temporal");

    await prisma.usuario.update({
      where: { id: Number(req.user!.sub) },
      data: { passwordHash: hashPassword(nueva), mustChangePassword: false },
    });

    const user = await loadCurrentUser(Number(req.user!.sub));
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
