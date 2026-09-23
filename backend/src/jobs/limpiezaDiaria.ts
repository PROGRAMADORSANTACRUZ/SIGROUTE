import cron from "node-cron";
import { prismaPlan as prisma } from "../lib/prisma";
import { jornadaKeyActual } from "../lib/jornada";

// Cada día a las 6:00 PM (hora Colombia) limpia las órdenes cargadas del día para
// que las facturas de un día no se arrastren a las rutas del día siguiente.
// Los históricos (PlanillaDespacho) guardan su propia copia de los ítems, así que
// borrar las órdenes NO afecta históricos ni el Nivel de Servicio. Las facturas se
// pueden volver a cargar/escanear con normalidad al día siguiente.
export function iniciarLimpiezaDiaria(): void {
  cron.schedule(
    "0 18 * * *",
    async () => {
      try {
        const { count } = await prisma.orden.deleteMany({});
        await prisma.envioReplica.deleteMany({});
        // Borra los borradores de la plantilla TAT de jornadas anteriores
        // (la jornada vigente recién empieza en este instante).
        const { count: borradores } = await prisma.plantillaTatBorrador.deleteMany({ where: { jornada: { not: jornadaKeyActual() } } });
        console.log(`[limpieza 18:00] ${count} órdenes eliminadas, ${borradores} filas de borrador de plantilla eliminadas (reset diario).`);
      } catch (e) {
        console.error("[limpieza 18:00] error:", (e as Error).message);
      }
    },
    { timezone: "America/Bogota" }
  );
  console.log("⏰ Job de limpieza diaria de órdenes programado (18:00 America/Bogota).");
}
