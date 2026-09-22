"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDistribucionDetalle } from "@/lib/planApi";
import { PageLoader } from "@/components/Loading";
import StatCard from "@/components/StatCard";
import { IconBox, IconCheckCircle, IconClipboard } from "@/components/icons";

interface DetalleFila {
  dep: string | null; tienda: string | null; plu: string | null; producto: string | null;
  pedido: number | null; planta: number | null; distribuido: number | null;
}
interface Detalle {
  id: number; fecha: string; nit: string | null; ordenArchivo: string | null; plantaArchivo: string | null;
  totalPedido: number | null; totalPlanta: number | null; totalDistribuido: number | null;
  detalle: DetalleFila[];
}

export default function DistribucionDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Detalle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDistribucionDetalle(Number(id)).then((r) => setData(r as unknown as Detalle)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageLoader />;
  if (!data) return <div className="p-6 text-sm text-[#b3261e]">Registro no encontrado.</div>;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#14352a]">Distribución #{data.id}</h1>
          <p className="text-xs text-[#9aa4af]">
            {new Date(data.fecha).toLocaleDateString("es-CO")} · NIT {data.nit ?? "—"} · {data.ordenArchivo} · {data.plantaArchivo}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/planeacion/distribucion-produccion/${data.id}/export.xlsx`} className="rounded-lg bg-[#2f8f4e] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#277a42]">Exportar pivote</a>
          <button onClick={() => router.push("/planeacion/distribucion-produccion")} className="rounded-lg border border-[#dfe4e0] px-4 py-1.5 text-sm">Volver</button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Pedido" value={(data.totalPedido ?? 0).toLocaleString("es-CO")} icon={IconClipboard} />
        <StatCard label="Planta" value={(data.totalPlanta ?? 0).toLocaleString("es-CO")} icon={IconBox} />
        <StatCard label="Distribuido" value={(data.totalDistribuido ?? 0).toLocaleString("es-CO")} color="#2f8f4e" bg="bg-[#f2f8ef]" icon={IconCheckCircle} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#f4f6f3] text-left text-xs font-semibold uppercase text-[#7a8794]">
            <tr><th className="px-3 py-2">Dep</th><th className="px-3 py-2">Tienda</th><th className="px-3 py-2">PLU</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Planta</th><th className="px-3 py-2">Distribuido</th></tr>
          </thead>
          <tbody>
            {data.detalle.map((f, i) => (
              <tr key={i} className="border-t border-[#f0f2ee]">
                <td className="px-3 py-2">{f.dep}</td>
                <td className="px-3 py-2">{f.tienda}</td>
                <td className="px-3 py-2">{f.plu}</td>
                <td className="px-3 py-2">{f.producto}</td>
                <td className="px-3 py-2">{f.pedido}</td>
                <td className="px-3 py-2">{f.planta}</td>
                <td className="px-3 py-2 font-semibold text-[#2f8f4e]">{f.distribuido}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
