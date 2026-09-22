// Usuarios (Planeación) — puerto de legacy_fastapi/app/repos/usuarios.py +
// routers/usuarios.py. Reemplaza el CRUD simple de usuarios de DISTRILOG.
import { Router } from "express";
import { z } from "zod";
import { prismaPlan as prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import { hashPassword } from "../../lib/security";
import { AREAS_USUARIO } from "../../lib/planCategorias";

const router = Router();
router.use(requireAuth);

// GET /api/planeacion/usuarios
router.get("/", requirePermiso("usuarios.ver"), async (_req, res, next) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      include: { rol: true },
      orderBy: [{ activo: "desc" }, { nombreCompleto: "asc" }],
    });
    res.json(
      usuarios.map((u) => ({
        id: u.id,
        username: u.username,
        nombreCompleto: u.nombreCompleto,
        email: u.email,
        rol: u.rol.nombre,
        instancia: u.instancia,
        canal: u.canal,
        activo: u.activo,
        ultimoLogin: u.ultimoLogin,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.get("/areas", requirePermiso("usuarios.ver"), (_req, res) => {
  res.json(AREAS_USUARIO);
});

router.get("/:id/columnas", requirePermiso("usuarios.ver"), async (req, res, next) => {
  try {
    const usuarioId = Number(req.params.id);
    const cols = await prisma.usuarioColumna.findMany({ where: { usuarioId } });
    res.json(cols.map((c) => ({ area: c.area, ver: c.puedeVer, editar: c.puedeEditar })));
  } catch (err) {
    next(err);
  }
});

const columnasSchema = z.array(z.object({ area: z.string(), ver: z.boolean().optional(), editar: z.boolean().optional() }));

// PUT /api/planeacion/usuarios/:id/columnas — editar implica ver.
router.put("/:id/columnas", requirePermiso("usuarios.editar"), async (req, res, next) => {
  try {
    const usuarioId = Number(req.params.id);
    const items = columnasSchema.parse(req.body);
    await prisma.usuarioColumna.deleteMany({ where: { usuarioId } });
    const rows = items
      .map((it) => ({ usuarioId, area: it.area, puedeEditar: !!it.editar, puedeVer: !!it.ver || !!it.editar }))
      .filter((it) => it.puedeVer || it.puedeEditar);
    if (rows.length) await prisma.usuarioColumna.createMany({ data: rows });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(4),
  nombreCompleto: z.string().trim().min(1),
  email: z.string().trim().optional().nullable(),
  rol: z.string().trim().min(1),
  instancia: z.string().trim().optional(),
  canal: z.string().trim().optional().nullable(),
});

// POST /api/planeacion/usuarios
router.post("/", requirePermiso("usuarios.crear"), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const username = data.username.toLowerCase().trim();
    const existe = await prisma.usuario.findUnique({ where: { username } });
    if (existe) throw new HttpError(409, "Ya existe un usuario con ese username");

    const rol = await prisma.rol.findUnique({ where: { nombre: data.rol } });
    if (!rol) throw new HttpError(400, `Rol '${data.rol}' no existe`);

    const usuario = await prisma.usuario.create({
      data: {
        username,
        passwordHash: hashPassword(data.password),
        nombreCompleto: data.nombreCompleto.trim(),
        email: data.email?.trim() || null,
        rolId: rol.id,
        instancia: data.instancia ?? "AMBAS",
        canal: data.canal?.trim() || null,
        mustChangePassword: true,
        createdBy: req.user!.username,
      },
    });
    res.status(201).json({ id: usuario.id });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  nombreCompleto: z.string().trim().min(1),
  email: z.string().trim().optional().nullable(),
  rol: z.string().trim().min(1),
  instancia: z.string().trim().optional(),
  canal: z.string().trim().optional().nullable(),
});

// PUT /api/planeacion/usuarios/:id
router.put("/:id", requirePermiso("usuarios.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = updateSchema.parse(req.body);
    const rol = await prisma.rol.findUnique({ where: { nombre: data.rol } });
    if (!rol) throw new HttpError(400, `Rol '${data.rol}' no existe`);

    await prisma.usuario.update({
      where: { id },
      data: {
        nombreCompleto: data.nombreCompleto.trim(),
        email: data.email?.trim() || null,
        rolId: rol.id,
        instancia: data.instancia ?? "AMBAS",
        canal: data.canal?.trim() || null,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/planeacion/usuarios/:id/activo (toggle) — bloqueado para sí mismo o "admin".
router.patch("/:id/activo", requirePermiso("usuarios.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await prisma.usuario.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, "Usuario no encontrado");
    if (target.id === Number(req.user!.sub)) throw new HttpError(400, "No puedes desactivarte a ti mismo");
    if (target.username === "admin") throw new HttpError(400, "No puedes desactivar al usuario admin");
    const usuario = await prisma.usuario.update({ where: { id }, data: { activo: !target.activo } });
    res.json({ activo: usuario.activo });
  } catch (err) {
    next(err);
  }
});

// POST /api/planeacion/usuarios/:id/reset-password
router.post("/:id/reset-password", requirePermiso("usuarios.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { password } = z.object({ password: z.string().min(4) }).parse(req.body);
    await prisma.usuario.update({
      where: { id },
      data: { passwordHash: hashPassword(password), mustChangePassword: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
