// Sincroniza Conductores/Vehículos/Auxiliares desde la BD de Ejecución
// (DISTRILOG, fuente única para estos 3 maestros) hacia la BD de Planeación
// (upsert por clave natural: placa / cédula / nombre). NUNCA borra registros
// de Planeación — los que ya no existan en Ejecución quedan tal cual (por
// integridad de las FK de rutas/asignación ya creadas), solo se agregan o
// actualizan los que sí coinciden.
import { prismaPlan } from "./prisma";

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

export async function sincronizarVehiculos(): Promise<{ creados: number; actualizados: number }> {
  const ejecucion = await prismaPlan.vehiculo.findMany();
  const planeacion = await prismaPlan.planVehiculo.findMany();
  const porPlaca = new Map(planeacion.map((v) => [norm(v.placa), v]));

  let creados = 0;
  let actualizados = 0;
  for (const v of ejecucion) {
    const existente = porPlaca.get(norm(v.placa));
    const capacidadKg = v.capacidadReal ? Number(v.capacidadReal.replace(/[^\d.]/g, "")) || undefined : undefined;
    if (existente) {
      await prismaPlan.planVehiculo.update({
        where: { id: existente.id },
        data: { placa: v.placa.toUpperCase(), ...(capacidadKg ? { capacidadKg } : {}) },
      });
      actualizados++;
    } else {
      await prismaPlan.planVehiculo.create({
        data: { placa: v.placa.toUpperCase(), capacidadKg: capacidadKg ?? 0, disponibilidad: v.estado === "Activo" ? "DISPONIBLE" : "NO DISPONIBLE" },
      });
      creados++;
    }
  }
  return { creados, actualizados };
}

export async function sincronizarConductores(): Promise<{ creados: number; actualizados: number }> {
  const ejecucion = await prismaPlan.conductor.findMany({ where: { activo: true } });
  const planeacion = await prismaPlan.planConductor.findMany();
  const porDocumento = new Map(planeacion.filter((c) => c.documento).map((c) => [norm(c.documento!), c]));
  const porNombre = new Map(planeacion.map((c) => [norm(c.nombre), c]));

  let creados = 0;
  let actualizados = 0;
  for (const c of ejecucion) {
    const nombreCompleto = `${c.nombres} ${c.apellidos}`.trim();
    const existente = (c.cedula && porDocumento.get(norm(c.cedula))) ?? porNombre.get(norm(nombreCompleto));
    const data = { nombre: nombreCompleto, documento: c.cedula ?? undefined, celular: c.celular ?? undefined, correo: c.correo ?? undefined };
    if (existente) {
      await prismaPlan.planConductor.update({ where: { id: existente.id }, data });
      actualizados++;
    } else {
      await prismaPlan.planConductor.create({ data: { nombre: nombreCompleto, documento: c.cedula, celular: c.celular, correo: c.correo } });
      creados++;
    }
  }
  return { creados, actualizados };
}

export async function sincronizarAuxiliares(): Promise<{ creados: number; actualizados: number }> {
  const ejecucion = await prismaPlan.auxiliar.findMany();
  const planeacion = await prismaPlan.planAuxiliar.findMany();
  const porNombre = new Map(planeacion.map((a) => [norm(a.nombre), a]));

  let creados = 0;
  let actualizados = 0;
  for (const a of ejecucion) {
    const existente = porNombre.get(norm(a.nombre));
    if (existente) {
      await prismaPlan.planAuxiliar.update({ where: { id: existente.id }, data: { celular: a.telefono ?? undefined } });
      actualizados++;
    } else {
      await prismaPlan.planAuxiliar.create({ data: { nombre: a.nombre, celular: a.telefono } });
      creados++;
    }
  }
  return { creados, actualizados };
}

export async function sincronizarTodo() {
  const [vehiculos, conductores, auxiliares] = await Promise.all([
    sincronizarVehiculos(),
    sincronizarConductores(),
    sincronizarAuxiliares(),
  ]);
  return { vehiculos, conductores, auxiliares };
}

// Auto-sync: se llama internamente (no hay botón en la UI) cada vez que Planeación
// necesita listas de conductores/vehículos/auxiliares. Se limita por tiempo para no
// pegarle a la BD de Ejecución en cada request; una app acoplada de verdad no expone
// esto al usuario, simplemente mantiene los datos frescos por debajo.
const INTERVALO_MS = 5 * 60 * 1000;
let ultimaSync = 0;
let syncEnCurso: Promise<void> | null = null;

export async function sincronizarSiVencido(): Promise<void> {
  if (Date.now() - ultimaSync < INTERVALO_MS) return;
  if (syncEnCurso) return syncEnCurso;
  syncEnCurso = sincronizarTodo()
    .then(() => {
      ultimaSync = Date.now();
    })
    .catch((err) => {
      // no bloquea la respuesta si Ejecución no está disponible; se reintenta en el próximo request
      console.error("[syncMaestros] auto-sync falló:", err);
    })
    .finally(() => {
      syncEnCurso = null;
    });
  return syncEnCurso;
}
