// Una sola base de datos (Planeación) — Ejecución (ex DISTRILOG) ya se migró
// 1:1 a este mismo esquema (ver prisma/schema.plan.prisma, sección
// "EJECUCIÓN") y dejó de tener su propia conexión/cliente Prisma.
import { PrismaClient as PrismaPlanClient } from "../../prisma/generated/plan";

const globalForPrisma = globalThis as unknown as {
  prismaPlan?: PrismaPlanClient;
};

export const prismaPlan = globalForPrisma.prismaPlan ?? new PrismaPlanClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaPlan = prismaPlan;
}
