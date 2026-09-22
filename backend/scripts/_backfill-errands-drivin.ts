// Script único: sincroniza (crea/actualiza) en Drivin TODOS los clientes de
// Run Errands ya existentes en la BD, uno por uno (respeta rate limits con un
// pequeño delay). Requiere DRIVIN_API_KEY configurada.
import { prismaPlan as prisma } from "../src/lib/prisma";
import { sincronizarClienteDrivin } from "../src/lib/drivin";

async function main() {
  const clientes = await prisma.errandsCliente.findMany({ where: { activo: true } });
  console.log(`Sincronizando ${clientes.length} clientes de Run Errands con Drivin...`);
  let ok = 0, fallidos = 0;
  for (const c of clientes) {
    const r = await sincronizarClienteDrivin({
      codigo: c.codigo, nombre: c.nombre, direccion: c.direccion,
      barrio: c.barrio, ciudad: c.ciudad, region: c.region,
      telefono: c.telefono, email: c.email,
    });
    if (r.ok) ok++;
    else { fallidos++; console.error(`  ✗ ${c.codigo} ${c.nombre}: ${r.mensaje}`); }
    await new Promise((res) => setTimeout(res, 150));
  }
  console.log(`✅ Listo: ${ok} sincronizados, ${fallidos} fallidos.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
