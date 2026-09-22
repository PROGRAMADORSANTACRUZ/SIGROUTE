"use client";

import { useEffect, useState } from "react";
import { getSiesa, guardarSiesa } from "@/lib/planApi";
import { ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import SimuladorTabs from "@/components/SimuladorTabs";
import { IconGear } from "@/components/icons";
import { PageLoader } from "@/components/Loading";
import EmptyState from "@/components/EmptyState";

interface SiesaRow { plu: string; siesa: string; nombre: string | null }

export default function MaestroSiesaPage() {
  const [items, setItems] = useState<SiesaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ plu: "", siesa: "", nombre: "" });
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setLoading(true);
    getSiesa().then(setItems).finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  async function guardar() {
    setError(null);
    if (!form.plu.trim() || !form.siesa.trim()) {
      setError("PLU y código SIESA son obligatorios");
      return;
    }
    try {
      await guardarSiesa(form);
      setForm({ plu: "", siesa: "", nombre: "" });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    }
  }

  function tipoDe(siesa: string): string {
    if (siesa.startsWith("2")) return "Porcino";
    if (siesa.startsWith("1")) return "Bovino";
    return "—";
  }

  return (
    <div className="p-6">
      <SimuladorTabs active="/planeacion/simulador/predistribucion/siesa" />

      <PageHeader icon={IconGear} title="Maestro SIESA" subtitle="Relaciona cada PLU con su código SIESA para clasificar bovino/porcino." />

      <div className="mb-4 rounded-2xl border border-[#e1e9dd] bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-[#14352a]">Agregar / editar código</h2>
        <p className="mb-2 text-xs text-[#9aa4af]">Si el PLU ya existe, se actualiza.</p>
        {error && <p className="mb-2 text-sm text-[#b3261e]">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <input placeholder="PLU" value={form.plu} onChange={(e) => setForm((f) => ({ ...f, plu: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-1.5 text-sm" />
          <input placeholder="Código SIESA" value={form.siesa} onChange={(e) => setForm((f) => ({ ...f, siesa: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-1.5 text-sm" />
          <input placeholder="Nombre / corte" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="rounded-lg border border-[#dfe4e0] px-3 py-1.5 text-sm" />
          <button onClick={guardar} className="rounded-lg bg-[#2f8f4e] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#277a42]">Guardar</button>
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e1e9dd] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f4f6f3] text-left text-xs font-semibold uppercase text-[#7a8794]">
              <tr><th className="px-3 py-2">SIESA</th><th className="px-3 py-2">PLU</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2 text-right">Acciones</th></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.plu} className="border-t border-[#f0f2ee]">
                  <td className="px-3 py-2">{it.siesa}</td>
                  <td className="px-3 py-2">{it.plu}</td>
                  <td className="px-3 py-2">{it.nombre ?? "—"}</td>
                  <td className="px-3 py-2">{tipoDe(it.siesa)}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setForm({ plu: it.plu, siesa: it.siesa, nombre: it.nombre ?? "" })} className="text-[#2f8f4e] hover:underline">Editar</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5}><EmptyState icon={IconGear} title="Sin códigos SIESA registrados" description="Agrega el primero con el formulario de arriba." /></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
