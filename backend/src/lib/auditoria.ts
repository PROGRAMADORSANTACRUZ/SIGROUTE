// Auditoría — puerto de legacy_fastapi/app/repos/auditoria.py. `log()` nunca
// debe romper la operación principal (se traga cualquier error de escritura).
import { prismaPlan as prisma } from "./prisma";

export async function log(usuario: string, accion: string, modulo: string, detalle = "", instancia: string | null = null) {
  try {
    await prisma.auditLog.create({
      data: { usuario, accion, modulo, detalle: detalle.slice(0, 500), instancia },
    });
  } catch {
    // intencional: la auditoría nunca debe tumbar la operación real
  }
}
