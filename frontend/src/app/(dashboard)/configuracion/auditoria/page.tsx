"use client";

import { useEffect, useState } from "react";
import { getAuditoria, getCambios } from "@/lib/planApi";
import { getUser } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { PageLoader } from "@/components/Loading";
import EmptyState from "@/components/EmptyState";
import { IconClipboard } from "@/components/icons";

interface AccionRow { id: number; usuario: string | null; accion: string | null; modulo: string | null; detalle: string | null; fecha: string }
interface CambioRow { id: number; usuario: string | null; modulo: string | null; contexto: string | null; campo: string | null; valorAnterior: string | null; valorNuevo: string | null; creadoAt: string }

// Fila unificada: una acción de auditoría o un cambio de campo, mostradas
// juntas en una sola línea de tiempo en vez de dos tablas separadas (evita
// ver el mismo evento "duplicado" una vez como acción y otra como cambio).
interface FilaUnificada {
  key: string;
  fecha: string;
  usuario: string | null;
  modulo: string | null;
  tipo: "Acción" | "Cambio";
  detalle: string;
}

export default function AuditoriaPage() {
  const [esAdmin, setEsAdmin] = useState(false);
  const [filas, setFilas] = useState<FilaUnificada[]>([]);
  const [modulo, setModulo] = useState("");
  const [usuario, setUsuario] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { setEsAdmin(getUser()?.role === "ADMIN"); }, []);

  function cargar(admin: boolean) {
    setLoading(true);
    const params: Record<string, string> = {};
    if (modulo) params.modulo = modulo;
    if (usuario) params.usuario = usuario;

    Promise.all([
      getAuditoria(params).then((d) => d as AccionRow[]),
      admin ? getCambios(params).then((d) => d as CambioRow[]) : Promise.resolve([] as CambioRow[]),
    ]).then(([acciones, cambios]) => {
      const deAcciones: FilaUnificada[] = acciones.map((r) => ({
        key: `a-${r.id}`,
        fecha: r.fecha,
        usuario: r.usuario,
        modulo: r.modulo,
        tipo: "Acción",
        detalle: [r.accion, r.detalle].filter(Boolean).join(" — ") || "—",
      }));
      const deCambios: FilaUnificada[] = cambios.map((r) => ({
        key: `c-${r.id}`,
        fecha: r.creadoAt,
        usuario: r.usuario,
        modulo: r.modulo,
        tipo: "Cambio",
        detalle: `${r.contexto ? r.contexto + " · " : ""}${r.campo ?? ""}: ${r.valorAnterior ?? "—"} → ${r.valorNuevo ?? "—"}`,
      }));
      const todas = [...deAcciones, ...deCambios].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      setFilas(todas);
    }).finally(() => setLoading(false));
  }
  useEffect(() => { cargar(esAdmin); }, [esAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6">
      <PageHeader
        icon={IconClipboard}
        title="Auditoría"
        subtitle={esAdmin ? "Acciones y cambios de campo de los usuarios, en una sola línea de tiempo." : "Registro de acciones de los usuarios en Planeación."}
      />
      <div className="mb-4 flex gap-2">
        <input placeholder="Módulo" value={modulo} onChange={(e) => setModulo(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-1.5 text-sm" />
        <input placeholder="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-1.5 text-sm" />
        <button onClick={() => cargar(esAdmin)} className="rounded-lg bg-[#2f8f4e] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#277a42]">Filtrar</button>
      </div>
      {loading ? (
        <PageLoader />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e1e9dd] bg-[#f7faf5] text-left text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Módulo</th>
                {esAdmin && <th className="px-3 py-2">Tipo</th>}
                <th className="px-3 py-2">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2ee]">
              {filas.map((r) => (
                <tr key={r.key} className="hover:bg-[#f9fbf7]">
                  <td className="whitespace-nowrap px-3 py-2">{new Date(r.fecha).toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2">{r.usuario}</td>
                  <td className="px-3 py-2">{r.modulo}</td>
                  {esAdmin && (
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.tipo === "Acción" ? "bg-[#e8f3e2] text-[#2f8f4e]" : "bg-[#e6effb] text-[#1a5fb4]"}`}>
                        {r.tipo}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2">{r.detalle}</td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr><td colSpan={esAdmin ? 5 : 4}><EmptyState icon={IconClipboard} title="Sin registros" description="Las acciones y cambios de otros usuarios aparecerán aquí a medida que ocurran." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

