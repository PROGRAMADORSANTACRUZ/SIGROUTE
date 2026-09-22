// Historial de Cambios (invisible salvo ADMIN) — puerto de
// legacy_fastapi/app/routers/cambios.py. 404 si no es ADMIN (ni descubrible).
import { Router } from "express";
import { prismaPlan as prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.use((req, res, next) => {
  if (req.sessionUser?.role !== "ADMIN") return res.status(404).json({ error: "No encontrado" });
  next();
});

// GET /api/planeacion/cambios?limit=&modulo=&usuario=&q=&desde=&hasta=
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 300, 2000));
    const where: Record<string, unknown> = {};
    if (req.query.modulo) where.modulo = String(req.query.modulo);
    if (req.query.usuario) where.usuario = { contains: String(req.query.usuario), mode: "insensitive" };
    if (req.query.q) {
      const q = String(req.query.q);
      where.OR = [
        { contexto: { contains: q, mode: "insensitive" } },
        { campo: { contains: q, mode: "insensitive" } },
        { valorAnterior: { contains: q, mode: "insensitive" } },
        { valorNuevo: { contains: q, mode: "insensitive" } },
      ];
    }
    if (req.query.desde || req.query.hasta) {
      where.creadoAt = {
        ...(req.query.desde ? { gte: new Date(String(req.query.desde)) } : {}),
        ...(req.query.hasta ? { lte: new Date(String(req.query.hasta)) } : {}),
      };
    }
    const rows = await prisma.cambioLog.findMany({ where, orderBy: { creadoAt: "desc" }, take: limit });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
