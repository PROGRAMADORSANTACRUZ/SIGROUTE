// Distribución Producción — puerto simplificado de
// legacy_fastapi/app/dist_produccion.py + repos/dist_produccion.py. El cruce
// orden-de-compra (.xlsb) vs despacho-de-planta (.xlsx) se hace en el
// frontend (SheetJS ya es dependencia del proyecto); aquí se persiste el
// resultado (distribuido = min(planta, pedido) ya calculado) y se exporta.
import { Router } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import { prismaPlan as prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../../middleware/auth";

const router = Router();
router.use(requireAuth, requirePermiso("distribucion.ver"));

// GET /api/planeacion/distribucion-produccion — historial de cruces guardados
router.get("/", async (_req, res, next) => {
  try {
    const items = await prisma.distProduccion.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = await prisma.distProduccion.findUnique({ where: { id }, include: { detalle: true } });
    if (!item) throw new HttpError(404, "Registro no encontrado");
    res.json(item);
  } catch (err) {
    next(err);
  }
});

const detalleSchema = z.object({
  dep: z.string().optional(),
  tienda: z.string().optional(),
  enOrden: z.boolean().default(false),
  plu: z.string().optional(),
  producto: z.string().optional(),
  pedido: z.number().default(0),
  planta: z.number().default(0),
});

const guardarSchema = z.object({
  fecha: z.string().optional(),
  nit: z.string().optional(),
  ordenArchivo: z.string().optional(),
  plantaArchivo: z.string().optional(),
  detalle: z.array(detalleSchema),
});

// POST /api/planeacion/distribucion-produccion — guarda el cruce (distribuido = min(planta,pedido))
router.post("/", requirePermiso("distribucion.editar"), async (req, res, next) => {
  try {
    const data = guardarSchema.parse(req.body);
    const detalle = data.detalle.map((d) => ({ ...d, distribuido: Math.min(d.planta, d.pedido) }));
    const totalPedido = detalle.reduce((acc, d) => acc + d.pedido, 0);
    const totalPlanta = detalle.reduce((acc, d) => acc + d.planta, 0);
    const totalDistribuido = detalle.reduce((acc, d) => acc + d.distribuido, 0);

    const item = await prisma.distProduccion.create({
      data: {
        fecha: data.fecha ? new Date(data.fecha) : new Date(),
        nit: data.nit,
        ordenArchivo: data.ordenArchivo,
        plantaArchivo: data.plantaArchivo,
        totalPedido,
        totalPlanta,
        totalDistribuido,
        totalExcedente: Math.max(0, totalPlanta - totalPedido),
        totalFaltante: Math.max(0, totalPedido - totalPlanta),
        usuario: req.user!.username,
        detalle: { create: detalle },
      },
    });
    res.status(201).json({ id: item.id });
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/distribucion-produccion/:id/export.xlsx — pivote producto×tienda
router.get("/:id/export.xlsx", requirePermiso("distribucion.ver"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = await prisma.distProduccion.findUnique({ where: { id }, include: { detalle: true } });
    if (!item) throw new HttpError(404, "Registro no encontrado");

    const tiendas = [...new Set(item.detalle.map((d) => d.tienda ?? ""))];
    const productos = [...new Set(item.detalle.map((d) => d.producto ?? ""))];
    const cell = new Map(item.detalle.map((d) => [`${d.producto}|${d.tienda}`, d.distribuido ?? 0]));

    const rows: (string | number)[][] = [["Producto", ...tiendas]];
    for (const p of productos) {
      rows.push([p, ...tiendas.map((t) => cell.get(`${p}|${t}`) ?? 0)]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Distribución");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="distribucion_${id}.xlsx"`);
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

export default router;
