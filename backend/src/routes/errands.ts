// Errands — pedidos ad-hoc de un Punto de Venta hacia un Destino/Cliente
// propios, exportables a Excel formato Free_Order. Puerto de
// SIGLOG-ANTIGUO/boletas-app/run-errands (misma lógica, tablas propias
// nuevas en la BD de Planeación — ver schema.plan.prisma).
import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
import { prismaPlan as prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../middleware/auth";
import { sincronizarClienteDrivin, crearPedidoDrivin } from "../lib/drivin";

const router = Router();
router.use(requireAuth, requirePermiso("distrilog.errands.ver"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function norm(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .trim();
}
function getVal(fila: Record<string, unknown>, ...keys: string[]): string {
  for (const k of Object.keys(fila)) {
    if (keys.includes(norm(k))) return String(fila[k] ?? "").trim();
  }
  return "";
}

// ── Puntos de Venta ───────────────────────────────────────────────────────

router.get("/puntos-venta", async (req, res, next) => {
  try {
    const todos = req.query.todos === "1";
    const items = await prisma.errandsPuntoVenta.findMany({
      where: todos ? {} : { activo: true },
      orderBy: { indicador: "asc" },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.post("/puntos-venta", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    const { nombre } = z.object({ nombre: z.string().trim().min(1) }).parse(req.body);
    const max = await prisma.errandsPuntoVenta.aggregate({ _max: { indicador: true } });
    const pdv = await prisma.errandsPuntoVenta.create({ data: { nombre, indicador: (max._max.indicador ?? 0) + 1 } });
    res.status(201).json(pdv);
  } catch (err) {
    next(err);
  }
});

router.put("/puntos-venta/:id", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = z.object({ nombre: z.string().trim().min(1).optional(), activo: z.boolean().optional() }).parse(req.body);
    const pdv = await prisma.errandsPuntoVenta.update({ where: { id }, data });
    res.json(pdv);
  } catch (err) {
    next(err);
  }
});

router.delete("/puntos-venta/:id", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.errandsPuntoVenta.update({ where: { id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Domiciliarios ──────────────────────────────────────────────────────────

function normalizarPdvNombre(s: string): string {
  return norm(s)
    .replace(/\bpdv\b/g, "")
    .replace(/carnes\s+santacruz/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

router.get("/domiciliarios", async (req, res, next) => {
  try {
    const todos = req.query.todos === "1";
    const pdv = String(req.query.pdv ?? "");
    const items = await prisma.errandsDomiciliario.findMany({
      where: {
        ...(todos ? {} : { activo: true }),
        ...(pdv === "SIN" ? { puntoVentaId: null } : pdv && pdv !== "TODOS" ? { puntoVentaId: Number(pdv) } : {}),
      },
      include: { puntoVenta: true },
      orderBy: { nombre: "asc" },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

const domiciliarioSchema = z.object({
  nombre: z.string().trim().min(1),
  telefono: z.string().trim().optional(),
  cedula: z.string().trim().optional(),
  email: z.string().trim().optional(),
  puntoVentaId: z.number().nullable().optional(),
});

router.post("/domiciliarios", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    const data = domiciliarioSchema.parse(req.body);
    const domiciliario = await prisma.errandsDomiciliario.create({ data, include: { puntoVenta: true } });
    res.status(201).json(domiciliario);
  } catch (err) {
    next(err);
  }
});

router.put("/domiciliarios/:id", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = domiciliarioSchema.partial().extend({ activo: z.boolean().optional() }).parse(req.body);
    const domiciliario = await prisma.errandsDomiciliario.update({ where: { id }, data, include: { puntoVenta: true } });
    res.json(domiciliario);
  } catch (err) {
    next(err);
  }
});

router.delete("/domiciliarios/:id", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    await prisma.errandsDomiciliario.update({ where: { id: Number(req.params.id) }, data: { activo: false } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/domiciliarios/borrar-todos", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    if (req.sessionUser?.role !== "ADMIN") throw new HttpError(403, "Requiere rol administrador");
    const { count } = await prisma.errandsDomiciliario.deleteMany({});
    res.json({ eliminados: count });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/domiciliarios/carga-masiva",
  requirePermiso("distrilog.errands.editar"),
  upload.single("archivo"),
  async (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, "No se recibió ningún archivo");
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      if (!filas.length) throw new HttpError(400, "El archivo está vacío");

      const pdvs = await prisma.errandsPuntoVenta.findMany();
      const pdvPorNombre = new Map(pdvs.map((p) => [normalizarPdvNombre(p.nombre), p.id]));

      let insertados = 0;
      let actualizados = 0;
      let sinPdv = 0;
      const errores: string[] = [];

      for (let i = 0; i < filas.length; i++) {
        const fila = filas[i];
        const nombres = getVal(fila, "nombres", "nombre");
        const apellidos = getVal(fila, "apellidos", "apellido");
        const nombre = `${nombres} ${apellidos}`.trim() || getVal(fila, "nombre completo");
        const telefono = getVal(fila, "celular", "telefono", "movil").replace(/\.0$/, "");
        const cedula = getVal(fila, "dni", "cedula", "cédula", "documento").replace(/\.0$/, "");
        const email = getVal(fila, "correo electronico", "correo", "email");
        const depositoRaw = getVal(fila, "depositos", "deposito", "punto de venta", "pdv");
        const activoRaw = getVal(fila, "activo");
        const activo = activoRaw ? /^(true|si|sí|1|activo)$/i.test(activoRaw) : true;

        if (!nombre) {
          errores.push(`Fila ${i + 2}: sin nombre`);
          continue;
        }
        let puntoVentaId: number | null = null;
        if (depositoRaw) {
          puntoVentaId = pdvPorNombre.get(normalizarPdvNombre(depositoRaw)) ?? null;
          if (puntoVentaId === null) sinPdv++;
        }
        try {
          const existente = cedula ? await prisma.errandsDomiciliario.findFirst({ where: { cedula } }) : null;
          if (existente) {
            await prisma.errandsDomiciliario.update({
              where: { id: existente.id },
              data: { nombre, telefono: telefono || existente.telefono, email: email || existente.email, puntoVentaId: puntoVentaId ?? existente.puntoVentaId, activo },
            });
            actualizados++;
          } else {
            await prisma.errandsDomiciliario.create({ data: { nombre, telefono, cedula, email, puntoVentaId, activo } });
            insertados++;
          }
        } catch (e) {
          errores.push(`Fila ${i + 2}: ${e instanceof Error ? e.message : "error"}`);
        }
      }

      res.json({ total: filas.length, insertados, actualizados, sinPdv, errores: errores.length, detalleErrores: errores.slice(0, 15) });
    } catch (err) {
      next(err);
    }
  }
);

// ── Clientes (destinos) ───────────────────────────────────────────────────

router.get("/clientes", async (req, res, next) => {
  try {
    const buscar = String(req.query.buscar ?? "").trim();
    const todos = req.query.todos === "1";
    const items = await prisma.errandsCliente.findMany({
      where: {
        ...(todos ? {} : { activo: true }),
        ...(buscar
          ? {
              OR: [
                { nombre: { contains: buscar, mode: "insensitive" } },
                { codigo: { contains: buscar, mode: "insensitive" } },
                { direccion: { contains: buscar, mode: "insensitive" } },
                { barrio: { contains: buscar, mode: "insensitive" } },
                { ciudad: { contains: buscar, mode: "insensitive" } },
                { region: { contains: buscar, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: "asc" },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get("/clientes/:id", async (req, res, next) => {
  try {
    const cliente = await prisma.errandsCliente.findUnique({ where: { id: Number(req.params.id) } });
    if (!cliente) throw new HttpError(404, "Cliente no encontrado");
    res.json(cliente);
  } catch (err) {
    next(err);
  }
});

const clienteSchema = z.object({
  nombre: z.string().trim().min(1),
  direccion: z.string().trim().optional(),
  referencia: z.string().trim().optional(),
  barrio: z.string().trim().optional(),
  ciudad: z.string().trim().optional(),
  region: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  email: z.string().trim().optional(),
  observaciones: z.string().trim().optional(),
});

async function siguienteCodigoCliente(): Promise<string> {
  const rows = await prisma.errandsCliente.findMany({ select: { codigo: true } });
  let max = 0;
  for (const r of rows) {
    const m = /^ERR(\d+)$/.exec(r.codigo);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `ERR${String(max + 1).padStart(5, "0")}`;
}

router.post("/clientes", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    const data = clienteSchema.parse(req.body);
    const codigo = await siguienteCodigoCliente();
    const cliente = await prisma.errandsCliente.create({ data: { ...data, codigo } });
    const drivin = await sincronizarClienteDrivin({ codigo, ...data });
    res.status(201).json({ ...cliente, drivinOk: drivin.ok, drivinMensaje: drivin.mensaje });
  } catch (err) {
    next(err);
  }
});

router.put("/clientes/:id", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = clienteSchema.partial().extend({ activo: z.boolean().optional() }).parse(req.body);
    const cliente = await prisma.errandsCliente.update({ where: { id }, data });
    const drivin = await sincronizarClienteDrivin({
      codigo: cliente.codigo, nombre: cliente.nombre, direccion: cliente.direccion,
      barrio: cliente.barrio, ciudad: cliente.ciudad, region: cliente.region,
      telefono: cliente.telefono, email: cliente.email,
    });
    res.json({ ...cliente, drivinOk: drivin.ok, drivinMensaje: drivin.mensaje });
  } catch (err) {
    next(err);
  }
});

router.delete("/clientes/:id", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    await prisma.errandsCliente.update({ where: { id: Number(req.params.id) }, data: { activo: false } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/clientes/borrar-todos", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    if (req.sessionUser?.role !== "ADMIN") throw new HttpError(403, "Requiere rol administrador");
    await prisma.errandsPedido.deleteMany({});
    const { count } = await prisma.errandsCliente.deleteMany({});
    res.json({ eliminados: count });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/clientes/carga-masiva",
  requirePermiso("distrilog.errands.editar"),
  upload.single("archivo"),
  async (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, "No se recibió ningún archivo");
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      if (!filas.length) throw new HttpError(400, "El archivo está vacío");

      let insertados = 0;
      let actualizados = 0;
      const errores: string[] = [];

      for (let i = 0; i < filas.length; i++) {
        const fila = filas[i];
        const nombre = getVal(fila, "nombre", "cliente", "razon social", "razon_social", "destino");
        const codigoRaw = getVal(fila, "codigo", "código", "nit_cedula", "nit cedula", "cedula", "nit").replace(/\.0$/, "");
        const direccion = getVal(fila, "direccion", "dir");
        const referencia = getVal(fila, "referencia", "ref");
        const barrio = getVal(fila, "barrio", "sector", "zona");
        const ciudad = getVal(fila, "ciudad", "municipio");
        const region = getVal(fila, "region", "región", "departamento", "depto", "dpto", "provincia");
        const telefono = getVal(fila, "telefono", "celular", "tel", "movil", "whatsapp").replace(/\.0$/, "");
        const email = getVal(fila, "email", "correo", "e-mail");
        const observaciones = getVal(fila, "observaciones", "obs", "nota", "notas");

        if (!nombre) {
          errores.push(`Fila ${i + 2}: sin nombre`);
          continue;
        }
        try {
          const existente = codigoRaw ? await prisma.errandsCliente.findUnique({ where: { codigo: codigoRaw } }) : null;
          if (existente) {
            await prisma.errandsCliente.update({
              where: { id: existente.id },
              data: { nombre, direccion: direccion || existente.direccion, referencia: referencia || existente.referencia, barrio: barrio || existente.barrio, ciudad: ciudad || existente.ciudad, region: region || existente.region, telefono: telefono || existente.telefono, email: email || existente.email, activo: true },
            });
            actualizados++;
          } else {
            const codigo = codigoRaw || (await siguienteCodigoCliente());
            await prisma.errandsCliente.create({ data: { codigo, nombre, direccion, referencia, barrio, ciudad, region, telefono, email, observaciones } });
            insertados++;
          }
        } catch (e) {
          errores.push(`Fila ${i + 2}: ${e instanceof Error ? e.message : "error"}`);
        }
      }

      res.json({ total: filas.length, insertados, actualizados, errores: errores.length, detalleErrores: errores.slice(0, 15) });
    } catch (err) {
      next(err);
    }
  }
);

// ── Pedidos ────────────────────────────────────────────────────────────────

async function siguienteNumeroPedido(): Promise<string> {
  const rows = await prisma.errandsPedido.findMany({ select: { numeroPedido: true } });
  let max = 0;
  for (const r of rows) {
    const m = /^OSRun(\d+)$/.exec(r.numeroPedido);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `OSRun${String(max + 1).padStart(5, "0")}`;
}

router.get("/pedidos", async (req, res, next) => {
  try {
    const { estado, desde, hasta, pdv } = req.query;
    const where: Record<string, unknown> = {};
    if (pdv && pdv !== "TODOS") where.puntoVentaId = Number(pdv);
    if (estado && estado !== "TODOS") where.estado = String(estado);
    if (desde || hasta) {
      where.fecha = {
        ...(desde ? { gte: new Date(String(desde)) } : {}),
        ...(hasta ? { lte: new Date(new Date(String(hasta)).setHours(23, 59, 59, 999)) } : {}),
      };
    }
    const pedidos = await prisma.errandsPedido.findMany({
      where,
      include: { cliente: true, puntoVenta: true, domiciliario: true },
      orderBy: { fecha: "desc" },
    });
    res.json(pedidos);
  } catch (err) {
    next(err);
  }
});

router.get("/pedidos-next-numero", async (_req, res, next) => {
  try {
    res.json({ numeroPedido: await siguienteNumeroPedido() });
  } catch (err) {
    next(err);
  }
});

router.get("/pedidos/:id", async (req, res, next) => {
  try {
    const pedido = await prisma.errandsPedido.findUnique({ where: { id: Number(req.params.id) }, include: { cliente: true, puntoVenta: true, domiciliario: true } });
    if (!pedido) throw new HttpError(404, "Pedido no encontrado");
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

const ESTADOS_PEDIDO = ["PENDIENTE", "EN_PROCESO", "ENTREGADO", "CANCELADO", "EDITADO", "REVISADO"] as const;

const pedidoSchema = z.object({
  clienteId: z.number(),
  puntoVentaId: z.number().nullable().optional(),
  domiciliarioId: z.number().nullable().optional(),
  kilos: z.number().optional(),
  estado: z.enum(ESTADOS_PEDIDO).optional(),
  observaciones: z.string().trim().optional(),
});

router.post("/pedidos", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    const body = z.object({ pedidos: z.array(pedidoSchema).min(1) }).safeParse(req.body);
    const filas = body.success ? body.data.pedidos : [pedidoSchema.parse(req.body)];

    const creados = [];
    for (const data of filas) {
      const numeroPedido = await siguienteNumeroPedido();
      const pedido = await prisma.errandsPedido.create({
        data: {
          numeroPedido,
          clienteId: data.clienteId,
          puntoVentaId: data.puntoVentaId ?? null,
          domiciliarioId: data.domiciliarioId ?? null,
          kilos: data.kilos ?? 1,
          estado: data.estado ?? "REVISADO",
          observaciones: data.observaciones ?? null,
          usuario: req.user!.username,
        },
        include: { cliente: true, puntoVenta: true, domiciliario: true },
      });
      // Best-effort: crea el pedido como orden real en Drivin (no bloquea si falla).
      await crearPedidoDrivin({
        clienteCodigo: pedido.cliente.codigo,
        numeroPedido: pedido.numeroPedido,
        kilos: pedido.kilos,
        fecha: pedido.fecha.toISOString().slice(0, 10),
      });
      creados.push(pedido);
    }
    res.status(201).json(body.success ? { creados } : creados[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/pedidos/:id", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = pedidoSchema.partial().parse(req.body);
    const pedido = await prisma.errandsPedido.update({ where: { id }, data, include: { cliente: true, puntoVenta: true, domiciliario: true } });
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

router.put("/pedidos/:id/estado", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { estado } = z.object({ estado: z.enum(ESTADOS_PEDIDO) }).parse(req.body);
    const pedido = await prisma.errandsPedido.update({ where: { id }, data: { estado } });
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

router.delete("/pedidos/:id", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    await prisma.errandsPedido.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/pedidos/borrar-todos", requirePermiso("distrilog.errands.editar"), async (req, res, next) => {
  try {
    if (req.sessionUser?.role !== "ADMIN") throw new HttpError(403, "Requiere rol administrador");
    const { count } = await prisma.errandsPedido.deleteMany({});
    res.json({ eliminados: count });
  } catch (err) {
    next(err);
  }
});

// Exporta al formato "Free_Order" (mismo layout que usan Drivin/SimpliRoute).
router.post("/pedidos/export-free-order", async (req, res, next) => {
  try {
    const { ids } = z.object({ ids: z.array(z.number()).min(1) }).parse(req.body);
    const pedidos = await prisma.errandsPedido.findMany({
      where: { id: { in: ids } },
      include: { cliente: true, puntoVenta: true },
      orderBy: { id: "asc" },
    });
    if (!pedidos.length) throw new HttpError(404, "Pedidos no encontrados");

    const headers = [
      "Fecha Maxima de Entrega", "Nombre Plan", "Esquema", "Código de despacho*", "Unidades_1*", "Unidades_2", "Unidades_3", "Prioridad",
      "Código de dirección*", "Nombre dirección", "Nombre cliente", "Tipo", "Dirección 1*", "Referencias", "Descripción", "Comuna*", "Provincia", "Región", "País*",
      "Código Postal", "Latitud", "Longitud", "Tiempo de servicio", "Inicio Ventana 1", "Fin Ventana 1", "Características", "Asignación vehículo",
      "Telefono de Contacto", "Email de Contacto", "Unidades del artículo", "Código del artículo", "Descripción del artículo", "Exclusividad", "Posicion", "Proveedor",
      "Inicio ventana 2", "Fin ventana 2", "Código cliente", "Nombre de contacto", "Código Alternativo",
    ];
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const fmtFecha = (d: Date) => `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
    const fmtHora = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

    const aoa: (string | number)[][] = [headers];
    for (const p of pedidos) {
      const fecha = p.fecha;
      const nombre = p.cliente.nombre;
      const referencias = `${nombre}${p.cliente.referencia ? " / " + p.cliente.referencia : " / "}`;
      const pdv = p.puntoVenta ? `PDV ${p.puntoVenta.nombre}`.replace(/^PDV PDV /, "PDV ") : "";
      const row = new Array(headers.length).fill("");
      row[0] = fmtFecha(fecha);
      row[3] = `OS${p.numeroPedido.replace(/^OS/i, "")}`;
      row[4] = p.kilos || 1;
      row[5] = 0;
      row[6] = 0;
      row[7] = 5;
      row[8] = p.cliente.codigo;
      row[9] = nombre;
      row[10] = nombre;
      row[12] = p.cliente.direccion ?? "";
      row[13] = referencias;
      row[15] = p.cliente.barrio ?? "";
      row[16] = p.cliente.ciudad ?? "";
      row[17] = p.cliente.region ?? "";
      row[18] = "Colombia";
      row[22] = 10;
      row[23] = fmtHora(fecha);
      row[24] = "23:59";
      row[27] = p.cliente.telefono ?? "";
      row[28] = p.cliente.email ?? "";
      row[34] = pdv;
      row[37] = p.cliente.codigo;
      row[38] = nombre;
      aoa.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (let i = 1; i < aoa.length; i++) {
      for (const col of [0, 23, 24]) {
        const cell = XLSX.utils.encode_cell({ r: i, c: col });
        if (ws[cell]) { ws[cell].t = "s"; ws[cell].z = "@"; }
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Free_Order");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Free_Order.xlsx"');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

// ── Dashboard ──────────────────────────────────────────────────────────────

router.get("/dashboard", async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    const where: Record<string, unknown> = {};
    if (desde || hasta) {
      where.fecha = {
        ...(desde ? { gte: new Date(String(desde)) } : {}),
        ...(hasta ? { lte: new Date(new Date(String(hasta)).setHours(23, 59, 59, 999)) } : {}),
      };
    }
    const pedidos = await prisma.errandsPedido.findMany({ where, include: { cliente: true, puntoVenta: true } });

    const porPdv = new Map<string, number>();
    const porCliente = new Map<string, number>();
    const porDia = new Map<string, number>();
    const porEstado = new Map<string, number>();
    let totalKilos = 0;
    for (const p of pedidos) {
      const pdvLabel = p.puntoVenta?.nombre ?? "Sin PDV";
      porPdv.set(pdvLabel, (porPdv.get(pdvLabel) ?? 0) + 1);
      porCliente.set(p.cliente.nombre, (porCliente.get(p.cliente.nombre) ?? 0) + 1);
      porEstado.set(p.estado, (porEstado.get(p.estado) ?? 0) + 1);
      totalKilos += p.kilos;
      const dia = p.fecha.toISOString().slice(0, 10);
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    }

    const dias14: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dias14.push({ label: key.slice(5), value: porDia.get(key) ?? 0 });
    }

    const [totalClientes, totalPuntosVenta] = await Promise.all([
      prisma.errandsCliente.count({ where: { activo: true } }),
      prisma.errandsPuntoVenta.count({ where: { activo: true } }),
    ]);

    res.json({
      totalPedidos: pedidos.length,
      totalKilos,
      totalClientes,
      totalPuntosVenta,
      porEstado: ESTADOS_PEDIDO.map((e) => ({ label: e, value: porEstado.get(e) ?? 0 })),
      porPdv: [...porPdv.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      porCliente: [...porCliente.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10),
      porDia: dias14,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
