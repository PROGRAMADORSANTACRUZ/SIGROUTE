// Planificación (grid programación por destino×categoría) — puerto de
// legacy_fastapi/app/routers/programacion.py + repos/programacion.py.
import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
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
    // Solo se escribe lo que realmente cambió: con 4600+ destinos, hacer un
    // upsert por fila SIEMPRE (aunque no haya cambiado nada) tardaba minutos
    // y la petición se caía (parecía "error al guardar" sin más detalle).
    const porEscribir: { clienteId: string; data: Record<string, number>; esNueva: boolean }[] = [];
    for (const fila of body.filas) {
      const cliente = clienteById.get(fila.clienteId);
      if (!cliente) continue;
      const existing = existentes.get(fila.clienteId);
      const nombreCliente = cliente.cliente || cliente.nombreDireccion || "(sin nombre)";
      const ctx = `${INSTANCIA} · ${body.fecha} · ${cliente.codigoDireccion ? cliente.codigoDireccion + " " : ""}${nombreCliente}`;
      const data: Record<string, number> = {};
      let cambio = !existing;
      for (const col of DETALLE_COLS) {
        if (editableCols.has(col)) {
          const val = Number(fila.valores[col] ?? 0);
          const old = Number(existing?.[col] ?? 0);
          if (val !== old) { cambiosFilas.push([ctx, LABEL_COL[col] ?? col, old, val]); cambio = true; }
          data[col] = val;
        } else {
          data[col] = Number(existing?.[col] ?? 0);
        }
      }
      if (cambio) porEscribir.push({ clienteId: fila.clienteId, data, esNueva: !existing });
    }

    // Máx. 25 upserts en vuelo a la vez — suficiente para no tardar minutos
    // con guardados grandes, sin agotar el pool de conexiones a la BD.
    const LOTE = 25;
    for (let i = 0; i < porEscribir.length; i += LOTE) {
      const lote = porEscribir.slice(i, i + LOTE);
      await Promise.all(
        lote.map((f) =>
          prisma.progDetalle.upsert({
            where: { progId_clienteId: { progId: prog.id, clienteId: f.clienteId } },
            update: f.data,
            create: { progId: prog.id, clienteId: f.clienteId, ...f.data },
          })
        )
      );
    }
    const n = porEscribir.length;
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

// ── Carga de kilos por área desde un Excel de despacho real (hoja "Remisión") ──
// Reemplaza al viejo "Pegar desde Excel" (copiar/pegar celdas) por un botón
// que sube el .xlsm/.xlsx directamente. Formato real (informe de desposte
// Planta Santacruz): la hoja "Remisión" tiene un bloque de 7 columnas por
// cliente ("DESPACHADO A: <nombre>" en el encabezado del bloque), con una
// fila de productos (CODIGO/DESCRIPCION/KILOS/SOBRA/FALTA/%PARTIC) y una fila
// final "TOTAL"/"TOTAL DESPACHADO" con el total de kg YA calculado por
// cliente — se usa ese total directo (verificado que coincide exacto con la
// suma manual de todas las filas de producto, y que la suma de todos los
// clientes coincide con el "PESO EN FRIO" del lote completo).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function normalizarTexto(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface BloqueCliente { col: number; nombre: string }

// Ubica la hoja "Remisión" (o "Remision", sin acento) sin depender del nombre exacto.
function hojaRemision(wb: XLSX.WorkBook): XLSX.WorkSheet {
  const nombre = wb.SheetNames.find((n) => normalizarTexto(n) === "remision");
  if (!nombre) throw new HttpError(400, "El archivo no tiene una hoja \"Remisión\"");
  return wb.Sheets[nombre];
}

// Extrae {cliente -> kg total despachado} de la hoja Remisión, buscando los
// marcadores de texto reales ("DESPACHADO A:", "KILOS", "TOTAL") en vez de
// posiciones fijas de fila/columna (cada informe puede variar un poco).
function extraerTotalesRemision(sheet: XLSX.WorkSheet): { cliente: string; kg: number }[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });

  const headerRow = rows.findIndex((r) => r.some((c) => normalizarTexto(c) === "despachado a:"));
  if (headerRow === -1) throw new HttpError(400, "No se encontró la fila \"DESPACHADO A:\" en la hoja Remisión");

  const bloques: BloqueCliente[] = [];
  const fila = rows[headerRow];
  for (let c = 0; c < fila.length; c++) {
    if (normalizarTexto(fila[c]) === "despachado a:") {
      bloques.push({ col: c, nombre: String(fila[c + 1] ?? "").trim() });
    }
  }
  if (bloques.length === 0) throw new HttpError(400, "No se encontraron bloques de cliente en la hoja Remisión");

  // Offset de la columna "KILOS" relativo al inicio del bloque (buscado en
  // las 6 filas siguientes al encabezado, dentro del primer bloque).
  let kilosOffset: number | null = null;
  for (let r = headerRow + 1; r < Math.min(headerRow + 6, rows.length) && kilosOffset === null; r++) {
    for (let off = 0; off <= 6; off++) {
      if (normalizarTexto(rows[r][bloques[0].col + off]) === "kilos") { kilosOffset = off; break; }
    }
  }
  if (kilosOffset === null) throw new HttpError(400, "No se encontró la columna \"KILOS\" en la hoja Remisión");

  // Fila de totales: primera fila (después del encabezado) cuyo inicio dice "TOTAL".
  const totalRow = rows.findIndex(
    (r, i) => i > headerRow && r.some((c) => normalizarTexto(c) === "total" || normalizarTexto(c) === "total despachado")
  );
  if (totalRow === -1) throw new HttpError(400, "No se encontró la fila \"TOTAL\" en la hoja Remisión");

  return bloques
    .filter((b) => b.nombre)
    .map((b) => ({ cliente: b.nombre, kg: Number(rows[totalRow][b.col + kilosOffset!]) || 0 }));
}

// Cruce por nombre contra el maestro de Clientes: exacto -> singular/plural
// (quita 's' final de cada palabra) -> substring en ambos sentidos. NO se usa
// distancia de edición (Levenshtein) sola: dio falsos positivos en la práctica
// (ej. "La 22" emparejado con "Olaya") — mejor reportar sin match que inventar.
function emparejarCliente(
  nombreExcel: string,
  clientes: { id: string; nombre: string }[]
): { id: string; nombre: string; tipo: "exacto" | "singular" | "substring" } | null {
  const key = normalizarTexto(nombreExcel);
  const singularizar = (s: string) => normalizarTexto(s).split(" ").map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)).join(" ");
  const keySing = singularizar(nombreExcel);

  for (const c of clientes) if (normalizarTexto(c.nombre) === key) return { ...c, tipo: "exacto" };
  for (const c of clientes) if (singularizar(c.nombre) === keySing) return { ...c, tipo: "singular" };

  let mejor: { id: string; nombre: string } | null = null;
  let mejorLen = -1;
  for (const c of clientes) {
    const n = normalizarTexto(c.nombre);
    if (n.includes(key) || key.includes(n)) {
      const len = Math.min(n.length, key.length);
      if (len > mejorLen) { mejor = c; mejorLen = len; }
    }
  }
  return mejor ? { ...mejor, tipo: "substring" } : null;
}

// POST /api/planeacion/programacion/cargar-excel  (multipart: file + area)
// Solo hace preview (parseo + cruce de clientes) — NO escribe en la BD. El
// frontend aplica el resultado a la grilla en memoria (igual que el viejo
// "Pegar desde Excel") y el usuario revisa y pulsa Guardar para persistir.
router.post("/cargar-excel", requirePermiso("programacion.editar"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, "Falta el archivo");
    const area = String(req.body?.area ?? "").trim();
    const categoria = CATEGORIAS.find((c) => c.clave === area);
    if (!categoria) throw new HttpError(400, "Área inválida");

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const totales = extraerTotalesRemision(hojaRemision(wb));

    const clientesDb = await prisma.cliente.findMany({
      where: { activo: true },
      select: { id: true, cliente: true, nombreDireccion: true },
    });
    const clientes = clientesDb
      .map((c) => ({ id: c.id, nombre: (c.cliente || c.nombreDireccion || "").trim() }))
      .filter((c) => c.nombre);

    const filas: { destino: string; clienteId: string | null; clienteNombre: string | null; tipo: string; kg: number }[] = [];
    const sinMatch: string[] = [];
    for (const t of totales) {
      const match = emparejarCliente(t.cliente, clientes);
      if (match) {
        filas.push({ destino: t.cliente, clienteId: match.id, clienteNombre: match.nombre, tipo: match.tipo, kg: t.kg });
      } else {
        sinMatch.push(t.cliente);
        filas.push({ destino: t.cliente, clienteId: null, clienteNombre: null, tipo: "sin_match", kg: t.kg });
      }
    }

    res.json({ area, campoKls: categoria.kls, filas, sinMatch });
  } catch (err) {
    next(err);
  }
});

export default router;
