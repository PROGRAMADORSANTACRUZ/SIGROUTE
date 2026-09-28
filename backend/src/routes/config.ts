import { Router } from "express";
import { z } from "zod";
import { prismaPlan as prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../middleware/auth";
import { AUXILIARES_DEFAULT, RUTAS_DEFAULT, PLAN_NOMBRES_DEFAULT } from "../data/configDefaults";
import { detectarArea, type PuntoLatLng } from "../lib/geozonas";

const router = Router();

// ── Auxiliares ───────────────────────────────────────────────────────────────
const auxiliarSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(1),
  telefono: z.string().trim().optional().nullable(),
});

router.get("/auxiliares", requireAuth, async (_req, res, next) => {
  try {
    let items = await prisma.auxiliar.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    if (items.length === 0) {
      await prisma.auxiliar.createMany({
        data: AUXILIARES_DEFAULT.map((a, i) => ({ nombre: a.nombre, telefono: a.telefono ?? null, orden: i })),
      });
      items = await prisma.auxiliar.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    }
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// Reemplaza toda la lista de auxiliares con la enviada.
router.put("/auxiliares", requireAuth, requirePermiso("config.auxiliares.editar"), async (req, res, next) => {
  try {
    const parsed = z.array(auxiliarSchema).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Datos de auxiliares inválidos");
    await prisma.$transaction([
      prisma.auxiliar.deleteMany(),
      prisma.auxiliar.createMany({
        data: parsed.data.map((a, i) => ({ nombre: a.nombre, telefono: a.telefono ?? null, orden: i })),
      }),
    ]);
    res.json(await prisma.auxiliar.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] }));
  } catch (err) {
    next(err);
  }
});

// ── Rutas ────────────────────────────────────────────────────────────────────
const rutaSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(1),
  recorrido: z.string().trim().optional().nullable(),
  ciudad: z.string().trim().optional().nullable(),
  kls: z.coerce.number().optional().nullable(),
  tiempo: z.string().trim().optional().nullable(),
  grupo: z.string().trim().optional().nullable(),
});

router.get("/rutas", requireAuth, async (_req, res, next) => {
  try {
    let items = await prisma.ruta.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    if (items.length === 0) {
      await prisma.ruta.createMany({
        data: RUTAS_DEFAULT.map((r, i) => ({
          nombre: r.nombre, recorrido: r.recorrido ?? null, ciudad: r.ciudad ?? null,
          kls: r.kls ?? null, tiempo: r.tiempo ?? null, grupo: r.grupo ?? null, orden: i,
        })),
      });
      items = await prisma.ruta.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    }
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.put("/rutas", requireAuth, requirePermiso("config.rutas.editar"), async (req, res, next) => {
  try {
    const parsed = z.array(rutaSchema).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Datos de rutas inválidos");
    await prisma.$transaction([
      prisma.ruta.deleteMany(),
      prisma.ruta.createMany({
        data: parsed.data.map((r, i) => ({
          nombre: r.nombre, recorrido: r.recorrido ?? null, ciudad: r.ciudad ?? null,
          kls: r.kls ?? null, tiempo: r.tiempo ?? null, grupo: r.grupo ?? null, orden: i,
        })),
      }),
    ]);
    res.json(await prisma.ruta.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] }));
  } catch (err) {
    next(err);
  }
});

// ── Nombres de planes ────────────────────────────────────────────────────────
const planNombreSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(1),
  tipo: z.string().trim().optional().nullable(),
});

router.get("/plan-nombres", requireAuth, async (_req, res, next) => {
  try {
    let items = await prisma.planNombre.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    if (items.length === 0) {
      await prisma.planNombre.createMany({
        data: PLAN_NOMBRES_DEFAULT.map((p, i) => ({ nombre: p.nombre, tipo: p.tipo ?? null, orden: i })),
      });
      items = await prisma.planNombre.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    }
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.put("/plan-nombres", requireAuth, requirePermiso("config.plan_nombres.editar"), async (req, res, next) => {
  try {
    const parsed = z.array(planNombreSchema).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Datos de nombres de planes inválidos");
    await prisma.$transaction([
      prisma.planNombre.deleteMany(),
      prisma.planNombre.createMany({
        data: parsed.data.map((p, i) => ({ nombre: p.nombre, tipo: p.tipo ?? null, orden: i })),
      }),
    ]);
    res.json(await prisma.planNombre.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] }));
  } catch (err) {
    next(err);
  }
});

// ── Registro de cambios de despacho ──────────────────────────────────────────
const cambioSchema = z.object({
  tipo: z.enum(["movimiento", "anulacion", "reimpresion", "liberacion"]),
  remision: z.string().trim().optional().nullable(),
  deVehiculo: z.string().trim().optional().nullable(),
  aVehiculo: z.string().trim().optional().nullable(),
  dlOrigen: z.coerce.number().int().optional().nullable(),
  dlNuevo: z.coerce.number().int().optional().nullable(),
  detalle: z.string().trim().optional().nullable(),
});

router.get("/cambios", requireAuth, async (_req, res, next) => {
  try {
    res.json(await prisma.cambioDespacho.findMany({ orderBy: { createdAt: "desc" }, take: 500 }));
  } catch (err) {
    next(err);
  }
});

router.post("/cambios", requireAuth, requirePermiso("distrilog.planificacion_dl.editar"), async (req, res, next) => {
  try {
    const parsed = cambioSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const c = await prisma.cambioDespacho.create({
      data: {
        tipo: parsed.data.tipo,
        remision: parsed.data.remision ?? null,
        deVehiculo: parsed.data.deVehiculo ?? null,
        aVehiculo: parsed.data.aVehiculo ?? null,
        dlOrigen: parsed.data.dlOrigen ?? null,
        dlNuevo: parsed.data.dlNuevo ?? null,
        detalle: parsed.data.detalle ?? null,
      },
    });
    res.status(201).json(c);
  } catch (err) {
    next(err);
  }
});

router.patch("/cambios/:id", requireAuth, requirePermiso("distrilog.planificacion_dl.editar"), async (req, res, next) => {
  try {
    const hecho = req.body?.hecho;
    if (typeof hecho !== "boolean") throw new HttpError(400, "El campo 'hecho' debe ser booleano");
    const c = await prisma.cambioDespacho.update({ where: { id: String(req.params.id) }, data: { hecho } });
    res.json(c);
  } catch (err) {
    next(err);
  }
});

// Elimina los cambios ya marcados como hechos.
router.delete("/cambios/hechos", requireAuth, requirePermiso("distrilog.planificacion_dl.editar"), async (_req, res, next) => {
  try {
    const { count } = await prisma.cambioDespacho.deleteMany({ where: { hecho: true } });
    res.json({ eliminados: count });
  } catch (err) {
    next(err);
  }
});

// ── Geozonas ─────────────────────────────────────────────────────────────────
const puntoSchema = z.object({ lat: z.coerce.number(), lng: z.coerce.number() });
const geozonaSchema = z.object({
  nombre: z.string().trim().min(1).max(30),
  ciudad: z.string().trim().optional().nullable(),
  poligono: z.array(puntoSchema).min(3, "Un polígono necesita al menos 3 puntos"),
  color: z.string().trim().optional(),
  orden: z.coerce.number().int().optional(),
  activo: z.coerce.boolean().optional(),
});

router.get("/geozonas", requireAuth, async (_req, res, next) => {
  try {
    res.json(await prisma.geoZona.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] }));
  } catch (err) {
    next(err);
  }
});

router.post("/geozonas", requireAuth, requirePermiso("config.geozonas.editar"), async (req, res, next) => {
  try {
    const parsed = geozonaSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const gz = await prisma.geoZona.create({
      data: {
        nombre: parsed.data.nombre,
        ciudad: parsed.data.ciudad ?? null,
        poligono: parsed.data.poligono,
        color: parsed.data.color ?? undefined,
        orden: parsed.data.orden ?? 0,
        activo: parsed.data.activo ?? true,
      },
    });
    res.status(201).json(gz);
  } catch (err) {
    next(err);
  }
});

router.patch("/geozonas/:id", requireAuth, requirePermiso("config.geozonas.editar"), async (req, res, next) => {
  try {
    const parsed = geozonaSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const gz = await prisma.geoZona.update({
      where: { id: String(req.params.id) },
      data: {
        ...(parsed.data.nombre !== undefined ? { nombre: parsed.data.nombre } : {}),
        ...(parsed.data.ciudad !== undefined ? { ciudad: parsed.data.ciudad } : {}),
        ...(parsed.data.poligono !== undefined ? { poligono: parsed.data.poligono } : {}),
        ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
        ...(parsed.data.orden !== undefined ? { orden: parsed.data.orden } : {}),
        ...(parsed.data.activo !== undefined ? { activo: parsed.data.activo } : {}),
      },
    });
    res.json(gz);
  } catch (err) {
    next(err);
  }
});

router.delete("/geozonas/:id", requireAuth, requirePermiso("config.geozonas.editar"), async (req, res, next) => {
  try {
    await prisma.geoZona.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Recalcula Cliente.area y Orden.area para TODOS los registros, contra las
// geozonas activas actuales (point-in-polygon con turf.js) — se llama tras
// crear/editar/borrar una geozona, o manualmente desde el módulo Geozonas.
router.post("/geozonas/recalcular", requireAuth, requirePermiso("config.geozonas.editar"), async (_req, res, next) => {
  try {
    const geozonas = await prisma.geoZona.findMany({
      where: { activo: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    });
    const geozonasParaMatch = geozonas.map((g) => ({
      id: g.id,
      nombre: g.nombre,
      poligono: g.poligono as unknown as PuntoLatLng[],
    }));

    const clientes = await prisma.cliente.findMany({ where: { activo: true }, select: { id: true, lat: true, lon: true, area: true } });
    const idsPorArea = new Map<string | null, string[]>();
    let clientesActualizados = 0;
    for (const c of clientes) {
      const lat = c.lat ? parseFloat(c.lat) : NaN;
      const lon = c.lon ? parseFloat(c.lon) : NaN;
      const nuevaArea = detectarArea(lat, lon, geozonasParaMatch);
      if (nuevaArea !== c.area) {
        clientesActualizados++;
        const arr = idsPorArea.get(nuevaArea) ?? [];
        arr.push(c.id);
        idsPorArea.set(nuevaArea, arr);
      }
    }
    for (const [area, ids] of idsPorArea) {
      await prisma.cliente.updateMany({ where: { id: { in: ids } }, data: { area } });
    }

    // Propaga el área del cliente a cada Orden asociada (clienteSistemaId ===
    // Cliente.id); las órdenes sin cliente resuelto (sinResolver) quedan null.
    // Se agrupa por área para actualizar en pocas consultas masivas en vez de
    // una por cliente (evita miles de round-trips al Postgres remoto).
    const clientesConArea = await prisma.cliente.findMany({ where: { activo: true }, select: { id: true, area: true } });
    const clientesIdsPorArea = new Map<string | null, string[]>();
    for (const c of clientesConArea) {
      const arr = clientesIdsPorArea.get(c.area) ?? [];
      arr.push(c.id);
      clientesIdsPorArea.set(c.area, arr);
    }
    let ordenesActualizadas = 0;
    for (const [area, clienteIds] of clientesIdsPorArea) {
      const { count } = await prisma.orden.updateMany({
        where: { clienteSistemaId: { in: clienteIds }, area: { not: area } },
        data: { area },
      });
      ordenesActualizadas += count;
    }

    res.json({ geozonas: geozonas.length, clientesActualizados, ordenesActualizadas });
  } catch (err) {
    next(err);
  }
});

export default router;
