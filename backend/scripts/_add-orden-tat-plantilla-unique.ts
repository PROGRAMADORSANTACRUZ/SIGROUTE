// Agrega la constraint UNIQUE(origen, numeroOrden) a OrdenTatPlantilla,
// necesaria para el upsert de la carga masiva de plantillas TAT.
import { prismaEjec as prisma } from "../src/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "OrdenTatPlantilla_origen_numeroOrden_key"
    ON "OrdenTatPlantilla" ("origen", "numeroOrden");
  `);
  console.log("✅ Índice único agregado (o ya existía).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
