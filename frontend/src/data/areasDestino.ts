// Áreas (categorías) de destino — espejo de backend/src/lib/planCategorias.ts,
// usado en Maestros (asignar áreas a un destino) y sus filtros.
export const AREAS_DESTINO: { clave: string; etiqueta: string }[] = [
  { clave: "bovino", etiqueta: "Bovino" },
  { clave: "viscera_bovino", etiqueta: "Víscera Bovino" },
  { clave: "porcino", etiqueta: "Porcino" },
  { clave: "viscera_porcino", etiqueta: "Víscera Porcino" },
  { clave: "inversion", etiqueta: "Inversiones" },
  { clave: "tat", etiqueta: "TAT" },
  { clave: "otros", etiqueta: "Otros" },
];

export const AREA_LABEL_DESTINO: Record<string, string> = Object.fromEntries(
  AREAS_DESTINO.map((a) => [a.clave, a.etiqueta])
);
