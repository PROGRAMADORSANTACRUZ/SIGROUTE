// Geozonas: point-in-polygon (turf.js, sin PostGIS) + geocoding (Google Maps
// Platform) para el módulo Configuración > Geozonas y la asignación
// automática de área por cliente/factura según su posición.
import { booleanPointInPolygon, polygon as turfPolygon } from "@turf/turf";
import { env } from "../config/env";

export interface PuntoLatLng {
  lat: number;
  lng: number;
}

export interface GeoZonaPoligono {
  id: string;
  nombre: string;
  poligono: PuntoLatLng[];
}

// GeoJSON exige que el anillo cierre (primer punto === último) y usa
// [lng, lat], al revés de como se guarda "poligono" (más natural para el
// mapa/drawing manager de Google, que trabaja en {lat,lng}).
function aAnilloGeoJSON(puntos: PuntoLatLng[]): number[][] {
  const anillo = puntos.map((p) => [p.lng, p.lat]);
  const primero = anillo[0];
  const ultimo = anillo[anillo.length - 1];
  if (!primero || !ultimo || primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) {
    anillo.push(primero);
  }
  return anillo;
}

// Devuelve el nombre de la primera geozona (en el orden recibido) que
// contiene el punto dado, o null si no cae en ninguna — un punto no debería
// caer en 2 geozonas a la vez si no se solapan al dibujarlas, pero si pasa,
// gana la primera (respeta el campo "orden" de GeoZona).
export function detectarArea(lat: number, lng: number, geozonas: GeoZonaPoligono[]): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const gz of geozonas) {
    if (!gz.poligono || gz.poligono.length < 3) continue;
    try {
      const poly = turfPolygon([aAnilloGeoJSON(gz.poligono)]);
      if (booleanPointInPolygon([lng, lat], poly)) return gz.nombre;
    } catch {
      // Polígono inválido (ej. mal guardado): se ignora, no rompe el resto.
    }
  }
  return null;
}

export interface ResultadoGeocoding {
  lat: number;
  lon: number;
  direccionFormateada: string;
}

// Geocoding API de Google (dirección -> lat/lon). null si no hay key
// configurada, la dirección viene vacía, o Google no encuentra nada.
export async function geocodificarDireccion(direccion: string): Promise<ResultadoGeocoding | null> {
  const apiKey = env.GOOGLE_MAPS_API_KEY;
  const texto = direccion.trim();
  if (!apiKey || !texto) return null;
  const qs = new URLSearchParams({ address: texto, key: apiKey, region: "co" });
  const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as {
    status?: string;
    results?: { geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string }[];
  };
  if (json.status !== "OK") return null;
  const primero = json.results?.[0];
  const loc = primero?.geometry?.location;
  if (!loc) return null;
  return { lat: loc.lat, lon: loc.lng, direccionFormateada: primero?.formatted_address ?? texto };
}
