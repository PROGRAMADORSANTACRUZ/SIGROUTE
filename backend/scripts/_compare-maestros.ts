// Script temporal de verificación (solo lectura) — compara conductores/vehículos/
// auxiliares de Planeación vs Ejecución para confirmar si son datos duplicados.
import { prismaPlan, prismaEjec } from "../src/lib/prisma";

async function main() {
  const planConductores = await prismaPlan.planConductor.findMany({ where: { activo: true } });
  const ejecConductores = await prismaEjec.conductor.findMany({ where: { activo: true } });
  const planVehiculos = await prismaPlan.planVehiculo.findMany({ where: { activo: true } });
  const ejecVehiculos = await prismaEjec.vehiculo.findMany();
  const planAux = await prismaPlan.planAuxiliar.findMany({ where: { activo: true } });
  const ejecAux = await prismaEjec.auxiliar.findMany();

  console.log("Planeación: conductores=%d vehiculos=%d auxiliares=%d", planConductores.length, planVehiculos.length, planAux.length);
  console.log("Ejecución : conductores=%d vehiculos=%d auxiliares=%d", ejecConductores.length, ejecVehiculos.length, ejecAux.length);

  const normP = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
  const ejecPlacas = new Set(ejecVehiculos.map((v) => normP(v.placa)));
  const matchVeh = planVehiculos.filter((v) => ejecPlacas.has(normP(v.placa)));
  console.log(`Vehículos: ${matchVeh.length}/${planVehiculos.length} placas de Planeación existen también en Ejecución`);
  console.log("Ejemplo placas Plan no en Ejec:", planVehiculos.filter((v) => !ejecPlacas.has(normP(v.placa))).slice(0, 5).map((v) => v.placa));

  const ejecNombresCond = new Set(ejecConductores.map((c) => normP(`${c.nombres} ${c.apellidos}`)));
  const matchCond = planConductores.filter((c) => ejecNombresCond.has(normP(c.nombre)));
  console.log(`Conductores: ${matchCond.length}/${planConductores.length} nombres de Planeación existen también en Ejecución (match exacto nombre completo)`);
  console.log("Ejemplo Plan:", planConductores.slice(0, 5).map((c) => c.nombre));
  console.log("Ejemplo Ejec:", ejecConductores.slice(0, 5).map((c) => `${c.nombres} ${c.apellidos}`));

  const ejecNombresAux = new Set(ejecAux.map((a) => normP(a.nombre)));
  const matchAux = planAux.filter((a) => ejecNombresAux.has(normP(a.nombre)));
  console.log(`Auxiliares: ${matchAux.length}/${planAux.length} nombres de Planeación existen también en Ejecución`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prismaPlan.$disconnect();
    await prismaEjec.$disconnect();
  });
