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

// Catálogo de permisos agrupado por módulo y submódulo (para la UI de
// checkboxes de Roles y permisos): cada módulo de primer nivel (Planeación,
// Ejecución, Plantillas TAT, Configuración, Dashboard) agrupa submódulos, y
// cada submódulo trae sus claves de permiso. Permite marcar/desmarcar un
// módulo entero o cada submódulo por separado.
export interface SubModulo { label: string; claves: string[] }
export interface ModuloGrupo { label: string; submodulos: SubModulo[] }

export const MODULOS: ModuloGrupo[] = [
  {
    label: "Planeación",
    submodulos: [
      { label: "Planificación", claves: ["programacion.ver", "programacion.editar", "programacion.cerrar_area", "programacion.reabrir_area"] },
      { label: "Distribución Producción", claves: ["distribucion.ver", "distribucion.editar"] },
      { label: "Simulador de Producción", claves: ["simulador.ver", "simulador.editar"] },
      { label: "Preasignación", claves: ["asignacion.ver", "asignacion.editar"] },
      { label: "Áreas para Cargar", claves: ["areas.ver", "areas.confirmar_carga", "areas.reabrir_carga", "areas.editar_kls", "areas.exportar"] },
      { label: "Resumen del Día", claves: ["resumen.ver", "resumen.exportar"] },
      { label: "Maestros", claves: ["maestros.ver", "maestros.editar", "maestros.eliminar"] },
      { label: "Reportes", claves: ["reportes.ver", "reportes.exportar"] },
    ],
  },
  {
    label: "Ejecución",
    submodulos: [
      { label: "Cargar Órdenes", claves: ["distrilog.ordenes.ver", "distrilog.ordenes.editar"] },
      { label: "Asignación de órdenes", claves: ["distrilog.asignacion.ver", "distrilog.asignacion.editar"] },
      { label: "Diagrama", claves: ["distrilog.planes.ver", "distrilog.planes.editar"] },
      { label: "Planificación D.L.", claves: ["distrilog.planificacion_dl.ver", "distrilog.planificacion_dl.editar"] },
      { label: "Históricos", claves: ["distrilog.historicos.ver"] },
      { label: "Nivel de servicio", claves: ["distrilog.nivel_servicio.ver", "distrilog.nivel_servicio.editar"] },
      { label: "Run Errands", claves: ["distrilog.errands.ver", "distrilog.errands.editar"] },
    ],
  },
  {
    label: "Plantillas TAT",
    submodulos: [
      { label: "Plantillas TAT (Agropecuaria e Inversiones)", claves: ["plantillas_tat.ver", "plantillas_tat.editar"] },
    ],
  },
  {
    label: "Configuración",
    submodulos: [
      { label: "Usuarios y roles", claves: ["usuarios.ver", "usuarios.crear", "usuarios.editar", "usuarios.roles"] },
      { label: "Auditoría", claves: ["auditoria.ver"] },
      { label: "Clientes", claves: ["config.clientes.ver", "config.clientes.editar"] },
      { label: "Vehículos", claves: ["config.vehiculos.ver", "config.vehiculos.editar"] },
      { label: "Conductores", claves: ["config.conductores.ver", "config.conductores.editar"] },
      { label: "Auxiliares", claves: ["config.auxiliares.ver", "config.auxiliares.editar"] },
      { label: "Rutas", claves: ["config.rutas.ver", "config.rutas.editar"] },
      { label: "Nombres de planes", claves: ["config.plan_nombres.ver", "config.plan_nombres.editar"] },
    ],
  },
  {
    label: "Dashboard",
    submodulos: [
      { label: "Ejecución", claves: ["dashboard.ejecucion.ver"] },
      { label: "Planeación", claves: ["dashboard.planeacion.ver"] },
      { label: "Run Errands", claves: ["dashboard.errands.ver"] },
      { label: "Comparativo", claves: ["dashboard.comparativo.ver"] },
    ],
  },
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
