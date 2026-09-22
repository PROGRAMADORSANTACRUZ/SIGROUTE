import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import vehiculosRouter from "./vehiculos";
import conductoresRouter from "./conductores";
import ordenesRouter from "./ordenes";
import clientesRouter from "./clientes";
import planesRouter from "./planes";
import planillasRouter from "./planillas";
import novedadesRouter from "./novedades";
import configRouter from "./config";
import planeacionRouter from "./planeacion";
import errandsRouter from "./errands";
// NOTA: el antiguo `users.ts` (gestión simple de usuarios de DISTRILOG) fue
// retirado — el módulo "Usuarios" (con roles/permisos granulares) de
// rutas_web lo reemplaza por completo (ver routes/planeacion/usuarios.ts).

const router = Router();

router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/vehiculos", vehiculosRouter);
router.use("/conductores", conductoresRouter);
router.use("/ordenes", ordenesRouter);
router.use("/clientes", clientesRouter);
router.use("/planes", planesRouter);
router.use("/planillas", planillasRouter);
router.use("/novedades", novedadesRouter);
router.use("/config", configRouter);
router.use("/planeacion", planeacionRouter);
router.use("/errands", errandsRouter);

export default router;
