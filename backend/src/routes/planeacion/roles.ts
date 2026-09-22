// Roles y permisos — puerto de legacy_fastapi/app/repos/roles.py.
import { Router } from "express";
import { z } from "zod";
import { prismaPlan as prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import { AREAS_USUARIO } from "../../lib/planCategorias";

const router = Router();
router.use(requireAuth);

const ROLES_SISTEMA = new Set(["ADMIN"]);

// Catálogo de permisos agrupado por módulo (para la UI de checkboxes).
export const MODULOS: [string, string[]][] = [
  ["Planificación", ["programacion.ver", "programacion.editar", "programacion.cerrar_area", "programacion.reabrir_area"]],
  ["Distribución Producción", ["distribucion.ver", "distribucion.editar"]],
  ["Simulador de Producción", ["simulador.ver", "simulador.editar"]],
  ["Preasignación", ["asignacion.ver", "asignacion.editar"]],
  ["Áreas para Cargar", ["areas.ver", "areas.confirmar_carga", "areas.reabrir_carga", "areas.editar_kls", "areas.exportar"]],
  ["Resumen del Día", ["resumen.ver", "resumen.exportar"]],
  ["Maestros", ["maestros.ver", "maestros.editar", "maestros.eliminar"]],
  ["Dashboard", ["dashboard.ver"]],
  ["Reportes", ["reportes.ver", "reportes.exportar"]],
  ["Usuarios y roles", ["usuarios.ver", "usuarios.crear", "usuarios.editar", "usuarios.roles"]],
  ["Auditoría", ["auditoria.ver"]],
  ["Ejecución · Cargar Órdenes", ["distrilog.ordenes.ver", "distrilog.ordenes.editar"]],
  ["Ejecución · Asignación de órdenes", ["distrilog.asignacion.ver", "distrilog.asignacion.editar"]],
  ["Ejecución · Diagrama", ["distrilog.planes.ver", "distrilog.planes.editar"]],
  ["Ejecución · Planificación D.L.", ["distrilog.planificacion_dl.ver", "distrilog.planificacion_dl.editar"]],
  ["Ejecución · Históricos", ["distrilog.historicos.ver"]],
  ["Ejecución · Nivel de servicio", ["distrilog.nivel_servicio.ver", "distrilog.nivel_servicio.editar"]],
  ["Ejecución · Run Errands", ["distrilog.errands.ver", "distrilog.errands.editar"]],
  ["Ejecución · Configuración", ["distrilog.config.ver", "distrilog.config.editar"]],
];

// GET /api/planeacion/roles
router.get("/", requirePermiso("usuarios.roles"), async (_req, res, next) => {
  try {
    const roles = await prisma.rol.findMany({
      include: { _count: { select: { usuarios: true, rolPermisos: true } } },
      orderBy: { id: "asc" },
    });
    res.json(
      roles.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        descripcion: r.descripcion,
        areaProgramacion: r.areaProgramacion,
        nUsuarios: r._count.usuarios,
        nPermisos: r._count.rolPermisos,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.get("/modulos", requirePermiso("usuarios.roles"), (_req, res) => {
  res.json({ modulos: MODULOS, areas: AREAS_USUARIO });
});

router.get("/:id/permisos", requirePermiso("usuarios.roles"), async (req, res, next) => {
  try {
    const rolId = Number(req.params.id);
    const rolPermisos = await prisma.rolPermiso.findMany({ where: { rolId }, include: { permiso: true } });
    res.json(rolPermisos.map((rp) => rp.permiso.clave));
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  nombre: z.string().trim().min(1),
  descripcion: z.string().trim().optional(),
  areaProgramacion: z.string().trim().optional().nullable(),
});

router.post("/", requirePermiso("usuarios.roles"), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const nombre = data.nombre.toUpperCase();
    const existe = await prisma.rol.findUnique({ where: { nombre } });
    if (existe) throw new HttpError(409, `Ya existe un rol llamado '${nombre}'`);
    const area = data.areaProgramacion && AREAS_USUARIO.includes(data.areaProgramacion) ? data.areaProgramacion : null;
    const rol = await prisma.rol.create({ data: { nombre, descripcion: data.descripcion ?? "", areaProgramacion: area } });
    res.status(201).json(rol);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requirePermiso("usuarios.roles"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = createSchema.parse(req.body);
    const rol = await prisma.rol.findUnique({ where: { id } });
    if (!rol) throw new HttpError(404, "Rol no encontrado");

    if (ROLES_SISTEMA.has(rol.nombre)) {
      // Rol de sistema: solo se permite tocar la descripción.
      const updated = await prisma.rol.update({ where: { id }, data: { descripcion: data.descripcion ?? "" } });
      return res.json(updated);
    }
    const area = data.areaProgramacion && AREAS_USUARIO.includes(data.areaProgramacion) ? data.areaProgramacion : null;
    const updated = await prisma.rol.update({
      where: { id },
      data: { nombre: data.nombre.toUpperCase(), descripcion: data.descripcion ?? "", areaProgramacion: area },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requirePermiso("usuarios.roles"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rol = await prisma.rol.findUnique({ where: { id } });
    if (!rol) throw new HttpError(404, "Rol no encontrado");
    if (ROLES_SISTEMA.has(rol.nombre)) throw new HttpError(400, "El rol ADMIN no se puede eliminar");
    const n = await prisma.usuario.count({ where: { rolId: id } });
    if (n > 0) throw new HttpError(400, `El rol tiene ${n} usuario(s) asignado(s). Reasígnalos antes de eliminar.`);
    await prisma.rolPermiso.deleteMany({ where: { rolId: id } });
    await prisma.rol.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const permisosSchema = z.object({ claves: z.array(z.string()) });

// PUT /api/planeacion/roles/:id/permisos
router.put("/:id/permisos", requirePermiso("usuarios.roles"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { claves } = permisosSchema.parse(req.body);
    const rol = await prisma.rol.findUnique({ where: { id } });
    if (!rol) throw new HttpError(404, "Rol no encontrado");
    if (ROLES_SISTEMA.has(rol.nombre)) {
      throw new HttpError(400, "El rol ADMIN no se puede modificar (siempre tiene todos los permisos)");
    }
    await prisma.rolPermiso.deleteMany({ where: { rolId: id } });
    const permisos = await prisma.permiso.findMany({ where: { clave: { in: claves } } });
    if (permisos.length) {
      await prisma.rolPermiso.createMany({
        data: permisos.map((p) => ({ rolId: id, permisoId: p.id })),
        skipDuplicates: true,
      });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
