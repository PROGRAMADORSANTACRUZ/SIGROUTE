// Simulador de Producción — puerto de legacy_fastapi/app/repos/simulador.py +
// app/simulador.py (fórmula: kg(producto,tienda) = kg_res(producto) × reses(tienda)
// si tienda ∈ surtido(producto)). Perfiles versionados por fecha de vigencia;
// las corridas guardan el perfil_id usado (trazabilidad).
import { Router } from "express";
import { z } from "zod";
import { prismaPlan as prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import predistribucionRouter from "./predistribucion";

const router = Router();
router.use(requireAuth, requirePermiso("simulador.ver"));

router.use("/predistribucion", predistribucionRouter);

// GET /api/planeacion/simulador/perfiles
router.get("/perfiles", async (_req, res, next) => {
  try {
    const perfiles = await prisma.simPerfil.findMany({
      orderBy: [{ vigenteDesde: "desc" }, { id: "desc" }],
      take: 50,
      include: { _count: { select: { productos: true, tiendas: true } } },
    });
    res.json(
      perfiles.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        vigenteDesde: p.vigenteDesde,
        origenArchivo: p.origenArchivo,
        activo: p.activo,
        usuario: p.usuario,
        createdAt: p.createdAt,
        nProductos: p._count.productos,
        nTiendas: p._count.tiendas,
      }))
    );
  } catch (err) {
    next(err);
  }
});

async function perfilVigenteId(fecha?: Date): Promise<number | null> {
  const p = await prisma.simPerfil.findFirst({
    where: { activo: true, vigenteDesde: { lte: fecha ?? new Date() } },
    orderBy: [{ vigenteDesde: "desc" }, { id: "desc" }],
  });
  return p?.id ?? null;
}

router.get("/perfiles/vigente", async (req, res, next) => {
  try {
    const fecha = req.query.fecha ? new Date(String(req.query.fecha)) : undefined;
    const id = await perfilVigenteId(fecha);
    res.json({ perfilId: id });
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/simulador/perfiles/:id — reconstruye el perfil completo
router.get("/perfiles/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const perfil = await prisma.simPerfil.findUnique({
      where: { id },
      include: {
        productos: { orderBy: [{ orden: "asc" }, { plu: "asc" }] },
        tiendas: { orderBy: [{ orden: "asc" }, { dep: "asc" }] },
        surtido: true,
      },
    });
    if (!perfil) throw new HttpError(404, "Perfil no encontrado");
    const surtido: Record<string, string[]> = {};
    for (const s of perfil.surtido) {
      (surtido[s.plu] ??= []).push(s.dep);
    }
    res.json({ ...perfil, surtido });
  } catch (err) {
    next(err);
  }
});

const productoSchema = z.object({
  plu: z.string().min(1),
  siesa: z.string().optional(),
  nombrePlanta: z.string().optional(),
  nombreExito: z.string().optional(),
  unidad: z.enum(["KG", "UND"]).default("KG"),
  kgRes: z.number().default(0),
  precio: z.number().default(0),
  orden: z.number().default(0),
});
const tiendaSchema = z.object({ dep: z.string().min(1), nombre: z.string().optional(), orden: z.number().default(0) });
const perfilSchema = z.object({
  nombre: z.string().min(1).default("Perfil"),
  origen: z.string().optional(),
  notas: z.string().optional(),
  vigenteDesde: z.string().optional(),
  productos: z.array(productoSchema),
  tiendas: z.array(tiendaSchema),
  surtido: z.record(z.string(), z.array(z.string())).default({}),
});

// POST /api/planeacion/simulador/perfiles — guarda un perfil nuevo (versión).
router.post("/perfiles", requirePermiso("simulador.editar"), async (req, res, next) => {
  try {
    const data = perfilSchema.parse(req.body);
    const perfil = await prisma.simPerfil.create({
      data: {
        nombre: data.nombre.slice(0, 120),
        vigenteDesde: data.vigenteDesde ? new Date(data.vigenteDesde) : new Date(),
        origenArchivo: data.origen?.slice(0, 200),
        notas: data.notas,
        usuario: req.user!.username,
        productos: { create: data.productos.map((p) => ({ ...p, plu: p.plu.slice(0, 30) })) },
        tiendas: { create: data.tiendas },
        surtido: {
          create: Object.entries(data.surtido).flatMap(([plu, deps]) => deps.map((dep) => ({ plu, dep }))),
        },
      },
    });
    res.status(201).json({ id: perfil.id });
  } catch (err) {
    next(err);
  }
});

router.patch("/perfiles/:id/productos/:plu", requirePermiso("simulador.editar"), async (req, res, next) => {
  try {
    const perfilId = Number(req.params.id);
    const plu = String(req.params.plu);
    const data = z.object({ kgRes: z.number().optional(), precio: z.number().optional(), unidad: z.enum(["KG", "UND"]).optional() }).parse(req.body);
    await prisma.simPerfilProducto.update({ where: { perfilId_plu: { perfilId, plu } }, data });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/planeacion/simulador/perfiles/:id/productos — agrega un producto manualmente
// al perfil (edición fila por fila, sin necesidad de reimportar el Excel completo).
router.post("/perfiles/:id/productos", requirePermiso("simulador.editar"), async (req, res, next) => {
  try {
    const perfilId = Number(req.params.id);
    const data = productoSchema.parse(req.body);
    await prisma.simPerfilProducto.create({ data: { ...data, plu: data.plu.slice(0, 30), perfilId } });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/planeacion/simulador/perfiles/:id/productos/:plu
router.delete("/perfiles/:id/productos/:plu", requirePermiso("simulador.editar"), async (req, res, next) => {
  try {
    const perfilId = Number(req.params.id);
    const plu = String(req.params.plu);
    await prisma.simPerfilSurtido.deleteMany({ where: { perfilId, plu } });
    await prisma.simPerfilProducto.delete({ where: { perfilId_plu: { perfilId, plu } } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/planeacion/simulador/perfiles/:id/tiendas — agrega una tienda manualmente.
router.post("/perfiles/:id/tiendas", requirePermiso("simulador.editar"), async (req, res, next) => {
  try {
    const perfilId = Number(req.params.id);
    const data = tiendaSchema.parse(req.body);
    await prisma.simPerfilTienda.create({ data: { ...data, perfilId } });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/planeacion/simulador/perfiles/:id/tiendas/:dep
router.delete("/perfiles/:id/tiendas/:dep", requirePermiso("simulador.editar"), async (req, res, next) => {
  try {
    const perfilId = Number(req.params.id);
    const dep = String(req.params.dep);
    await prisma.simPerfilSurtido.deleteMany({ where: { perfilId, dep } });
    await prisma.simPerfilTienda.delete({ where: { perfilId_dep: { perfilId, dep } } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/perfiles/:id/surtido", requirePermiso("simulador.editar"), async (req, res, next) => {
  try {
    const perfilId = Number(req.params.id);
    const { plu, dep, activo } = z.object({ plu: z.string(), dep: z.string(), activo: z.boolean() }).parse(req.body);
    if (activo) {
      await prisma.simPerfilSurtido.upsert({
        where: { perfilId_plu_dep: { perfilId, plu, dep } },
        update: {},
        create: { perfilId, plu, dep },
      });
    } else {
      await prisma.simPerfilSurtido.deleteMany({ where: { perfilId, plu, dep } });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/planeacion/simulador/calcular — no guarda, solo proyecta.
const calcularSchema = z.object({ perfilId: z.number(), reses: z.record(z.string(), z.number()) });
router.post("/calcular", async (req, res, next) => {
  try {
    const { perfilId, reses } = calcularSchema.parse(req.body);
    const perfil = await prisma.simPerfil.findUnique({
      where: { id: perfilId },
      include: { productos: true, tiendas: true, surtido: true },
    });
    if (!perfil) throw new HttpError(404, "Perfil no encontrado");
    const surtidoSet = new Set(perfil.surtido.map((s) => `${s.plu}|${s.dep}`));

    const detalle: { dep: string; tienda: string | null; plu: string; producto: string | null; unidad: string; reses: number; cantidad: number; valor: number }[] = [];
    let totalReses = 0;
    let totalKg = 0;
    let totalUnd = 0;
    let totalValor = 0;
    for (const t of perfil.tiendas) {
      const r = Number(reses[t.dep] ?? 0);
      if (r <= 0) continue;
      totalReses += r;
      for (const p of perfil.productos) {
        if (!surtidoSet.has(`${p.plu}|${t.dep}`)) continue;
        const cantidad = p.kgRes * r;
        const valor = cantidad * p.precio;
        if (p.unidad === "UND") totalUnd += cantidad;
        else totalKg += cantidad;
        totalValor += valor;
        detalle.push({ dep: t.dep, tienda: t.nombre, plu: p.plu, producto: p.nombrePlanta, unidad: p.unidad, reses: r, cantidad, valor });
      }
    }
    res.json({ detalle, totales: { reses: totalReses, kg: totalKg, und: totalUnd, valor: totalValor } });
  } catch (err) {
    next(err);
  }
});

const guardarCorridaSchema = z.object({
  perfilId: z.number(),
  fecha: z.string().optional(),
  titulo: z.string().optional(),
  detalle: z.array(z.object({
    dep: z.string().optional(), tienda: z.string().optional(), plu: z.string().optional(),
    producto: z.string().optional(), unidad: z.string().optional(), reses: z.number().optional(),
    cantidad: z.number().optional(), valor: z.number().optional(),
  })),
  totales: z.object({ reses: z.number(), kg: z.number(), und: z.number(), valor: z.number() }),
});

// POST /api/planeacion/simulador/corridas — guarda una Orden de Producción.
router.post("/corridas", requirePermiso("simulador.editar"), async (req, res, next) => {
  try {
    const data = guardarCorridaSchema.parse(req.body);
    const corrida = await prisma.$transaction(async (tx) => {
      const max = await tx.simCorrida.aggregate({ _max: { numero: true } });
      return tx.simCorrida.create({
        data: {
          perfilId: data.perfilId,
          fecha: data.fecha ? new Date(data.fecha) : new Date(),
          titulo: data.titulo,
          numero: (max._max.numero ?? 0) + 1,
          totalReses: data.totales.reses,
          totalKg: data.totales.kg,
          totalUnd: data.totales.und,
          totalValor: data.totales.valor,
          usuario: req.user!.username,
          detalle: { create: data.detalle },
        },
      });
    });
    res.status(201).json({ id: corrida.id, numero: corrida.numero });
  } catch (err) {
    next(err);
  }
});

router.get("/corridas", async (req, res, next) => {
  try {
    const take = Math.min(Number(req.query.limit) || 50, 500);
    const corridas = await prisma.simCorrida.findMany({ orderBy: { fecha: "desc" }, take });
    res.json(corridas);
  } catch (err) {
    next(err);
  }
});

router.get("/corridas/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const corrida = await prisma.simCorrida.findUnique({ where: { id }, include: { detalle: true, perfil: true } });
    if (!corrida) throw new HttpError(404, "Corrida no encontrada");
    res.json(corrida);
  } catch (err) {
    next(err);
  }
});

export default router;
