// Predistribución — puerto simplificado de legacy_fastapi/app/predistribucion.py
// + app/repos/predist.py. El cálculo detallado de pivote (orden de compra Éxito
// vs maestro SIESA) se hace en el frontend a partir del Excel ya parseado; aquí
// se persiste el consolidado completo (JSONB) para reabrir sin re-subir, igual
// que el original.
import { Router } from "express";
import { z } from "zod";
import { prismaPlan as prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../../middleware/auth";

const router = Router();
router.use(requireAuth, requirePermiso("simulador.ver"));

// GET /api/planeacion/simulador/predistribucion/siesa — maestro PLU→SIESA
router.get("/siesa", async (_req, res, next) => {
  try {
    res.json(await prisma.predistSiesa.findMany({ orderBy: { plu: "asc" } }));
  } catch (err) {
    next(err);
  }
});

router.post("/siesa", requirePermiso("simulador.editar"), async (req, res, next) => {
  try {
    const data = z.object({ plu: z.string().min(1), siesa: z.string().min(1), nombre: z.string().optional() }).parse(req.body);
    const item = await prisma.predistSiesa.upsert({
      where: { plu: data.plu },
      update: { siesa: data.siesa, nombre: data.nombre },
      create: data,
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/simulador/predistribucion — historial de consolidados
router.get("/", async (_req, res, next) => {
  try {
    const consolidados = await prisma.predistConsolidado.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, ffin: true, archivo: true, usuario: true, nProductos: true, nTiendas: true, granTotal: true, tipo: true, grupo: true, createdAt: true },
    });
    res.json(consolidados);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const consolidado = await prisma.predistConsolidado.findUnique({ where: { id } });
    if (!consolidado) throw new HttpError(404, "Consolidado no encontrado");
    res.json(consolidado);
  } catch (err) {
    next(err);
  }
});

const guardarSchema = z.object({
  ffin: z.string().optional(),
  archivo: z.string().optional(),
  nProductos: z.number().default(0),
  nTiendas: z.number().default(0),
  granTotal: z.number().default(0),
  tipo: z.enum(["bovino", "porcino"]).optional(),
  grupo: z.string().optional(),
  datos: z.unknown(),
});

// POST /api/planeacion/simulador/predistribucion — guarda el consolidado completo.
router.post("/", requirePermiso("simulador.editar"), async (req, res, next) => {
  try {
    const data = guardarSchema.parse(req.body);
    const item = await prisma.predistConsolidado.create({
      data: { ...data, usuario: req.user!.username, datos: data.datos as never },
    });
    res.status(201).json({ id: item.id });
  } catch (err) {
    next(err);
  }
});

export default router;
