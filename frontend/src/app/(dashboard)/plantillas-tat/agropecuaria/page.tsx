"use client";

import PlantillaTatEditor from "@/components/ordenes/PlantillaTatEditor";

export default function PlantillaTatAgropecuariaPage() {
  return (
    <PlantillaTatEditor
      origen="AGROPECUARIA"
      titulo="Plantilla TAT Agropecuaria"
      subtitulo="Captura la Plantilla Ruta 2026 — cada fila se cruza automáticamente con Siesa y queda lista en Cargar Órdenes."
    />
  );
}
