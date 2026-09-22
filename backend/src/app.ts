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
  app.use(express.json());
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
