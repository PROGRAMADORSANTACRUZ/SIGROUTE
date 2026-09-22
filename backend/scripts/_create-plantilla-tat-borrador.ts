// Script único: crea SOLO la tabla nueva PlantillaTatBorrador via SQL directo,
// evitando `prisma db push` (que en este schema intentaría borrar la tabla
// legado "User" —5 filas— no declarada aquí, ajena a este cambio).
import { prismaEjec as prisma } from "../src/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlantillaTatBorrador" (
      "id" SERIAL NOT NULL,
      "origen" TEXT NOT NULL,
      "jornada" TEXT NOT NULL,
      "posicion" INTEGER NOT NULL,
      "fila" TEXT NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlantillaTatBorrador_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PlantillaTatBorrador_origen_jornada_posicion_key" ON "PlantillaTatBorrador"("origen", "jornada", "posicion");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PlantillaTatBorrador_origen_jornada_idx" ON "PlantillaTatBorrador"("origen", "jornada");`);
  console.log("✅ Tabla PlantillaTatBorrador creada (o ya existía).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
