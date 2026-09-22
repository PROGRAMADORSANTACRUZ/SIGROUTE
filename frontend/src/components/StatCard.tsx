// Tarjeta de KPI reutilizable (mismo estilo que el dashboard): etiqueta,
// valor grande y un ícono en un chip a la derecha.
export default function StatCard({ label, value, sub, color = "#14352a", bg = "bg-white", icon }: {
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
