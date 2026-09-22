// Historial de cambios (solo ADMIN) — puerto de legacy_fastapi/app/repos/cambios.py.
import { prismaPlan as prisma } from "./prisma";

function norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

export async function registrar(usuario: string, modulo: string, contexto: string, campo: string, anterior: unknown, nuevo: unknown) {
  const a = norm(anterior);
  const n = norm(nuevo);
  if (a === n) return;
  try {
    await prisma.cambioLog.create({
      data: { usuario, modulo, contexto: contexto.slice(0, 250), campo: campo.slice(0, 100), valorAnterior: a || null, valorNuevo: n || null },
    });
  } catch {
    // intencional: nunca debe tumbar la operación real
  }
}

export async function registrarLote(usuario: string, modulo: string, filas: [string, string, unknown, unknown][]) {
  const pend = filas
    .map(([c, f, a, n]) => [c, f, norm(a), norm(n)] as [string, string, string, string])
    .filter(([, , a, n]) => a !== n);
  if (!pend.length) return;
  try {
    await prisma.cambioLog.createMany({
      data: pend.map(([contexto, campo, valorAnterior, valorNuevo]) => ({
        usuario, modulo, contexto: contexto.slice(0, 250), campo: campo.slice(0, 100),
        valorAnterior: valorAnterior || null, valorNuevo: valorNuevo || null,
      })),
    });
  } catch {
    // intencional
  }
}
