// Cliente API para los módulos de Planeación (backend Express en /api/planeacion/*).
// Reutiliza el mismo `request()` con cookies de sesión que lib/api.ts.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

import { ApiError } from "./api";

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/planeacion${path}`, {
      ...options,
      cache: "no-store",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err?.error ?? `Error ${res.status}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.blob()) as unknown as T;
}


// ── Usuarios / Roles ─────────────────────────────────────────────────────
export const getUsuariosPlan = () => req<Record<string, unknown>[]>("/usuarios");
export const crearUsuarioPlan = (data: Record<string, unknown>) => req("/usuarios", { method: "POST", body: JSON.stringify(data) });
export const editarUsuarioPlan = (id: number, data: Record<string, unknown>) => req(`/usuarios/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const toggleActivoUsuarioPlan = (id: number) => req<{ activo: boolean }>(`/usuarios/${id}/activo`, { method: "PATCH", body: "{}" });
export const resetPasswordUsuarioPlan = (id: number, password: string) =>
  req(`/usuarios/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) });
export const getAreasUsuario = () => req<string[]>("/usuarios/areas");
export const getColumnasUsuario = (id: number) => req<{ area: string; ver: boolean; editar: boolean }[]>(`/usuarios/${id}/columnas`);
export const setColumnasUsuario = (id: number, items: { area: string; ver: boolean; editar: boolean }[]) =>
  req(`/usuarios/${id}/columnas`, { method: "PUT", body: JSON.stringify(items) });

export const getRoles = () => req<Record<string, unknown>[]>("/roles");
export const getRolesModulos = () =>
  req<{ modulos: { label: string; submodulos: { label: string; claves: string[] }[] }[]; areas: string[] }>("/roles/modulos");
export const getRolPermisos = (id: number) => req<string[]>(`/roles/${id}/permisos`);
export const crearRol = (data: Record<string, unknown>) => req("/roles", { method: "POST", body: JSON.stringify(data) });
export const editarRol = (id: number, data: Record<string, unknown>) => req(`/roles/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const eliminarRol = (id: number) => req(`/roles/${id}`, { method: "DELETE" });
export const setRolPermisos = (id: number, claves: string[]) => req(`/roles/${id}/permisos`, { method: "PUT", body: JSON.stringify({ claves }) });

// ── Dashboard ────────────────────────────────────────────────────────────
export const getDashboardPlan = (fecha?: string) => req(`/dashboard${fecha ? `?fecha=${fecha}` : ""}`);
export interface ComparativoFila { placa: string; planificado: number; ejecutado: number; diferencia: number; pctDesviacion: number }
export interface ComparativoAdmin { fecha: string; filas: ComparativoFila[]; totales: { planificado: number; ejecutado: number } }
export const getComparativoAdmin = (fecha?: string) => req<ComparativoAdmin>(`/dashboard/comparativo${fecha ? `?fecha=${fecha}` : ""}`);

// Comparativo por CLIENTE: kg planificados en Programación vs kg realmente
// ejecutados/cargados en Órdenes (Diagrama) — cruce por Cliente.id.
export interface ComparativoClienteFila { clienteId: string; nombre: string; planificado: number; ejecutado: number; diferencia: number; pctDesviacion: number }
export interface ComparativoClientesCategoria { clave: string; etiqueta: string; planificado: number; ejecutado: number }
export interface ComparativoClientes {
  fecha: string;
  hayPlanificacion: boolean;
  totales: { planificado: number; ejecutado: number; diferencia: number; pctCumplimiento: number; perdido: number; extra: number; sinClienteKg: number };
  porCategoria: ComparativoClientesCategoria[];
  filas: ComparativoClienteFila[];
}
export const getComparativoClientes = (fecha?: string) => req<ComparativoClientes>(`/dashboard/comparativo-clientes${fecha ? `?fecha=${fecha}` : ""}`);
export const rellenarEjecutado = (fecha: string) =>
  req<{ ok: boolean; fecha: string; clientesRellenados: number }>("/dashboard/rellenar-ejecutado", { method: "POST", body: JSON.stringify({ fecha }) });

// ── Pre-planificación (facturas TAT agrupadas por ciudad o barrio) ────────
export interface PreplanProducto { tipoComercial: string; kg: number; valor: number }
export interface PreplanDocumento {
  numero: string; origen: string; fecha: string;
  sucursal: string | null; direccion: string | null;
  kg: number; valor: number; productos: PreplanProducto[];
}
export interface PreplanCliente { nombre: string; nit: string; kg: number; valor: number; documentos: PreplanDocumento[] }
export interface PreplanGrupo { nombre: string; kg: number; valor: number; clientes: PreplanCliente[] }
export interface Preplanificacion {
  fecha: string; fechaFin: string; origen: string; criterio: "ciudad" | "barrio";
  totalKg: number; totalValor: number; totalFacturas: number;
  productosDisponibles: string[];
  grupos: PreplanGrupo[];
}
export const getPreplanificacion = (params: {
  fecha: string; fechaFin?: string; origen?: string; agrupar?: "ciudad" | "barrio";
  buscar?: string; producto?: string; kgMin?: number;
}) => {
  const qs = new URLSearchParams({ fecha: params.fecha });
  if (params.fechaFin) qs.set("fechaFin", params.fechaFin);
  if (params.origen) qs.set("origen", params.origen);
  if (params.agrupar) qs.set("agrupar", params.agrupar);
  if (params.buscar) qs.set("buscar", params.buscar);
  if (params.producto) qs.set("producto", params.producto);
  if (params.kgMin) qs.set("kgMin", String(params.kgMin));
  return req<Preplanificacion>(`/preplanificacion?${qs}`);
};

// ── Programación ─────────────────────────────────────────────────────────
// Los "destinos" de la grilla salen del maestro de Clientes (Ejecución); su
// id es un cuid (string), no el id numérico del viejo maestro Destino.
export const getGrid = (fecha: string) => req(`/programacion/grid?fecha=${fecha}`);
export const guardarGrid = (fecha: string, filas: { clienteId: string; valores: Record<string, number> }[]) =>
  req("/programacion/guardar", { method: "POST", body: JSON.stringify({ fecha, filas }) });
export const cerrarArea = (fecha: string, area: string) => req("/programacion/cerrar-area", { method: "POST", body: JSON.stringify({ fecha, area }) });
export const reabrirArea = (fecha: string, area: string) => req("/programacion/reabrir-area", { method: "POST", body: JSON.stringify({ fecha, area }) });

export interface FilaCargaExcel {
  destino: string;
  clienteId: string | null;
  clienteNombre: string | null;
  tipo: "exacto" | "singular" | "substring" | "sin_match";
  kg: number;
}
export interface ResultadoCargaExcel {
  area: string;
  campoKls: string;
  filas: FilaCargaExcel[];
  sinMatch: string[];
}

// Sube el Excel real de despacho (hoja "Remisión") y devuelve el cruce con
// el maestro de Clientes — no escribe en la BD, el frontend aplica el
// resultado a la grilla en memoria y el usuario guarda manualmente.
export async function cargarExcelProgramacion(area: string, file: File): Promise<ResultadoCargaExcel> {
  const formData = new FormData();
  formData.append("area", area);
  formData.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/planeacion/programacion/cargar-excel`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err?.error ?? `Error ${res.status}`);
  }
  return res.json();
}

// ── Asignación ───────────────────────────────────────────────────────────
export const getAsignacion = (fecha: string) => req(`/asignacion?fecha=${fecha}`);
export const getAsignacionMaestros = (fecha: string, excluirRutaId?: number) =>
  req(`/asignacion/maestros?fecha=${fecha}${excluirRutaId ? `&excluirRutaId=${excluirRutaId}` : ""}`);
export const getRutaDetalle = (id: number) => req(`/asignacion/${id}`);
export interface CrearRutaInput {
  fecha: string;
  vehiculoId?: number | null;
  conductorId?: number | null;
  horaCargue?: string | null;
  ruta?: string | null;
  destinoIds?: string[];
  auxiliarIds?: number[];
}
export const crearRuta = (data: CrearRutaInput) => req("/asignacion", { method: "POST", body: JSON.stringify(data) });
export const editarRuta = (id: number, data: Record<string, unknown>) => req(`/asignacion/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const eliminarRuta = (id: number) => req(`/asignacion/${id}`, { method: "DELETE" });
export const cerrarRuta = (id: number) => req(`/asignacion/${id}/cerrar`, { method: "POST" });
export const reabrirRuta = (id: number) => req(`/asignacion/${id}/reabrir`, { method: "POST" });

// ── Áreas para Cargar ────────────────────────────────────────────────────
export const getAreasCarga = (fecha: string) => req(`/areas?fecha=${fecha}`);
export const setEstadoAreaCarga = (rutaId: number, area: string, estado: string) =>
  req(`/areas/${rutaId}/estado`, { method: "POST", body: JSON.stringify({ area, estado }) });

// ── Resumen ──────────────────────────────────────────────────────────────
export const getResumen = (fecha: string) => req(`/resumen?fecha=${fecha}`);

// ── Reportes ─────────────────────────────────────────────────────────────
export type TipoReporte = "programacion" | "rutas" | "resumen" | "areas-carga" | "auditoria";
export async function descargarReporte(tipo: TipoReporte, fecha: string) {
  const blob = await req<Blob>(`/reportes/${tipo}.xlsx?fecha=${fecha}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${tipo}_${fecha}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Auditoría / Cambios ──────────────────────────────────────────────────
export const getAuditoria = (params?: Record<string, string>) => req(`/auditoria?${new URLSearchParams(params).toString()}`);
export const getCambios = (params?: Record<string, string>) => req(`/cambios?${new URLSearchParams(params).toString()}`);

// ── Distribución Producción ──────────────────────────────────────────────
export const getDistribucionHistorial = () => req("/distribucion-produccion");
export const getDistribucionDetalle = (id: number) => req(`/distribucion-produccion/${id}`);
export const guardarDistribucion = (data: Record<string, unknown>) => req("/distribucion-produccion", { method: "POST", body: JSON.stringify(data) });

// ── Simulador ────────────────────────────────────────────────────────────
export const getPerfiles = () => req("/simulador/perfiles");
export const getPerfilVigente = () => req<{ perfilId: number | null }>("/simulador/perfiles/vigente");
export const getPerfil = (id: number) => req(`/simulador/perfiles/${id}`);
export const guardarPerfil = (data: Record<string, unknown>) => req<{ id: number }>("/simulador/perfiles", { method: "POST", body: JSON.stringify(data) });
export const calcularSimulacion = (perfilId: number, reses: Record<string, number>) =>
  req("/simulador/calcular", { method: "POST", body: JSON.stringify({ perfilId, reses }) });
export const guardarCorrida = (data: Record<string, unknown>) => req("/simulador/corridas", { method: "POST", body: JSON.stringify(data) });
export const getCorridas = () => req("/simulador/corridas");
export const getCorrida = (id: number) => req(`/simulador/corridas/${id}`);
export const agregarProductoPerfil = (perfilId: number, data: Record<string, unknown>) =>
  req(`/simulador/perfiles/${perfilId}/productos`, { method: "POST", body: JSON.stringify(data) });
export const editarProductoPerfil = (perfilId: number, plu: string, data: Record<string, unknown>) =>
  req(`/simulador/perfiles/${perfilId}/productos/${encodeURIComponent(plu)}`, { method: "PATCH", body: JSON.stringify(data) });
export const eliminarProductoPerfil = (perfilId: number, plu: string) =>
  req(`/simulador/perfiles/${perfilId}/productos/${encodeURIComponent(plu)}`, { method: "DELETE" });
export const agregarTiendaPerfil = (perfilId: number, data: Record<string, unknown>) =>
  req(`/simulador/perfiles/${perfilId}/tiendas`, { method: "POST", body: JSON.stringify(data) });
export const eliminarTiendaPerfil = (perfilId: number, dep: string) =>
  req(`/simulador/perfiles/${perfilId}/tiendas/${encodeURIComponent(dep)}`, { method: "DELETE" });
export const setSurtidoPerfil = (perfilId: number, plu: string, dep: string, activo: boolean) =>
  req(`/simulador/perfiles/${perfilId}/surtido`, { method: "PATCH", body: JSON.stringify({ plu, dep, activo }) });

// ── Predistribución (submódulo del Simulador) ────────────────────────────
export const getPredistribuciones = () => req<Record<string, unknown>[]>("/simulador/predistribucion");
export const getPredistribucion = (id: number) => req(`/simulador/predistribucion/${id}`);
export const guardarPredistribucion = (data: Record<string, unknown>) =>
  req<{ id: number }>("/simulador/predistribucion", { method: "POST", body: JSON.stringify(data) });
export const getSiesa = () => req<{ plu: string; siesa: string; nombre: string | null }[]>("/simulador/predistribucion/siesa");
export const guardarSiesa = (data: { plu: string; siesa: string; nombre?: string }) =>
  req("/simulador/predistribucion/siesa", { method: "POST", body: JSON.stringify(data) });
