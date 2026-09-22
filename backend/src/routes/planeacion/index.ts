import { Router } from "express";
import usuariosRouter from "./usuarios";
import rolesRouter from "./roles";
import dashboardRouter from "./dashboard";
import programacionRouter from "./programacion";
import asignacionRouter from "./asignacion";
import areasRouter from "./areas";
import resumenRouter from "./resumen";
import reportesRouter from "./reportes";
import auditoriaRouter from "./auditoria";
import cambiosRouter from "./cambios";
import distProduccionRouter from "./distProduccion";
import simuladorRouter from "./simulador";
import preplanificacionRouter from "./preplanificacion";

const router = Router();

router.use("/usuarios", usuariosRouter);
router.use("/roles", rolesRouter);
router.use("/dashboard", dashboardRouter);
router.use("/programacion", programacionRouter);
router.use("/asignacion", asignacionRouter);
router.use("/areas", areasRouter);
router.use("/resumen", resumenRouter);
router.use("/reportes", reportesRouter);
router.use("/auditoria", auditoriaRouter);
router.use("/cambios", cambiosRouter);
router.use("/distribucion-produccion", distProduccionRouter);
router.use("/simulador", simuladorRouter);
router.use("/preplanificacion", preplanificacionRouter);

export default router;
