// Módulos del sistema para permisos granulares — cada href del Sidebar se
// liga a la CLAVE de permiso real (`permisos.clave` en la BD, ver
// backend/prisma/seed.ts), igual que el macro `can(perm)` de
// legacy_fastapi/app/templates/_layout.html.

export interface Modulo {
  key: string; // href del Sidebar
  label: string;
  grupo: "Planeación" | "Ejecución";
  permiso: string | null; // null = solo ADMIN (p. ej. Cambios)
}

export const MODULOS: Modulo[] = [
  // ── Planeación (módulos originales de rutas_web) ───────────────────────

  { key: "/planeacion/preplanificacion", label: "Pre-planificación", grupo: "Planeación", permiso: "programacion.ver" },
  { key: "/planeacion/programacion", label: "Planificación", grupo: "Planeación", permiso: "programacion.ver" },
  { key: "/planeacion/asignacion", label: "Preasignación", grupo: "Planeación", permiso: "asignacion.ver" },
  { key: "/planeacion/areas", label: "Áreas para Cargar", grupo: "Planeación", permiso: "areas.ver" },
  { key: "/planeacion/distribucion-produccion", label: "Distribución Producción", grupo: "Planeación", permiso: "distribucion.ver" },
  { key: "/planeacion/simulador", label: "Simulador de Producción", grupo: "Planeación", permiso: "simulador.ver" },
  { key: "/planeacion/reportes", label: "Reportes", grupo: "Planeación", permiso: "reportes.ver" },
  { key: "/planeacion/auditoria", label: "Auditoría", grupo: "Planeación", permiso: "auditoria.ver" },
  { key: "/planeacion/usuarios", label: "Usuarios", grupo: "Planeación", permiso: "usuarios.ver" },
  { key: "/planeacion/roles", label: "Roles y permisos", grupo: "Planeación", permiso: "usuarios.roles" },

  // ── Módulos de ejecución (DISTRILOG) ──────────────────────────────────
  { key: "/ordenes", label: "Cargar Órdenes", grupo: "Ejecución", permiso: "distrilog.ordenes.ver" },
  { key: "/asignacion-vehiculos", label: "Asignación de órdenes", grupo: "Ejecución", permiso: "distrilog.asignacion.ver" },
  { key: "/planes", label: "Diagrama", grupo: "Ejecución", permiso: "distrilog.planes.ver" },
  { key: "/planificacion-dl", label: "Planificación D.L.", grupo: "Ejecución", permiso: "distrilog.planificacion_dl.ver" },
  { key: "/historicos", label: "Históricos", grupo: "Ejecución", permiso: "distrilog.historicos.ver" },
  { key: "/nivel-de-servicio", label: "Nivel de servicio", grupo: "Ejecución", permiso: "distrilog.nivel_servicio.ver" },
  { key: "/errands", label: "Run Errands", grupo: "Ejecución", permiso: "distrilog.errands.ver" },
  { key: "/plantillas-tat/agropecuaria", label: "Plantilla TAT Agropecuaria", grupo: "Ejecución", permiso: "distrilog.ordenes.editar" },
  { key: "/plantillas-tat/inversiones", label: "Plantilla TAT Inversiones", grupo: "Ejecución", permiso: "distrilog.ordenes.editar" },
  { key: "/configuracion/clientes", label: "Clientes", grupo: "Ejecución", permiso: "distrilog.config.ver" },
  { key: "/configuracion/vehiculos", label: "Vehículos", grupo: "Ejecución", permiso: "distrilog.config.ver" },
  { key: "/configuracion/rutas", label: "Rutas", grupo: "Ejecución", permiso: "distrilog.config.ver" },
  { key: "/configuracion/conductores", label: "Conductores", grupo: "Ejecución", permiso: "distrilog.config.ver" },
  { key: "/configuracion/auxiliares", label: "Auxiliares", grupo: "Ejecución", permiso: "distrilog.config.ver" },
  { key: "/configuracion/plan-nombres", label: "Nombres de planes", grupo: "Ejecución", permiso: "distrilog.config.ver" },
];

export const TODOS_LOS_MODULOS = MODULOS.map((m) => m.key);

// ¿El usuario puede acceder al módulo? ADMIN siempre; sin `permiso` = solo ADMIN;
// si no, exige que la clave esté en `permisos` (coincide también por prefijo,
// p. ej. /nivel-de-servicio/tat → /nivel-de-servicio).
export function puedeAcceder(
  href: string,
  role?: string,
  permisos?: string[] | null
): boolean {
  if (role === "ADMIN") return true;
  const modulo = MODULOS.find((m) => href === m.key || href.startsWith(m.key + "/"));
  if (!modulo) return true; // no está en el catálogo (p. ej. Dashboard): visible siempre
  if (!modulo.permiso) return false; // solo ADMIN
  return (permisos ?? []).includes(modulo.permiso);
}
