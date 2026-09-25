"use client";

import { useEffect, useState } from "react";
import { ApiError, cargarTodasFacturasTat, getRutasFlete, type FacturasTodasResult } from "@/lib/api";

// Paso previo a "Leer factura": el operador elige si va a pistolear/escanear
// una factura a la vez, o traer TODAS las facturas de despacho del día de una
// sola vez (las de recogida en planta se descartan solas, esta app es de noche).
export default function CargarSiesaModal({
  origen,
  onEscanear,
  onDone,
  onClose,
}: {
  origen: "AGROPECUARIA" | "INVERSIONES";
  onEscanear: () => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const [modo, setModo] = useState<"elegir" | "todas">("elegir");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState("");
  const [ruta, setRuta] = useState("");
  const [rutasFlete, setRutasFlete] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<FacturasTodasResult | null>(null);

  useEffect(() => { getRutasFlete().then(setRutasFlete).catch(() => {}); }, []);

  const etiqueta = origen === "INVERSIONES" ? "TAT Inversiones" : "TAT Agropecuaria";

  async function cargarTodas() {
    setCargando(true);
    setError(null);
    try {
      const r = await cargarTodasFacturasTat(origen, fecha, fechaFin || undefined, ruta || undefined);
      setResultado(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-[#eceef0] px-5 py-3.5">
          <div>
            <h3 className="text-base font-semibold text-[#14352a]">Cargar órdenes de Siesa · {etiqueta}</h3>
            <p className="text-xs text-[#7a8794]">Solo se cargan las de despacho (las de recogida no salen de noche).</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="shrink-0 rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5">
          {modo === "elegir" && !resultado && (
            <div className="flex flex-col gap-2.5">
              <button
                onClick={onEscanear}
                className="rounded-xl border border-[#dfe4e0] px-4 py-3 text-left text-sm font-medium text-[#14352a] hover:border-[#2f8f4e] hover:bg-[#f2f8ef]"
              >
                Pistolear / traer una por una
                <span className="mt-0.5 block text-xs font-normal text-[#7a8794]">Pistola QR, cámara del celular o número manual.</span>
              </button>
              <button
                onClick={() => setModo("todas")}
                className="rounded-xl border border-[#dfe4e0] px-4 py-3 text-left text-sm font-medium text-[#14352a] hover:border-[#2f8f4e] hover:bg-[#f2f8ef]"
              >
                Traer todas de una
                <span className="mt-0.5 block text-xs font-normal text-[#7a8794]">Trae todas las facturas de despacho del día directo de Siesa.</span>
              </button>
            </div>
          )}

          {modo === "todas" && !resultado && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#7a8794]">Fecha</label>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#7a8794]">Fecha fin (opcional)</label>
                <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#7a8794]">Ruta (opcional)</label>
                <select value={ruta} onChange={(e) => setRuta(e.target.value)} className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]">
                  <option value="">Sin definir (se pedirá al asignar vehículo)</option>
                  {rutasFlete.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {error && <p className="text-sm text-[#b3261e]">{error}</p>}
              <div className="mt-1 flex justify-end gap-2">
                <button onClick={() => setModo("elegir")} disabled={cargando} className="rounded-lg border border-[#dfe4e0] px-4 py-2 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-60">
                  Atrás
                </button>
                <button onClick={cargarTodas} disabled={cargando} className="rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-60">
                  {cargando ? "Cargando…" : "Cargar todas"}
                </button>
              </div>
            </div>
          )}

          {resultado && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-[#dfe4e0] bg-[#f7faf5] p-3 text-sm">
                <p className="font-medium text-[#14352a]">
                  {resultado.cargadas} factura(s) cargada(s) de {resultado.totalEncontradas} encontrada(s)
                </p>
                {resultado.totalRecogidaDescartadas > 0 && (
                  <p className="mt-1 text-xs text-[#7a8794]">{resultado.totalRecogidaDescartadas} línea(s) de recogida descartada(s).</p>
                )}
              </div>
              {resultado.errores.length > 0 && (
                <div className="rounded-xl border border-[#f0c4c1] bg-[#fbeceb] p-3 text-sm text-[#b3261e]">
                  <p className="font-medium">{resultado.errores.length} factura(s) con error:</p>
                  <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5">
                    {resultado.errores.map((e, i) => <li key={i}>{e.documento}: {e.error}</li>)}
                  </ul>
                </div>
              )}
              <button
                onClick={() => { onDone(); onClose(); }}
                className="rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-medium text-white hover:bg-[#277a42]"
              >
                Listo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
