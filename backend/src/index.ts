import { createApp } from "./app";
import { env } from "./config/env";
import { iniciarLimpiezaDiaria } from "./jobs/limpiezaDiaria";

// Red de seguridad: cualquier promesa rechazada sin capturar (ej. un error de
// Prisma en un middleware/handler async que se nos escapó) por defecto tumba
// TODO el proceso de Node — y como docker-start.sh mata el contenedor entero
// si backend o frontend mueren, un solo hiccup transitorio de BD reiniciaba
// el servicio completo (502 en producción). Se loguea y se sigue vivo; los
// handlers de rutas ya devuelven 500 al cliente vía errorHandler.
process.on("unhandledRejection", (reason) => {
  console.error("⚠ unhandledRejection (proceso sigue vivo):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("⚠ uncaughtException (proceso sigue vivo):", err);
});

const app = createApp();

// El job de limpieza corre en TODOS los entornos (misma BD compartida siempre).
iniciarLimpiezaDiaria();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Backend escuchando en http://localhost:${env.PORT}`);
  console.log(`   Entorno: ${env.NODE_ENV}`);
});

function shutdown(signal: string) {
  console.log(`\n${signal} recibido. Cerrando servidor…`);
  server.close(() => {
    console.log("Servidor cerrado.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
