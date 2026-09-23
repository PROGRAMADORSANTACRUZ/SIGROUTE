// Resumen del Día (solo lectura) — puerto de legacy_fastapi/app/repos/resumen.py.
import { Router } from "express";
import { prismaPlan as prisma } from "../../lib/prisma";
import { requireAuth, requirePermiso } from "../../middleware/auth";
import { CATEGORIAS, INSTANCIA } from "../../lib/planCategorias";

const router = Router();
router.use(requireAuth, requirePermiso("resumen.ver"));

function parseFecha(s: unknown): Date {
  const d = typeof s === "string" && s ? new Date(s) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /api/planeacion/resumen?fecha=
router.get("/", async (req, res, next) => {
  try {
    const fecha = parseFecha(req.query.fecha);
    const prog = await prisma.programacion.findUnique({ where: { instancia_fecha: { instancia: INSTANCIA, fecha } } });
    if (!prog) {
      return res.json({
        prog: null,
        totalesCategoria: CATEGORIAS.map((c) => ({ categoria: c.etiqueta, kls: 0, canastillas: 0 })),
        totales: { kls: 0, canastillas: 0 },
        conteos: { destinos: 0, rutas: 0, rutasAsignadas: 0 },
        rutas: [],
      });
    }

    const detalle = await prisma.progDetalle.findMany({ where: { progId: prog.id } });
    let tk = 0;
    let tc = 0;
    const totalesCategoria = CATEGORIAS.map((c) => {
      const kls = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0), 0);
      const can = detalle.reduce((acc, d) => acc + Number((d as unknown as Record<string, unknown>)[c.can] ?? 0), 0);
      tk += kls;
      tc += can;
      return { categoria: c.etiqueta, kls, canastillas: can };
    });

    const destinosConProducto = detalle.filter((d) =>
      CATEGORIAS.some((c) => Number((d as unknown as Record<string, unknown>)[c.kls] ?? 0) > 0)
    ).length;

    const rutas = await prisma.planRuta.findMany({
      where: { progId: prog.id },
      include: {
        vehiculo: true,
        conductor: true,
        destinos: { orderBy: { orden: "asc" }, include: { destino: true } },
        auxiliares: { orderBy: { posicion: "asc" }, include: { auxiliar: true } },
      },
      orderBy: { numeroRuta: "asc" },
    });

    const clienteIds = [...new Set(rutas.flatMap((r) => r.destinos.map((d) => d.clienteId).filter((x): x is string => !!x)))];
    const clientes = clienteIds.length
      ? await prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, codigoDireccion: true, cliente: true, nombreDireccion: true } })
      : [];
    const clienteById = new Map(clientes.map((c) => [c.id, c]));

    res.json({
      prog: { id: prog.id, fecha: prog.fecha, consecutivo: prog.consecutivo, estado: prog.estado },
      totalesCategoria,
      totales: { kls: tk, canastillas: tc },
      conteos: {
        destinos: destinosConProducto,
        rutas: rutas.length,
        rutasAsignadas: rutas.filter((r) => r.vehiculoId != null).length,
      },
      rutas: rutas.map((r) => ({
        id: r.id,
        numeroRuta: r.numeroRuta,
        horaCargue: r.horaCargue,
        vehiculo: r.vehiculo?.placa ?? null,
        conductor: r.conductor?.nombre ?? null,
        cerrada: !!r.cerrada,
        destinos: r.destinos.map((d) => {
          const cliente = d.clienteId ? clienteById.get(d.clienteId) : null;
          return {
            numero: cliente?.codigoDireccion ?? d.destino?.numero ?? null,
            nombre: cliente?.cliente ?? cliente?.nombreDireccion ?? d.destino?.nombre ?? "(sin nombre)",
            kilos: d.kilos,
          };
        }),
        auxiliares: r.auxiliares.map((a) => a.auxiliar.nombre),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
