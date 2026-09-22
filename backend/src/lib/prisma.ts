// Dos bases de datos separadas (no se fusionan): Planeación (rutas_web) y
// Ejecución (DISTRILOG), cada una con su propio cliente Prisma generado desde
// su propio schema (prisma/schema.plan.prisma y prisma/schema.ejec.prisma).
import { PrismaClient as PrismaPlanClient } from "../../prisma/generated/plan";
import { PrismaClient as PrismaEjecClient } from "../../prisma/generated/ejec";

const globalForPrisma = globalThis as unknown as {
  prismaPlan?: PrismaPlanClient;
  prismaEjec?: PrismaEjecClient;
};

export const prismaPlan = globalForPrisma.prismaPlan ?? new PrismaPlanClient();
export const prismaEjec = globalForPrisma.prismaEjec ?? new PrismaEjecClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaPlan = prismaPlan;
  globalForPrisma.prismaEjec = prismaEjec;
}
