import { Router } from "express";
import { env } from "../config/env";
import { prismaPlan as prisma } from "../lib/prisma";

// Resumen ejecutivo para "Estadísticas generales" de la Suite (secreto SSO).
const router = Router();

router.use((req, res, next) => {
  const secret = (env.SSO_SHARED_SECRET || "").trim();
  const provided = String(req.header("X-SSO-Secret") || "").trim();
  if (!secret || secret !== provided) {
    return res.status(401).json({ error: "No autorizado" });
  }
  next();
});

router.get("/", async (_req, res, next) => {
  try {
    // Orden.fecha se guarda como texto DD/MM/YYYY.
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" })
      .format(new Date())
      .split("-");
    const hoy = `${d}/${m}/${y}`;

    const [ordenesHoy, sinAsignar, entregadas, novedades] = await Promise.all([
      prisma.orden.aggregate({ where: { fecha: hoy }, _count: { _all: true }, _sum: { cantidadKg: true } }),
      prisma.orden.count({ where: { fecha: hoy, asignadoVehiculo: null } }),
      prisma.orden.count({ where: { fecha: hoy, estado: "Entregado" } }),
      prisma.novedad.count({ where: { estado: "Pendiente" } }),
    ]);

    const kg = Math.round(ordenesHoy._sum.cantidadKg ?? 0);
    res.json({
      metrics: [
        { key: "ordenes_hoy", label: "Órdenes hoy", value: ordenesHoy._count._all, hint: `${entregadas} entregadas` },
        { key: "kg_hoy", label: "Kg a despachar", value: kg, format: "kg" },
        { key: "sin_asignar", label: "Sin vehículo", value: sinAsignar, tone: sinAsignar > 0 ? "warn" : "default" },
        { key: "novedades_pendientes", label: "Novedades pendientes", value: novedades, tone: novedades > 0 ? "warn" : "default" },
      ],
    });
  } catch (err) {
    next(err);
  }
});

export default router;
