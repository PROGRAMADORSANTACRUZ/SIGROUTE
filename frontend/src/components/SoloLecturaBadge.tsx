import { IconLock } from "./icons";

// Aviso visual cuando el usuario solo tiene permiso de "ver" en un módulo
// (sin el ".editar" correspondiente) — se usa junto a usePermiso/useModuloPermiso.
export default function SoloLecturaBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6d9a8] bg-[#fdf6e9] px-3 py-1 text-xs font-medium text-[#a86a12]">
      {IconLock} Solo lectura
    </span>
  );
}
