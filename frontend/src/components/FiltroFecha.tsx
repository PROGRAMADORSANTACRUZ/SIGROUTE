"use client";

// Fecha ISO (yyyy-mm-dd) N días atrás (negativo = hacia adelante, ej. "mañana").
export function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface FiltroRangoFechaProps {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
  etiqueta?: string; // texto antes de los inputs, ej. "Planillas y novedades:"
  nota?: string; // texto alineado a la derecha, ej. aclaración de alcance
  // Sin caja contenedora ni "nota" a la derecha — para embeber inline dentro
  // de un header que ya trae sus propios botones sueltos (ej. Nivel de
  // Servicio), en vez de duplicar el mismo arreglo de presets/estilos ahí.
  compacto?: boolean;
}

// Desde/Hasta + accesos rápidos Hoy/Ayer/7 días/30 días — mismo patrón ya
// usado en Dashboard (Ejecución) y Nivel de Servicio, extraído a un solo
// componente para que cualquier página nueva lo reutilice tal cual.
export function FiltroRangoFecha({ desde, hasta, onChange, etiqueta, nota, compacto }: FiltroRangoFechaProps) {
  const presets = [
    { label: "Hoy", d: diasAtras(0), h: diasAtras(0) },
    { label: "Ayer", d: diasAtras(1), h: diasAtras(1) },
    { label: "7 días", d: diasAtras(6), h: diasAtras(0) },
    { label: "30 días", d: diasAtras(29), h: diasAtras(0) },
  ];
  const txt = compacto ? "text-sm" : "text-xs";
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compacto ? "" : "rounded-2xl border border-[#e1e9dd] bg-white px-3 py-2"}`}>
      {etiqueta && <span className={`font-medium text-[#7a8794] ${txt}`}>{etiqueta}</span>}
      <label className={`flex items-center gap-1.5 text-[#7a8794] ${txt}`}>
        Desde
        <input type="date" value={desde} onChange={(e) => onChange(e.target.value, hasta)} className={`rounded-lg border border-[#dfe4e0] bg-white px-2 ${compacto ? "py-1.5" : "py-1"} text-[#14352a] outline-none focus:border-[#2f8f4e] ${txt}`} />
      </label>
      <label className={`flex items-center gap-1.5 text-[#7a8794] ${txt}`}>
        Hasta
        <input type="date" value={hasta} onChange={(e) => onChange(desde, e.target.value)} className={`rounded-lg border border-[#dfe4e0] bg-white px-2 ${compacto ? "py-1.5" : "py-1"} text-[#14352a] outline-none focus:border-[#2f8f4e] ${txt}`} />
      </label>
      <div className="flex items-center gap-1">
        {presets.map((p) => {
          const activo = desde === p.d && hasta === p.h;
          return (
            <button key={p.label} type="button" onClick={() => onChange(p.d, p.h)}
              className={`rounded-lg border px-2.5 ${compacto ? "py-1.5" : "py-1"} text-xs font-medium transition-colors ${activo ? "border-[#2f8f4e] bg-[#e8f3e2] text-[#2f8f4e]" : "border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]"}`}>
              {p.label}
            </button>
          );
        })}
      </div>
      {nota && <span className="ml-auto text-[11px] text-[#9aa4af]">{nota}</span>}
    </div>
  );
}

interface FiltroFechaUnicaProps {
  value: string;
  onChange: (fecha: string) => void;
  etiqueta?: string;
  // "md" = input más grande (px-3 py-2.5 text-sm), igual al que ya usan los
  // headers de Preasignación/Áreas/Programación. Default "sm" = pill chica,
  // igual al usado en los accesos rápidos del Dashboard.
  tamano?: "sm" | "md";
}

// Un solo <input type=date> + accesos rápidos Ayer/Hoy/Mañana — para páginas
// que solo trabajan sobre UN día a la vez (Planeación, Preasignación, Áreas
// para Cargar, Programación), donde un rango no tiene sentido operativo.
export function FiltroFechaUnica({ value, onChange, etiqueta, tamano = "sm" }: FiltroFechaUnicaProps) {
  const opciones = [
    { label: "Ayer", v: diasAtras(1) },
    { label: "Hoy", v: diasAtras(0) },
    { label: "Mañana", v: diasAtras(-1) },
  ];
  const inputCls = tamano === "md"
    ? "rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]"
    : "rounded-lg border border-[#dfe4e0] bg-white px-2 py-1 text-xs text-[#14352a] outline-none focus:border-[#2f8f4e]";
  const btnCls = tamano === "md" ? "px-2.5 py-2 text-xs" : "px-2.5 py-1 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {etiqueta && <span className="text-xs font-medium text-[#7a8794]">{etiqueta}</span>}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      <div className="flex items-center gap-1">
        {opciones.map((o) => {
          const activo = value === o.v;
          return (
            <button key={o.label} type="button" onClick={() => onChange(o.v)}
              className={`rounded-lg border font-medium transition-colors ${btnCls} ${activo ? "border-[#2f8f4e] bg-[#e8f3e2] text-[#2f8f4e]" : "border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]"}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
