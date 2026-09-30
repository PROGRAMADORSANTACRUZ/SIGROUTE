"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

// Mismo contrato que el viejo MapaLeaflet (drop-in replacement) — pin
// arrastrable + clic para reubicar — pero con Google Maps en vez de
// OpenStreetMap, para que el mapa del modal de Clientes se vea igual que el
// resto de la app (Geozonas ya usa Google Maps).
export default function MapaGoogle({
  lat,
  lng,
  onMover,
  height = 220,
}: {
  lat: number;
  lng: number;
  onMover?: (lat: number, lng: number) => void;
  height?: number;
}) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inicializa el mapa UNA vez (se recentra/mueve el pin en el otro efecto).
  useEffect(() => {
    let cancelado = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelado || !divRef.current) return;
        const map = new google.maps.Map(divRef.current, {
          center: { lat, lng },
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        const marker = new google.maps.Marker({
          position: { lat, lng },
          map,
          draggable: Boolean(onMover),
        });
        if (onMover) {
          marker.addListener("dragend", () => {
            const p = marker.getPosition();
            if (p) onMover(p.lat(), p.lng());
          });
          map.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            marker.setPosition(e.latLng);
            onMover(e.latLng.lat(), e.latLng.lng());
          });
        }
        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el mapa"));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-centra y mueve el pin cuando lat/lng cambian desde afuera (ej. al
  // encontrar la dirección con "Buscar en el mapa" o elegir una sugerencia).
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setPosition({ lat, lng });
    const zoom = (map.getZoom() ?? 16) < 14 ? 16 : map.getZoom();
    map.setCenter({ lat, lng });
    if (zoom) map.setZoom(zoom);
  }, [lat, lng]);

  if (error) {
    return (
      <div style={{ height }} className="flex items-center justify-center rounded-xl bg-[#fbeceb] text-sm text-[#b3261e]">
        {error}
      </div>
    );
  }
  return <div ref={divRef} style={{ height, width: "100%" }} className="rounded-xl" />;
}
