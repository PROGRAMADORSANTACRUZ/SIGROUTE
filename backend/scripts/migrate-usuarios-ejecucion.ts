// Migración única: usuarios de la tabla legado "User" de la BD de Ejecución
// (DISTRILOG/TATDRIVIN_DB, no declarada en schema.ejec.prisma) hacia la
// tabla real de autenticación `usuarios` de la BD de Planeación, para que
// puedan iniciar sesión en SigRoute con el mismo login unificado.
//
// Password temporal = su propia cédula, con mustChangePassword=true (deben
// cambiarla en el primer login). Mapeo de rol legado -> rol de Planeación:
//   DEVELOPER, ADMIN -> ADMIN
//   USER             -> SUPERVISOR
import { prismaPlan, prismaEjec } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/security";

const ROL_POR_LEGACY: Record<string, string> = {
  DEVELOPER: "ADMIN",
  ADMIN: "ADMIN",
  USER: "SUPERVISOR",
};

interface LegacyUser {
  id: string;
  cedula: string;
  password: string;
  name: string;
  role: string;
}

async function main() {
  const legacyUsers = await prismaEjec.$queryRawUnsafe<LegacyUser[]>('SELECT * FROM "User"');
  console.log(`Encontrados ${legacyUsers.length} usuarios legado en Ejecución.`);

  let creados = 0;
  let omitidos = 0;

  for (const u of legacyUsers) {
    const username = u.cedula.trim();
    const existente = await prismaPlan.usuario.findUnique({ where: { username } });
    if (existente) {
      console.log(`- Omitido (ya existe): ${username} (${u.name}) -> usuario Planeación #${existente.id}`);
      omitidos++;
      continue;
    }

    const rolNombre = ROL_POR_LEGACY[u.role] ?? "OPERADOR";
    const rol = await prismaPlan.rol.findUnique({ where: { nombre: rolNombre } });
    if (!rol) {
      console.log(`- ERROR: rol '${rolNombre}' no existe en Planeación, se omite a ${username} (${u.name})`);
      omitidos++;
      continue;
    }

    const nuevo = await prismaPlan.usuario.create({
      data: {
        username,
        passwordHash: hashPassword(username), // temporal = su propia cédula
        nombreCompleto: u.name.trim(),
        rolId: rol.id,
        instancia: "AMBAS",
        mustChangePassword: true,
        createdBy: "migracion-ejecucion",
      },
    });
    console.log(`+ Creado: ${username} (${u.name}) -> rol ${rolNombre}, usuario Planeación #${nuevo.id} [contraseña temporal = su cédula]`);
    creados++;
  }

  console.log(`\nListo. Creados: ${creados}, omitidos (ya existían): ${omitidos}.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    await prismaPlan.$disconnect();
    await prismaEjec.$disconnect();
  });
