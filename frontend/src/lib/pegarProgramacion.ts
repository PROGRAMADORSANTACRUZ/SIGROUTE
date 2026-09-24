// Pegado inteligente desde Excel para la grilla de Programación: el usuario
// copia un rango (con fila de encabezados) desde su Excel de programación de
// despacho y lo pega aquí; se detectan las columnas por el texto de sus
// encabezados (no por posición fija), porque D-Mega y D-Casa no usan
// exactamente el mismo orden de columnas en su Excel.
export interface CategoriaCol {
  clave: string;
  etiqueta: string;
  kls: string;
  can: string;
}

export interface DestinoRef {
  id: string;
  nombre: string;
}

export interface FilaPegada {
  destinoTexto: string;
  destinoId: string | null;
  valores: Record<string, number>; // clave "kls"/"can" de la categoría -> valor
}

export interface ResultadoPegado {
  columnaDestinoIdx: number;
  categoriasDetectadas: { clave: string; etiqueta: string; colKls: number | null; colCan: number | null }[];
  filas: FilaPegada[];
  noEncontrados: string[];
  filasIgnoradas: number; // filas sin texto de destino reconocible (vacías/separadoras)
}

function normalizar(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Identifica a qué categoría (por clave) corresponde un encabezado de "kilos"
// — víscera se revisa primero para no confundirla con la categoría base.
function categoriaDeEncabezado(header: string): string | null {
  const h = normalizar(header);
  if (!h) return null;
  const esViscera = h.includes("viscera");
  if (esViscera && h.includes("bovino")) return "viscera_bovino";
  if (esViscera && (h.includes("porcino") || h.includes("procino"))) return "viscera_porcino";
  if (h.includes("bovino")) return "bovino";
  if (h.includes("porcino")) return "porcino";
  if (h.includes("invers")) return "inversion";
  if (h.includes("tat")) return "tat";
  if (h.includes("otro")) return "otros";
  return null;
}

// Encabezado de columna "canastillas" (o su equivalente Unds/Cajas/Can).
function esEncabezadoCanastillas(header: string): boolean {
  const h = normalizar(header);
  return h === "unds" || h === "und" || h === "can" || h === "canastilla" || h === "canastillas" || h === "caja" || h === "cajas";
}

// Columnas explícitamente ignorables (info auxiliar del Excel que no vive en
// nuestro modelo: total de reses/cerdos, el "Kls" computado bajo Canastillas,
// el TOTAL general, y la columna de orden "*").
function esEncabezadoIgnorable(header: string): boolean {
  const h = normalizar(header);
  return h === "" || h === "*" || h === "total" || h === "kls" || h.includes("total reses") || h.includes("total cerdos");
}

function esEncabezadoDestino(header: string): boolean {
  const h = normalizar(header);
  return h.includes("destino") || h.includes("cliente") || h.includes("tienda") || h === "nombre";
}

function parseNumeroCelda(v: string): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // Los Excel reales usan formato "en-US" (coma de miles, punto decimal —
  // igual que las facturas Siesa): "1,707" es 1707, no 1.707.
  const limpio = s.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!limpio) return 0;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

// Parser tipo CSV/TSV con comillas: cuando una celda de Excel tiene salto de
// línea interno (ej. el encabezado real "KLS\nBOVINO"), el portapapeles la
// envuelve en comillas dobles — hay que respetarlas o un \n interno se
// confundiría con un salto de fila real.
function splitFilas(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let dentroComillas = false;
  const s = texto.replace(/\r\n/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (dentroComillas) {
      if (ch === '"') {
        if (s[i + 1] === '"') { celda += '"'; i++; }
        else dentroComillas = false;
      } else {
        celda += ch;
      }
      continue;
    }
    if (ch === '"' && celda === "") { dentroComillas = true; continue; }
    if (ch === "\t") { fila.push(celda); celda = ""; continue; }
    if (ch === "\n") { fila.push(celda); filas.push(fila); fila = []; celda = ""; continue; }
    celda += ch;
  }
  fila.push(celda);
  filas.push(fila);
  // Colapsa el salto de línea interno de celdas con texto envuelto (p. ej.
  // "KLS\nBOVINO" -> "KLS BOVINO") para que la detección de encabezados
  // funcione igual sin importar si Excel lo pegó con o sin comillas.
  return filas
    .map((f) => f.map((c) => c.replace(/\n/g, " ")))
    .filter((f) => f.some((c) => c.trim() !== ""));
}

export function parsearPegadoProgramacion(
  texto: string,
  categorias: CategoriaCol[],
  destinos: DestinoRef[]
): ResultadoPegado {
  const filasRaw = splitFilas(texto);
  if (filasRaw.length === 0) {
    return { columnaDestinoIdx: -1, categoriasDetectadas: [], filas: [], noEncontrados: [], filasIgnoradas: 0 };
  }

  // Busca la fila de encabezados entre las primeras filas (tolera 1-2 filas
  // de título/fecha antes, como en el Excel real): la primera fila que
  // reconozca al menos una columna de destino o de categoría.
  let idxHeader = 0;
  for (let i = 0; i < Math.min(filasRaw.length, 4); i++) {
    const fila = filasRaw[i];
    const tieneDestino = fila.some(esEncabezadoDestino);
    const tieneCategoria = fila.some((c) => categoriaDeEncabezado(c) !== null);
    if (tieneDestino || tieneCategoria) { idxHeader = i; break; }
  }
  const header = filasRaw[idxHeader];
  // Sub-fila (Unds/Kls) inmediatamente debajo del encabezado principal, si existe.
  const subHeader = filasRaw[idxHeader + 1]?.some((c) => esEncabezadoCanastillas(c) || esEncabezadoIgnorable(c))
    ? filasRaw[idxHeader + 1]
    : null;

  let columnaDestinoIdx = header.findIndex(esEncabezadoDestino);
  if (columnaDestinoIdx === -1) {
    // Sin encabezado "Destino" explícito: usa la primera columna que no sea
    // la de orden ("*"/numérica) — igual que el Excel real (col0="*", col1=Destino).
    columnaDestinoIdx = esEncabezadoIgnorable(header[0]) || /^\d+$/.test((header[0] ?? "").trim()) ? 1 : 0;
  }

  // Detecta, para cada columna del encabezado, si es "kls" de una categoría;
  // luego busca su "can" pareja en las columnas siguientes (encabezado o
  // sub-encabezado) antes de la próxima columna de categoría reconocida.
  // Algunos Excel (D-Casa) usan una columna "KLS VÍSCERA" genérica, sin decir
  // de qué especie — se asocia a la última especie (bovino/porcino) vista.
  const colKls: Record<string, number> = {};
  const colCan: Record<string, number> = {};
  const canUsados = new Set<number>();
  let ultimaEspecie: "bovino" | "porcino" | null = null;
  for (let i = 0; i < header.length; i++) {
    let clave = categoriaDeEncabezado(header[i]);
    if (clave === "bovino" || clave === "porcino") ultimaEspecie = clave;
    if (!clave) {
      const h = normalizar(header[i]);
      const viscAmbigua = `viscera_${ultimaEspecie}`;
      if (h.includes("viscera") && ultimaEspecie && !(viscAmbigua in colKls)) clave = viscAmbigua;
    }
    if (!clave || clave in colKls) continue;
    colKls[clave] = i;
    for (let j = i + 1; j < header.length; j++) {
      if (categoriaDeEncabezado(header[j])) break; // empezó la siguiente categoría
      if (canUsados.has(j)) continue; // ya es la canastilla de otra categoría (ej. bovino+víscera comparten una sola columna)
      const esCan = esEncabezadoCanastillas(header[j]) || (subHeader && esEncabezadoCanastillas(subHeader[j] ?? ""));
      if (esCan) { colCan[clave] = j; canUsados.add(j); break; }
    }
  }

  const categoriasDetectadas = categorias.map((c) => ({
    clave: c.clave,
    etiqueta: c.etiqueta,
    colKls: colKls[c.clave] ?? null,
    colCan: colCan[c.clave] ?? null,
  }));

  const porNombre = new Map(destinos.map((d) => [normalizar(d.nombre), d.id]));

  const filaDatosInicio = idxHeader + (subHeader ? 2 : 1);
  const filas: FilaPegada[] = [];
  const noEncontrados: string[] = [];
  let filasIgnoradas = 0;

  for (let i = filaDatosInicio; i < filasRaw.length; i++) {
    const fila = filasRaw[i];
    const destinoTexto = (fila[columnaDestinoIdx] ?? "").trim();
    if (!destinoTexto) { filasIgnoradas++; continue; }
    const destinoId = porNombre.get(normalizar(destinoTexto)) ?? null;
    const valores: Record<string, number> = {};
    for (const c of categorias) {
      const ik = colKls[c.clave];
      const ic = colCan[c.clave];
      if (ik != null) valores[c.kls] = parseNumeroCelda(fila[ik] ?? "");
      if (ic != null) valores[c.can] = parseNumeroCelda(fila[ic] ?? "");
    }
    filas.push({ destinoTexto, destinoId, valores });
    if (!destinoId) noEncontrados.push(destinoTexto);
  }

  return { columnaDestinoIdx, categoriasDetectadas, filas, noEncontrados, filasIgnoradas };
}
