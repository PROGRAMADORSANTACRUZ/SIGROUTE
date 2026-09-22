// Piezas visuales reutilizables tipo dashboard (StatCard/Donut/HBar) — ver
// también las versiones locales en app/(dashboard)/dashboard/page.tsx; se
// duplican aquí en vez de importarlas para no arriesgar esa página ya en uso.

export function StatCard({ label, value, sub, color = "#14352a", bg = "bg-white", icon }: {
  label: string; value: string | number; sub?: string; color?: string; bg?: string; icon?: React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border border-[#e1e9dd] ${bg} px-4 py-3 shadow-sm`}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-[#7a8794]">{label}</p>
        <p className="text-3xl font-bold leading-none tabular-nums" style={{ color }}>{value}</p>
        {sub && <p className="truncate text-[11px] text-[#7a8794]">{sub}</p>}
      </div>
      {icon && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f2f5ef] text-[#7a8794]">
          {icon}
        </span>
      )}
    </div>
  );
}

export function DonutChart({ segments, centerLabel, centerSub }: {
  segments: { value: number; color: string; label: string }[];
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  const cx = 50, cy = 50, r = 36, sw = 14;
  const circ = 2 * Math.PI * r;
  let off = 0;
  const arcs = segments.map((seg) => {
    const dl = total > 0 ? (seg.value / total) * circ : 0;
    const a = { ...seg, dashLength: dl, offset: off };
    off += dl;
    return a;
  });
  return (
    <div className="relative">
      <svg viewBox="0 0 100 100" className="w-full">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f2f5ef" strokeWidth={sw} />
        {arcs.map((a, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={a.color} strokeWidth={sw}
            strokeDasharray={`${a.dashLength} ${circ}`}
            strokeDashoffset={-(a.offset - circ / 4)}
            className="transition-all duration-500"
          />
        ))}
        {centerLabel && (
          <>
            <text x="50" y="47" textAnchor="middle" className="fill-[#14352a]" fontSize="14" fontWeight="bold">{centerLabel}</text>
            {centerSub && <text x="50" y="58" textAnchor="middle" className="fill-[#7a8794]" fontSize="6">{centerSub}</text>}
          </>
        )}
      </svg>
    </div>
  );
}

export function SparkBars({ data }: { data: { label: string; value: number; kg?: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-28 items-end gap-1.5">
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex flex-1 flex-col items-center gap-1">
          {d.value > 0 && <span className="text-[9px] font-semibold text-[#14352a]">{d.value}</span>}
          <div className="w-full overflow-hidden rounded-t-md bg-[#f2f5ef]" style={{ height: "80px" }}>
            <div
              className="w-full rounded-t-md bg-[#2f8f4e] transition-all duration-700"
              style={{ height: `${(d.value / max) * 100}%`, marginTop: `${100 - (d.value / max) * 100}%` }}
            />
          </div>
          <span className="text-center text-[9px] text-[#7a8794]">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function HBar({ label, value, max, color = "#2f8f4e", sub }: {
  label: string; value: number; max: number; color?: string; sub?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs font-medium text-[#45505e]" title={label}>{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#f2f5ef]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-10 shrink-0 text-right">
        <span className="text-xs font-semibold tabular-nums text-[#14352a]">{sub ?? value}</span>
      </div>
    </div>
  );
}
