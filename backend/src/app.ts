import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieSession from "cookie-session";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  // El contenedor recibe el tráfico real vía Nginx -> Traefik -> Cloudflare,
  // TODOS terminando TLS antes de llegar a Express por HTTP plano interno.
  // Sin esto, Express (y la librería "cookies" que usa cookie-session) ve
  // `req.protocol==="http"` SIEMPRE y con `secure:true` en la cookie de
  // sesión lanza "Cannot send secure cookie over unencrypted connection" al
  // final de cada response — el login respondía 200 igual (el error pasa
  // DESPUÉS de que la ruta ya mandó su JSON) pero el Set-Cookie nunca salía,
  // así que /api/auth/me quedaba siempre en 401 después de "loguearse bien".
  // `X-Forwarded-Proto` ya lo manda Nginx (nginx.conf) y Traefik por defecto.
  app.set("trust proxy", 1);

  app.use(helmet());
  // Comprime las respuestas JSON grandes (maestros de clientes, órdenes,
  // novedades pueden pesar varios cientos de KB / unos MB sin comprimir) —
  // sin esto, esas respuestas eran lentas de transferir y el proxy de
  // desarrollo de Next.js a veces las cortaba a medias (ECONNRESET).
  app.use(compression());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  // Límite por defecto de express.json() es 100kb — Planificación manda el
  // grid COMPLETO de Clientes (4600+) en cada Guardar, que pesa varios MB;
  // sin este límite mayor esas peticiones fallaban silenciosamente (413).
  app.use(express.json({ limit: "20mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  // Sesión por cookie firmada (igual que SessionMiddleware de Starlette en
  // rutas_web original): solo se guarda `userId`, todo lo demás se relee de la
  // BD en cada request (ver middleware/auth.ts).
  app.use(
    cookieSession({
      name: "rutas_session",
      keys: [env.SECRET_KEY],
      maxAge: 12 * 60 * 60 * 1000,
      sameSite: "lax",
      secure: env.SESSION_HTTPS_ONLY,
      httpOnly: true,
    })
  );

  // Nunca cachear respuestas del API (evita que el navegador muestre datos viejos).
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
