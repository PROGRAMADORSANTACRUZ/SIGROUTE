// Áreas por Programación (cierre/reapertura) — puerto de
// legacy_fastapi/app/repos/areas.py.
import { prismaPlan as prisma } from "./prisma";
import { CATEGORIAS } from "./planCategorias";

export interface EstadoArea {
  area: string;
  kls: number;
  canastillas: number;
  cerrado: boolean;
  cerradoPor: string | null;
  cerradoAt: Date | null;
}

export async function estados(progId: number): Promise<EstadoArea[]> {
  const detalle = await prisma.progDetalle.findMany({ where: { progId } });
  const estadosRows = await prisma.areaEstado.findMany({ where: { progId } });
  const estMap = new Map(estadosRows.map((e) => [e.area, e]));

  return CATEGORIAS.map((c) => {
    const e = estMap.get(c.etiqueta);
    const kls = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0), 0);
    const can = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.can] ?? 0), 0);
    return {
      area: c.etiqueta,
      kls,
      canastillas: can,
      cerrado: !!e?.cerrado,
      cerradoPor: e?.cerradoPor ?? null,
      cerradoAt: e?.cerradoAt ?? null,
    };
  });
}

export async function cerrar(progId: number, area: string, usuario: string) {
  await prisma.areaEstado.upsert({
    where: { progId_area: { progId, area } },
    update: { cerrado: true, cerradoPor: usuario, cerradoAt: new Date() },
    create: { progId, area, cerrado: true, cerradoPor: usuario, cerradoAt: new Date() },
  });
}

export async function reabrir(progId: number, area: string) {
  await prisma.areaEstado.upsert({
    where: { progId_area: { progId, area } },
    update: { cerrado: false, cerradoPor: null, cerradoAt: null },
    create: { progId, area, cerrado: false },
  });
}

export function validoArea(area: string): boolean {
  return CATEGORIAS.some((c) => c.etiqueta === area);
}

export async function todasAreasCerradas(progId: number): Promise<boolean> {
  const rows = await prisma.areaEstado.findMany({ where: { progId, cerrado: true } });
  const cerradas = new Set(rows.map((r) => r.area));
  return CATEGORIAS.every((c) => cerradas.has(c.etiqueta));
}
