"use client";

import PlantillaTatEditor from "@/components/ordenes/PlantillaTatEditor";

export default function PlantillaTatInversionesPage() {
  return (
    <PlantillaTatEditor
      origen="INVERSIONES"
      titulo="Plantilla TAT Inversiones"
      subtitulo="Captura la plantilla de Nivel de Servicio — cada fila se cruza automáticamente con Siesa y queda lista en Cargar Órdenes."
    />
  );
}
