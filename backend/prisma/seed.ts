// Seed — puerto exacto de los INSERT de legacy_fastapi/db/schema.sql
// (roles, catálogo de permisos, asignación por rol y usuario admin semilla).
// Siembra SOLO la BD de Planeación (auth vive ahí, no en la BD de Ejecución).
import { prismaPlan as prisma } from "../src/lib/prisma";

const ROLES = [
  { nombre: "ADMIN", descripcion: "Acceso total al sistema" },
  { nombre: "SUPERVISOR", descripcion: "Supervisión y reportes" },
  { nombre: "OPERADOR", descripcion: "Operaciones del día a día" },
  { nombre: "CONSULTA", descripcion: "Solo lectura" },
];

const PERMISOS: [string, string][] = [
  ["programacion.ver", "Acceder al módulo Planificación"],
  ["programacion.editar", "Crear / editar planificación del día"],
  ["programacion.cerrar_area", "Cerrar área propia en planificación"],
  ["programacion.reabrir_area", "Reabrir área cerrada en planificación"],
  ["asignacion.ver", "Acceder al módulo Preasignación"],
  ["asignacion.editar", "Editar preasignación de rutas"],
  ["areas.ver", "Acceder al módulo Áreas para Cargar"],
  ["areas.confirmar_carga", "Confirmar carga de vehículo"],
  ["areas.reabrir_carga", "Reabrir/revertir una carga ya confirmada (solo super admin)"],
  ["areas.editar_kls", "Editar kls y canastillas por ruta"],
  ["areas.exportar", "Exportar áreas para cargar a Excel / PDF"],
  ["resumen.ver", "Acceder al Resumen del Día"],
  ["resumen.exportar", "Exportar resumen a PDF / Excel"],
  ["horarios.ver", "Acceder al módulo Horarios"],
  ["horarios.editar", "Editar registros de horario"],
  ["maestros.ver", "Ver conductores, vehículos, aux, destinos"],
  ["maestros.editar", "Crear / editar maestros"],
  ["maestros.eliminar", "Eliminar / desactivar maestros"],
  ["usuarios.ver", "Acceder al módulo Usuarios"],
  ["usuarios.crear", "Crear nuevos usuarios"],
  ["usuarios.editar", "Editar usuarios existentes"],
  ["usuarios.roles", "Gestionar roles y permisos"],
  ["dashboard.ver", "Acceder al Dashboard de Programación"],
  ["reportes.ver", "Acceder al módulo de Reportes"],
  ["reportes.exportar", "Exportar reportes a Excel"],
  ["auditoria.ver", "Acceder al Log de Auditoría"],
  ["distribucion.ver", "Acceder a Distribución Producción (previsualizar / exportar)"],
  ["distribucion.editar", "Guardar y ajustar la distribución"],
  ["simulador.ver", "Acceder al Simulador de Producción (simular / exportar)"],
  ["simulador.editar", "Guardar corridas y editar el perfil de rendimiento"],
  // Permisos nuevos de la fusión con DISTRILOG (módulos de "Ejecución").
  ["distrilog.ordenes.ver", "Acceder a Cargar Órdenes (DISTRILOG)"],
  ["distrilog.ordenes.editar", "Cargar, facturar, asignar ruta y eliminar órdenes"],
  ["distrilog.asignacion.ver", "Acceder a Asignación de órdenes (DISTRILOG)"],
  ["distrilog.asignacion.editar", "Asignar/reasignar órdenes a vehículos"],
  ["distrilog.planes.ver", "Acceder al Diagrama de vehículos (DISTRILOG)"],
  ["distrilog.planes.editar", "Crear y modificar planes/diagramas de vehículos"],
  ["distrilog.planificacion_dl.ver", "Acceder a Planificación D.L. (DISTRILOG)"],
  ["distrilog.planificacion_dl.editar", "Crear, anular y editar planillas de despacho"],
  ["distrilog.historicos.ver", "Acceder a Históricos (DISTRILOG)"],
  ["distrilog.nivel_servicio.ver", "Acceder a Nivel de servicio (DISTRILOG)"],
  ["distrilog.nivel_servicio.editar", "Registrar novedades y reenviar a nivel de servicio"],
  ["distrilog.errands.ver", "Acceder al módulo Run Errands (DISTRILOG)"],
  ["distrilog.errands.editar", "Crear/editar pedidos, clientes y puntos de venta en Errands"],
  ["distrilog.config.ver", "Acceder a Configuración de DISTRILOG (clientes/vehículos/rutas/conductores)"],
  ["distrilog.config.editar", "Crear/editar/eliminar clientes, vehículos, rutas y conductores"],
  // NOTA: el permiso "siglog.ver" de la app original NO se siembra — el
  // módulo SIGLOG fue eliminado en la fusión con DISTRILOG.
];

const OPERADOR_CLAVES = [
  "programacion.ver", "programacion.editar", "programacion.cerrar_area",
  "asignacion.ver", "asignacion.editar",
  "areas.ver", "areas.confirmar_carga", "areas.exportar",
  "resumen.ver", "resumen.exportar",
  "horarios.ver", "horarios.editar", "maestros.ver", "dashboard.ver",
  "distrilog.ordenes.ver", "distrilog.ordenes.editar",
  "distrilog.asignacion.ver", "distrilog.asignacion.editar",
  "distrilog.planes.ver", "distrilog.planes.editar",
  "distrilog.planificacion_dl.ver", "distrilog.planificacion_dl.editar",
  "distrilog.historicos.ver",
  "distrilog.nivel_servicio.ver", "distrilog.nivel_servicio.editar",
  "distrilog.errands.ver", "distrilog.errands.editar",
  "distrilog.config.ver",
];

const CONSULTA_CLAVES = [
  "programacion.ver", "asignacion.ver", "areas.ver",
  "resumen.ver", "horarios.ver", "maestros.ver", "dashboard.ver",
  "distrilog.ordenes.ver", "distrilog.historicos.ver", "distrilog.nivel_servicio.ver",
];

async function main() {
  for (const r of ROLES) {
    await prisma.rol.upsert({ where: { nombre: r.nombre }, update: {}, create: r });
  }
  for (const [clave, descripcion] of PERMISOS) {
    await prisma.permiso.upsert({ where: { clave }, update: {}, create: { clave, descripcion } });
  }

  const roles = await prisma.rol.findMany();
  const permisos = await prisma.permiso.findMany();
  const rolId = (nombre: string) => roles.find((r) => r.nombre === nombre)!.id;

  async function asignar(rolNombre: string, claves: string[]) {
    const rId = rolId(rolNombre);
    for (const p of permisos) {
      if (!claves.includes(p.clave)) continue;
      await prisma.rolPermiso.upsert({
        where: { rolId_permisoId: { rolId: rId, permisoId: p.id } },
        update: {},
        create: { rolId: rId, permisoId: p.id },
      });
    }
  }

  // ADMIN → todos los permisos.
  await asignar("ADMIN", permisos.map((p) => p.clave));
  // SUPERVISOR → todo excepto usuarios.*, auditoria.ver y areas.reabrir_carga.
  await asignar(
    "SUPERVISOR",
    permisos
      .map((p) => p.clave)
      .filter((c) => !c.startsWith("usuarios.") && c !== "auditoria.ver" && c !== "areas.reabrir_carga")
  );
  await asignar("OPERADOR", OPERADOR_CLAVES);
  await asignar("CONSULTA", CONSULTA_CLAVES);

  // Usuario admin semilla (contraseña temporal "Admin2024*"), mismo hash pbkdf2
  // que el seed original de rutas_web — debe cambiarla en el primer ingreso.
  await prisma.usuario.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash:
        "pbkdf2_sha256$200000$67964c9862af719e5ff7cf779dbc341a$00c5cf07013af039dcd56330b222d93c4a69de492496e89b3b202f96c9aa2721",
      nombreCompleto: "Administrador del Sistema",
      rolId: rolId("ADMIN"),
      instancia: "AMBAS",
      mustChangePassword: true,
    },
  });

  console.log("✅ Seed de auth (roles/permisos/admin) completo.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
