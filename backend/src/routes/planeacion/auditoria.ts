// Auditoría (solo lectura) — puerto de legacy_fastapi/app/routers/auditoria.py.
import { Router } from "express";
import { prismaPlan as prisma } from "../../lib/prisma";
import { requireAuth, requirePermiso } from "../../middleware/auth";

const router = Router();
router.use(requireAuth, requirePermiso("auditoria.ver"));

// GET /api/planeacion/auditoria?limit=&modulo=&usuario=&desde=&hasta=
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 200, 1000));
    const where: Record<string, unknown> = {};
    if (req.query.modulo) where.modulo = String(req.query.modulo);
    if (req.query.usuario) where.usuario = { contains: String(req.query.usuario), mode: "insensitive" };
    if (req.query.desde || req.query.hasta) {
      where.fecha = {
        ...(req.query.desde ? { gte: new Date(String(req.query.desde)) } : {}),
        ...(req.query.hasta ? { lte: new Date(String(req.query.hasta)) } : {}),
      };
    }
    const rows = await prisma.auditLog.findMany({ where, orderBy: { fecha: "desc" }, take: limit });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/modulos", async (_req, res, next) => {
  try {
    const rows = await prisma.auditLog.findMany({ where: { modulo: { not: null } }, distinct: ["modulo"], select: { modulo: true } });
    res.json(rows.map((r) => r.modulo).sort());
  } catch (err) {
    next(err);
  }
});

export default router;
