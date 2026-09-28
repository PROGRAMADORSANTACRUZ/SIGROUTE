// Geocodifica los Cliente activos que no tienen lat/lon, usando la dirección
// (direccion + comuna/provincia como contexto) contra la Geocoding API de
// Google. Solo rellena los que faltan — no pisa lat/lon ya cargados (ver
// chequeo previo: 3693/4625 clientes activos YA tienen lat/lon, probablemente
// cargados por otra vía; este script solo completa los ~932 restantes).
//
// Uso: npx tsx scripts/_geocode-clientes.ts [--dry-run] [--limit=50]
import { prismaPlan as prisma } from "../src/lib/prisma";
import { geocodificarDireccion } from "../src/lib/geozonas";

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

// Pausa entre llamadas para no ráfaga-golpear la API (Google permite bastante
// más que esto, pero no hay apuro y así queda con margen de sobra).
const PAUSA_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function construirDireccionCompleta(c: {
  direccion: string | null;
  comuna: string | null;
  provincia: string | null;
  region: string | null;
}): string {
  const partes = [c.direccion, c.comuna, c.provincia, c.region, "Colombia"].filter(
    (p): p is string => !!p && p.trim().length > 0
  );
  return partes.join(", ");
}

async function main() {
  const clientes = await prisma.cliente.findMany({
    where: {
      activo: true,
      OR: [{ lat: null }, { lat: "" }, { lon: null }, { lon: "" }],
      NOT: [{ direccion: null }, { direccion: "" }],
    },
    select: { id: true, cliente: true, direccion: true, comuna: true, provincia: true, region: true },
    take: LIMIT,
  });

  console.log(`Clientes a geocodificar: ${clientes.length}${DRY_RUN ? " (DRY RUN, no se guarda nada)" : ""}`);

  let ok = 0;
  let fallidos = 0;
  const fallidosDetalle: { id: string; cliente: string | null; direccion: string }[] = [];

  for (const c of clientes) {
    const direccion = construirDireccionCompleta(c);
    try {
      const r = await geocodificarDireccion(direccion);
      if (!r) {
        fallidos++;
        fallidosDetalle.push({ id: c.id, cliente: c.cliente, direccion });
      } else {
        ok++;
        console.log(`OK  ${c.cliente ?? c.id} -> ${r.lat}, ${r.lon}  (${r.direccionFormateada})`);
        if (!DRY_RUN) {
          await prisma.cliente.update({
            where: { id: c.id },
            data: { lat: String(r.lat), lon: String(r.lon) },
          });
        }
      }
    } catch (e) {
      fallidos++;
      fallidosDetalle.push({ id: c.id, cliente: c.cliente, direccion });
      console.error(`ERROR ${c.cliente ?? c.id}:`, e instanceof Error ? e.message : e);
    }
    await sleep(PAUSA_MS);
  }

  console.log("\n── Resumen ──");
  console.log(`OK: ${ok}  Fallidos: ${fallidos}`);
  if (fallidosDetalle.length > 0) {
    console.log("\nDirecciones que Google no pudo geocodificar (revisar manualmente):");
    for (const f of fallidosDetalle) console.log(`  - [${f.id}] ${f.cliente ?? "?"}: ${f.direccion}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
