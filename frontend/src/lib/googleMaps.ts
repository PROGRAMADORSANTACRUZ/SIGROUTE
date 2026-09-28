"use client";

// Carga perezosa y cacheada del script de Google Maps JavaScript API (con la
// librería "drawing" para el módulo de Geozonas) — se inyecta una sola vez
// aunque el componente se monte varias veces.
let mapsPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadGoogleMaps solo puede correr en el navegador"));
  }
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve, reject) => {
    const w = window as unknown as { google?: typeof google };
    if (w.google?.maps) {
      resolve(w.google);
      return;
    }
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      reject(new Error("Falta configurar NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));
      return;
    }
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

  return mapsPromise;
}
