// Script temporal de verificación (solo lectura) — confirma que el esquema
// Prisma coincide con las 2 bases reales de producción. No escribe nada.
import { prismaPlan, prismaEjec } from "../src/lib/prisma";

async function main() {
  console.log("== Planeación (rutas) ==");
  try {
    const roles = await prismaPlan.rol.count();
    const usuarios = await prismaPlan.usuario.count();
    const destinos = await prismaPlan.destino.count();
    console.log({ roles, usuarios, destinos });
  } catch (e) {
    console.error("ERROR Planeación:", (e as Error).message);
  }

  console.log("== Ejecución (DISTRILOG) ==");
  try {
    const ordenes = await prismaEjec.orden.count();
    const clientes = await prismaEjec.cliente.count();
    const vehiculos = await prismaEjec.vehiculo.count();
    console.log({ ordenes, clientes, vehiculos });
  } catch (e) {
    console.error("ERROR Ejecución:", (e as Error).message);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prismaPlan.$disconnect();
    await prismaEjec.$disconnect();
  });
