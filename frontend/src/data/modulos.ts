// Módulos del sistema para permisos granulares — cada href del Sidebar se
// liga a la CLAVE de permiso real (`permisos.clave` en la BD, ver
// backend/prisma/seed.ts), igual que el macro `can(perm)` de
// legacy_fastapi/app/templates/_layout.html.

export interface Modulo {
  key: string; // href del Sidebar
  label: string;
  grupo: "Planeación" | "Ejecución" | "Configuración";
  permiso: string | null; // null = solo ADMIN (p. ej. Cambios)
}

export const MODULOS: Modulo[] = [
  // ── Planeación (módulos originales de rutas_web) ───────────────────────
  { key: "/dashboard?panel=planeacion", label: "Dashboard", grupo: "Planeación", permiso: "dashboard.planeacion.ver" },
  { key: "/planeacion/preplanificacion", label: "Pre-planificación", grupo: "Planeación", permiso: "programacion.ver" },
  { key: "/planeacion/programacion", label: "Planificación", grupo: "Planeación", permiso: "programacion.ver" },
  { key: "/planeacion/asignacion", label: "Preasignación", grupo: "Planeación", permiso: "asignacion.ver" },
  { key: "/planeacion/areas", label: "Áreas para Cargar", grupo: "Planeación", permiso: "areas.ver" },
  { key: "/planeacion/distribucion-produccion", label: "Distribución Producción", grupo: "Planeación", permiso: "distribucion.ver" },
  { key: "/planeacion/simulador", label: "Simulador de Producción", grupo: "Planeación", permiso: "simulador.ver" },
  { key: "/planeacion/reportes", label: "Reportes", grupo: "Planeación", permiso: "reportes.ver" },

  // ── Módulos de ejecución (DISTRILOG + Plantillas TAT, ambos bajo el mismo panel) ─
  { key: "/dashboard?panel=ejecucion", label: "Dashboard", grupo: "Ejecución", permiso: "dashboard.ejecucion.ver" },
  { key: "/ordenes", label: "Cargar Órdenes", grupo: "Ejecución", permiso: "distrilog.ordenes.ver" },
  { key: "/asignacion-vehiculos", label: "Asignación de órdenes", grupo: "Ejecución", permiso: "distrilog.asignacion.ver" },
  { key: "/planes", label: "Diagrama", grupo: "Ejecución", permiso: "distrilog.planes.ver" },
  { key: "/planificacion-dl", label: "Planificación D.L.", grupo: "Ejecución", permiso: "distrilog.planificacion_dl.ver" },
  { key: "/historicos", label: "Históricos", grupo: "Ejecución", permiso: "distrilog.historicos.ver" },
  { key: "/nivel-de-servicio", label: "Nivel de servicio", grupo: "Ejecución", permiso: "distrilog.nivel_servicio.ver" },
  { key: "/errands", label: "Run Errands", grupo: "Ejecución", permiso: "distrilog.errands.ver" },
  { key: "/plantillas-tat/agropecuaria", label: "Plantilla TAT Agropecuaria", grupo: "Ejecución", permiso: "plantillas_tat.ver" },
  { key: "/plantillas-tat/inversiones", label: "Plantilla TAT Inversiones", grupo: "Ejecución", permiso: "plantillas_tat.ver" },

  // ── Configuración (catálogos de Planeación y de Ejecución, unificados) ─
  { key: "/configuracion/auditoria", label: "Auditoría", grupo: "Configuración", permiso: "auditoria.ver" },
  { key: "/configuracion/usuarios", label: "Usuarios", grupo: "Configuración", permiso: "usuarios.ver" },
  { key: "/configuracion/roles", label: "Roles y permisos", grupo: "Configuración", permiso: "usuarios.roles" },
  { key: "/configuracion/clientes", label: "Clientes", grupo: "Configuración", permiso: "config.clientes.ver" },
  { key: "/configuracion/vehiculos", label: "Vehículos", grupo: "Configuración", permiso: "config.vehiculos.ver" },
  { key: "/configuracion/rutas", label: "Rutas", grupo: "Configuración", permiso: "config.rutas.ver" },
  { key: "/configuracion/conductores", label: "Conductores", grupo: "Configuración", permiso: "config.conductores.ver" },
  { key: "/configuracion/auxiliares", label: "Auxiliares", grupo: "Configuración", permiso: "config.auxiliares.ver" },
  { key: "/configuracion/plan-nombres", label: "Nombres de planes", grupo: "Configuración", permiso: "config.plan_nombres.ver" },
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

// Selector de panel (pantalla post-login): ¿el usuario puede entrar a este
// panel (Planeación/Ejecución/Configuración)? Basta con tener acceso a
// cualquiera de sus módulos.
export function puedeAccederPanel(
  grupo: Modulo["grupo"],
  role?: string,
  permisos?: string[] | null
): boolean {
  return primeraRutaPanel(grupo, role, permisos) !== null;
}

// Primera ruta del panel a la que el usuario tiene acceso (en el orden
// declarado en MODULOS, así que el Dashboard del panel siempre se prueba
// primero). Null si no tiene acceso a nada de ese panel.
export function primeraRutaPanel(
  grupo: Modulo["grupo"],
  role?: string,
  permisos?: string[] | null
): string | null {
  const modulosPanel = MODULOS.filter((m) => m.grupo === grupo);
  if (role === "ADMIN") return modulosPanel[0]?.key ?? null;
  const accesible = modulosPanel.find((m) => m.permiso && (permisos ?? []).includes(m.permiso));
  return accesible?.key ?? null;
}

