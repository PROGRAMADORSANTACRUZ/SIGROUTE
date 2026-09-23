// Planificación (grid programación por destino×categoría) — puerto de
// legacy_fastapi/app/routers/programacion.py + repos/programacion.py.
import { Router } from "express";
import { z } from "zod";
import { prismaPlan as prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import { areasPermitidas } from "../../lib/authSession";
import { CATEGORIAS, CANASTILLA_KG, DETALLE_COLS, KLS_COLS, INSTANCIA } from "../../lib/planCategorias";
import * as areasRepo from "../../lib/areaEstados";
import { log as auditLog } from "../../lib/auditoria";
import { registrarLote } from "../../lib/cambios";

const router = Router();
router.use(requireAuth, requirePermiso("programacion.ver"));

const LABEL_COL: Record<string, string> = {};
for (const c of CATEGORIAS) {
  LABEL_COL[c.kls] = `${c.etiqueta} Kls`;
  LABEL_COL[c.can] = `${c.etiqueta} Can`;
}

function parseFecha(s: unknown): Date {
  const d = typeof s === "string" && s ? new Date(s) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getOrCreateProg(fecha: Date, usuario: string) {
  const prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha } } });
  if (prog) return prog;
  try {
    const max = await prisma.programacion.aggregate({ where: { instancia: INSTANCIA }, _max: { consecutivo: true } });
    return await prisma.programacion.create({
      data: { instancia: INSTANCIA, fecha, usuario, consecutivo: (max._max.consecutivo ?? 0) + 1 },
    });
  } catch (err) {
    // Dos peticiones concurrentes (p.ej. dos pestañas o un doble fetch) pueden
    // intentar crear la misma Programacion del día a la vez; la segunda choca
    // con la restricción única (instancia, fecha) — en vez de tumbar la
    // petición con un 500, se relee la que la otra ya creó.
    if ((err as { code?: string })?.code === "P2002") {
      return prisma.programacion.findUniqueOrThrow({ where: { instancia_fecha: { instancia: INSTANCIA, fecha } } });
    }
    throw err;
  }
}

// GET /api/planeacion/programacion/grid?fecha=YYYY-MM-DD
// Los "destinos" de la grilla vienen del maestro de Clientes (base de
// Ejecución), no del maestro Destino propio de Planeación (retirado de este
// flujo): son miles de registros, así que el frontend filtra/pagina en memoria.
router.get("/grid", async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const prog = await getOrCreateProg(fecha, req.user!.username);
    const clientes = await prisma.cliente.findMany({
      where: { activo: true },
      orderBy: [{ cliente: "asc" }],
      select: { id: true, codigoDireccion: true, cliente: true, nombreDireccion: true, tipo: true },
    });
    const destinos = clientes.map((c) => ({
      id: c.id,
      numero: c.codigoDireccion,
      nombre: c.cliente || c.nombreDireccion || "(sin nombre)",
      canal: c.tipo === "TAT" ? "TAT" : "Distribución",
    }));
    const detalleRows = await prisma.progDetalle.findMany({ where: { progId: prog.id, clienteId: { not: null } } });
    const detalle = Object.fromEntries(detalleRows.map((d) => [d.clienteId as string, d]));

    const { visibles: ver, editables: edit } = areasPermitidas(req.sessionUser);
    const cats = ver === null ? CATEGORIAS : CATEGORIAS.filter((c) => ver.includes(c.etiqueta));

    const estados = await areasRepo.estados(prog.id);
    const cerradas = Object.fromEntries(estados.filter((e) => e.cerrado).map((e) => [e.area, e.cerradoPor]));
    const cerradasInfo = Object.fromEntries(estados.filter((e) => e.cerrado).map((e) => [e.area, { por: e.cerradoPor, at: e.cerradoAt }]));
    const misAreas = cats.map((c) => c.etiqueta).filter((label) => edit === null || edit.includes(label));

    let totKls = 0;
    let totCan = 0;
    for (const d of Object.values(detalle)) {
      for (const c of cats) {
        totKls += Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0);
        totCan += Number((d as unknown as Record<string, unknown>)[c.can] ?? 0);
      }
    }

    res.json({
      prog: { id: prog.id, consecutivo: prog.consecutivo, estado: prog.estado, fecha: prog.fecha },
      destinos,
      detalle,
      categorias: cats,
      klsCols: [...KLS_COLS],
      editables: edit,
      cerradas,
      cerradasInfo,
      misAreas,
      canCerrar: !!req.sessionUser && (req.sessionUser.role === "ADMIN" || req.sessionUser.permisos.includes("programacion.cerrar_area")),
      canReabrir: !!req.sessionUser && (req.sessionUser.role === "ADMIN" || req.sessionUser.permisos.includes("programacion.reabrir_area")),
      canEditar: !!req.sessionUser && (req.sessionUser.role === "ADMIN" || req.sessionUser.permisos.includes("programacion.editar")),
      totales: { kls: totKls + totCan * CANASTILLA_KG, canastillas: totCan },
      restringido: ver !== null,
      esAdmin: req.sessionUser?.role === "ADMIN",
      todasCerradas: CATEGORIAS.every((c) => c.etiqueta in cerradas),
    });
  } catch (err) {
    next(err);
  }
});

const filaSchema = z.object({ clienteId: z.string(), valores: z.record(z.string(), z.number()) });
const guardarSchema = z.object({ fecha: z.string(), filas: z.array(filaSchema) });

// POST /api/planeacion/programacion/guardar
router.post("/guardar", requirePermiso("programacion.editar"), async (req, res, next) => {
  try {
    const body = guardarSchema.parse(req.body);
    const fecha = parseFecha(body.fecha);
    const prog = await getOrCreateProg(fecha, req.user!.username);

    const { editables: edit } = areasPermitidas(req.sessionUser);
    const estadosActuales = await areasRepo.estados(prog.id);
    const cerradas = new Set(estadosActuales.filter((e) => e.cerrado).map((e) => e.area));

    const editableCols = new Set<string>();
    for (const c of CATEGORIAS) {
      if ((edit === null || edit.includes(c.etiqueta)) && !cerradas.has(c.etiqueta)) {
        editableCols.add(c.kls);
        editableCols.add(c.can);
      }
    }

    const existentesRows = await prisma.progDetalle.findMany({ where: { progId: prog.id, clienteId: { not: null } } });
    const existentes = new Map(existentesRows.map((d) => [d.clienteId as string, d as unknown as Record<string, unknown>]));
    const clienteIds = body.filas.map((f) => f.clienteId);
    const clientes = clienteIds.length
      ? await prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, codigoDireccion: true, cliente: true, nombreDireccion: true } })
      : [];
    const clienteById = new Map(clientes.map((c) => [c.id, c]));

    const cambiosFilas: [string, string, unknown, unknown][] = [];
    let n = 0;
    for (const fila of body.filas) {
      const cliente = clienteById.get(fila.clienteId);
      if (!cliente) continue;
      const existing = existentes.get(fila.clienteId) ?? {};
      const nombreCliente = cliente.cliente || cliente.nombreDireccion || "(sin nombre)";
      const ctx = `${INSTANCIA} · ${body.fecha} · ${cliente.codigoDireccion ? cliente.codigoDireccion + " " : ""}${nombreCliente}`;
      const data: Record<string, number> = {};
      for (const col of DETALLE_COLS) {
        if (editableCols.has(col)) {
          const val = Number(fila.valores[col] ?? 0);
          const old = Number(existing[col] ?? 0);
          if (val !== old) cambiosFilas.push([ctx, LABEL_COL[col] ?? col, old, val]);
          data[col] = val;
        } else {
          data[col] = Number(existing[col] ?? 0);
        }
      }
      await prisma.progDetalle.upsert({
        where: { progId_clienteId: { progId: prog.id, clienteId: fila.clienteId } },
        update: data,
        create: { progId: prog.id, clienteId: fila.clienteId, ...data },
      });
      n++;
    }
    await prisma.programacion.update({ where: { id: prog.id }, data: { updatedAt: new Date() } });
    await registrarLote(req.user!.username, "Programación", cambiosFilas);
    await auditLog(req.user!.username, "GUARDAR", "Programación", `Día ${body.fecha} (${n} destinos)`, INSTANCIA);

    res.json({ ok: true, guardados: n });
  } catch (err) {
    next(err);
  }
});

const areaActionSchema = z.object({ fecha: z.string(), area: z.string() });

// POST /api/planeacion/programacion/cerrar-area
router.post("/cerrar-area", requirePermiso("programacion.cerrar_area"), async (req, res, next) => {
  try {
    const { fecha: fechaStr, area } = areaActionSchema.parse(req.body);
    if (!areasRepo.validoArea(area)) throw new HttpError(400, "Área inválida");
    const { editables: edit } = areasPermitidas(req.sessionUser);
    if (edit !== null && !edit.includes(area)) throw new HttpError(403, "No puedes cerrar esta área");

    const fecha = parseFecha(fechaStr);
    const prog = await getOrCreateProg(fecha, req.user!.username);
    await areasRepo.cerrar(prog.id, area, req.user!.username);
    await auditLog(req.user!.username, "CERRAR ÁREA", "Programación", `${area} · ${fechaStr}`, INSTANCIA);
    await registrarLote(req.user!.username, "Programación", [[`${INSTANCIA} · ${fechaStr}`, `Área ${area}`, "Abierta", "Cerrada"]]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/planeacion/programacion/reabrir-area
router.post("/reabrir-area", requirePermiso("programacion.reabrir_area"), async (req, res, next) => {
  try {
    const { fecha: fechaStr, area } = areaActionSchema.parse(req.body);
    if (!areasRepo.validoArea(area)) throw new HttpError(400, "Área inválida");

    const fecha = parseFecha(fechaStr);
    const prog = await getOrCreateProg(fecha, req.user!.username);
    await areasRepo.reabrir(prog.id, area);
    await auditLog(req.user!.username, "REABRIR ÁREA", "Programación", `${area} · ${fechaStr}`, INSTANCIA);
    await registrarLote(req.user!.username, "Programación", [[`${INSTANCIA} · ${fechaStr}`, `Área ${area}`, "Cerrada", "Abierta"]]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Carga de kilos por área desde plantilla de despacho (.xlsx) ──────────────
// Deshabilitada: la carga masiva por Excel apuntaba al maestro Destino y
// nunca fue migrada al esquema basado en Cliente (ver planCategorias/Cliente).
// Removida por completo — cargar la grilla a mano o vía Plantillas TAT.

export default router;
