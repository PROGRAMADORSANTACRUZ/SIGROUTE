import type { ReactNode } from "react";

// Botón de icono para acciones de fila en tablas — mismo patrón que ya usa
// Ejecución (conductores/vehículos), con tooltip nativo vía `title`.
export default function IconButton({
  title,
  onClick,
  disabled,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border border-[#dfe4e0] p-2 text-[#5b6670] transition-colors hover:bg-[#f4f6f3] hover:text-[#14352a] disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
