// Helpers de geometría puros (sin dependencias de Google Maps) para el
// sistema de dibujo de Geozonas: área aproximada, conversión círculo→polígono
// y cálculo de rectángulo a partir de 2 esquinas — usados por
// configuracion/geozonas/page.tsx.

export interface Punto {
  lat: number;
  lng: number;
}

const RADIO_TIERRA_KM = 6371;
const RADIO_TIERRA_M = 6371000;

// Área aproximada de un polígono simple (proyección equirectangular centrada
// en la latitud promedio) — suficientemente precisa a escala de ciudad, NO
// pensada para límites administrativos exactos.
export function areaAproxKm2(puntos: Punto[]): number {
  if (puntos.length < 3) return 0;
  const latRef = (puntos.reduce((s, p) => s + p.lat, 0) / puntos.length) * (Math.PI / 180);
  const cosLatRef = Math.cos(latRef);
  const xy = puntos.map((p) => ({
    x: p.lng * (Math.PI / 180) * RADIO_TIERRA_KM * cosLatRef,
    y: p.lat * (Math.PI / 180) * RADIO_TIERRA_KM,
  }));
  let area = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
}

// Distancia haversine en metros entre 2 puntos.
export function distanciaMetros(a: Punto, b: Punto): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(h));
}

// Aproxima un círculo (centro + radio) como un polígono de N lados, ya que el
// backend solo entiende polígonos (turf.js booleanPointInPolygon) — 64 lados
// es indistinguible de un círculo real a escala de ciudad.
export function circuloAPoligono(centro: Punto, radioMetros: number, lados = 64): Punto[] {
  const lat1 = (centro.lat * Math.PI) / 180;
  const lng1 = (centro.lng * Math.PI) / 180;
  const puntos: Punto[] = [];
  for (let i = 0; i < lados; i++) {
    const brng = (i / lados) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(radioMetros / RADIO_TIERRA_M) +
        Math.cos(lat1) * Math.sin(radioMetros / RADIO_TIERRA_M) * Math.cos(brng)
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(radioMetros / RADIO_TIERRA_M) * Math.cos(lat1),
        Math.cos(radioMetros / RADIO_TIERRA_M) - Math.sin(lat1) * Math.sin(lat2)
      );
    puntos.push({ lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI });
  }
  return puntos;
}

// Rectángulo alineado a los ejes lat/lng a partir de 2 esquinas opuestas.
export function rectanguloDeEsquinas(a: Punto, b: Punto): Punto[] {
  const norte = Math.max(a.lat, b.lat);
  const sur = Math.min(a.lat, b.lat);
  const este = Math.max(a.lng, b.lng);
  const oeste = Math.min(a.lng, b.lng);
  return [
    { lat: norte, lng: oeste },
    { lat: norte, lng: este },
    { lat: sur, lng: este },
    { lat: sur, lng: oeste },
  ];
}
