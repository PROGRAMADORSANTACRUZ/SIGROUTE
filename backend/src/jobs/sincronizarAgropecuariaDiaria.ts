import cron from "node-cron";
import { sincronizarAgropecuaria } from "../routes/ordenes";

// Red de seguridad para el backfill de facturación de Bovino/Porcino: el
// autodisparo ya corre justo después de cada `/import`, pero Siesa a veces
// tarda en aprobar el CUFE (DIAN) después del despacho físico — esta pasada
// nocturna (17:30, antes de que limpiezaDiaria archive Orden a las 18:00)
// reintenta con una ventana de 5 días hacia atrás, por si algo quedó
// pendiente ese mismo día o el anterior.
export function iniciarSincronizacionAgropecuariaDiaria(): void {
  cron.schedule(
    "30 17 * * *",
    async () => {
      try {
        const hoy = new Date().toISOString().slice(0, 10);
        const desde = new Date();
        desde.setDate(desde.getDate() - 5);
        const r = await sincronizarAgropecuaria(desde.toISOString().slice(0, 10), hoy);
        console.log(`✔ Sincronización Agropecuaria nocturna: ${r.ordenesActualizadas} línea(s) actualizada(s), ${r.sinFactura.length} sin factura aún.`);
      } catch (err) {
        console.error("⚠ Falló la sincronización Agropecuaria nocturna (se reintenta mañana):", err);
      }
    },
    { timezone: "America/Bogota" }
  );
}
