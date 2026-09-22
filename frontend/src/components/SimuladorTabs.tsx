"use client";

import Link from "next/link";

const TABS = [
  { href: "/planeacion/simulador", label: "Órdenes de Producción" },
  { href: "/planeacion/simulador/predistribucion", label: "Predistribución" },
  { href: "/planeacion/simulador/predistribucion/siesa", label: "Maestro SIESA" },
];

// Pestañas cruzadas entre los 3 sub-módulos del Simulador de Producción.
export default function SimuladorTabs({ active }: { active: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-[#e1e9dd] pb-2 text-sm">
      {TABS.map((t) =>
        t.href === active ? (
          <span key={t.href} className="rounded-lg bg-[#e8f3e2] px-2 py-1 font-semibold text-[#2f8f4e]">{t.label}</span>
        ) : (
          <Link key={t.href} href={t.href} className="px-2 py-1 text-[#7a8794] hover:text-[#2f8f4e]">{t.label}</Link>
        )
      )}
    </div>
  );
}
