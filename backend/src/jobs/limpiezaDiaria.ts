import cron from "node-cron";
import { prismaPlan as prisma } from "../lib/prisma";
import { jornadaKeyActual } from "../lib/jornada";

// Cada día a las 6:00 PM (hora Colombia) archiva y limpia las órdenes cargadas
// del día para que las facturas de un día no se arrastren a las rutas del día
// siguiente. El borrado es "visual": antes de vaciar Orden, cada fila se
// copia completa a OrdenHistorico (incluido si fue realmente enviada a Drivin,
// vía envioDrivinId/enviadoDrivinEn), así que nada se pierde para reportes o
// el Dashboard. Los históricos (PlanillaDespacho, EnvioDrivin) tienen su
// propia copia aparte y no dependen de este job.
export function iniciarLimpiezaDiaria(): void {
  cron.schedule(
    "0 18 * * *",
    async () => {
      try {
        const ordenes = await prisma.orden.findMany();
        if (ordenes.length > 0) {
          await prisma.ordenHistorico.createMany({
            data: ordenes.map((o) => ({
              ordenOriginalId: o.id,
              fecha: o.fecha,
              numeroOrden: o.numeroOrden,
              cliente: o.cliente,
              destino: o.destino,
              producto: o.producto,
              productoCodigo: o.productoCodigo,
              cantidadKg: o.cantidadKg,
              estado: o.estado,
              nit: o.nit,
              codigo: o.codigo,
              valor: o.valor,
              direccion: o.direccion,
              vendedor: o.vendedor,
              ciudad: o.ciudad,
              clienteSistemaId: o.clienteSistemaId,
              clienteFactura: o.clienteFactura,
              nitFactura: o.nitFactura,
              direccionFactura: o.direccionFactura,
              pedidoSigcom: o.pedidoSigcom,
              ordenCompra: o.ordenCompra,
              fechaAprobacionDian: o.fechaAprobacionDian,
              distribucion: o.distribucion,
              tatOrigen: o.tatOrigen,
              cufe: o.cufe,
              qrTexto: o.qrTexto,
              firmaDigital: o.firmaDigital,
              podCode: o.podCode,
              scenarioToken: o.scenarioToken,
              deliveredBy: o.deliveredBy,
              podLat: o.podLat,
              podLng: o.podLng,
              reasonName: o.reasonName,
              reasonCode: o.reasonCode,
              reenviado: o.reenviado,
              reenviadoAt: o.reenviadoAt,
              asignadoVehiculo: o.asignadoVehiculo,
              ruta: o.ruta,
              area: o.area,
              fechaDespacho: o.fechaDespacho,
              envioDrivinId: o.envioDrivinId,
              enviadoDrivinEn: o.enviadoDrivinEn,
              createdAt: o.createdAt,
            })),
          });
        }
        const { count } = await prisma.orden.deleteMany({});
        await prisma.envioReplica.deleteMany({});
        // Borra los borradores de la plantilla TAT de jornadas anteriores
        // (la jornada vigente recién empieza en este instante).
        const { count: borradores } = await prisma.plantillaTatBorrador.deleteMany({ where: { jornada: { not: jornadaKeyActual() } } });
        console.log(`[limpieza 18:00] ${ordenes.length} órdenes archivadas, ${count} eliminadas, ${borradores} filas de borrador de plantilla eliminadas (reset diario).`);
      } catch (e) {
        console.error("[limpieza 18:00] error:", (e as Error).message);
      }
    },
    { timezone: "America/Bogota" }
  );
  console.log("⏰ Job de limpieza diaria de órdenes programado (18:00 America/Bogota).");
}
