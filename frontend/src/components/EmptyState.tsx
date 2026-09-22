import type { ReactNode } from "react";

// Estado vacío consistente para tablas/listas de Planeación y Ejecución
// (icono + título + descripción opcional), en vez de una fila de texto plano.
export default function EmptyState({
  icon,
  title,
  description,
  className = "py-12",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${className}`}>
      {icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f5ef] text-[#9aa4af]">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-[#45505e]">{title}</p>
      {description && <p className="max-w-sm text-xs text-[#9aa4af]">{description}</p>}
    </div>
  );
}
