"use client";

import { useState } from "react";
import { parsearPegadoProgramacion, type CategoriaCol, type DestinoRef, type ResultadoPegado } from "@/lib/pegarProgramacion";

export default function PegarExcelModal({
  categorias,
  destinos,
  onAplicar,
  onClose,
}: {
  categorias: CategoriaCol[];
  destinos: DestinoRef[];
  onAplicar: (r: ResultadoPegado) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoPegado | null>(null);

  function analizar() {
    if (!texto.trim()) return;
    setResultado(parsearPegadoProgramacion(texto, categorias, destinos));
  }

  const encontrados = resultado ? resultado.filas.filter((f) => f.destinoId).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#eceef0] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#14352a]">Pegar desde Excel</h3>
          <p className="mt-1 text-sm text-[#5f7a68]">
            Copia en tu Excel desde la fila de encabezados (Destino, Bovino, Víscera Bovino, Porcino…) hasta la última fila de datos, y pégalo aquí.
          </p>
        </div>
        <div className="nice-scroll min-h-0 flex-1 overflow-auto px-6 py-4">
          <textarea
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setResultado(null); }}
            placeholder="Pega aquí el rango copiado de Excel (Ctrl+V)…"
            rows={8}
            className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 font-mono text-xs outline-none focus:border-[#2f8f4e]"
          />
          <button
            onClick={analizar}
            disabled={!texto.trim()}
            className="mt-3 rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-50"
          >
            Analizar
          </button>

          {resultado && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-[#dfe4e0] bg-[#f7faf5] p-3 text-sm">
                <p className="font-medium text-[#14352a]">
                  {encontrados} destino(s) encontrado(s) de {resultado.filas.length} fila(s) leída(s)
                  {resultado.filasIgnoradas > 0 && ` · ${resultado.filasIgnoradas} fila(s) vacía(s) ignorada(s)`}
                </p>
                <p className="mt-1 text-xs text-[#5f7a68]">
                  Columnas detectadas: {resultado.categoriasDetectadas.filter((c) => c.colKls != null).map((c) => c.etiqueta).join(", ") || "ninguna"}
                </p>
              </div>

              {resultado.noEncontrados.length > 0 && (
                <div className="rounded-xl border border-[#f0c4c1] bg-[#fbeceb] p-3 text-sm text-[#b3261e]">
                  <p className="font-medium">No coinciden con ningún destino existente (no se cargarán):</p>
                  <ul className="mt-1 list-disc pl-5">
                    {resultado.noEncontrados.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}

              {encontrados > 0 && (
                <div className="overflow-x-auto rounded-xl border border-[#dfe4e0]">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f7faf5] text-left text-[#7a8794]">
                      <tr>
                        <th className="px-2 py-1.5">Destino</th>
                        {categorias.map((c) => <th key={c.clave} className="px-2 py-1.5 text-right">{c.etiqueta}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f0f2ee]">
                      {resultado.filas.filter((f) => f.destinoId).map((f, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 font-medium text-[#14352a]">{f.destinoTexto}</td>
                          {categorias.map((c) => (
                            <td key={c.clave} className="px-2 py-1.5 text-right text-[#45505e]">
                              {f.valores[c.kls] || f.valores[c.can] ? `${f.valores[c.kls] ?? 0} kg · ${f.valores[c.can] ?? 0} can` : "—"}
                            </td>
                          ))}
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
            onClick={() => resultado && onAplicar(resultado)}
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
