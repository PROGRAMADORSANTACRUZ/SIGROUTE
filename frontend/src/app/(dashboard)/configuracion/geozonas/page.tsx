"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getGeoZonas,
  crearGeoZona,
  editarGeoZona,
  eliminarGeoZona,
  recalcularGeoZonas,
  type GeoZona,
  type PuntoLatLng,
} from "@/lib/api";
import { loadGoogleMaps } from "@/lib/googleMaps";
import SoloLecturaBadge from "@/components/SoloLecturaBadge";
import { usePermiso } from "@/lib/permisos";

// Centro aproximado de la Costa Caribe colombiana (entre Cartagena y Santa
// Marta), para que al abrir el mapa ya se vean las 5 geozonas sembradas.
const CENTRO_INICIAL = { lat: 10.75, lng: -74.9 };
const ZOOM_INICIAL = 9;

const COLORES_SUGERIDOS = ["#2f8f4e", "#2f6f9f", "#b8860b", "#8f2f6b", "#a03a3a", "#3f6b5a", "#6b5fa0", "#c0742f"];

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
  // Google descontinuó el DrawingManager de la Maps JS API (v3.65+), así que
  // el polígono se dibuja "a mano": cada clic en el mapa agrega un punto; un
  // botón "Finalizar" cierra la figura. dibujandoRef existe porque el
  // listener de clic se registra una sola vez y necesita leer el estado más
  // reciente sin re-suscribirse en cada render.
  const dibujandoRef = useRef(false);
  const puntosDibujoRef = useRef<google.maps.LatLng[]>([]);

  const [cargandoMapa, setCargandoMapa] = useState(true);
  const [errorMapa, setErrorMapa] = useState<string | null>(null);
  const [zonas, setZonas] = useState<GeoZona[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [resultadoRecalculo, setResultadoRecalculo] = useState<string | null>(null);
  const [dibujando, setDibujando] = useState(false);
  const [puntosCount, setPuntosCount] = useState(0);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formNombre, setFormNombre] = useState("");
  const [formCiudad, setFormCiudad] = useState("");
  const [formColor, setFormColor] = useState(COLORES_SUGERIDOS[0]);

  const [nuevaZona, setNuevaZona] = useState<{ nombre: string; ciudad: string; color: string } | null>(null);

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

  // Inicializa el mapa una sola vez (con su listener de clic para dibujar).
  useEffect(() => {
    let cancelado = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelado || !mapDivRef.current) return;
        const map = new g.maps.Map(mapDivRef.current, {
          center: CENTRO_INICIAL,
          zoom: ZOOM_INICIAL,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        mapRef.current = map;

        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!dibujandoRef.current || !e.latLng) return;
          puntosDibujoRef.current = [...puntosDibujoRef.current, e.latLng];
          let preview = pendingOverlayRef.current;
          if (!preview) {
            preview = new g.maps.Polygon({
              paths: puntosDibujoRef.current,
              strokeColor: "#14352a",
              fillColor: "#14352a",
              fillOpacity: 0.15,
              strokeWeight: 2,
              map,
            });
            pendingOverlayRef.current = preview;
          } else {
            preview.setPath(puntosDibujoRef.current);
          }
          setPuntosCount(puntosDibujoRef.current.length);
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

  // Sincroniza los polígonos dibujados en el mapa con la lista de geozonas
  // guardadas (crea/actualiza/borra overlays según corresponda).
  useEffect(() => {
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
          map,
        });
        overlay.addListener("click", () => setEditandoId(z.id));
        overlaysRef.current.set(z.id, overlay);
      } else if (editandoId !== z.id) {
        // No pisar el path mientras el usuario lo está editando en vivo.
        overlay.setPath(path);
        overlay.setOptions({ strokeColor: z.color, fillColor: z.color });
      }
    }
  }, [zonas, editandoId]);

  function iniciarDibujo() {
    puntosDibujoRef.current = [];
    setPuntosCount(0);
    dibujandoRef.current = true;
    setDibujando(true);
  }

  function deshacerUltimoPunto() {
    puntosDibujoRef.current = puntosDibujoRef.current.slice(0, -1);
    pendingOverlayRef.current?.setPath(puntosDibujoRef.current);
    setPuntosCount(puntosDibujoRef.current.length);
  }

  function cancelarDibujo() {
    dibujandoRef.current = false;
    setDibujando(false);
    puntosDibujoRef.current = [];
    setPuntosCount(0);
    pendingOverlayRef.current?.setMap(null);
    pendingOverlayRef.current = null;
  }

  function finalizarDibujo() {
    if (puntosDibujoRef.current.length < 3) {
      setError("Marca al menos 3 puntos en el mapa para formar un polígono");
      return;
    }
    dibujandoRef.current = false;
    setDibujando(false);
    pendingOverlayRef.current?.setEditable(true);
    setNuevaZona({ nombre: "", ciudad: "", color: COLORES_SUGERIDOS[zonas.length % COLORES_SUGERIDOS.length] });
  }

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
    setEditandoId(z.id);
    setFormNombre(z.nombre);
    setFormCiudad(z.ciudad ?? "");
    setFormColor(z.color);
    const overlay = overlaysRef.current.get(z.id);
    overlay?.setEditable(true);
  }

  function cerrarEdicion(idPrevia: string | null) {
    if (idPrevia) overlaysRef.current.get(idPrevia)?.setEditable(false);
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
            Dibuja los polígonos de cada zona de ciudad; se usan para agrupar clientes/facturas por área en Ejecución y
            para preasignar rutas automáticamente en Planeación.
          </p>
        </div>
        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            {resultadoRecalculo && <span className="text-xs text-[#2f8f4e]">{resultadoRecalculo}</span>}
            {error && <span className="text-sm text-[#b3261e]">{error}</span>}
            <button
              onClick={recalcular}
              disabled={recalculando}
              className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-50"
            >
              {recalculando ? "Recalculando…" : "Recalcular áreas"}
            </button>
            <button
              onClick={iniciarDibujo}
              disabled={dibujando || !!nuevaZona}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Dibujar geozona
            </button>
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

          {dibujando && (
            <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#e1e9dd] bg-white px-4 py-2 shadow-lg">
              <span className="text-sm text-[#14352a]">
                Haz clic en el mapa para marcar los puntos del polígono ({puntosCount} punto{puntosCount === 1 ? "" : "s"})
              </span>
              <button
                onClick={deshacerUltimoPunto}
                disabled={puntosCount === 0}
                className="rounded-lg px-2.5 py-1 text-xs text-[#5f7a68] hover:bg-[#f4f6f3] disabled:opacity-40"
              >
                Deshacer punto
              </button>
              <button onClick={cancelarDibujo} className="rounded-lg px-2.5 py-1 text-xs text-[#b3261e] hover:bg-[#fdecea]">
                Cancelar
              </button>
              <button
                onClick={finalizarDibujo}
                disabled={puntosCount < 3}
                className="rounded-lg bg-[#2f8f4e] px-3 py-1 text-xs font-medium text-white hover:bg-[#277a42] disabled:opacity-40"
              >
                Finalizar
              </button>
            </div>
          )}

          {nuevaZona && (
            <div className="absolute bottom-4 left-4 z-10 w-72 rounded-xl border border-[#e1e9dd] bg-white p-4 shadow-lg">
              <p className="mb-2 text-sm font-semibold text-[#14352a]">Nueva geozona</p>
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
                        {z.ciudad && <p className="truncate text-xs text-[#7a8794]">{z.ciudad}</p>}
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
