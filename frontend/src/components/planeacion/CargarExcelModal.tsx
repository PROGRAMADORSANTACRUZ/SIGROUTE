"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { cargarExcelProgramacion, type ResultadoCargaExcel } from "@/lib/planApi";
import type { ResultadoPegado } from "@/lib/pegarProgramacion";

interface CategoriaCol { clave: string; etiqueta: string; kls: string; can: string }

// Reemplaza al viejo "Pegar desde Excel" (copiar/pegar celdas): sube el
// archivo real (.xlsx/.xlsm) y lee la hoja "Remisión" — cada cliente trae su
// total de kg ya despachado, se aplica todo a UNA sola área/categoría (la
// que se elija aquí), porque el informe es de un solo producto (ej. Porcino).
export default function CargarExcelModal({
  categorias,
  onAplicar,
  onClose,
}: {
  categorias: CategoriaCol[];
  onAplicar: (r: ResultadoPegado) => void;
  onClose: () => void;
}) {
  const [area, setArea] = useState(categorias[0]?.clave ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCargaExcel | null>(null);

  async function analizar() {
    if (!archivo || !area) return;
    setCargando(true);
    setError(null);
    try {
      setResultado(await cargarExcelProgramacion(area, archivo));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo leer el archivo");
    } finally {
      setCargando(false);
    }
  }

  const categoria = categorias.find((c) => c.clave === area);
  const encontrados = resultado ? resultado.filas.filter((f) => f.clienteId).length : 0;

  function aplicar() {
    if (!resultado || !categoria) return;
    const r: ResultadoPegado = {
      columnaDestinoIdx: 0,
      categoriasDetectadas: [{ clave: categoria.clave, etiqueta: categoria.etiqueta, colKls: 0, colCan: null }],
      filas: resultado.filas
        .filter((f) => f.clienteId)
        .map((f) => ({ destinoTexto: f.destino, destinoId: f.clienteId, valores: { [resultado.campoKls]: f.kg } })),
      noEncontrados: resultado.sinMatch,
      filasIgnoradas: 0,
    };
    onAplicar(r);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#eceef0] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#14352a]">Cargar Excel</h3>
          <p className="mt-1 text-sm text-[#5f7a68]">
            Sube el informe real (.xlsx/.xlsm) — se lee la hoja "Remisión" y se toma el total de kg ya despachado por cliente.
          </p>
        </div>
        <div className="nice-scroll min-h-0 flex-1 overflow-auto px-6 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#7a8794]">Área / categoría</label>
              <select
                value={area}
                onChange={(e) => { setArea(e.target.value); setResultado(null); }}
                className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]"
              >
                {categorias.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#7a8794]">Archivo</label>
              <input
                type="file"
                accept=".xlsx,.xlsm,.xls"
                onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setResultado(null); }}
                className="text-sm"
              />
            </div>
            <button
              onClick={analizar}
              disabled={!archivo || !area || cargando}
              className="rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-50"
            >
              {cargando ? "Leyendo…" : "Analizar"}
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-[#b3261e]">{error}</p>}

          {resultado && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-[#dfe4e0] bg-[#f7faf5] p-3 text-sm">
                <p className="font-medium text-[#14352a]">
                  {encontrados} cliente(s) encontrado(s) de {resultado.filas.length} leído(s) — se cargarán en "{categoria?.etiqueta}"
                </p>
              </div>

              {resultado.sinMatch.length > 0 && (
                <div className="rounded-xl border border-[#f0c4c1] bg-[#fbeceb] p-3 text-sm text-[#b3261e]">
                  <p className="font-medium">No coinciden con ningún cliente existente (no se cargarán):</p>
                  <ul className="mt-1 list-disc pl-5">
                    {resultado.sinMatch.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}

              {resultado.filas.some((f) => f.clienteId && f.tipo !== "exacto") && (
                <div className="rounded-xl border border-[#f5dfa0] bg-[#fdf6e3] p-3 text-sm text-[#8a6a00]">
                  <p className="font-medium">Coincidencia aproximada (revisa que sea el cliente correcto):</p>
                  <ul className="mt-1 list-disc pl-5">
                    {resultado.filas.filter((f) => f.clienteId && f.tipo !== "exacto").map((f, i) => (
                      <li key={i}>"{f.destino}" → "{f.clienteNombre}"</li>
                    ))}
                  </ul>
                </div>
              )}

              {encontrados > 0 && (
                <div className="overflow-x-auto rounded-xl border border-[#dfe4e0]">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f7faf5] text-left text-[#7a8794]">
                      <tr>
                        <th className="px-2 py-1.5">Cliente</th>
                        <th className="px-2 py-1.5 text-right">Kg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f0f2ee]">
                      {resultado.filas.filter((f) => f.clienteId).map((f, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 font-medium text-[#14352a]">{f.clienteNombre}</td>
                          <td className="px-2 py-1.5 text-right text-[#45505e]">{f.kg.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">
            Cancelar
          </button>
          <button
            onClick={aplicar}
            disabled={!resultado || encontrados === 0}
            className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-50"
          >
            Aplicar a la grilla ({encontrados})
          </button>
        </div>
      </div>
    </div>
  );
}
