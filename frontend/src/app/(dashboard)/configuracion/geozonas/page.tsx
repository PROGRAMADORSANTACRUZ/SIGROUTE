"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getGeoZonas,
  crearGeoZona,
  editarGeoZona,
  eliminarGeoZona,
  recalcularGeoZonas,
  getClientesMapa,
  type GeoZona,
  type PuntoLatLng,
  type ClienteMapa,
} from "@/lib/api";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { areaAproxKm2, circuloAPoligono, distanciaMetros, puntoEnPoligono, rectanguloDeEsquinas } from "@/lib/geoDrawing";
import SoloLecturaBadge from "@/components/SoloLecturaBadge";
import { usePermiso } from "@/lib/permisos";

// Centro aproximado de la Costa Caribe colombiana (entre Cartagena y Santa
// Marta), para que al abrir el mapa ya se vean las 5 geozonas sembradas.
const CENTRO_INICIAL = { lat: 10.75, lng: -74.9 };
const ZOOM_INICIAL = 9;

const COLORES_SUGERIDOS = ["#2f8f4e", "#2f6f9f", "#b8860b", "#8f2f6b", "#a03a3a", "#3f6b5a", "#6b5fa0", "#c0742f"];

type ModoDibujo = "poligono" | "rectangulo" | "circulo" | "libre";

const HERRAMIENTAS: { modo: ModoDibujo; label: string; hint: string }[] = [
  { modo: "poligono", label: "Polígono", hint: "Clic para marcar cada punto; clic en el primer punto (verde) para cerrar la figura" },
  { modo: "rectangulo", label: "Rectángulo", hint: "Arrastra de una esquina a la opuesta" },
  { modo: "circulo", label: "Círculo", hint: "Arrastra desde el centro hacia afuera" },
  { modo: "libre", label: "Mano alzada", hint: "Arrastra para dibujar el contorno libremente" },
];

// Texto "≈ X m²/km²" legible según el tamaño del área.
function fmtArea(km2: number): string {
  return km2 < 1 ? `≈ ${Math.round(km2 * 1_000_000).toLocaleString("es-CO")} m²` : `≈ ${km2.toFixed(2)} km²`;
}

// El InfoWindow de clientes se arma con innerHTML (Google Maps no ofrece un
// content de React) — escapar es obligatorio, el nombre/dirección vienen de
// datos cargados por Excel/import y no se puede confiar en que no traigan
// caracteres HTML.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function anilloCerrado(path: google.maps.MVCArray<google.maps.LatLng>): PuntoLatLng[] {
  const puntos: PuntoLatLng[] = [];
  path.forEach((p) => puntos.push({ lat: p.lat(), lng: p.lng() }));
  return puntos;
}

export default function GeozonasPage() {
  const puedeEditar = usePermiso("config.geozonas.editar");
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Map<string, google.maps.Polygon>>(new Map());
  const pendingOverlayRef = useRef<google.maps.Polygon | null>(null);
  // Espejo de `zonas` para que el listener de clic de cada overlay (que se
  // registra UNA sola vez por zona) siempre pueda leer los datos más
  // recientes de esa zona, aunque se hayan editado después de dibujarla.
  const zonasRef = useRef<GeoZona[]>([]);

  // Herramienta de dibujo activa. Se necesita también en un ref porque los
  // listeners del mapa se registran UNA sola vez (useEffect []) y deben leer
  // siempre el valor más reciente sin volver a suscribirse en cada render.
  const modoRef = useRef<ModoDibujo | null>(null);
  const puntosDibujoRef = useRef<google.maps.LatLng[]>([]);
  // Puntos (círculos blancos) que marcan cada vértice YA colocado, para que
  // se vea con claridad dónde quedó cada clic — el primero se resalta en
  // verde y es clicable para cerrar la figura sin necesitar el botón.
  const verticeMarkersRef = useRef<google.maps.Marker[]>([]);
  // "Línea de goma": del último punto colocado hasta el cursor (se mueve con
  // el mouse antes de fijar el siguiente punto) + una línea de cierre punteada
  // (cursor -> primer punto) para previsualizar cómo quedaría la figura.
  const lineaGomaRef = useRef<google.maps.Polyline | null>(null);
  const lineaCierreRef = useRef<google.maps.Polyline | null>(null);
  // Arrastre (rectángulo/círculo/mano alzada): punto donde empezó el drag +
  // overlay de previsualización en vivo mientras se arrastra.
  const arrastrandoRef = useRef(false);
  const inicioArrastreRef = useRef<google.maps.LatLng | null>(null);
  const previewRectRef = useRef<google.maps.Rectangle | null>(null);
  const previewCircleRef = useRef<google.maps.Circle | null>(null);
  const ultimaMuestraLibreRef = useRef(0);
  // Pines de clientes (toggle "Mostrar clientes") + un solo InfoWindow
  // reutilizado para el mini-modal al pasar el mouse (crear uno por cliente
  // sería carísimo con miles de clientes).
  const clienteMarkersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [cargandoMapa, setCargandoMapa] = useState(true);
  const [errorMapa, setErrorMapa] = useState<string | null>(null);
  const [zonas, setZonas] = useState<GeoZona[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [resultadoRecalculo, setResultadoRecalculo] = useState<string | null>(null);
  const [modoDibujo, setModoDibujo] = useState<ModoDibujo | null>(null);
  const [puntosCount, setPuntosCount] = useState(0);
  const [areaEnCurso, setAreaEnCurso] = useState<number | null>(null);
  const [mostrarClientes, setMostrarClientes] = useState(false);
  const [clientesMapa, setClientesMapa] = useState<ClienteMapa[] | null>(null);
  const [cargandoClientes, setCargandoClientes] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formNombre, setFormNombre] = useState("");
  const [formCiudad, setFormCiudad] = useState("");
  const [formColor, setFormColor] = useState(COLORES_SUGERIDOS[0]);

  const [nuevaZona, setNuevaZona] = useState<{ nombre: string; ciudad: string; color: string; areaKm2: number } | null>(null);

  const cargarZonas = useCallback(() => {
    getGeoZonas()
      .then(setZonas)
      .catch((err) => {
        console.error(err);
        setError("No se pudieron cargar las geozonas");
      });
  }, []);

  useEffect(() => {
    cargarZonas();
  }, [cargarZonas]);

  // Quita marcadores de vértice + líneas de ayuda + previews de arrastre del
  // mapa (NO toca pendingOverlayRef, que sigue vivo tras finalizar la figura).
  function limpiarAyudasDibujo() {
    for (const m of verticeMarkersRef.current) m.setMap(null);
    verticeMarkersRef.current = [];
    lineaGomaRef.current?.setMap(null);
    lineaGomaRef.current = null;
    lineaCierreRef.current?.setMap(null);
    lineaCierreRef.current = null;
    previewRectRef.current?.setMap(null);
    previewRectRef.current = null;
    previewCircleRef.current?.setMap(null);
    previewCircleRef.current = null;
  }

  function agregarMarcadorVertice(punto: google.maps.LatLng, esPrimero: boolean) {
    const marker = new google.maps.Marker({
      position: punto,
      map: mapRef.current!,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: esPrimero ? 7 : 5,
        fillColor: esPrimero ? "#2f8f4e" : "#ffffff",
        fillOpacity: 1,
        strokeColor: "#14352a",
        strokeWeight: 2,
      },
      cursor: esPrimero ? "pointer" : "default",
      title: esPrimero ? "Clic aquí para cerrar la figura" : undefined,
      clickable: esPrimero,
      zIndex: 1000,
    });
    if (esPrimero) {
      marker.addListener("click", () => {
        if (puntosDibujoRef.current.length >= 3) finalizarPoligonoOMano();
      });
    }
    verticeMarkersRef.current.push(marker);
  }

  // Crea o actualiza el polígono "en construcción" (polígono por clics o
  // mano alzada) y refresca el contador de puntos + área aproximada en vivo.
  function actualizarPoligonoEnCurso(puntos: google.maps.LatLng[]) {
    let preview = pendingOverlayRef.current;
    if (!preview) {
      preview = new google.maps.Polygon({
        paths: puntos,
        strokeColor: "#14352a",
        fillColor: "#14352a",
        fillOpacity: 0.15,
        strokeWeight: 2,
        // El relleno del polígono en construcción NO debe capturar clics: si
        // el usuario marca un punto dentro del área ya cerrada, el clic debe
        // seguir llegando al mapa para agregar el vértice (si no, a veces "no
        // se fijaba" el punto porque el propio overlay se lo tragaba).
        clickable: false,
        map: mapRef.current!,
      });
      pendingOverlayRef.current = preview;
    } else {
      preview.setPath(puntos);
    }
    setPuntosCount(puntos.length);
    setAreaEnCurso(puntos.length >= 3 ? areaAproxKm2(puntos.map((p) => ({ lat: p.lat(), lng: p.lng() }))) : null);
  }

  function seleccionarHerramienta(modo: ModoDibujo) {
    if (modoRef.current === modo) {
      cancelarDibujo();
      return;
    }
    cancelarDibujo();
    modoRef.current = modo;
    setModoDibujo(modo);
    setError(null);
    // Clic-a-clic (polígono) deja el mapa "arrastrable" (un clic simple sigue
    // funcionando aunque el mapa se pueda mover); las herramientas de
    // arrastre necesitan el control total del gesto para dibujar, no para
    // desplazar el mapa.
    mapRef.current?.setOptions({ draggable: modo === "poligono", disableDoubleClickZoom: true });
  }

  function cancelarDibujo() {
    modoRef.current = null;
    setModoDibujo(null);
    arrastrandoRef.current = false;
    inicioArrastreRef.current = null;
    puntosDibujoRef.current = [];
    setPuntosCount(0);
    setAreaEnCurso(null);
    limpiarAyudasDibujo();
    pendingOverlayRef.current?.setMap(null);
    pendingOverlayRef.current = null;
    mapRef.current?.setOptions({ draggable: true, disableDoubleClickZoom: false });
  }

  function deshacerUltimoPunto() {
    if (puntosDibujoRef.current.length === 0) return;
    puntosDibujoRef.current = puntosDibujoRef.current.slice(0, -1);
    verticeMarkersRef.current.pop()?.setMap(null);
    pendingOverlayRef.current?.setPath(puntosDibujoRef.current);
    setPuntosCount(puntosDibujoRef.current.length);
    setAreaEnCurso(
      puntosDibujoRef.current.length >= 3
        ? areaAproxKm2(puntosDibujoRef.current.map((p) => ({ lat: p.lat(), lng: p.lng() })))
        : null
    );
  }

  // Cierra el polígono por clics o la figura de mano alzada. `avisar=false`
  // se usa cuando lo dispara el soltar el mouse en modo libre (si el usuario
  // apenas hizo clic sin arrastrar, se cancela en silencio en vez de mostrar
  // un error molesto).
  function finalizarPoligonoOMano(avisar = true) {
    if (puntosDibujoRef.current.length < 3) {
      if (avisar) setError("Marca al menos 3 puntos para formar la figura");
      else cancelarDibujo();
      return;
    }
    modoRef.current = null;
    setModoDibujo(null);
    mapRef.current?.setOptions({ draggable: true, disableDoubleClickZoom: false });
    limpiarAyudasDibujo();
    pendingOverlayRef.current?.setEditable(true);
    pendingOverlayRef.current?.setDraggable(true);
    const puntos = puntosDibujoRef.current.map((p) => ({ lat: p.lat(), lng: p.lng() }));
    setNuevaZona({ nombre: "", ciudad: "", color: COLORES_SUGERIDOS[zonas.length % COLORES_SUGERIDOS.length], areaKm2: areaAproxKm2(puntos) });
  }

  // Cierra un rectángulo/círculo (figuras de un solo gesto de arrastre): crea
  // el polígono final directo, ya editable, y abre el formulario de nombre.
  function confirmarFiguraArrastrada(puntos: PuntoLatLng[]) {
    if (puntos.length < 3) return;
    modoRef.current = null;
    setModoDibujo(null);
    mapRef.current?.setOptions({ draggable: true, disableDoubleClickZoom: false });
    const overlay = new google.maps.Polygon({
      paths: puntos,
      strokeColor: "#14352a",
      fillColor: "#14352a",
      fillOpacity: 0.15,
      strokeWeight: 2,
      editable: true,
      draggable: true,
      map: mapRef.current!,
    });
    pendingOverlayRef.current = overlay;
    setNuevaZona({ nombre: "", ciudad: "", color: COLORES_SUGERIDOS[zonas.length % COLORES_SUGERIDOS.length], areaKm2: areaAproxKm2(puntos) });
  }

  // Inicializa el mapa una sola vez, con los 4 listeners que cubren las 4
  // herramientas de dibujo (polígono por clics, rectángulo/círculo/mano
  // alzada por arrastre) — cada listener solo actúa si `modoRef` coincide.
  useEffect(() => {
    let cancelado = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelado || !mapDivRef.current) return;
        const map = new google.maps.Map(mapDivRef.current, {
          center: CENTRO_INICIAL,
          zoom: ZOOM_INICIAL,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        mapRef.current = map;

        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (modoRef.current !== "poligono" || !e.latLng) return;
          const esPrimero = puntosDibujoRef.current.length === 0;
          puntosDibujoRef.current = [...puntosDibujoRef.current, e.latLng];
          agregarMarcadorVertice(e.latLng, esPrimero);
          actualizarPoligonoEnCurso(puntosDibujoRef.current);
        });

        map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;

          // Línea de goma del polígono por clics: del último punto al
          // cursor, más una línea de cierre punteada (cursor -> 1er punto).
          if (modoRef.current === "poligono" && puntosDibujoRef.current.length > 0) {
            const ultimo = puntosDibujoRef.current[puntosDibujoRef.current.length - 1];
            if (!lineaGomaRef.current) {
              lineaGomaRef.current = new google.maps.Polyline({
                path: [ultimo, e.latLng],
                strokeColor: "#14352a",
                strokeOpacity: 0.7,
                strokeWeight: 2,
                clickable: false,
                map,
              });
            } else {
              lineaGomaRef.current.setPath([ultimo, e.latLng]);
            }
            if (puntosDibujoRef.current.length >= 2) {
              const primero = puntosDibujoRef.current[0];
              if (!lineaCierreRef.current) {
                lineaCierreRef.current = new google.maps.Polyline({
                  path: [e.latLng, primero],
                  strokeColor: "#14352a",
                  strokeOpacity: 0.35,
                  strokeWeight: 2,
                  icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "10px" }],
                  clickable: false,
                  map,
                });
              } else {
                lineaCierreRef.current.setPath([e.latLng, primero]);
              }
            }
          }

          // Mano alzada: muestrea puntos mientras se arrastra (throttle ~30ms
          // para no saturar de vértices casi idénticos entre sí).
          if (modoRef.current === "libre" && arrastrandoRef.current) {
            const ahora = Date.now();
            if (ahora - ultimaMuestraLibreRef.current > 30) {
              ultimaMuestraLibreRef.current = ahora;
              puntosDibujoRef.current = [...puntosDibujoRef.current, e.latLng];
              actualizarPoligonoEnCurso(puntosDibujoRef.current);
            }
          }

          // Rectángulo/círculo: previsualización en vivo mientras se arrastra.
          if (arrastrandoRef.current && inicioArrastreRef.current) {
            const inicio = { lat: inicioArrastreRef.current.lat(), lng: inicioArrastreRef.current.lng() };
            const actual = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            if (modoRef.current === "rectangulo") {
              const bounds = {
                north: Math.max(inicio.lat, actual.lat),
                south: Math.min(inicio.lat, actual.lat),
                east: Math.max(inicio.lng, actual.lng),
                west: Math.min(inicio.lng, actual.lng),
              };
              if (!previewRectRef.current) {
                previewRectRef.current = new google.maps.Rectangle({
                  bounds, strokeColor: "#14352a", fillColor: "#14352a", fillOpacity: 0.15, strokeWeight: 2, clickable: false, map,
                });
              } else {
                previewRectRef.current.setBounds(bounds);
              }
              setAreaEnCurso(areaAproxKm2(rectanguloDeEsquinas(inicio, actual)));
            } else if (modoRef.current === "circulo") {
              const radio = distanciaMetros(inicio, actual);
              if (!previewCircleRef.current) {
                previewCircleRef.current = new google.maps.Circle({
                  center: inicioArrastreRef.current, radius: radio,
                  strokeColor: "#14352a", fillColor: "#14352a", fillOpacity: 0.15, strokeWeight: 2, clickable: false, map,
                });
              } else {
                previewCircleRef.current.setRadius(radio);
              }
              setAreaEnCurso((Math.PI * radio * radio) / 1_000_000);
            }
          }
        });

        map.addListener("mousedown", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          if (modoRef.current === "rectangulo" || modoRef.current === "circulo") {
            arrastrandoRef.current = true;
            inicioArrastreRef.current = e.latLng;
          } else if (modoRef.current === "libre") {
            arrastrandoRef.current = true;
            puntosDibujoRef.current = [e.latLng];
            ultimaMuestraLibreRef.current = Date.now();
            agregarMarcadorVertice(e.latLng, true);
          }
        });

        map.addListener("mouseup", (e: google.maps.MapMouseEvent) => {
          if (!arrastrandoRef.current) return;
          arrastrandoRef.current = false;

          if ((modoRef.current === "rectangulo" || modoRef.current === "circulo") && inicioArrastreRef.current && e.latLng) {
            const inicio = { lat: inicioArrastreRef.current.lat(), lng: inicioArrastreRef.current.lng() };
            const actual = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            previewRectRef.current?.setMap(null);
            previewRectRef.current = null;
            previewCircleRef.current?.setMap(null);
            previewCircleRef.current = null;
            if (distanciaMetros(inicio, actual) < 3) {
              // Arrastre insignificante (casi un clic) — no crear nada.
            } else if (modoRef.current === "rectangulo") {
              confirmarFiguraArrastrada(rectanguloDeEsquinas(inicio, actual));
            } else {
              confirmarFiguraArrastrada(circuloAPoligono(inicio, distanciaMetros(inicio, actual)));
            }
            if (modoRef.current) { modoRef.current = null; setModoDibujo(null); mapRef.current?.setOptions({ draggable: true, disableDoubleClickZoom: false }); }
          } else if (modoRef.current === "libre") {
            finalizarPoligonoOMano(false);
          }
          inicioArrastreRef.current = null;
        });

        setCargandoMapa(false);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelado) {
          setErrorMapa(err instanceof Error ? err.message : "No se pudo cargar Google Maps");
          setCargandoMapa(false);
        }
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atajos de teclado mientras se dibuja: Escape cancela, Enter cierra el
  // polígono por clics (si ya tiene los 3 puntos mínimos).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && modoRef.current) cancelarDibujo();
      if (e.key === "Enter" && modoRef.current === "poligono" && puntosDibujoRef.current.length >= 3) finalizarPoligonoOMano();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza los polígonos dibujados en el mapa con la lista de geozonas
  // guardadas (crea/actualiza/borra overlays según corresponda). Depende
  // también de `cargandoMapa`: `zonas` suele llegar de la API ANTES de que el
  // mapa termine de inicializarse (son 2 cargas asíncronas en paralelo), y
  // sin esta dependencia el efecto se saltaba silenciosamente esa primera
  // vez (mapRef.current aún null) y nunca se reintentaba — las geozonas no
  // aparecían en el mapa hasta el próximo cambio de `zonas`/`editandoId`.
  useEffect(() => {
    zonasRef.current = zonas;
    const map = mapRef.current;
    if (!map || typeof google === "undefined") return;

    const vigentes = new Set(zonas.map((z) => z.id));
    for (const [id, overlay] of overlaysRef.current) {
      if (!vigentes.has(id)) {
        overlay.setMap(null);
        overlaysRef.current.delete(id);
      }
    }

    for (const z of zonas) {
      let overlay = overlaysRef.current.get(z.id);
      const path = z.poligono.map((p) => new google.maps.LatLng(p.lat, p.lng));
      if (!overlay) {
        overlay = new google.maps.Polygon({
          paths: path,
          strokeColor: z.color,
          fillColor: z.color,
          fillOpacity: 0.2,
          strokeWeight: 2,
          editable: false,
          draggable: false,
          map,
        });
        // Clic en la figura = mismo efecto que el botón "Editar" del panel
        // (muestra los vértices y permite arrastrar toda la figura). Busca la
        // zona actual en zonasRef (no la capturada al crear el overlay) para
        // no quedarse con nombre/color desactualizados si se editó después.
        overlay.addListener("click", () => {
          const actual = zonasRef.current.find((zz) => zz.id === z.id);
          if (actual) abrirEdicion(actual);
        });
        overlaysRef.current.set(z.id, overlay);
      } else if (editandoId !== z.id) {
        // No pisar el path mientras el usuario lo está editando en vivo.
        overlay.setPath(path);
        overlay.setOptions({ strokeColor: z.color, fillColor: z.color });
      }
    }
  }, [zonas, editandoId, cargandoMapa]);

  // Carga los clientes (livianos: id/nombre/dirección/teléfono/lat/lon) la
  // PRIMERA vez que se activa el switch "Mostrar clientes" — no antes, para
  // no pagar ese payload si nunca se usa.
  useEffect(() => {
    if (!mostrarClientes || clientesMapa !== null) return;
    setCargandoClientes(true);
    getClientesMapa()
      .then(setClientesMapa)
      .catch((err) => {
        console.error(err);
        setError("No se pudieron cargar los clientes para el mapa");
      })
      .finally(() => setCargandoClientes(false));
  }, [mostrarClientes, clientesMapa]);

  // Pinta/quita los pines de clientes según el switch. Un solo InfoWindow
  // compartido se abre en "mouseover" (mini-modal con la info del cliente,
  // anclado justo encima del pin) y se cierra en "mouseout".
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof google === "undefined") return;

    if (!mostrarClientes || !clientesMapa) {
      for (const m of clienteMarkersRef.current) m.setMap(null);
      clienteMarkersRef.current = [];
      infoWindowRef.current?.close();
      return;
    }

    if (!infoWindowRef.current) {
      infoWindowRef.current = new google.maps.InfoWindow({ disableAutoPan: true });
    }
    const infoWindow = infoWindowRef.current;

    for (const m of clienteMarkersRef.current) m.setMap(null);
    clienteMarkersRef.current = clientesMapa.map((c) => {
      const marker = new google.maps.Marker({
        position: { lat: c.lat, lng: c.lon },
        map,
        title: c.nombre,
        zIndex: 1,
      });
      marker.addListener("mouseover", () => {
        // Geozona detectada en vivo (point-in-polygon contra los polígonos ya
        // cargados en el mapa), solo para mostrarla en el mini-modal.
        const zona = zonas.find((z) => puntoEnPoligono({ lat: c.lat, lng: c.lon }, z.poligono));
        infoWindow.setContent(
          `<div style="font:13px system-ui,sans-serif;max-width:220px;padding:2px 2px">` +
            `<strong style="color:#14352a">${escapeHtml(c.nombre)}</strong>` +
            (c.direccion ? `<br/><span style="color:#5f7a68">${escapeHtml(c.direccion)}</span>` : "") +
            (c.telefono ? `<br/><span style="color:#5f7a68">Tel: ${escapeHtml(c.telefono)}</span>` : "") +
            (zona ? `<br/><span style="color:${zona.color};font-weight:600">Geozona: ${escapeHtml(zona.nombre)}</span>` : "") +
            `</div>`
        );
        infoWindow.open({ anchor: marker, map });
      });
      marker.addListener("mouseout", () => infoWindow.close());
      return marker;
    });
  }, [mostrarClientes, clientesMapa, zonas]);

  function cancelarNuevaZona() {
    pendingOverlayRef.current?.setMap(null);
    pendingOverlayRef.current = null;
    setNuevaZona(null);
  }

  async function guardarNuevaZona() {
    const overlay = pendingOverlayRef.current;
    if (!overlay || !nuevaZona) return;
    if (!nuevaZona.nombre.trim()) {
      setError("Ponle un nombre a la geozona (ej. \"6-PAL\")");
      return;
    }
    const poligono = anilloCerrado(overlay.getPath());
    if (poligono.length < 3) {
      setError("El polígono necesita al menos 3 puntos");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await crearGeoZona({
        nombre: nuevaZona.nombre.trim(),
        ciudad: nuevaZona.ciudad.trim() || null,
        color: nuevaZona.color,
        poligono,
        orden: zonas.length,
      });
      overlay.setMap(null);
      pendingOverlayRef.current = null;
      setNuevaZona(null);
      cargarZonas();
    } catch (err) {
      console.error(err);
      setError("No se pudo crear la geozona (¿el nombre ya existe?)");
    } finally {
      setGuardando(false);
    }
  }

  function abrirEdicion(z: GeoZona) {
    // Si había otra zona en edición, se le quitan los controles antes de
    // mostrar los de la nueva (si no, quedaba "editable" huérfana).
    if (editandoId && editandoId !== z.id) {
      const anterior = overlaysRef.current.get(editandoId);
      anterior?.setEditable(false);
      anterior?.setDraggable(false);
    }
    setEditandoId(z.id);
    setFormNombre(z.nombre);
    setFormCiudad(z.ciudad ?? "");
    setFormColor(z.color);
    const overlay = overlaysRef.current.get(z.id);
    // editable = muestra los vértices arrastrables; draggable = permite mover
    // toda la figura arrastrando su relleno/centro.
    overlay?.setEditable(true);
    overlay?.setDraggable(true);
  }

  function cerrarEdicion(idPrevia: string | null) {
    if (idPrevia) {
      const overlay = overlaysRef.current.get(idPrevia);
      overlay?.setEditable(false);
      overlay?.setDraggable(false);
    }
    setEditandoId(null);
  }

  async function guardarEdicion(z: GeoZona) {
    const overlay = overlaysRef.current.get(z.id);
    if (!overlay) return;
    setGuardando(true);
    setError(null);
    try {
      const poligono = anilloCerrado(overlay.getPath());
      await editarGeoZona(z.id, {
        nombre: formNombre.trim() || z.nombre,
        ciudad: formCiudad.trim() || null,
        color: formColor,
        poligono,
      });
      cerrarEdicion(z.id);
      cargarZonas();
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar la geozona");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(z: GeoZona) {
    if (!confirm(`¿Eliminar la geozona "${z.nombre}"? Los clientes/órdenes que caían en ella quedarán sin área hasta el próximo recálculo.`)) return;
    setGuardando(true);
    setError(null);
    try {
      await eliminarGeoZona(z.id);
      cerrarEdicion(z.id);
      cargarZonas();
    } catch (err) {
      console.error(err);
      setError("No se pudo eliminar la geozona");
    } finally {
      setGuardando(false);
    }
  }

  async function recalcular() {
    setRecalculando(true);
    setResultadoRecalculo(null);
    setError(null);
    try {
      const r = await recalcularGeoZonas();
      setResultadoRecalculo(
        `${r.geozonas} geozonas activas · ${r.clientesActualizados} clientes actualizados · ${r.ordenesActualizadas} órdenes actualizadas`
      );
    } catch (err) {
      console.error(err);
      setError("No se pudo recalcular las áreas");
    } finally {
      setRecalculando(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-4 sm:p-6 lg:p-8">
      <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#14352a]">Geozonas</h1>
            {!puedeEditar && <SoloLecturaBadge />}
          </div>
          <p className="text-sm text-[#5f7a68]">
            Dibuja el contorno de cada zona de ciudad (polígono, rectángulo, círculo o mano alzada); se usan para agrupar
            clientes/facturas por área en Ejecución y para preasignar rutas automáticamente en Planeación.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={mostrarClientes}
            onClick={() => setMostrarClientes((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              mostrarClientes ? "bg-[#2f8f4e]" : "bg-[#d7dcd6]"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                mostrarClientes ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm font-medium text-[#45505e]">
            Mostrar clientes{cargandoClientes ? " (cargando…)" : clientesMapa ? ` (${clientesMapa.length})` : ""}
          </span>
          {error && <span className="text-sm text-[#b3261e]">{error}</span>}
        </div>
        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            {resultadoRecalculo && <span className="text-xs text-[#2f8f4e]">{resultadoRecalculo}</span>}
            <button
              onClick={recalcular}
              disabled={recalculando}
              className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-50"
            >
              {recalculando ? "Recalculando…" : "Recalcular áreas"}
            </button>
            <div className="flex items-center gap-1 rounded-lg border border-[#dfe4e0] bg-white p-1">
              {HERRAMIENTAS.map((h) => (
                <button
                  key={h.modo}
                  title={h.hint}
                  onClick={() => seleccionarHerramienta(h.modo)}
                  disabled={!!nuevaZona}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                    modoDibujo === h.modo ? "bg-[#2f8f4e] text-white" : "text-[#45505e] hover:bg-[#f0f2ee]"
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
          {cargandoMapa && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-[#5f7a68]">
              Cargando mapa…
            </div>
          )}
          {errorMapa && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white p-6 text-center text-sm text-[#b3261e]">
              {errorMapa}
            </div>
          )}
          <div ref={mapDivRef} className="h-full w-full" />

          {modoDibujo && (
            <div className="absolute left-1/2 top-4 z-10 flex max-w-[90%] -translate-x-1/2 flex-wrap items-center gap-3 rounded-full border border-[#e1e9dd] bg-white px-4 py-2 shadow-lg">
              <span className="text-sm text-[#14352a]">
                {HERRAMIENTAS.find((h) => h.modo === modoDibujo)?.hint}
                {modoDibujo === "poligono" && ` · ${puntosCount} punto${puntosCount === 1 ? "" : "s"}`}
              </span>
              {areaEnCurso != null && (
                <span className="rounded-full bg-[#f0f2ee] px-2 py-0.5 text-xs font-medium text-[#45505e]">{fmtArea(areaEnCurso)}</span>
              )}
              {modoDibujo === "poligono" && (
                <button
                  onClick={deshacerUltimoPunto}
                  disabled={puntosCount === 0}
                  className="rounded-lg px-2.5 py-1 text-xs text-[#5f7a68] hover:bg-[#f4f6f3] disabled:opacity-40"
                >
                  Deshacer punto
                </button>
              )}
              <button onClick={cancelarDibujo} className="rounded-lg px-2.5 py-1 text-xs text-[#b3261e] hover:bg-[#fdecea]">
                Cancelar (Esc)
              </button>
              {modoDibujo === "poligono" && (
                <button
                  onClick={() => finalizarPoligonoOMano()}
                  disabled={puntosCount < 3}
                  className="rounded-lg bg-[#2f8f4e] px-3 py-1 text-xs font-medium text-white hover:bg-[#277a42] disabled:opacity-40"
                >
                  Finalizar (Enter)
                </button>
              )}
            </div>
          )}

          {nuevaZona && (
            <div className="absolute bottom-4 left-4 z-10 w-72 rounded-xl border border-[#e1e9dd] bg-white p-4 shadow-lg">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#14352a]">Nueva geozona</p>
                <span className="shrink-0 rounded-full bg-[#f0f2ee] px-2 py-0.5 text-xs font-medium text-[#45505e]">
                  {fmtArea(nuevaZona.areaKm2)}
                </span>
              </div>
              <p className="mb-2 text-xs text-[#7a8794]">Puedes arrastrar los vértices en el mapa para ajustar la figura antes de guardar.</p>
              <input
                autoFocus
                value={nuevaZona.nombre}
                onChange={(e) => setNuevaZona({ ...nuevaZona, nombre: e.target.value })}
                placeholder='Nombre (ej. "6-PAL")'
                className="mb-2 w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]"
              />
              <input
                value={nuevaZona.ciudad}
                onChange={(e) => setNuevaZona({ ...nuevaZona, ciudad: e.target.value })}
                placeholder="Ciudad (opcional)"
                className="mb-2 w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]"
              />
              <div className="mb-3 flex items-center gap-1.5">
                {COLORES_SUGERIDOS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNuevaZona({ ...nuevaZona, color: c })}
                    className="h-6 w-6 rounded-full border-2"
                    style={{ backgroundColor: c, borderColor: nuevaZona.color === c ? "#14352a" : "transparent" }}
                  />
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={cancelarNuevaZona} className="rounded-lg px-3 py-1.5 text-sm text-[#5f7a68] hover:bg-[#f4f6f3]">
                  Cancelar
                </button>
                <button
                  onClick={guardarNuevaZona}
                  disabled={guardando}
                  className="rounded-lg bg-[#2f8f4e] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="nice-scroll w-80 shrink-0 overflow-auto rounded-2xl border border-[#e1e9dd] bg-white p-3 shadow-sm">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
            {zonas.length} geozona{zonas.length === 1 ? "" : "s"}
          </p>
          <ul className="space-y-2">
            {zonas.map((z) => {
              const enEdicion = editandoId === z.id;
              return (
                <li key={z.id} className="rounded-xl border border-[#eceef0] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: z.color }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#14352a]">{z.nombre}</p>
                        <p className="truncate text-xs text-[#7a8794]">
                          {z.ciudad ? `${z.ciudad} · ` : ""}
                          {fmtArea(areaAproxKm2(z.poligono))} · {z.poligono.length} puntos
                        </p>
                      </div>
                    </div>
                    {puedeEditar && !enEdicion && (
                      <button onClick={() => abrirEdicion(z)} className="shrink-0 text-xs text-[#2f8f4e] hover:underline">
                        Editar
                      </button>
                    )}
                  </div>

                  {enEdicion && (
                    <div className="mt-2 space-y-2 border-t border-[#eceef0] pt-2">
                      <p className="text-xs text-[#7a8794]">Arrastra los puntos del polígono en el mapa para ajustarlo.</p>
                      <input
                        value={formNombre}
                        onChange={(e) => setFormNombre(e.target.value)}
                        className="w-full rounded-lg border border-[#dfe4e0] px-2.5 py-1.5 text-sm outline-none focus:border-[#2f8f4e]"
                      />
                      <input
                        value={formCiudad}
                        onChange={(e) => setFormCiudad(e.target.value)}
                        placeholder="Ciudad"
                        className="w-full rounded-lg border border-[#dfe4e0] px-2.5 py-1.5 text-sm outline-none focus:border-[#2f8f4e]"
                      />
                      <div className="flex items-center gap-1.5">
                        {COLORES_SUGERIDOS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setFormColor(c)}
                            className="h-5 w-5 rounded-full border-2"
                            style={{ backgroundColor: c, borderColor: formColor === c ? "#14352a" : "transparent" }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button onClick={() => eliminar(z)} className="text-xs text-[#b3261e] hover:underline">
                          Eliminar
                        </button>
                        <div className="flex gap-2">
                          <button onClick={() => cerrarEdicion(z.id)} className="rounded-lg px-2.5 py-1 text-xs text-[#5f7a68] hover:bg-[#f4f6f3]">
                            Cancelar
                          </button>
                          <button
                            onClick={() => guardarEdicion(z)}
                            disabled={guardando}
                            className="rounded-lg bg-[#2f8f4e] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#277a42] disabled:opacity-50"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            {zonas.length === 0 && <p className="px-1 text-sm text-[#7a8794]">Aún no hay geozonas. Usa &quot;Dibujar geozona&quot;.</p>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
