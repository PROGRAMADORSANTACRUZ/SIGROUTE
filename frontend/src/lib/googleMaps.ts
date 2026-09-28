"use client";

// Carga perezosa y cacheada del script de Google Maps JavaScript API (con la
// librería "drawing" para el módulo de Geozonas) — se inyecta una sola vez
// aunque el componente se monte varias veces.
//
// La API key se pide al backend en tiempo de ejecución (GET /api/config/maps-key)
// en vez de usar NEXT_PUBLIC_GOOGLE_MAPS_API_KEY inlineado en el build: Dokploy
// no reenvía las variables del panel como build-args de Docker, así que un
// NEXT_PUBLIC_* configurado ahí nunca llegaba al bundle ya compilado en
// producción (confirmado: la key quedaba vacía en el JS servido aunque sí
// estuviera seteada en Dokploy).
import { API_URL } from "./api";

let mapsPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadGoogleMaps solo puede correr en el navegador"));
  }
  if (mapsPromise) return mapsPromise;

  mapsPromise = (async () => {
    const w = window as unknown as { google?: typeof google };
    if (w.google?.maps) return w.google;

    const resp = await fetch(`${API_URL}/api/config/maps-key`, { credentials: "include" });
    if (!resp.ok) throw new Error("No se pudo obtener la key de Google Maps del servidor");
    const { apiKey } = (await resp.json()) as { apiKey: string | null };
    if (!apiKey) throw new Error("Falta configurar GOOGLE_MAPS_API_KEY en el servidor");

    return new Promise<typeof google>((resolve, reject) => {
      const callbackName = "__onGoogleMapsLoaded";
      (window as unknown as Record<string, () => void>)[callbackName] = () => {
        resolve((window as unknown as { google: typeof google }).google);
      };
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=drawing&callback=${callbackName}`;
      script.async = true;
      script.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
      document.head.appendChild(script);
    });
  })();

  return mapsPromise;
}
