// Reportes en Excel (Programación y Rutas del día) — puerto de
// legacy_fastapi/app/routers/reportes.py, reutilizando los mismos datos que
// Planificación/Resumen. Usa `xlsx` (ya dependencia del backend) para armar
// las hojas y `xlsx-js-style` (mismo patrón ya usado en routes/clientes.ts)
// solo para ESCRIBIR el buffer final con estilos — la Community Edition de
// `xlsx` ignora el estilo de celda al escribir, por eso hace falta ese fork.
import { Router } from "express";
import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
import { prismaPlan as prisma } from "../../lib/prisma";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import { CATEGORIAS, INSTANCIA } from "../../lib/planCategorias";
import { calcularComparativoClientes } from "./dashboard";

const router = Router();
router.use(requireAuth, requirePermiso("reportes.ver"));

function parseFecha(s: unknown): Date {
  const d = typeof s === "string" && s ? new Date(s) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Estilos compartidos (misma paleta que la UI: verde oscuro de marca para
// encabezados/letras blancas, cuerpo con letra un poco más grande que el
// default de Excel para que se vea prolijo) ────────────────────────────────
const VERDE_OSCURO = "14352A";
const BLANCO = "FFFFFF";
const GRIS_SUBTITULO = "5F7A68";
const VERDE_TOTAL = "EAF4E6";

const ESTILO_TITULO = {
  font: { bold: true, sz: 14, color: { rgb: BLANCO } },
  fill: { patternType: "solid", fgColor: { rgb: VERDE_OSCURO } },
  alignment: { vertical: "center", horizontal: "left", indent: 1 },
};
const ESTILO_SUBTITULO = {
  font: { italic: true, sz: 10, color: { rgb: GRIS_SUBTITULO } },
  alignment: { vertical: "center", horizontal: "left", indent: 1 },
};
const ESTILO_ENCABEZADO = {
  font: { bold: true, sz: 12, color: { rgb: BLANCO } },
  fill: { patternType: "solid", fgColor: { rgb: VERDE_OSCURO } },
  alignment: { vertical: "center", horizontal: "center" },
};
const ESTILO_CELDA = { font: { sz: 11 } };
const ESTILO_TOTAL = {
  font: { bold: true, sz: 11, color: { rgb: VERDE_OSCURO } },
  fill: { patternType: "solid", fgColor: { rgb: VERDE_TOTAL } },
};

type CeldaEstilo = XLSX.CellObject & { s?: Record<string, unknown>; z?: string };

function aplicarEstilo(ws: XLSX.WorkSheet, r: number, c: number, estilo: Record<string, unknown>) {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (!ws[ref]) ws[ref] = { t: "s", v: "" };
  (ws[ref] as CeldaEstilo).s = estilo;
}

function fusionarFila(ws: XLSX.WorkSheet, fila: number, nCols: number) {
  if (nCols < 2) return;
  ws["!merges"] = [...(ws["!merges"] ?? []), { s: { r: fila, c: 0 }, e: { r: fila, c: nCols - 1 } }];
}

function estilizarEncabezado(ws: XLSX.WorkSheet, fila: number, nCols: number) {
  for (let c = 0; c < nCols; c++) aplicarEstilo(ws, fila, c, ESTILO_ENCABEZADO);
}

function estilizarCuerpo(ws: XLSX.WorkSheet, desde: number, hasta: number, nCols: number) {
  for (let r = desde; r <= hasta; r++) {
    for (let c = 0; c < nCols; c++) aplicarEstilo(ws, r, c, ESTILO_CELDA);
  }
}

function estilizarTotal(ws: XLSX.WorkSheet, fila: number, nCols: number) {
  for (let c = 0; c < nCols; c++) aplicarEstilo(ws, fila, c, ESTILO_TOTAL);
}

function anchoColumnas(headers: string[], rows: (string | number)[][]): XLSX.ColInfo[] {
  return headers.map((h, i) => {
    let max = String(h).length;
    for (const row of rows) {
      const v = row[i];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(Math.max(max + 2, 10), 60) };
  });
}

function lineaGenerado(): string {
  return `Generado por el software SIGROUTE — Grupo Santacruz · ${new Date().toLocaleString("es-CO")}`;
}

// Bloque de marca al inicio de cada hoja: título del reporte + línea
// "Generado por SIGROUTE" + líneas de info opcionales (consecutivo/estado,
// rango de fechas) + una fila en blanco antes del encabezado de la tabla.
function bloqueTitulo(titulo: string, info: string[] = []): (string | number)[][] {
  return [[titulo], [lineaGenerado()], ...info.map((l) => [l]), []];
}

// Aplica el estilo de marca a las filas del bloqueTitulo (título + generado +
// info), fusionando cada una a todo el ancho de la tabla.
function estilizarBloqueTitulo(ws: XLSX.WorkSheet, nFilasInfo: number, nCols: number) {
  fusionarFila(ws, 0, nCols);
  aplicarEstilo(ws, 0, 0, ESTILO_TITULO);
  for (let i = 0; i <= nFilasInfo; i++) {
    fusionarFila(ws, 1 + i, nCols);
    aplicarEstilo(ws, 1 + i, 0, ESTILO_SUBTITULO);
  }
}

function enviarExcel(res: import("express").Response, wb: XLSX.WorkBook, filename: string) {
  const buf = XLSXStyle.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
}

// Resuelve nombre/código de un lote de clienteId (Cliente vive en la BD de
// Ejecución) para mostrarlos en reportes que antes usaban el maestro Destino.
async function resolverClientes(clienteIds: string[]) {
  const ids = [...new Set(clienteIds)];
  const clientes = ids.length
    ? await prisma.cliente.findMany({ where: { id: { in: ids } }, select: { id: true, codigoDireccion: true, cliente: true, nombreDireccion: true } })
    : [];
  return new Map(clientes.map((c) => [c.id, { numero: c.codigoDireccion, nombre: c.cliente || c.nombreDireccion || "(sin nombre)" }]));
}

function etiquetaDestino(
  d: { destino: { numero: number | null; nombre: string } | null; clienteId: string | null },
  clientePorId: Map<string, { numero: string | null; nombre: string }>
): string {
  const c = d.clienteId ? clientePorId.get(d.clienteId) : null;
  if (c) return `${c.numero ?? ""} ${c.nombre}`.trim();
  if (d.destino) return `${d.destino.numero ?? ""} ${d.destino.nombre}`.trim();
  return "(sin destino)";
}

// GET /api/planeacion/reportes/programacion.xlsx?fecha=
// Solo incluye clientes con al menos un valor cargado ese día (el maestro de
// Clientes tiene miles de registros; listar todos saturaría el Excel).
router.get("/programacion.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const fechaStr = fecha.toISOString().slice(0, 10);
    const prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha } } });
    const detalleRows = prog ? await prisma.progDetalle.findMany({ where: { progId: prog.id, clienteId: { not: null } } }) : [];
    const clienteIds = detalleRows.map((d) => d.clienteId as string);
    const clientes = clienteIds.length
      ? await prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, codigoDireccion: true, cliente: true, nombreDireccion: true, tipo: true } })
      : [];
    const clienteById = new Map(clientes.map((c) => [c.id, c]));
    const destinos = detalleRows
      .map((d) => clienteById.get(d.clienteId as string))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => (a.cliente ?? a.nombreDireccion ?? "").localeCompare(b.cliente ?? b.nombreDireccion ?? ""));
    const detalle = new Map(detalleRows.map((d) => [d.clienteId as string, d as unknown as Record<string, unknown>]));

    const headers = ["N°", "Destino", "Canal", ...CATEGORIAS.flatMap((c) => [`${c.etiqueta} Kls`, `${c.etiqueta} Can`]), "Total Kls"];
    const dataRows: (string | number)[][] = [];
    let grandKls = 0;
    for (const d of destinos) {
      const row = detalle.get(d.id) ?? {};
      let rk = 0;
      const cells: (string | number)[] = [d.codigoDireccion ?? "", d.cliente || d.nombreDireccion || "(sin nombre)", d.tipo === "TAT" ? "TAT" : "Distribución"];
      for (const c of CATEGORIAS) {
        const vk = Number(row[c.kls] ?? 0);
        const vc = Number(row[c.can] ?? 0);
        cells.push(vk, vc);
        rk += vk;
      }
      cells.push(rk);
      grandKls += rk;
      dataRows.push(cells);
    }
    const filaTotal = dataRows.length;
    dataRows.push(["", "TOTAL", "", ...CATEGORIAS.flatMap(() => ["", ""]), grandKls]);

    const info = prog ? [`Consecutivo N° ${prog.consecutivo} · Estado: ${prog.estado}`] : ["Sin programación para esta fecha"];
    const bloque = bloqueTitulo(`Programación de Rutas — ${INSTANCIA} — ${fechaStr}`, info);
    const filaEncabezado = bloque.length;
    const ws = XLSX.utils.aoa_to_sheet([...bloque, headers, ...dataRows]);
    const nCols = headers.length;
    estilizarBloqueTitulo(ws, info.length, nCols);
    estilizarEncabezado(ws, filaEncabezado, nCols);
    estilizarCuerpo(ws, filaEncabezado + 1, filaEncabezado + filaTotal, nCols);
    estilizarTotal(ws, filaEncabezado + 1 + filaTotal, nCols);
    ws["!cols"] = anchoColumnas(headers, dataRows);
    ws["!rows"] = [{ hpt: 26 }, { hpt: 16 }, ...info.map(() => ({ hpt: 16 })), { hpt: 6 }, { hpt: 22 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Programación");
    enviarExcel(res, wb, `programacion_${fechaStr}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/reportes/rutas.xlsx?fecha=
router.get("/rutas.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const fechaStr = fecha.toISOString().slice(0, 10);
    const prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha } } });
    const rutas = prog
      ? await prisma.planRuta.findMany({
          where: { progId: prog.id },
          include: {
            vehiculo: true,
            conductor: true,
            destinos: { orderBy: { orden: "asc" }, include: { destino: true } },
            auxiliares: { orderBy: { posicion: "asc" }, include: { auxiliar: true } },
          },
          orderBy: { numeroRuta: "asc" },
        })
      : [];

    const headers = ["Ruta", "Vehículo", "Conductor", "Hora Cargue", "Peso Total", "Auxiliares", "Destinos (en orden)"];
    const clientePorId = await resolverClientes(rutas.flatMap((r) => r.destinos.map((d) => d.clienteId).filter((x): x is string => !!x)));
    const dataRows: (string | number)[][] = rutas.map((r) => [
      r.numeroRuta,
      r.vehiculo?.placa ?? "",
      r.conductor?.nombre ?? "",
      r.horaCargue ?? "",
      r.pesoTotal ?? 0,
      r.auxiliares.map((a) => a.auxiliar.nombre).join(", "),
      r.destinos.map((d) => etiquetaDestino(d, clientePorId)).join(" → "),
    ]);

    const info = prog ? [] : ["Sin programación para esta fecha"];
    const bloque = bloqueTitulo(`Rutas del Día — ${INSTANCIA} — ${fechaStr}`, info);
    const filaEncabezado = bloque.length;
    const ws = XLSX.utils.aoa_to_sheet([...bloque, headers, ...dataRows]);
    const nCols = headers.length;
    estilizarBloqueTitulo(ws, info.length, nCols);
    estilizarEncabezado(ws, filaEncabezado, nCols);
    estilizarCuerpo(ws, filaEncabezado + 1, filaEncabezado + dataRows.length, nCols);
    ws["!cols"] = anchoColumnas(headers, dataRows);
    ws["!rows"] = [{ hpt: 26 }, { hpt: 16 }, ...info.map(() => ({ hpt: 16 })), { hpt: 6 }, { hpt: 22 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rutas");
    enviarExcel(res, wb, `rutas_${fechaStr}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/reportes/resumen.xlsx?fecha= — consolida categorías + rutas en un solo libro.
router.get("/resumen.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const fechaStr = fecha.toISOString().slice(0, 10);
    const prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha } } });
    const detalle = prog ? await prisma.progDetalle.findMany({ where: { progId: prog.id } }) : [];
    const rutas = prog
      ? await prisma.planRuta.findMany({
          where: { progId: prog.id },
          include: {
            vehiculo: true,
            conductor: true,
            destinos: { orderBy: { orden: "asc" }, include: { destino: true } },
            auxiliares: { orderBy: { posicion: "asc" }, include: { auxiliar: true } },
          },
          orderBy: { numeroRuta: "asc" },
        })
      : [];

    let grandKls = 0;
    let grandCan = 0;
    const filasCategoria: (string | number)[][] = [];
    for (const c of CATEGORIAS) {
      const kls = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0), 0);
      const can = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.can] ?? 0), 0);
      grandKls += kls;
      grandCan += can;
      filasCategoria.push([c.etiqueta, kls, can]);
    }

    const destinosConProducto = detalle.filter((d) =>
      CATEGORIAS.some((c) => Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0) > 0)
    ).length;

    // ── Hoja 1: Resumen (indicadores + tabla de categorías) ──────────────
    const info = [prog ? `Consecutivo N° ${prog.consecutivo} · Estado: ${prog.estado}` : "Sin programación para esta fecha"];
    const bloque = bloqueTitulo(`Resumen del Día — ${INSTANCIA} — ${fechaStr}`, info);
    const indicadores: (string | number)[][] = [
      ["Destinos con producto", destinosConProducto],
      ["Rutas", rutas.length],
      ["Rutas asignadas", rutas.filter((r) => r.vehiculoId != null).length],
      ["Rutas cerradas", rutas.filter((r) => r.cerrada).length],
      [],
    ];
    const filaIndicadores = bloque.length;
    const headersCategoria = ["Categoría", "Kls", "Canastillas"];
    const filaEncabezadoCategoria = filaIndicadores + indicadores.length;
    const wsResumen = XLSX.utils.aoa_to_sheet([
      ...bloque,
      ...indicadores,
      headersCategoria,
      ...filasCategoria,
      ["TOTAL", grandKls, grandCan],
    ]);
    estilizarBloqueTitulo(wsResumen, info.length, 3);
    for (let i = 0; i < 4; i++) aplicarEstilo(wsResumen, filaIndicadores + i, 0, { font: { bold: true, sz: 11 } });
    estilizarEncabezado(wsResumen, filaEncabezadoCategoria, 3);
    estilizarCuerpo(wsResumen, filaEncabezadoCategoria + 1, filaEncabezadoCategoria + filasCategoria.length, 3);
    estilizarTotal(wsResumen, filaEncabezadoCategoria + 1 + filasCategoria.length, 3);
    wsResumen["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }];

    // ── Hoja 2: Rutas ─────────────────────────────────────────────────────
    const clientePorId = await resolverClientes(rutas.flatMap((r) => r.destinos.map((d) => d.clienteId).filter((x): x is string => !!x)));
    const headersRutas = ["Ruta", "Vehículo", "Conductor", "Hora Cargue", "Cerrada", "Peso Total", "Auxiliares", "Destinos (en orden)"];
    const dataRutas = rutas.map((r) => [
      r.numeroRuta,
      r.vehiculo?.placa ?? "",
      r.conductor?.nombre ?? "",
      r.horaCargue ?? "",
      r.cerrada ? "Sí" : "No",
      r.pesoTotal ?? 0,
      r.auxiliares.map((a) => a.auxiliar.nombre).join(", "),
      r.destinos.map((d) => etiquetaDestino(d, clientePorId)).join(" → "),
    ]);
    const bloqueRutas = bloqueTitulo(`Rutas — ${INSTANCIA} — ${fechaStr}`);
    const filaEncabezadoRutas = bloqueRutas.length;
    const wsRutas = XLSX.utils.aoa_to_sheet([...bloqueRutas, headersRutas, ...dataRutas]);
    estilizarBloqueTitulo(wsRutas, 0, headersRutas.length);
    estilizarEncabezado(wsRutas, filaEncabezadoRutas, headersRutas.length);
    estilizarCuerpo(wsRutas, filaEncabezadoRutas + 1, filaEncabezadoRutas + dataRutas.length, headersRutas.length);
    wsRutas["!cols"] = anchoColumnas(headersRutas, dataRutas);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
    XLSX.utils.book_append_sheet(wb, wsRutas, "Rutas");
    enviarExcel(res, wb, `resumen_${fechaStr}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/reportes/areas-carga.xlsx?fecha= — avance de cargue por área y ruta.
router.get("/areas-carga.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const fechaStr = fecha.toISOString().slice(0, 10);
    const prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha } } });
    const rutas = prog
      ? await prisma.planRuta.findMany({
          where: { progId: prog.id, cerrada: true },
          include: { vehiculo: true, conductor: true, destinos: true, areaCarga: true },
          orderBy: { numeroRuta: "asc" },
        })
      : [];

    const presentes = new Set<string>();
    const filas: { numeroRuta: number; vehiculo: string; conductor: string; cargada: string; celdas: Record<string, { estado: string; hora: string }> }[] = [];
    for (const r of rutas) {
      const clienteIds = r.destinos.map((d) => d.clienteId).filter((x): x is string => !!x);
      const detalle = clienteIds.length && prog ? await prisma.progDetalle.findMany({ where: { progId: prog.id, clienteId: { in: clienteIds } } }) : [];
      const celdas: Record<string, { estado: string; hora: string }> = {};
      for (const c of CATEGORIAS) {
        const k = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0), 0);
        const cc = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.can] ?? 0), 0);
        if (k > 0 || cc > 0) {
          const est = r.areaCarga.find((a) => a.area === c.etiqueta);
          // La hora solo aporta algo cuando ya está CARGADA (si no, es solo
          // "cuándo se tocó por última vez" un estado intermedio sin interés)
          // -- va en SU PROPIA columna, no embebida en el texto del estado.
          const hora = est?.estado === "CARGADA" && est.actualizadoAt
            ? est.actualizadoAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
            : "";
          celdas[c.etiqueta] = { estado: est?.estado ?? "PENDIENTE", hora };
          presentes.add(c.etiqueta);
        }
      }
      filas.push({ numeroRuta: r.numeroRuta, vehiculo: r.vehiculo?.placa ?? "", conductor: r.conductor?.nombre ?? "", cargada: r.cargada ? "Sí" : "No", celdas });
    }
    const columnas = CATEGORIAS.map((c) => c.etiqueta).filter((l) => presentes.has(l));

    const headers = ["Ruta", "Vehículo", "Conductor", ...columnas.flatMap((c) => [c, `${c} — Hora`]), "Cargada"];
    const dataRows: (string | number)[][] = filas.map((f) => [
      f.numeroRuta, f.vehiculo, f.conductor,
      ...columnas.flatMap((c) => [f.celdas[c]?.estado ?? "—", f.celdas[c]?.hora ?? ""]),
      f.cargada,
    ]);

    const info = prog ? [] : ["Sin programación para esta fecha"];
    const bloque = bloqueTitulo(`Áreas para Cargar — ${INSTANCIA} — ${fechaStr}`, info);
    const filaEncabezado = bloque.length;
    const ws = XLSX.utils.aoa_to_sheet([...bloque, headers, ...dataRows]);
    const nCols = headers.length;
    estilizarBloqueTitulo(ws, info.length, nCols);
    estilizarEncabezado(ws, filaEncabezado, nCols);
    estilizarCuerpo(ws, filaEncabezado + 1, filaEncabezado + dataRows.length, nCols);
    ws["!cols"] = anchoColumnas(headers, dataRows);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Áreas para Cargar");
    enviarExcel(res, wb, `areas_carga_${fechaStr}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/reportes/auditoria.xlsx?fecha= — bitácora de cambios del día.
router.get("/auditoria.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const fechaStr = fecha.toISOString().slice(0, 10);
    const desde = new Date(fecha);
    const hasta = new Date(fecha);
    hasta.setHours(23, 59, 59, 999);
    const registros = await prisma.auditLog.findMany({ where: { fecha: { gte: desde, lte: hasta } }, orderBy: { fecha: "asc" } });

    const headers = ["Fecha", "Hora", "Usuario", "Módulo", "Acción", "Detalle"];
    const dataRows: (string | number)[][] = registros.map((r) => [
      r.fecha.toLocaleDateString("es-CO"),
      r.fecha.toLocaleTimeString("es-CO"),
      r.usuario ?? "",
      r.modulo ?? "",
      r.accion ?? "",
      r.detalle ?? "",
    ]);

    const bloque = bloqueTitulo(`Auditoría — ${INSTANCIA} — ${fechaStr}`);
    const filaEncabezado = bloque.length;
    const ws = XLSX.utils.aoa_to_sheet([...bloque, headers, ...dataRows]);
    const nCols = headers.length;
    estilizarBloqueTitulo(ws, 0, nCols);
    estilizarEncabezado(ws, filaEncabezado, nCols);
    estilizarCuerpo(ws, filaEncabezado + 1, filaEncabezado + dataRows.length, nCols);
    ws["!cols"] = anchoColumnas(headers, dataRows);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoría");
    enviarExcel(res, wb, `auditoria_${fechaStr}.xlsx`);
  } catch (err) {
    next(err);
  }
});

router.get("/cierres-area.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const fechaFin = req.query.fechaFin ? parseFecha(req.query.fechaFin) : fecha;
    const fechaStr = fecha.toISOString().slice(0, 10);
    const fechaFinStr = fechaFin.toISOString().slice(0, 10);

    const programaciones = await prisma.programacion.findMany({
      where: { instancia: INSTANCIA, fecha: { gte: fecha, lte: fechaFin } },
      include: { areaEstados: true },
      orderBy: { fecha: "asc" },
    });

    const headers = ["Fecha", "Área", "Estado", "Cerrado por", "Hora de cierre"];
    const dataRows: (string | number)[][] = [];
    for (const prog of programaciones) {
      const porArea = new Map(prog.areaEstados.map((e) => [e.area, e]));
      for (const c of CATEGORIAS) {
        const e = porArea.get(c.etiqueta);
        dataRows.push([
          prog.fecha.toISOString().slice(0, 10),
          c.etiqueta,
          e?.cerrado ? "Cerrada" : "Abierta",
          e?.cerradoPor ?? "",
          e?.cerradoAt ? e.cerradoAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "",
        ]);
      }
    }

    const bloque = bloqueTitulo(`Cierres de área — ${INSTANCIA} — ${fechaStr} a ${fechaFinStr}`);
    const filaEncabezado = bloque.length;
    const ws = XLSX.utils.aoa_to_sheet([...bloque, headers, ...dataRows]);
    const nCols = headers.length;
    estilizarBloqueTitulo(ws, 0, nCols);
    estilizarEncabezado(ws, filaEncabezado, nCols);
    estilizarCuerpo(ws, filaEncabezado + 1, filaEncabezado + dataRows.length, nCols);
    ws["!cols"] = anchoColumnas(headers, dataRows);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cierres de área");
    enviarExcel(res, wb, `cierres_area_${fechaStr}_${fechaFinStr}.xlsx`);
  } catch (err) {
    next(err);
  }
});

function isoToDMY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// ── Reportes de Ejecución (antes solo había de Planeación) + Comparativo ──

// GET /api/planeacion/reportes/comparativo-clientes.xlsx?fecha=
// Mismo cálculo que el Dashboard (planificado en Programación vs ejecutado
// en Órdenes/Diagrama), pero exportado completo (el dashboard trunca a 200
// filas para la UI; acá van todos los clientes).
router.get("/comparativo-clientes.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fechaStr = typeof req.query.fecha === "string" && req.query.fecha ? req.query.fecha : new Date().toISOString().slice(0, 10);
    const r = await calcularComparativoClientes(fechaStr);

    // Hoja 1: resumen + por categoría
    const indicadores: (string | number)[][] = [
      ["Planificado (kg)", r.totales.planificado],
      ["Ejecutado (kg)", r.totales.ejecutado],
      ["Diferencia (kg)", r.totales.diferencia],
      ["% Cumplimiento", r.totales.pctCumplimiento],
      ["Perdido (planificado sin ejecutar, kg)", r.totales.perdido],
      ["Extra (ejecutado sin plan, kg)", r.totales.extra],
      ["Sin cliente identificado (kg)", r.totales.sinClienteKg],
      [],
    ];
    const headersCategoria = ["Categoría", "Planificado", "Ejecutado"];
    const bloqueResumen = bloqueTitulo(`Comparativo Planificado vs Ejecutado — ${INSTANCIA} — ${fechaStr}`, r.hayPlanificacion ? [] : ["Sin planificación cargada para esta fecha"]);
    const filaIndicadores = bloqueResumen.length;
    const filaEncabezadoCategoria = filaIndicadores + indicadores.length;
    const wsResumen = XLSX.utils.aoa_to_sheet([
      ...bloqueResumen,
      ...indicadores,
      headersCategoria,
      ...r.porCategoria.map((c) => [c.etiqueta, c.planificado, c.ejecutado]),
    ]);
    estilizarBloqueTitulo(wsResumen, r.hayPlanificacion ? 0 : 1, 3);
    for (let i = 0; i < 7; i++) aplicarEstilo(wsResumen, filaIndicadores + i, 0, { font: { bold: true, sz: 11 } });
    estilizarEncabezado(wsResumen, filaEncabezadoCategoria, 3);
    estilizarCuerpo(wsResumen, filaEncabezadoCategoria + 1, filaEncabezadoCategoria + r.porCategoria.length, 3);
    wsResumen["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }];

    // Hoja 2: por cliente (todas las filas, sin el truncado a 200 del dashboard)
    const headersClientes = ["Cliente", "Planificado (kg)", "Ejecutado (kg)", "Diferencia (kg)", "% Desviación"];
    const dataClientes = r.filas.map((f) => [f.nombre, f.planificado, f.ejecutado, f.diferencia, f.pctDesviacion]);
    const bloqueClientes = bloqueTitulo(`Comparativo por cliente — ${INSTANCIA} — ${fechaStr}`);
    const filaEncabezadoClientes = bloqueClientes.length;
    const wsClientes = XLSX.utils.aoa_to_sheet([...bloqueClientes, headersClientes, ...dataClientes]);
    estilizarBloqueTitulo(wsClientes, 0, headersClientes.length);
    estilizarEncabezado(wsClientes, filaEncabezadoClientes, headersClientes.length);
    estilizarCuerpo(wsClientes, filaEncabezadoClientes + 1, filaEncabezadoClientes + dataClientes.length, headersClientes.length);
    wsClientes["!cols"] = anchoColumnas(headersClientes, dataClientes);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
    XLSX.utils.book_append_sheet(wb, wsClientes, "Por cliente");
    enviarExcel(res, wb, `comparativo_clientes_${fechaStr}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/reportes/ordenes-ejecucion.xlsx?fecha= — órdenes de
// Ejecución (Cargar Órdenes/Diagrama) para un día: junta Orden (vivo, el día
// de hoy que aún no pasó por el archivo de las 18:00) + OrdenHistorico (ya
// archivado por limpiezaDiaria.ts) — igual patrón que el Comparativo, porque
// no se sabe de antemano si la fecha pedida ya fue archivada o no.
router.get("/ordenes-ejecucion.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fechaStr = typeof req.query.fecha === "string" && req.query.fecha ? req.query.fecha : new Date().toISOString().slice(0, 10);
    const fechaDMY = isoToDMY(fechaStr);

    const select = {
      fecha: true, numeroOrden: true, cliente: true, destino: true, producto: true, productoCodigo: true,
      cantidadKg: true, valor: true, estado: true, asignadoVehiculo: true, ruta: true,
      distribucion: true, tatOrigen: true, cufe: true,
    } as const;
    const [vivas, archivadas] = await Promise.all([
      prisma.orden.findMany({ where: { fecha: fechaDMY }, select }),
      prisma.ordenHistorico.findMany({ where: { fecha: fechaDMY }, select }),
    ]);
    const ordenes = [...vivas, ...archivadas];

    const headers = ["Fecha", "N° Orden", "Cliente", "Destino", "Producto", "Código", "Kg", "Valor", "Estado", "Vehículo", "Ruta", "Origen", "CUFE"];
    const dataRows: (string | number)[][] = ordenes.map((o) => [
      o.fecha, o.numeroOrden, o.cliente, o.destino, o.producto, o.productoCodigo ?? "",
      Math.round(o.cantidadKg * 10) / 10, Math.round(o.valor), o.estado,
      o.asignadoVehiculo ?? "", o.ruta ?? "",
      o.distribucion === "TAT" ? (o.tatOrigen ?? "TAT") : o.distribucion,
      o.cufe ? "Sí" : "No",
    ]);

    const bloque = bloqueTitulo(`Órdenes de Ejecución — ${fechaStr}`, ordenes.length === 0 ? ["Sin órdenes para esta fecha"] : []);
    const filaEncabezado = bloque.length;
    const ws = XLSX.utils.aoa_to_sheet([...bloque, headers, ...dataRows]);
    const nCols = headers.length;
    estilizarBloqueTitulo(ws, ordenes.length === 0 ? 1 : 0, nCols);
    estilizarEncabezado(ws, filaEncabezado, nCols);
    estilizarCuerpo(ws, filaEncabezado + 1, filaEncabezado + dataRows.length, nCols);
    ws["!cols"] = anchoColumnas(headers, dataRows);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Órdenes");
    enviarExcel(res, wb, `ordenes_ejecucion_${fechaStr}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/reportes/envios-drivin.xlsx?fecha=&fechaFin= —
// historial DURABLE de envíos a Drivin desde Diagrama (EnvioDrivin nunca se
// borra, a diferencia de Orden) + el detalle factura por factura de cada envío.
router.get("/envios-drivin.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const fechaFin = req.query.fechaFin ? parseFecha(req.query.fechaFin) : fecha;
    const fechaFinExclusiva = new Date(fechaFin);
    fechaFinExclusiva.setDate(fechaFinExclusiva.getDate() + 1);
    const fechaStr = fecha.toISOString().slice(0, 10);
    const fechaFinStr = fechaFin.toISOString().slice(0, 10);

    const envios = await prisma.envioDrivin.findMany({
      where: { createdAt: { gte: fecha, lt: fechaFinExclusiva } },
      include: { facturas: true },
      orderBy: { createdAt: "asc" },
    });

    const headersEnvios = ["Fecha", "Hora", "Tipo", "Usuario", "Resultado", "Placas", "Facturas", "Kg", "Valor", "Error"];
    const dataEnvios: (string | number)[][] = envios.map((e) => [
      e.createdAt.toLocaleDateString("es-CO"), e.createdAt.toLocaleTimeString("es-CO"),
      e.tipo, e.usuarioNombre ?? "", e.exitoso ? "Éxito" : "Error",
      e.placas ?? "", e.totalFacturas, Math.round(e.totalKg), Math.round(e.totalValor),
      e.errorMensaje ?? "",
    ]);
    const bloqueEnvios = bloqueTitulo(`Envíos a Drivin — ${fechaStr} a ${fechaFinStr}`, envios.length === 0 ? ["Sin envíos en el rango"] : []);
    const filaEncabezadoEnvios = bloqueEnvios.length;
    const wsEnvios = XLSX.utils.aoa_to_sheet([...bloqueEnvios, headersEnvios, ...dataEnvios]);
    estilizarBloqueTitulo(wsEnvios, envios.length === 0 ? 1 : 0, headersEnvios.length);
    estilizarEncabezado(wsEnvios, filaEncabezadoEnvios, headersEnvios.length);
    estilizarCuerpo(wsEnvios, filaEncabezadoEnvios + 1, filaEncabezadoEnvios + dataEnvios.length, headersEnvios.length);
    wsEnvios["!cols"] = anchoColumnas(headersEnvios, dataEnvios);

    const headersDetalle = ["Fecha envío", "N° Orden", "Cliente", "Destino", "Placa", "Kg", "Valor", "Origen"];
    const dataDetalle: (string | number)[][] = envios.flatMap((e) =>
      e.facturas.map((f) => [
        e.createdAt.toLocaleDateString("es-CO"), f.numeroOrden, f.cliente ?? "", f.destino ?? "", f.placa ?? "",
        Math.round(f.cantidadKg * 10) / 10, Math.round(f.valor), f.distribucion ?? "",
      ])
    );
    const bloqueDetalle = bloqueTitulo(`Envíos a Drivin — Detalle de facturas — ${fechaStr} a ${fechaFinStr}`);
    const filaEncabezadoDetalle = bloqueDetalle.length;
    const wsDetalle = XLSX.utils.aoa_to_sheet([...bloqueDetalle, headersDetalle, ...dataDetalle]);
    estilizarBloqueTitulo(wsDetalle, 0, headersDetalle.length);
    estilizarEncabezado(wsDetalle, filaEncabezadoDetalle, headersDetalle.length);
    estilizarCuerpo(wsDetalle, filaEncabezadoDetalle + 1, filaEncabezadoDetalle + dataDetalle.length, headersDetalle.length);
    wsDetalle["!cols"] = anchoColumnas(headersDetalle, dataDetalle);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsEnvios, "Envíos");
    XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle facturas");
    enviarExcel(res, wb, `envios_drivin_${fechaStr}_${fechaFinStr}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/reportes/novedades.xlsx?fecha= — Nivel de servicio
// (Ejecución): novedades/incidencias reportadas para ese día.
router.get("/novedades.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fechaStr = typeof req.query.fecha === "string" && req.query.fecha ? req.query.fecha : new Date().toISOString().slice(0, 10);
    const fechaDMY = isoToDMY(fechaStr);

    const registros = await prisma.novedad.findMany({ where: { fecha: fechaDMY }, orderBy: { createdAt: "asc" } });

    const headers = ["N°", "Tipo", "Prioridad", "Estado", "Estado entrega", "Cliente", "N° Orden", "Placa", "Conductor", "Auxiliar", "Descripción", "Resolución"];
    const dataRows: (string | number)[][] = registros.map((r) => [
      r.consecutivo, r.tipo, r.prioridad, r.estado, r.estadoEntrega, r.cliente ?? "", r.numeroOrden ?? "",
      r.placa ?? "", r.conductor ?? "", r.auxiliarRuta ?? "", r.descripcion, r.resolucion ?? "",
    ]);

    const bloque = bloqueTitulo(`Nivel de Servicio — Novedades — ${fechaStr}`, registros.length === 0 ? ["Sin novedades para esta fecha"] : []);
    const filaEncabezado = bloque.length;
    const ws = XLSX.utils.aoa_to_sheet([...bloque, headers, ...dataRows]);
    const nCols = headers.length;
    estilizarBloqueTitulo(ws, registros.length === 0 ? 1 : 0, nCols);
    estilizarEncabezado(ws, filaEncabezado, nCols);
    estilizarCuerpo(ws, filaEncabezado + 1, filaEncabezado + dataRows.length, nCols);
    ws["!cols"] = anchoColumnas(headers, dataRows);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Novedades");
    enviarExcel(res, wb, `novedades_${fechaStr}.xlsx`);
  } catch (err) {
    next(err);
  }
});

export default router;
