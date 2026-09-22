// Fuente única de verdad de categorías de Programación — puerto de
// legacy_fastapi/app/repos/programacion.py (CATEGORIAS/CANASTILLA_KG) y
// planificacion_areas.py (AREAS/AREA_LABEL). `instancia` es vestigial en el
// original (post-migración 2026_instancia_unica.sql todo vive en "GENERAL");
// aquí se simplifica directamente a esa constante.
export const INSTANCIA = "GENERAL";

export const CANASTILLA_KG = 1.9;

export interface Categoria {
  clave: string;
  etiqueta: string;
  kls: string;
  can: string;
}

export const CATEGORIAS: Categoria[] = [
  { clave: "bovino", etiqueta: "Bovino", kls: "klsBovino", can: "canastillasBovino" },
  { clave: "viscera_bovino", etiqueta: "Víscera Bovino", kls: "klsVisceraBovino", can: "canastillasVisceraBovino" },
  { clave: "porcino", etiqueta: "Porcino", kls: "klsPorcino", can: "canastillasPorcino" },
  { clave: "viscera_porcino", etiqueta: "Víscera Porcino", kls: "klsVisceraPorcino", can: "canastillasVisceraPorcino" },
  { clave: "inversion", etiqueta: "Inversiones", kls: "klsInversion", can: "canastillasInversion" },
  { clave: "tat", etiqueta: "TAT", kls: "klsTat", can: "canastillasTat" },
  { clave: "otros", etiqueta: "Otros", kls: "klsOtros", can: "canastillasOtros" },
];

export const AREAS = CATEGORIAS.map((c) => c.clave);
export const AREA_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.clave, c.etiqueta])
);
// Áreas de Programación asignables a un usuario (usuario_columnas) — deben
// coincidir EXACTO con las etiquetas (no las claves).
export const AREAS_USUARIO = CATEGORIAS.map((c) => c.etiqueta);

export function areaValida(area: string): boolean {
  return AREAS.includes(area);
}

export const DETALLE_COLS: string[] = CATEGORIAS.flatMap((c) => [c.kls, c.can]);
export const KLS_COLS = new Set(CATEGORIAS.map((c) => c.kls));

export function totalesDetalle(filas: Record<string, number | null | undefined>[]): { kls: number; canastillas: number } {
  let kls = 0;
  let canastillas = 0;
  for (const fila of filas) {
    for (const col of DETALLE_COLS) {
      const v = Number(fila[col] ?? 0);
      if (KLS_COLS.has(col)) kls += v;
      else canastillas += v;
    }
  }
  return { kls, canastillas };
}
