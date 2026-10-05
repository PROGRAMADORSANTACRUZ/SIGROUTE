// Importa directo a la base de datos (sin pasar por el endpoint /api/clientes/import
// ni por la UI) el Excel real de direcciones de clientes de Distribución que
// exporta Drivin ("Direcciones CO - Agropecuaria Santacruz.xlsx"), usando
// exactamente la misma lógica de parseo/emparejamiento/upsert que
// src/routes/clientes.ts (POST /import): empareja por Código de Dirección (o
// por nombre si la fila no trae código), SOLO crea/actualiza — nunca borra
// clientes existentes que no vengan en el archivo.
//
// Uso: npx tsx scripts/_import-direcciones-distribucion.ts "<ruta-al-xlsx>" [--dry-run]
import * as fs from "fs";
import * as XLSX from "xlsx";
import { prismaPlan as prisma } from "../src/lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");
const rutaArchivo = process.argv[2];
if (!rutaArchivo) {
  console.error("Uso: npx tsx scripts/_import-direcciones-distribucion.ts <ruta-al-xlsx> [--dry-run]");
  process.exit(1);
}

function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Campo -> encabezado esperado en el Excel (idéntico a CAMPOS en clientes.ts).
const CAMPOS: { key: keyof ClienteRow; header: string }[] = [
  { key: "codigoDireccion", header: "Código de Dirección" },
  { key: "nombreDireccion", header: "Nombre de Dirección" },
  { key: "cliente", header: "Cliente" },
  { key: "tipoDireccion", header: "Tipo de Dirección" },
  { key: "direccion", header: "Dirección" },
  { key: "referencia", header: "Referencia" },
  { key: "descripcion", header: "Descripción" },
  { key: "comuna", header: "Comuna" },
  { key: "provincia", header: "Provincia" },
  { key: "region", header: "Región" },
  { key: "pais", header: "País" },
  { key: "codigoPostal", header: "Código Postal" },
  { key: "lat", header: "Lat" },
  { key: "lon", header: "Lon" },
];

const CAMPOS_EXTRA = ["barrio", "manzana", "lote", "tipoVia", "telefono", "correo", "puntoVenta", "tipo", "vendedor"] as const;

interface ClienteRow {
  codigoDireccion: string;
  nombreDireccion: string;
  cliente: string;
  tipoDireccion: string;
  direccion: string;
  referencia: string;
  descripcion: string;
  comuna: string;
  provincia: string;
  region: string;
  pais: string;
  codigoPostal: string;
  lat: string;
  lon: string;
  barrio?: string;
  manzana?: string;
  lote?: string;
  tipoVia?: string;
  telefono?: string;
  correo?: string;
  puntoVenta?: string;
  tipo?: string;
  vendedor?: string;
  extraDrivin?: string;
}

const ALIASES: Record<string, string[]> = {
  codigoDireccion: ["Código de Dirección", "Codigo de Direccion", "Código", "Codigo", "Nit_Cedula", "Nit Cedula", "Nit/Cedula", "Nit", "Cedula"],
  nombreDireccion: ["Nombre de Dirección", "Nombre de Direccion", "Descripción Sucursal", "Descripcion Sucursal"],
  cliente: ["Cliente", "Nombre", "Nombres", "Razón Social", "Razon Social"],
  tipoDireccion: ["Tipo de Dirección", "Tipo de Direccion"],
  direccion: ["Dirección", "Direccion"],
  referencia: ["Referencia"],
  descripcion: ["Descripción", "Descripcion"],
  comuna: ["Comuna", "Ciudad"],
  provincia: ["Provincia", "Departamento"],
  region: ["Región", "Region"],
  pais: ["País", "Pais"],
  codigoPostal: ["Código Postal", "Codigo Postal"],
  lat: ["Lat", "Latitud"],
  lon: ["Lon", "Lng", "Longitud"],
  barrio: ["Barrio"],
  manzana: ["Manzana"],
  lote: ["Lote"],
  tipoVia: ["Tipo de Vía", "Tipo de Via"],
  telefono: ["Teléfono", "Telefono", "Celular"],
  correo: ["Correo", "Email"],
  puntoVenta: ["Punto de Venta", "Punto_venta", "Puntoventa", "Punto"],
  tipo: ["Tipo"],
  vendedor: ["Vendedor"],
};

function tituloAuto(s: string): string {
  return s
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())
    .trim();
}

const CAMPOS_TITULO = new Set(["cliente", "referencia", "barrio"]);

function parseClientes(buffer: Buffer): { rows: ClienteRow[]; presentes: Set<string> } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (rows.length < 2) return { rows: [], presentes: new Set() };

  const headerRaw = rows[0].map((h) => String(h ?? "").trim());
  const header = headerRaw.map(norm);
  const idx: Record<string, number> = {};
  for (const key of Object.keys(ALIASES)) {
    const aliases = ALIASES[key].map(norm);
    idx[key] = header.findIndex((h) => aliases.includes(h));
  }
  const presentes = new Set(Object.keys(idx).filter((k) => idx[k] >= 0));

  const columnasReconocidas = new Set(Object.values(idx).filter((i) => i >= 0));
  const columnasExtra = headerRaw
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => h && !columnasReconocidas.has(i));
  const hayExtra = columnasExtra.length > 0;

  const pick = (r: unknown[], i: number, key: string) => {
    const v = i >= 0 ? String(r[i] ?? "").trim() : "";
    return v && CAMPOS_TITULO.has(key) ? tituloAuto(v) : v;
  };

  const out: ClienteRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const row = {} as ClienteRow;
    for (const { key } of CAMPOS) {
      row[key] = pick(r, idx[key], key);
    }
    for (const key of CAMPOS_EXTRA) {
      const v = pick(r, idx[key], key);
      if (v) row[key] = v;
    }
    if (hayExtra) {
      const extra: Record<string, string> = {};
      for (const { h, i: ci } of columnasExtra) {
        const v = String(r[ci] ?? "").trim();
        if (v) extra[h] = v;
      }
      if (Object.keys(extra).length > 0) row.extraDrivin = JSON.stringify(extra);
    }
    if (!row.codigoDireccion && !row.nombreDireccion && !row.cliente) continue;
    out.push(row);
  }
  return { rows: out, presentes: hayExtra ? new Set([...presentes, "extraDrivin"]) : presentes };
}

function comparable(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const CAMPOS_CONTENIDO = [
  ...CAMPOS.map((c) => c.key).filter((k) => k !== "codigoDireccion" && k !== "lat" && k !== "lon"),
  ...CAMPOS_EXTRA,
  "extraDrivin",
] as const;

async function main() {
  const buffer = fs.readFileSync(rutaArchivo);
  const { rows: filasCrudas, presentes } = parseClientes(buffer);
  if (filasCrudas.length === 0) {
    console.error("El archivo no contiene clientes válidos.");
    process.exit(1);
  }
  console.log(`Filas leídas del Excel: ${filasCrudas.length}`);

  // El maestro de Clientes YA tiene cargado (y así lo usa el resto de la app:
  // matching de Bovino/Porcino, export a Drivin, Referencia, etc.) que
  // Cliente.cliente = nombre ESPECÍFICO de la sucursal (ej. "Olimpica 201
  // Centro") y Cliente.nombreDireccion = nombre genérico de la cadena (ej.
  // "Olimpica"). Pero el Excel oficial que exporta Drivin trae esas DOS
  // columnas al revés ("Nombre de Dirección" = sucursal puntual, "Cliente" =
  // razón social genérica): si se importara tal cual con el mapeo por
  // defecto, se sobrescribiría el nombre específico ya cargado con el
  // genérico de la cadena, rompiendo el matching (two clientes "Olimpica" en
  // Santa Marta y en cualquier otra ciudad pasarían a ser indistinguibles).
  // Por eso, SOLO para este import puntual, se intercambian ambos campos al
  // leer cada fila para preservar la semántica ya establecida en la BD.
  const filas: ClienteRow[] = filasCrudas.map((f) => ({
    ...f,
    cliente: f.nombreDireccion || f.cliente,
    nombreDireccion: f.cliente || f.nombreDireccion,
  }));

  const clave = (f: { codigoDireccion: string; cliente: string; nombreDireccion: string }): string => {
    const cod = norm(f.codigoDireccion);
    if (cod) return `COD:${cod}`;
    const nombre = norm(f.cliente || f.nombreDireccion);
    return nombre ? `NOM:${nombre}` : "";
  };

  const porClave = new Map<string, ClienteRow>();
  let descartadas = 0;
  for (const f of filas) {
    const k = clave(f);
    if (!k) { descartadas++; continue; }
    porClave.set(k, f);
  }

  const existentes = await prisma.cliente.findMany();
  const existentePorClave = new Map<string, (typeof existentes)[number]>();
  for (const c of existentes) {
    const k = clave({ codigoDireccion: c.codigoDireccion ?? "", cliente: c.cliente ?? "", nombreDireccion: c.nombreDireccion ?? "" });
    if (k) existentePorClave.set(k, c);
  }

  let creados = 0;
  let actualizados = 0;
  let sinCambios = 0;

  type Operacion =
    | { tipo: "crear"; data: Record<string, string | null> }
    | { tipo: "actualizar"; id: string; data: Record<string, string | null> };
  const operaciones: Operacion[] = [];
  for (const [k, f] of porClave) {
    const actual = existentePorClave.get(k);
    if (!actual) {
      const data: Record<string, string | null> = {};
      for (const { key } of CAMPOS) data[key] = f[key] || null;
      for (const key of CAMPOS_EXTRA) data[key] = f[key] || null;
      data.extraDrivin = f.extraDrivin || null;
      operaciones.push({ tipo: "crear", data });
      continue;
    }
    let difiereContenido = false;
    const data: Record<string, string | null> = {};
    for (const key of CAMPOS_CONTENIDO) {
      if (!presentes.has(key)) continue;
      const nuevo = (f as unknown as Record<string, string | undefined>)[key] ?? "";
      const previo = (actual as unknown as Record<string, string | null>)[key];
      if (comparable(previo) !== comparable(nuevo)) difiereContenido = true;
      data[key] = nuevo || null;
    }
    if (!difiereContenido) { sinCambios++; continue; }
    data.lat = presentes.has("lat") ? (f.lat || null) : null;
    data.lon = presentes.has("lon") ? (f.lon || null) : null;
    operaciones.push({ tipo: "actualizar", id: actual.id, data });
  }

  console.log(`A crear: ${operaciones.filter((o) => o.tipo === "crear").length}`);
  console.log(`A actualizar: ${operaciones.filter((o) => o.tipo === "actualizar").length}`);
  console.log(`Sin cambios: ${sinCambios}`);
  console.log(`Descartadas (sin clave): ${descartadas}`);

  if (DRY_RUN) {
    console.log("--dry-run: no se escribió nada en la base de datos.");
    return;
  }

  const TAMANO_LOTE = 25;
  for (let i = 0; i < operaciones.length; i += TAMANO_LOTE) {
    const lote = operaciones.slice(i, i + TAMANO_LOTE);
    await Promise.all(
      lote.map((op) =>
        op.tipo === "crear"
          ? prisma.cliente.create({ data: { ...op.data, consecutivos: JSON.stringify([]) } }).then(() => { creados++; })
          : prisma.cliente.update({ where: { id: op.id }, data: op.data }).then(() => { actualizados++; })
      )
    );
    console.log(`Progreso: ${Math.min(i + TAMANO_LOTE, operaciones.length)}/${operaciones.length}`);
  }

  console.log(`Listo. Creados: ${creados}, Actualizados: ${actualizados}, Sin cambios: ${sinCambios}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
