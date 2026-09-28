// Recalcula Cliente.area y Orden.area contra las geozonas activas (misma
// lógica que POST /api/config/geozonas/recalcular) — útil para correrlo una
// vez desde consola tras sembrar/editar geozonas sin necesitar sesión web.
// Uso: npx tsx scripts/_recalcular-geozonas.ts
import { prismaPlan as prisma } from "../src/lib/prisma";
import { detectarArea, type PuntoLatLng } from "../src/lib/geozonas";

async function main() {
  const geozonas = await prisma.geoZona.findMany({
    where: { activo: true },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });
  const geozonasParaMatch = geozonas.map((g) => ({
    id: g.id,
    nombre: g.nombre,
    poligono: g.poligono as unknown as PuntoLatLng[],
  }));

  const clientes = await prisma.cliente.findMany({
    where: { activo: true },
    select: { id: true, lat: true, lon: true, area: true },
  });

  // Agrupa por área resultante (incluyendo null) para actualizar en pocas
  // consultas masivas en vez de una por cliente (miles de round-trips a un
  // Postgres remoto son lentos y propensos a cortes de conexión).
  const idsPorArea = new Map<string | null, string[]>();
  let clientesActualizados = 0;
  for (const c of clientes) {
    const lat = c.lat ? parseFloat(c.lat) : NaN;
    const lon = c.lon ? parseFloat(c.lon) : NaN;
    const nuevaArea = detectarArea(lat, lon, geozonasParaMatch);
    if (nuevaArea !== c.area) {
      clientesActualizados++;
      const arr = idsPorArea.get(nuevaArea) ?? [];
      arr.push(c.id);
      idsPorArea.set(nuevaArea, arr);
    }
  }
  for (const [area, ids] of idsPorArea) {
    await prisma.cliente.updateMany({ where: { id: { in: ids } }, data: { area } });
  }

  // Propaga el área de cada cliente a sus órdenes (clienteSistemaId === Cliente.id),
  // también agrupado por área para minimizar round-trips.
  const clientesConArea = await prisma.cliente.findMany({ where: { activo: true }, select: { id: true, area: true } });
  const clientesIdsPorArea = new Map<string | null, string[]>();
  for (const c of clientesConArea) {
    const arr = clientesIdsPorArea.get(c.area) ?? [];
    arr.push(c.id);
    clientesIdsPorArea.set(c.area, arr);
  }
  let ordenesActualizadas = 0;
  for (const [area, clienteIds] of clientesIdsPorArea) {
    const { count } = await prisma.orden.updateMany({
      where: { clienteSistemaId: { in: clienteIds }, area: { not: area } },
      data: { area },
    });
    ordenesActualizadas += count;
  }

  console.log(JSON.stringify({ geozonas: geozonas.length, clientesActualizados, ordenesActualizadas }));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
