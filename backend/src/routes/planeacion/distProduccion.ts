// Distribución Producción — puerto simplificado de
// legacy_fastapi/app/dist_produccion.py + repos/dist_produccion.py. El cruce
// orden-de-compra (.xlsb) vs despacho-de-planta (.xlsx) se hace en el
// frontend (SheetJS ya es dependencia del proyecto); aquí se persiste el
// resultado (distribuido = min(planta, pedido) ya calculado) y se exporta.
import { Router } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
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

    const headers = ["Producto", ...tiendas];
    const dataRows: (string | number)[][] = productos.map((p) => [p, ...tiendas.map((t) => cell.get(`${p}|${t}`) ?? 0)]);
    const fechaStr = item.fecha.toISOString().slice(0, 10);

    const titulo = `Distribución Producción — ${fechaStr}`;
    const generado = `Generado por el software SIGROUTE — Grupo Santacruz · ${new Date().toLocaleString("es-CO")}`;
    const ws = XLSX.utils.aoa_to_sheet([[titulo], [generado], [], headers, ...dataRows]);
    const nCols = headers.length;

    const aplicar = (r: number, c: number, s: Record<string, unknown>) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      (ws[ref] as XLSX.CellObject & { s?: unknown }).s = s;
    };
    if (nCols > 1) {
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } }];
    }
    aplicar(0, 0, { font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: "14352A" } }, alignment: { vertical: "center", horizontal: "left", indent: 1 } });
    aplicar(1, 0, { font: { italic: true, sz: 10, color: { rgb: "5F7A68" } } });
    for (let c = 0; c < nCols; c++) {
      aplicar(3, c, { font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: "14352A" } }, alignment: { vertical: "center", horizontal: "center" } });
    }
    for (let r = 4; r < 4 + dataRows.length; r++) {
      for (let c = 0; c < nCols; c++) aplicar(r, c, { font: { sz: 11 } });
    }
    ws["!rows"] = [{ hpt: 24 }, { hpt: 16 }, { hpt: 6 }, { hpt: 22 }];
    ws["!cols"] = headers.map((h, i) => {
      let max = String(h).length;
      for (const row of dataRows) {
        const len = String(row[i] ?? "").length;
        if (len > max) max = len;
      }
      return { wch: Math.min(Math.max(max + 2, 10), 60) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Distribución");
    const buf = XLSXStyle.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="distribucion_${id}.xlsx"`);
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

export default router;
