// Tabla de precios de flete 2026 (tarifa "Con Cargue", la única que se usa —
// confirmado con el usuario que casi siempre el vehículo va con cargue).
// Cada ruta tiene 1+ tramos por peso soportado por el vehículo (no por lo que
// realmente lleve en un viaje puntual — dos camiones del mismo tipo cobran
// igual sin importar si van a la mitad de su capacidad o llenos). Cuando una
// ruta solo tiene un precio en la tabla real (ej. Valledupar, Bucaramanga),
// ese precio aplica sin importar el peso del vehículo.
interface TramoFlete {
  // Peso mínimo (kg) del vehículo para que aplique este tramo.
  minKg: number;
  precio: number;
}

const TABLA_FLETES: Record<string, TramoFlete[]> = {
  BARRANQUILLA: [
    { minKg: 0, precio: 564000 },
    { minKg: 3000, precio: 794000 },
    { minKg: 7000, precio: 985000 },
  ],
  CARTAGENA: [
    { minKg: 0, precio: 763000 },
    { minKg: 3000, precio: 1019000 },
  ],
  "SANTA MARTA": [
    { minKg: 0, precio: 827000 },
    { minKg: 3000, precio: 1057000 },
  ],
  POBLACIONES: [{ minKg: 0, precio: 727000 }],
  VALLEDUPAR: [{ minKg: 0, precio: 1888000 }],
  MONTERIA: [{ minKg: 0, precio: 1690000 }],
  PLATO: [{ minKg: 0, precio: 809000 }],
  PIVIJAY: [{ minKg: 0, precio: 785000 }],
  BUCARAMANGA: [{ minKg: 0, precio: 4700000 }],
  PEREIRA: [{ minKg: 0, precio: 6548000 }],
  BOGOTA: [{ minKg: 0, precio: 4350000 }],
  RIOHACHA: [{ minKg: 0, precio: 1762000 }],
};

// Lista de rutas válidas para el selector de "Nombre de ruta" en Asignación.
export const RUTAS_FLETE: string[] = Object.keys(TABLA_FLETES);

function normalizarRuta(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

// Precio de flete "Con Cargue" para una ruta, según el peso que soporta el
// vehículo (capacidad real si está ingresada, si no la de tarjeta) — null si
// la ruta no está en la tabla.
export function calcularFlete(ruta: string, pesoKg: number): number | null {
  const tramos = TABLA_FLETES[normalizarRuta(ruta)];
  if (!tramos) return null;
  let mejor = tramos[0];
  for (const t of tramos) {
    if (pesoKg >= t.minKg && t.minKg >= mejor.minKg) mejor = t;
  }
  return mejor.precio;
}

// Capacidad efectiva de un vehículo (real si está ingresada, si no la de
// tarjeta) — un "0" literal NO cuenta como capacidad válida (dato mal
// cargado), se trata igual que vacío/null. Misma regla que
// frontend/src/lib/utils.ts::capacidadEfectiva, para todos los cálculos de
// flete/capacidad del lado del servidor.
export function capacidadEfectiva(v: { capacidadReal?: string | null; capacidad?: string | null } | null | undefined): number {
  const real = Number(v?.capacidadReal);
  if (real > 0) return real;
  const tarjeta = Number(v?.capacidad);
  return tarjeta > 0 ? tarjeta : 0;
}
