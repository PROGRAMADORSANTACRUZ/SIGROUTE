// Reportes en Excel (Programación y Rutas del día) — puerto de
// legacy_fastapi/app/routers/reportes.py, reutilizando los mismos datos que
// Planificación/Resumen. Usa `xlsx` (ya dependencia del backend) en vez de
// openpyxl; el contenido/columnas es igual, el estilo de celda se simplifica.
import { Router } from "express";
import * as XLSX from "xlsx";
import { prismaPlan as prisma } from "../../lib/prisma";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import { CATEGORIAS, INSTANCIA } from "../../lib/planCategorias";

const router = Router();
router.use(requireAuth, requirePermiso("reportes.ver"));

function parseFecha(s: unknown): Date {
  const d = typeof s === "string" && s ? new Date(s) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function enviarExcel(res: import("express").Response, wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
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
    const rows: (string | number)[][] = [
      [`Programación de Rutas — ${INSTANCIA} — ${fecha.toISOString().slice(0, 10)}`],
      prog ? [`Consecutivo N° ${prog.consecutivo} · Estado: ${prog.estado}`] : [],
      [],
      headers,
    ];
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
      rows.push(cells);
    }
    rows.push(["", "TOTAL", "", ...CATEGORIAS.flatMap(() => ["", ""]), grandKls]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Programación");
    enviarExcel(res, wb, `programacion_${fecha.toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/reportes/rutas.xlsx?fecha=
router.get("/rutas.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
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

    const rows: (string | number)[][] = [
      [`Rutas del Día — ${INSTANCIA} — ${fecha.toISOString().slice(0, 10)}`],
      [],
      ["Ruta", "Vehículo", "Conductor", "Hora Cargue", "Peso Total", "Auxiliares", "Destinos (en orden)"],
    ];
    const clientePorId = await resolverClientes(rutas.flatMap((r) => r.destinos.map((d) => d.clienteId).filter((x): x is string => !!x)));
    for (const r of rutas) {
      rows.push([
        r.numeroRuta,
        r.vehiculo?.placa ?? "",
        r.conductor?.nombre ?? "",
        r.horaCargue ?? "",
        r.pesoTotal ?? 0,
        r.auxiliares.map((a) => a.auxiliar.nombre).join(", "),
        r.destinos.map((d) => etiquetaDestino(d, clientePorId)).join(" → "),
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rutas");
    enviarExcel(res, wb, `rutas_${fecha.toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/reportes/resumen.xlsx?fecha= — consolida categorías + rutas en un solo libro.
router.get("/resumen.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
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
    const filasCategoria: (string | number)[][] = [["Categoría", "Kls", "Canastillas"]];
    for (const c of CATEGORIAS) {
      const kls = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0), 0);
      const can = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.can] ?? 0), 0);
      grandKls += kls;
      grandCan += can;
      filasCategoria.push([c.etiqueta, kls, can]);
    }
    filasCategoria.push(["TOTAL", grandKls, grandCan]);

    const destinosConProducto = detalle.filter((d) =>
      CATEGORIAS.some((c) => Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0) > 0)
    ).length;

    const wsResumen = XLSX.utils.aoa_to_sheet([
      [`Resumen del Día — ${INSTANCIA} — ${fecha.toISOString().slice(0, 10)}`],
      prog ? [`Consecutivo N° ${prog.consecutivo} · Estado: ${prog.estado}`] : ["Sin programación para esta fecha"],
      [],
      ["Destinos con producto", destinosConProducto],
      ["Rutas", rutas.length],
      ["Rutas asignadas", rutas.filter((r) => r.vehiculoId != null).length],
      ["Rutas cerradas", rutas.filter((r) => r.cerrada).length],
      [],
      ...filasCategoria,
    ]);

    const wsRutas = XLSX.utils.aoa_to_sheet([
      ["Ruta", "Vehículo", "Conductor", "Hora Cargue", "Cerrada", "Peso Total", "Auxiliares", "Destinos (en orden)"],
      ...(await (async () => {
        const clientePorId = await resolverClientes(rutas.flatMap((r) => r.destinos.map((d) => d.clienteId).filter((x): x is string => !!x)));
        return rutas.map((r) => [
          r.numeroRuta,
          r.vehiculo?.placa ?? "",
          r.conductor?.nombre ?? "",
          r.horaCargue ?? "",
          r.cerrada ? "Sí" : "No",
          r.pesoTotal ?? 0,
          r.auxiliares.map((a) => a.auxiliar.nombre).join(", "),
          r.destinos.map((d) => etiquetaDestino(d, clientePorId)).join(" → "),
        ]);
      })()),
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
    XLSX.utils.book_append_sheet(wb, wsRutas, "Rutas");
    enviarExcel(res, wb, `resumen_${fecha.toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/reportes/areas-carga.xlsx?fecha= — avance de cargue por área y ruta.
router.get("/areas-carga.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha } } });
    const rutas = prog
      ? await prisma.planRuta.findMany({
          where: { progId: prog.id, cerrada: true },
          include: { vehiculo: true, conductor: true, destinos: true, areaCarga: true },
          orderBy: { numeroRuta: "asc" },
        })
      : [];

    const presentes = new Set<string>();
    const filas: { numeroRuta: number; vehiculo: string; conductor: string; cargada: string; celdas: Record<string, string> }[] = [];
    for (const r of rutas) {
      const clienteIds = r.destinos.map((d) => d.clienteId).filter((x): x is string => !!x);
      const detalle = clienteIds.length && prog ? await prisma.progDetalle.findMany({ where: { progId: prog.id, clienteId: { in: clienteIds } } }) : [];
      const celdas: Record<string, string> = {};
      for (const c of CATEGORIAS) {
        const k = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0), 0);
        const cc = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.can] ?? 0), 0);
        if (k > 0 || cc > 0) {
          const est = r.areaCarga.find((a) => a.area === c.etiqueta);
          celdas[c.etiqueta] = est?.estado ?? "PENDIENTE";
          presentes.add(c.etiqueta);
        }
      }
      filas.push({ numeroRuta: r.numeroRuta, vehiculo: r.vehiculo?.placa ?? "", conductor: r.conductor?.nombre ?? "", cargada: r.cargada ? "Sí" : "No", celdas });
    }
    const columnas = CATEGORIAS.map((c) => c.etiqueta).filter((l) => presentes.has(l));

    const rows: (string | number)[][] = [
      [`Áreas para Cargar — ${INSTANCIA} — ${fecha.toISOString().slice(0, 10)}`],
      [],
      ["Ruta", "Vehículo", "Conductor", ...columnas, "Cargada"],
    ];
    for (const f of filas) {
      rows.push([f.numeroRuta, f.vehiculo, f.conductor, ...columnas.map((c) => f.celdas[c] ?? "—"), f.cargada]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Áreas para Cargar");
    enviarExcel(res, wb, `areas_carga_${fecha.toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/planeacion/reportes/auditoria.xlsx?fecha= — bitácora de cambios del día.
router.get("/auditoria.xlsx", requirePermiso("reportes.exportar"), async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const desde = new Date(fecha);
    const hasta = new Date(fecha);
    hasta.setHours(23, 59, 59, 999);
    const registros = await prisma.auditLog.findMany({ where: { fecha: { gte: desde, lte: hasta } }, orderBy: { fecha: "asc" } });

    const rows: (string | number)[][] = [
      [`Auditoría — ${INSTANCIA} — ${fecha.toISOString().slice(0, 10)}`],
      [],
      ["Fecha/Hora", "Usuario", "Módulo", "Acción", "Detalle"],
    ];
    for (const r of registros) {
      rows.push([r.fecha.toLocaleString("es-CO"), r.usuario ?? "", r.modulo ?? "", r.accion ?? "", r.detalle ?? ""]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoría");
    enviarExcel(res, wb, `auditoria_${fecha.toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    next(err);
  }
});

export default router;
