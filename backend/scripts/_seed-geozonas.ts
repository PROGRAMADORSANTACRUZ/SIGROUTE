// Siembra las 5 geozonas iniciales de la Costa Caribe (Configuración >
// Geozonas), con un rectángulo aproximado por ciudad — SOLO para arrancar;
// hay que refinar cada polígono desde el mapa (Drawing Manager) una vez que
// el módulo esté en uso, estas coordenadas son una caja aproximada, no un
// límite administrativo real.
//
// Convención de nombre pedida: "<número>-<3 primeras letras de la ciudad>".
//
// Uso: npx tsx scripts/_seed-geozonas.ts
import { prismaPlan as prisma } from "../src/lib/prisma";

interface ZonaSeed {
  nombre: string;
  ciudad: string;
  color: string;
  // Rectángulo aproximado [ {lat,lng}, ... ] en sentido horario.
  poligono: { lat: number; lng: number }[];
}

const ZONAS: ZonaSeed[] = [
  {
    nombre: "1-BAR",
    ciudad: "Barranquilla",
    color: "#2f8f4e",
    poligono: [
      { lat: 11.05, lng: -74.85 },
      { lat: 11.05, lng: -74.74 },
      { lat: 10.96, lng: -74.74 },
      { lat: 10.96, lng: -74.85 },
    ],
  },
  {
    nombre: "2-SOL",
    ciudad: "Soledad",
    color: "#2f6f9f",
    poligono: [
      { lat: 10.95, lng: -74.8 },
      { lat: 10.95, lng: -74.73 },
      { lat: 10.87, lng: -74.73 },
      { lat: 10.87, lng: -74.8 },
    ],
  },
  {
    nombre: "3-MAL",
    ciudad: "Malambo",
    color: "#b8860b",
    poligono: [
      { lat: 10.88, lng: -74.79 },
      { lat: 10.88, lng: -74.74 },
      { lat: 10.82, lng: -74.74 },
      { lat: 10.82, lng: -74.79 },
    ],
  },
  {
    nombre: "4-SAN",
    ciudad: "Santa Marta",
    color: "#8f2f6b",
    poligono: [
      { lat: 11.28, lng: -74.24 },
      { lat: 11.28, lng: -74.14 },
      { lat: 11.2, lng: -74.14 },
      { lat: 11.2, lng: -74.24 },
    ],
  },
  {
    nombre: "5-CAR",
    ciudad: "Cartagena",
    color: "#a03a3a",
    poligono: [
      { lat: 10.47, lng: -75.58 },
      { lat: 10.47, lng: -75.44 },
      { lat: 10.35, lng: -75.44 },
      { lat: 10.35, lng: -75.58 },
    ],
  },
];

async function main() {
  for (const [i, z] of ZONAS.entries()) {
    const gz = await prisma.geoZona.upsert({
      where: { nombre: z.nombre },
      update: { ciudad: z.ciudad, color: z.color, poligono: z.poligono, orden: i },
      create: { nombre: z.nombre, ciudad: z.ciudad, color: z.color, poligono: z.poligono, orden: i },
    });
    console.log(`OK ${gz.nombre} (${gz.ciudad}) id=${gz.id}`);
  }
  console.log("\nListo. Refinar los polígonos desde el mapa de Geozonas — estos son rectángulos aproximados.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
