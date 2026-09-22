// "Jornada" de la plantilla TAT: corre de 6:00 p. m. a 6:00 p. m. del día
// siguiente (hora Colombia) — mismo corte que el reset diario de Órdenes
// (jobs/limpiezaDiaria.ts). Se usa para que el borrador de la plantilla se
// vea "vacío" en cuanto empieza una jornada nueva.
function ahoraBogota(): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`);
}

export function jornadaKeyActual(): string {
  const ahora = ahoraBogota();
  const limite = new Date(ahora);
  limite.setHours(18, 0, 0, 0);
  if (ahora < limite) limite.setDate(limite.getDate() - 1);
  return limite.toISOString().slice(0, 10);
}
