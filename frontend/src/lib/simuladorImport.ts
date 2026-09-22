// Importador del Excel de reparto (hojas CONSOLIDADO + REPARTO) — puerto
// exacto de legacy_fastapi/app/simulador.py::leer_perfil, para poder recargar
// el perfil de rendimiento del Simulador sin pasar por el backend en Python.
import * as XLSX from "xlsx";

export interface ProductoPerfil {
  plu: string;
  siesa: string;
  nombrePlanta: string;
  nombreExito: string;
  unidad: "KG" | "UND";
  kgRes: number;
  precio: number;
  orden: number;
}
export interface TiendaPerfil { dep: string; nombre: string; orden: number }
export interface PerfilImportado {
  nombre: string;
  origen: string;
  productos: ProductoPerfil[];
  tiendas: TiendaPerfil[];
  surtido: Record<string, string[]>;
  avisos: string[];
}

const UND_RE = /\b(VISCERA\w*|MENUDENCIA\w*)\b/i;
const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const esUnidad = (nombre: string) => UND_RE.test(sinTildes(nombre));
const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();
const limpia = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function hoja(wb: XLSX.WorkBook, nombre: string): unknown[][] | null {
  const objetivo = nombre.toUpperCase();
  const sheetName = wb.SheetNames.find((n) => n.toUpperCase() === objetivo);
  if (!sheetName) return null;
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null }) as unknown[][];
}

export async function leerPerfilExcel(file: File): Promise<PerfilImportado> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const filasReparto = hoja(wb, "REPARTO");
  if (!filasReparto) {
    throw new Error(`El archivo no tiene la hoja 'REPARTO'. Hojas encontradas: ${wb.SheetNames.join(", ")}`);
  }
  if (filasReparto.length < 4) throw new Error("La hoja 'REPARTO' no tiene suficientes filas.");

  const avisos: string[] = [];

  // ── CONSOLIDADO: precios y códigos SIESA, indexados por nombre de planta ──
  const precios = new Map<string, { siesa: string; plu: string; precio: number }>();
  const filasConsolidado = hoja(wb, "CONSOLIDADO");
  if (!filasConsolidado) {
    avisos.push("El archivo no trae hoja 'CONSOLIDADO': el perfil queda sin precios (se pueden cargar a mano).");
  } else {
    for (const fila of filasConsolidado.slice(1)) {
      if (!fila) continue;
      const nombre = limpia(fila[1]);
      if (!nombre || norm(fila[0]) === "TOTAL" || norm(fila[0]) === "TOTALES") continue;
      if (norm(nombre) === "TOTAL" || norm(nombre) === "TOTALES") continue;
      precios.set(norm(nombre), { siesa: str(fila[0]), plu: str(fila[2]), precio: num(fila[4]) });
    }
  }

  // ── REPARTO: fila0=nombres tienda, fila1=reses, fila2=dep, fila3+=productos ──
  const [fNombres, , fDeps] = filasReparto;
  const idxTiendas: number[] = [];
  for (let i = 4; i < fDeps.length; i++) {
    if (norm(fNombres[i]).startsWith("TOTAL")) break;
    if (str(fDeps[i])) idxTiendas.push(i);
  }
  if (idxTiendas.length === 0) {
    throw new Error("No se encontraron columnas de tienda en 'REPARTO'. Se esperaba: fila 1 = nombres, fila 2 = reses, fila 3 = códigos Dep.");
  }

  const tiendas: TiendaPerfil[] = idxTiendas.map((i, orden) => ({
    dep: str(fDeps[i]),
    nombre: limpia(fNombres[i]) || str(fDeps[i]),
    orden,
  }));

  const productos: ProductoPerfil[] = [];
  const surtido: Record<string, string[]> = {};
  const vistos = new Set<string>();

  filasReparto.slice(3).forEach((fila, orden) => {
    if (!fila) return;
    const nombrePlanta = limpia(fila[0]);
    const nombreExito = limpia(fila[1]);
    const plu = str(fila[2]);
    if (!plu || norm(plu) === "TOTAL" || norm(plu) === "TOTALES") return;
    if (norm(nombrePlanta) === "TOTAL" || norm(nombrePlanta) === "TOTALES") return;
    if (vistos.has(plu)) {
      avisos.push(`PLU ${plu} aparece repetido en REPARTO; se usa la primera fila.`);
      return;
    }
    vistos.add(plu);

    const info = precios.get(norm(nombrePlanta));
    if (info?.plu && info.plu !== plu) {
      avisos.push(`«${nombreExito || nombrePlanta}»: el PLU de CONSOLIDADO (${info.plu}) no coincide con el de REPARTO (${plu}). Se usa el de REPARTO.`);
    }
    if (!info) avisos.push(`«${nombrePlanta}» no está en CONSOLIDADO: queda sin precio.`);

    const unidad = esUnidad(nombreExito) || esUnidad(nombrePlanta) ? "UND" : "KG";
    productos.push({
      plu,
      siesa: info?.siesa ?? "",
      nombrePlanta,
      nombreExito: nombreExito || nombrePlanta,
      unidad,
      kgRes: Math.round(num(fila[3]) * 1e6) / 1e6,
      precio: Math.round((info?.precio ?? 0) * 100) / 100,
      orden,
    });

    const deps: string[] = [];
    for (const i of idxTiendas) {
      if (fila[i] !== null && fila[i] !== undefined && fila[i] !== "") deps.push(str(fDeps[i]));
    }
    surtido[plu] = deps;
  });

  if (productos.length === 0) throw new Error("No se encontraron productos en la hoja 'REPARTO'.");

  const enReparto = new Set(productos.map((p) => norm(p.nombrePlanta)));
  for (const [nomNorm, info] of precios) {
    if (!enReparto.has(nomNorm)) avisos.push(`PLU ${info.plu || "?"} está en CONSOLIDADO pero no en REPARTO: no entra al perfil.`);
  }
  if (productos.some((p) => p.unidad === "UND")) {
    avisos.push("Hay productos por UNIDAD (vísceras/menudencias). Se totalizan aparte de los kilos; verifica que el precio cargado sea por unidad.");
  }

  return { nombre: file.name.replace(/\.xlsx?$/i, ""), origen: file.name, productos, tiendas, surtido, avisos };
}
