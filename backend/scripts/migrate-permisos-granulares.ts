// Migración (idempotente, solo agrega) que preserva el acceso de TODOS los
// roles ya existentes tras introducir permisos granulares nuevos:
//   - dashboard.ver              -> dashboard.ejecucion.ver, dashboard.planeacion.ver, dashboard.errands.ver
//   - distrilog.config.ver       -> config.{clientes,vehiculos,conductores,auxiliares,rutas,plan_nombres}.ver
//   - distrilog.config.editar    -> ... mismos .editar (+ .ver)
//   - Plantillas TAT antes NO tenía permiso propio (cualquier usuario logueado
//     entraba): se le da plantillas_tat.ver + .editar a todos los roles
//     EXCEPTO "CONSULTA" (rol de solo lectura, se queda solo con .ver, ya
//     sembrado en seed.ts).
// No quita nada — solo agrega asignaciones para que nadie pierda acceso.
import { prismaPlan as prisma } from "../src/lib/prisma";

const CONFIG_CATALOGOS = ["clientes", "vehiculos", "conductores", "auxiliares", "rutas", "plan_nombres"];

async function main() {
  const roles = await prisma.rol.findMany({ include: { rolPermisos: { include: { permiso: true } } } });
  const permisos = await prisma.permiso.findMany();
  const permisoPorClave = new Map(permisos.map((p) => [p.clave, p]));

  async function otorgar(rolId: number, claves: string[]) {
    for (const clave of claves) {
      const permiso = permisoPorClave.get(clave);
      if (!permiso) { console.log(`  ! permiso '${clave}' no existe (corre el seed primero)`); continue; }
      await prisma.rolPermiso.upsert({
        where: { rolId_permisoId: { rolId, permisoId: permiso.id } },
        update: {},
        create: { rolId, permisoId: permiso.id },
      });
    }
  }

  for (const rol of roles) {
    const clavesActuales = new Set(rol.rolPermisos.map((rp) => rp.permiso.clave));
    const aOtorgar: string[] = [];

    if (clavesActuales.has("dashboard.ver")) {
      aOtorgar.push("dashboard.ejecucion.ver", "dashboard.planeacion.ver", "dashboard.errands.ver");
    }
    if (clavesActuales.has("distrilog.config.editar")) {
      for (const c of CONFIG_CATALOGOS) aOtorgar.push(`config.${c}.ver`, `config.${c}.editar`);
    } else if (clavesActuales.has("distrilog.config.ver")) {
      for (const c of CONFIG_CATALOGOS) aOtorgar.push(`config.${c}.ver`);
    }
    if (rol.nombre === "CONSULTA") {
      aOtorgar.push("plantillas_tat.ver");
    } else {
      aOtorgar.push("plantillas_tat.ver", "plantillas_tat.editar");
    }

    const nuevas = aOtorgar.filter((c) => !clavesActuales.has(c));
    if (nuevas.length === 0) {
      console.log(`- ${rol.nombre}: ya tenía todo, sin cambios.`);
      continue;
    }
    await otorgar(rol.id, aOtorgar);
    console.log(`+ ${rol.nombre}: se agregaron ${nuevas.length} permiso(s) -> ${nuevas.join(", ")}`);
  }

  console.log("\nListo.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
