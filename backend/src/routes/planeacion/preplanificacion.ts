// Pre-planificación — trae las facturas TAT (Agropecuaria + Inversiones) del
// mismo origen que ya usa Ejecución (apiconsulta/Siesa) para un rango de
// fechas COMPLETO (no una factura puntual) y las agrupa por ciudad, para que
// Planeación decida rutas antes de que Ejecución las cargue una a una.
import { Router } from "express";
import { prismaEjec } from "../../lib/prisma";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { env } from "../../config/env";
import { resolverCiudad } from "../../lib/ciudadesColombia";

const router = Router();
router.use(requireAuth, requirePermiso("programacion.ver"));

const CIA_POR_ORIGEN: Record<string, string> = { AGROPECUARIA: "3", INVERSIONES: "8" };
const PAGE_SIZE = 1000;

interface TatInvoiceRaw {
  nro_documento?: string;
  fecha_documento?: string;
  tipo_comercial?: string;
  cliente_factura?: string;
  razon_social_cliente?: string;
  codigo_sucursal?: string;
  descripcion_sucursal?: string;
  direccion_sucursal?: string;
  cantidad_inv?: number;
  valor_subtotal?: number;
}
interface TatInvoicesResponse {
  has_more?: boolean;
  next_offset?: number | null;
  data?: TatInvoiceRaw[];
}

// Trae TODAS las líneas de un origen en el rango de fechas (paginado), igual
// que hace SIGCOM internamente para su propio flujo de despacho.
async function fetchFacturasRango(origen: string, fechaInicio: string, fechaFin: string): Promise<TatInvoiceRaw[]> {
  const cia = CIA_POR_ORIGEN[origen];
  if (!cia) return [];
  const base = origen === "INVERSIONES" ? env.FACTURAS_INV_URL : env.FACTURAS_AGRO_URL;
  const lineas: TatInvoiceRaw[] = [];
  let offset = 0;
  for (let guard = 0; guard < 200; guard++) {
    const qs = new URLSearchParams({
      cia, fecha_inicio: fechaInicio, fecha_fin: fechaFin,
      limit: String(PAGE_SIZE), offset: String(offset),
      ...(env.CLIENTES_TAT_TOKEN ? { token: env.CLIENTES_TAT_TOKEN } : {}),
    });
    let resp: Response;
    try {
      resp = await fetch(`${base}?${qs}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    } catch (err) {
      throw new HttpError(502, `No se pudo conectar con Siesa (${(err as Error)?.name ?? "error"})`);
    }
    if (!resp.ok) throw new HttpError(502, `Siesa respondió ${resp.status} para ${origen}`);
    const json = (await resp.json().catch(() => ({}))) as TatInvoicesResponse;
    lineas.push(...(json.data ?? []));
    const nextOffset = json.next_offset;
    if (json.has_more && typeof nextOffset === "number") offset = nextOffset;
    else break;
  }
  return lineas;
}

// Limpia "3202 - CANUTA COMESTIBLE" -> "CANUTA COMESTIBLE" (igual que en órdenes).
function limpiarProducto(tipo: string): string {
  const s = tipo.trim();
  const m = /^\d+\s*-\s*(.+)$/.exec(s);
  return (m ? m[1] : s).replace(/\s+/g, " ").trim();
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// yyyy-mm-ddTHH:MM:SS (Siesa) -> dd/mm/aaaa (Siesa no trae hora real, siempre 00:00:00).
function formatFechaDoc(iso: string | undefined): string {
  const s = String(iso ?? "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

// GET /api/planeacion/preplanificacion?fecha=&fechaFin=&origen=TODOS|AGROPECUARIA|INVERSIONES
//   &agrupar=ciudad|barrio&buscar=&producto=&kgMin=
router.get("/", async (req, res, next) => {
  try {
    const fecha = String(req.query.fecha ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const fechaFin = String(req.query.fechaFin ?? fecha).slice(0, 10);
    const origenParam = String(req.query.origen ?? "TODOS").toUpperCase();
    const origenes = origenParam === "TODOS" ? ["AGROPECUARIA", "INVERSIONES"] : [origenParam];
    const criterio = req.query.agrupar === "barrio" ? "barrio" : "ciudad";
    const buscar = norm(String(req.query.buscar ?? "").trim());
    const productoFiltro = norm(String(req.query.producto ?? "").trim());
    const kgMin = Number(req.query.kgMin) || 0;

    const todas: (TatInvoiceRaw & { origen: string })[] = [];
    for (const o of origenes) {
      if (!CIA_POR_ORIGEN[o]) continue;
      const filas = await fetchFacturasRango(o, fecha, fechaFin);
      for (const f of filas) todas.push({ ...f, origen: o });
    }

    // Lista de productos disponibles en TODO el rango (antes de filtrar), para
    // poblar el selector del filtro con las opciones reales de este período.
    const productosDisponibles = [...new Set(
      todas.map((f) => limpiarProducto(String(f.tipo_comercial ?? ""))).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "es"));

    // 1) Agrupa las líneas crudas por documento (remisión): un documento trae
    // varias líneas, una por tipo de producto.
    interface DocInterno {
      origen: string; numero: string; fecha: string; nit: string;
      clienteRaw: string; sucursal: string; direccion: string; codigoSucursal: string;
      kg: number; valor: number; productos: { tipoComercial: string; kg: number; valor: number }[];
    }
    const documentos = new Map<string, DocInterno>();
    for (const f of todas) {
      const key = `${f.origen}|${f.nro_documento}`;
      let doc = documentos.get(key);
      if (!doc) {
        doc = {
          origen: f.origen, numero: String(f.nro_documento ?? ""), fecha: formatFechaDoc(f.fecha_documento),
          nit: String(f.cliente_factura ?? "").trim(), clienteRaw: String(f.razon_social_cliente ?? "").trim(),
          sucursal: String(f.descripcion_sucursal ?? "").trim(), direccion: String(f.direccion_sucursal ?? "").trim(),
          codigoSucursal: String(f.codigo_sucursal ?? "").trim(),
          kg: 0, valor: 0, productos: [],
        };
        documentos.set(key, doc);
      }
      const kg = Number(f.cantidad_inv) || 0;
      const valor = Number(f.valor_subtotal) || 0;
      doc.kg += kg; doc.valor += valor;
      doc.productos.push({ tipoComercial: limpiarProducto(String(f.tipo_comercial ?? "")), kg, valor });
    }

    // 2) Filtros: producto (recorta líneas y recalcula kg/valor del documento),
    // kgMin (excluye documentos livianos), buscar (cliente/NIT/número).
    let docsFiltrados = [...documentos.values()];
    if (productoFiltro) {
      docsFiltrados = docsFiltrados
        .map((d) => {
          const productos = d.productos.filter((p) => norm(p.tipoComercial).includes(productoFiltro));
          return { ...d, productos, kg: productos.reduce((s, p) => s + p.kg, 0), valor: productos.reduce((s, p) => s + p.valor, 0) };
        })
        .filter((d) => d.productos.length > 0);
    }
    if (kgMin > 0) docsFiltrados = docsFiltrados.filter((d) => d.kg >= kgMin);
    if (buscar) {
      docsFiltrados = docsFiltrados.filter((d) =>
        norm(d.clienteRaw).includes(buscar) || norm(d.nit).includes(buscar) || norm(d.numero).includes(buscar)
      );
    }

    // Cruce con el maestro de clientes TAT para resolver ciudad/barrio real.
    // "ciudad" se valida contra el listado real de municipios de Colombia:
    // el campo comuna/provincia a veces trae en realidad un BARRIO (ej. "Ciudad
    // Jardín", "Comuna 3"), lo que antes inflaba grupos de "ciudad" falsos.
    const nits = [...new Set(docsFiltrados.map((d) => d.nit).filter(Boolean))];
    const clientesTat = nits.length
      ? await prismaEjec.cliente.findMany({
          where: { tipo: "TAT", OR: nits.map((n) => ({ codigoDireccion: { startsWith: n } })) },
          select: { codigoDireccion: true, cliente: true, comuna: true, provincia: true, region: true, barrio: true },
        })
      : [];
    const porNit = new Map<string, { cliente: string | null; ciudad: string | null; barrio: string | null }[]>();
    for (const c of clientesTat) {
      const nit = (c.codigoDireccion ?? "").split("-")[0];
      const arr = porNit.get(nit) ?? [];
      arr.push({
        cliente: c.cliente,
        ciudad: resolverCiudad(c.comuna, c.provincia, c.region),
        barrio: (c.barrio || c.comuna || "").trim() || null,
      });
      porNit.set(nit, arr);
    }

    // 3) Agrupa: grupo (ciudad/barrio) -> cliente -> documentos completos.
    interface ClienteAgrupado { nombre: string; nit: string; kg: number; valor: number; documentos: DocInterno[] }
    interface Agrupado { nombre: string; kg: number; valor: number; clientes: Map<string, ClienteAgrupado> }
    const porGrupo = new Map<string, Agrupado>();
    let totalKg = 0, totalValor = 0;
    for (const d of docsFiltrados) {
      const match = porNit.get(d.nit)?.[0];
      const nombreGrupo = criterio === "barrio" ? (match?.barrio || "Sin barrio") : (match?.ciudad || "Sin ciudad");
      const nombreCliente = match?.cliente || d.clienteRaw || d.nit || "(sin nombre)";
      totalKg += d.kg; totalValor += d.valor;

      let grupo = porGrupo.get(nombreGrupo);
      if (!grupo) { grupo = { nombre: nombreGrupo, kg: 0, valor: 0, clientes: new Map() }; porGrupo.set(nombreGrupo, grupo); }
      grupo.kg += d.kg; grupo.valor += d.valor;

      const claveCliente = `${nombreCliente}|${d.nit}`;
      let cli = grupo.clientes.get(claveCliente);
      if (!cli) { cli = { nombre: nombreCliente, nit: d.nit, kg: 0, valor: 0, documentos: [] }; grupo.clientes.set(claveCliente, cli); }
      cli.kg += d.kg; cli.valor += d.valor;
      cli.documentos.push(d);
    }

    const grupos = [...porGrupo.values()]
      .map((g) => ({
        nombre: g.nombre,
        kg: Math.round(g.kg),
        valor: Math.round(g.valor),
        clientes: [...g.clientes.values()]
          .map((c) => ({
            nombre: c.nombre,
            nit: c.nit,
            kg: Math.round(c.kg),
            valor: Math.round(c.valor),
            documentos: c.documentos
              .map((d) => ({
                numero: d.numero, origen: d.origen, fecha: d.fecha,
                sucursal: d.sucursal || null, direccion: d.direccion || null,
                kg: Math.round(d.kg * 100) / 100, valor: Math.round(d.valor),
                productos: d.productos.map((p) => ({ tipoComercial: p.tipoComercial, kg: Math.round(p.kg * 100) / 100, valor: Math.round(p.valor) })),
              }))
              .sort((a, b) => b.fecha.localeCompare(a.fecha)),
          }))
          .sort((a, b) => b.kg - a.kg),
      }))
      .sort((a, b) => b.kg - a.kg);

    res.json({
      fecha, fechaFin, origen: origenParam, criterio,
      totalKg: Math.round(totalKg), totalValor: Math.round(totalValor), totalFacturas: docsFiltrados.length,
      productosDisponibles,
      grupos,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
