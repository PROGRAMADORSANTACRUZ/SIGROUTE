import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { prismaPlan as prisma } from "../lib/prisma";
import { hashPassword } from "../lib/security";

const router = Router();

const upsertSchema = z.object({
  cedula: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
  nombre: z.string().trim().optional(),
  rol: z.string().trim().optional(),
  permisos: z.array(z.string()).optional(),
  activo: z.boolean().optional(),
  password: z.string().min(1).optional(),
});

const estadoSchema = z.object({
  activo: z.boolean().optional(),
  bloqueadoSuite: z.boolean().optional(),
});

const passwordSchema = z.object({
  password: z.string().min(1, "La contraseña es obligatoria"),
});

const permisosSchema = z.object({
  rol: z.string().trim().optional(),
  permisos: z.array(z.string()).optional(),
});

router.use((req, res, next) => {
  const secret = (env.SSO_SHARED_SECRET || "").trim();
  const provided = String(req.header("X-SSO-Secret") || "").trim();
  if (!secret || secret !== provided) {
    return res.status(401).json({ error: "No autorizado" });
  }
  next();
});

router.get("/catalogo", async (_req, res, next) => {
  try {
    const roles = await prisma.rol.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { nombre: true },
    });

    res.json({
      roles: roles.map((r) => r.nombre),
      grupos: [],
      companies: [],
    });
  } catch (err) {
    next(err);
  }
});

router.get("/usuarios", async (_req, res, next) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      orderBy: { nombreCompleto: "asc" },
      include: {
        rol: {
          include: {
            rolPermisos: { include: { permiso: true } },
          },
        },
      },
    });

    res.json(
      usuarios.map((u) => ({
        cedula: u.username,
        nombre: u.nombreCompleto,
        email: u.email,
        rol: u.rol.nombre,
        activo: u.activo,
        permisos: u.rol.rolPermisos.map((rp) => rp.permiso.clave),
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.get("/usuarios/:cedula", async (req, res, next) => {
  try {
    const cedula = String(req.params.cedula || "").trim();
    const user = await prisma.usuario.findFirst({
      where: { username: cedula },
      include: {
        rol: {
          include: {
            rolPermisos: { include: { permiso: true } },
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: "No existe" });

    res.json({
      cedula: user.username,
      nombre: user.nombreCompleto,
      email: user.email,
      rol: user.rol.nombre,
      activo: user.activo,
      permisos: user.rol.rolPermisos.map((rp) => rp.permiso.clave),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/usuarios", async (req, res, next) => {
  try {
    const parsed = upsertSchema.parse(req.body ?? {});
    const cedula = String(parsed.cedula || "").trim();
    const email = parsed.email ? parsed.email.toLowerCase() : null;
    const nombre = String(parsed.nombre || "").trim();

    if (!cedula && !email) {
      return res.status(400).json({ error: "Se requiere cédula o email" });
    }

    let rol = null;
    if (parsed.rol) {
      rol = await prisma.rol.findFirst({ where: { nombre: parsed.rol } });
    }
    if (!rol) {
      rol = await prisma.rol.findFirst({ where: { nombre: "OPERADOR" } });
    }
    if (!rol) {
      rol = await prisma.rol.findFirst({ orderBy: { id: "asc" } });
    }
    if (!rol) {
      return res.status(500).json({ error: "No hay roles configurados en SIGROUTE" });
    }

    const where = cedula ? { username: cedula } : { email: email || "" };
    const existing = await prisma.usuario.findFirst({ where });

    const data = {
      username: cedula || String(email),
      nombreCompleto: nombre || cedula || String(email),
      email,
      rolId: rol.id,
      activo: parsed.activo ?? true,
      passwordHash: parsed.password ? hashPassword(parsed.password) : undefined,
      mustChangePassword: parsed.password ? true : undefined,
    } as const;

    if (existing) {
      const updated = await prisma.usuario.update({
        where: { id: existing.id },
        data: {
          username: data.username,
          nombreCompleto: data.nombreCompleto,
          email: data.email,
          rolId: data.rolId,
          activo: data.activo,
          ...(data.passwordHash ? { passwordHash: data.passwordHash, mustChangePassword: true } : {}),
        },
      });
      return res.json({ ok: true, action: "updated", id: updated.id });
    }

    const created = await prisma.usuario.create({
      data: {
        username: data.username,
        nombreCompleto: data.nombreCompleto,
        email: data.email,
        rolId: data.rolId,
        activo: data.activo,
        passwordHash: data.passwordHash ?? hashPassword("Admin2024*"),
        mustChangePassword: true,
      },
    });
    return res.json({ ok: true, action: "created", id: created.id });
  } catch (err) {
    next(err);
  }
});

router.patch("/usuarios/:cedula/estado", async (req, res, next) => {
  try {
    const parsed = estadoSchema.parse(req.body ?? {});
    const cedula = String(req.params.cedula || "").trim();
    const user = await prisma.usuario.findFirst({ where: { username: cedula } });
    if (!user) return res.status(404).json({ error: "No existe" });

    let activo = parsed.activo;
    if (parsed.bloqueadoSuite === true) activo = false;

    await prisma.usuario.update({
      where: { id: user.id },
      data: activo === undefined ? {} : { activo },
    });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/usuarios/:cedula/password", async (req, res, next) => {
  try {
    const parsed = passwordSchema.parse(req.body ?? {});
    const cedula = String(req.params.cedula || "").trim();
    const user = await prisma.usuario.findFirst({ where: { username: cedula } });
    if (!user) return res.status(404).json({ error: "No existe" });

    await prisma.usuario.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(parsed.password), mustChangePassword: true },
    });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/usuarios/:cedula/permisos", async (req, res, next) => {
  try {
    const parsed = permisosSchema.parse(req.body ?? {});
    const cedula = String(req.params.cedula || "").trim();
    const user = await prisma.usuario.findFirst({ where: { username: cedula } });
    if (!user) return res.status(404).json({ error: "No existe" });

    let rolId: number | undefined;
    if (parsed.rol) {
      const rol = await prisma.rol.findFirst({ where: { nombre: parsed.rol } });
      if (rol) rolId = rol.id;
    }

    await prisma.usuario.update({
      where: { id: user.id },
      data: rolId ? { rolId } : {},
    });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
