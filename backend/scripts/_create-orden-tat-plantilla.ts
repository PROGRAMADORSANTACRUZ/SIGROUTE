// Script único: crea SOLO la tabla nueva OrdenTatPlantilla via SQL directo,
// evitando `prisma db push` (que en este schema intentaría borrar la tabla
// legado "User" —5 filas— no declarada aquí, ajena a este cambio).
import { prismaEjec as prisma } from "../src/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OrdenTatPlantilla" (
      "id" TEXT NOT NULL,
      "origen" TEXT NOT NULL,
      "fecha" TEXT NOT NULL,
      "numeroOrden" TEXT NOT NULL,
      "placa" TEXT,
      "conductor" TEXT,
      "auxiliar" TEXT,
      "ruta" TEXT,
      "extra" TEXT,
      "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
      "mensaje" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OrdenTatPlantilla_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OrdenTatPlantilla_origen_idx" ON "OrdenTatPlantilla"("origen");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OrdenTatPlantilla_numeroOrden_idx" ON "OrdenTatPlantilla"("numeroOrden");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OrdenTatPlantilla_estado_idx" ON "OrdenTatPlantilla"("estado");`);
  console.log("✅ Tabla OrdenTatPlantilla creada (o ya existía).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
