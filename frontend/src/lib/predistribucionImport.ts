// Importador de la orden de compra (Éxito) para Predistribución — puerto de
// legacy_fastapi/app/predistribucion.py: localiza la hoja de datos por
// cabecera (Dep/Plu/C.Ped, con alias tolerantes), pivotea producto×tienda y
// separa bovino/porcino por prefijo SIESA (1xxx/2xxx) o por nombre del corte.
import * as XLSX from "xlsx";

export interface ProductoPivot { siesa: string; plu: string; desc: string }
export interface ConsolidadoTipo {
  tipo: "bovino" | "porcino";
  productos: ProductoPivot[];
  tiendas: { dep: string; desc: string }[];
  celdas: Record<string, number>; // key = `${plu}|${dep}`
  totalesFila: Record<string, number>; // key = plu
  granTotal: number;
}

const ALIAS: Record<string, string[]> = {
  dep: ["dep"],
  depDesc: ["dep desc", "dependencia"],
  plu: ["plu"],
  desc: ["desc plu", "descripcion", "descripción"],
  ped: ["c.ped", "c ped", "cantidad", "cant"],
  siesa: ["codigo de siesa", "siesa", "cod siesa"],
  ffin: ["f.fin", "f fin", "ffin", "fecha entrega", "fecha de entrega", "fecha"],
  orden: ["orden", "no orden", "nº orden", "pedido"],
};

const PORC_KEYWORDS = ["CERDO", "PORC", "TOCINETA", "PAPADA", "PEZUNA", "CHULETA", "CODILLO", "ESPINAZO", "COSTILLA SAN LUIS", "SOLOMITO CERDO", "BONDIOLA"];

function norm(v: unknown): string | number {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  return v as string | number;
}
const s = (v: unknown): string => (v === null || v === undefined ? "" : String(norm(v)).trim());
const int = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

function clasificarTipo(siesa: string, nombre: string): "bovino" | "porcino" {
  const sTrim = siesa.trim();
  if (sTrim.startsWith("2")) return "porcino";
  if (sTrim.startsWith("1")) return "bovino";
  const n = nombre.toUpperCase();
  return PORC_KEYWORDS.some((w) => n.includes(w)) ? "porcino" : "bovino";
}

function localizarHoja(wb: XLSX.WorkBook): { filas: unknown[][]; cols: Record<string, number>; headerIdx: number } | null {
  let mejor: { filas: unknown[][]; cols: Record<string, number>; headerIdx: number; n: number } | null = null;

  for (const sheetName of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null }) as unknown[][];
    for (let i = 0; i < Math.min(8, filas.length); i++) {
      const fila = filas[i] ?? [];
      const cab: Record<string, number> = {};
      fila.forEach((val, c) => {
        const k = s(val).toLowerCase();
        if (k && !(k in cab)) cab[k] = c;
      });
      const col = (key: string): number | null => {
        for (const a of ALIAS[key]) if (a in cab) return cab[a];
        return null;
      };
      const cd = col("dep");
      const cp = col("plu");
      const cq = col("ped");
      if (cd === null || cp === null || cq === null) continue;

      let n = 0;
      for (const f of filas.slice(i + 1)) {
        if (f && cp < f.length && cq < f.length && s(f[cp]) && int(f[cq]) > 0) n++;
      }
      if (!mejor || n > mejor.n) {
        const cols: Record<string, number> = {};
        for (const key of Object.keys(ALIAS)) {
          const c = col(key);
          if (c !== null) cols[key] = c;
        }
        mejor = { filas, cols, headerIdx: i, n };
      }
      break; // una cabecera por hoja basta
    }
  }
  return mejor && mejor.n > 0 ? mejor : null;
}

export interface LineaOC {
  dep: string; depDesc: string; plu: string; desc: string; siesa: string;
  cantidad: number; ffin: string; orden: string; tipo: "bovino" | "porcino";
}

// Lee la orden de compra completa (todas las líneas, con su fecha de entrega
// "ffin"), SIN consolidar todavía — permite elegir qué fechas incluir antes
// de generar el pivote, igual que legacy_fastapi/app/predistribucion.py.
export async function leerLineasOrdenCompra(file: File): Promise<{ lineas: LineaOC[]; fechas: string[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const encontrada = localizarHoja(wb);
  if (!encontrada) throw new Error("No se encontró una hoja con columnas Dep/Plu/C.Ped reconocibles.");
  const { filas, cols, headerIdx } = encontrada;

  const lineas: LineaOC[] = [];
  for (const fila of filas.slice(headerIdx + 1)) {
    if (!fila) continue;
    const dep = cols.dep !== undefined ? s(fila[cols.dep]) : "";
    const plu = cols.plu !== undefined ? s(fila[cols.plu]) : "";
    const cantidad = cols.ped !== undefined ? int(fila[cols.ped]) : 0;
    if (!dep || !plu || cantidad <= 0) continue;

    const desc = cols.desc !== undefined ? s(fila[cols.desc]) : "";
    const depDesc = cols.depDesc !== undefined ? s(fila[cols.depDesc]) : dep;
    const siesa = cols.siesa !== undefined ? s(fila[cols.siesa]) : "";
    const ffin = cols.ffin !== undefined ? s(fila[cols.ffin]) : "";
    const orden = cols.orden !== undefined ? s(fila[cols.orden]) : "";
    lineas.push({ dep, depDesc, plu, desc, siesa, cantidad, ffin, orden, tipo: clasificarTipo(siesa, desc) });
  }

  const fechas = [...new Set(lineas.map((l) => l.ffin).filter(Boolean))].sort();
  return { lineas, fechas };
}

// Arma el pivote producto×tienda (bovino + porcino) a partir de un subconjunto
// de líneas ya filtrado por las fechas de entrega elegidas por el usuario.
export function pivotarLineas(lineas: LineaOC[]): { bovino: ConsolidadoTipo; porcino: ConsolidadoTipo } {
  const tipos: Record<"bovino" | "porcino", ConsolidadoTipo> = {
    bovino: { tipo: "bovino", productos: [], tiendas: [], celdas: {}, totalesFila: {}, granTotal: 0 },
    porcino: { tipo: "porcino", productos: [], tiendas: [], celdas: {}, totalesFila: {}, granTotal: 0 },
  };
  const productosVistos: Record<"bovino" | "porcino", Set<string>> = { bovino: new Set(), porcino: new Set() };
  const tiendasVistas: Record<"bovino" | "porcino", Set<string>> = { bovino: new Set(), porcino: new Set() };

  for (const l of lineas) {
    const c = tipos[l.tipo];
    if (!productosVistos[l.tipo].has(l.plu)) {
      productosVistos[l.tipo].add(l.plu);
      c.productos.push({ siesa: l.siesa, plu: l.plu, desc: l.desc });
    }
    if (!tiendasVistas[l.tipo].has(l.dep)) {
      tiendasVistas[l.tipo].add(l.dep);
      c.tiendas.push({ dep: l.dep, desc: l.depDesc });
    }
    const key = `${l.plu}|${l.dep}`;
    c.celdas[key] = (c.celdas[key] ?? 0) + l.cantidad;
    c.totalesFila[l.plu] = (c.totalesFila[l.plu] ?? 0) + l.cantidad;
    c.granTotal += l.cantidad;
  }
  return tipos;
}

// Compatibilidad: lee y consolida TODAS las fechas de una vez (sin selector).
export async function leerOrdenCompra(file: File): Promise<{ bovino: ConsolidadoTipo; porcino: ConsolidadoTipo }> {
  const { lineas } = await leerLineasOrdenCompra(file);
  return pivotarLineas(lineas);
}
