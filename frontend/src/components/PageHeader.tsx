import type { ReactNode } from "react";

// Encabezado unificado (ícono + título + subtítulo + acciones) para que todas
// las páginas de Planeación luzcan igual que las de Ejecución/DISTRILOG.
export default function PageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f3e2] text-[#2f8f4e]">
            {icon}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">{title}</h1>
          {subtitle && <p className="text-sm text-[#5f7a68]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}
