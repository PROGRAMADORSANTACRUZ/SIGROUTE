// Cliente API para el módulo Errands (pedidos ad-hoc PDV → destino).
import { ApiError } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/errands${path}`, {
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

export interface ErrandsPuntoVenta {
  id: number;
  indicador: number;
  nombre: string;
  activo: boolean;
}

export interface ErrandsCliente {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string | null;
  referencia: string | null;
  barrio: string | null;
  ciudad: string | null;
  region: string | null;
  telefono: string | null;
  email: string | null;
  observaciones: string | null;
  activo: boolean;
}

export interface ErrandsDomiciliario {
  id: number;
  nombre: string;
  telefono: string | null;
  cedula: string | null;
  email: string | null;
  puntoVentaId: number | null;
  puntoVenta: ErrandsPuntoVenta | null;
  activo: boolean;
}

export interface ErrandsPedido {
  id: number;
  numeroPedido: string;
  clienteId: number;
  puntoVentaId: number | null;
  domiciliarioId: number | null;
  kilos: number;
  estado: "PENDIENTE" | "EN_PROCESO" | "ENTREGADO" | "CANCELADO" | "EDITADO" | "REVISADO";
  observaciones: string | null;
  fecha: string;
  usuario: string | null;
  cliente: ErrandsCliente;
  puntoVenta: ErrandsPuntoVenta | null;
  domiciliario: ErrandsDomiciliario | null;
  drivinEstadoEnvio: "PENDIENTE" | "ENVIADO" | "ERROR";
  drivinMensajeEnvio: string | null;
  drivinEstadoEntrega: string | null;
  drivinMotivoEntrega: string | null;
  drivinSyncAt: string | null;
  drivinSchemaName: string | null;
}

export interface ErrandsDrivinEsquema {
  code: string;
  name: string;
}

// ── Puntos de Venta ─────────────────────────────────────────────────────
export const getErrandsPuntosVenta = (todos = false) => req<ErrandsPuntoVenta[]>(`/puntos-venta${todos ? "?todos=1" : ""}`);
export const crearErrandsPuntoVenta = (nombre: string) => req<ErrandsPuntoVenta>("/puntos-venta", { method: "POST", body: JSON.stringify({ nombre }) });
export const editarErrandsPuntoVenta = (id: number, data: { nombre?: string; activo?: boolean }) =>
  req<ErrandsPuntoVenta>(`/puntos-venta/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const eliminarErrandsPuntoVenta = (id: number) => req(`/puntos-venta/${id}`, { method: "DELETE" });

// ── Clientes (destinos) ─────────────────────────────────────────────────
export const getErrandsClientes = (params?: { buscar?: string; todos?: boolean }) => {
  const qs = new URLSearchParams();
  if (params?.buscar) qs.set("buscar", params.buscar);
  if (params?.todos) qs.set("todos", "1");
  const suffix = qs.toString() ? `?${qs}` : "";
  return req<ErrandsCliente[]>(`/clientes${suffix}`);
};
export const getErrandsCliente = (id: number) => req<ErrandsCliente>(`/clientes/${id}`);
export interface ErrandsClienteInput {
  nombre: string;
  direccion?: string;
  referencia?: string;
  barrio?: string;
  ciudad?: string;
  region?: string;
  telefono?: string;
  email?: string;
  observaciones?: string;
}
export const crearErrandsCliente = (data: ErrandsClienteInput) => req<ErrandsCliente>("/clientes", { method: "POST", body: JSON.stringify(data) });
export const editarErrandsCliente = (id: number, data: Partial<ErrandsClienteInput> & { activo?: boolean }) =>
  req<ErrandsCliente>(`/clientes/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const eliminarErrandsCliente = (id: number) => req(`/clientes/${id}`, { method: "DELETE" });
export const borrarTodosErrandsClientes = () => req<{ eliminados: number }>("/clientes/borrar-todos", { method: "POST" });

export async function cargaMasivaErrandsClientes(file: File) {
  const form = new FormData();
  form.append("archivo", file);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/errands/clientes/carga-masiva`, { method: "POST", credentials: "include", body: form });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "Error al importar");
  return data as { total: number; insertados: number; actualizados: number; errores: number; detalleErrores: string[] };
}

// ── Domiciliarios ────────────────────────────────────────────────────────
export const getErrandsDomiciliarios = (params?: { pdv?: string; todos?: boolean }) => {
  const qs = new URLSearchParams();
  if (params?.pdv) qs.set("pdv", params.pdv);
  if (params?.todos) qs.set("todos", "1");
  const suffix = qs.toString() ? `?${qs}` : "";
  return req<ErrandsDomiciliario[]>(`/domiciliarios${suffix}`);
};
export interface ErrandsDomiciliarioInput {
  nombre: string;
  telefono?: string;
  cedula?: string;
  email?: string;
  puntoVentaId?: number | null;
}
export const crearErrandsDomiciliario = (data: ErrandsDomiciliarioInput) => req<ErrandsDomiciliario>("/domiciliarios", { method: "POST", body: JSON.stringify(data) });
export const editarErrandsDomiciliario = (id: number, data: Partial<ErrandsDomiciliarioInput> & { activo?: boolean }) =>
  req<ErrandsDomiciliario>(`/domiciliarios/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const eliminarErrandsDomiciliario = (id: number) => req(`/domiciliarios/${id}`, { method: "DELETE" });
export const borrarTodosErrandsDomiciliarios = () => req<{ eliminados: number }>("/domiciliarios/borrar-todos", { method: "POST" });

export async function cargaMasivaErrandsDomiciliarios(file: File) {
  const form = new FormData();
  form.append("archivo", file);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/errands/domiciliarios/carga-masiva`, { method: "POST", credentials: "include", body: form });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "Error al importar");
  return data as { total: number; insertados: number; actualizados: number; sinPdv: number; errores: number; detalleErrores: string[] };
}

// ── Pedidos ──────────────────────────────────────────────────────────────
export const getErrandsPedidos = (params?: { estado?: string; desde?: string; hasta?: string; pdv?: string }) => {
  const qs = new URLSearchParams();
  if (params?.estado) qs.set("estado", params.estado);
  if (params?.desde) qs.set("desde", params.desde);
  if (params?.hasta) qs.set("hasta", params.hasta);
  if (params?.pdv) qs.set("pdv", params.pdv);
  const suffix = qs.toString() ? `?${qs}` : "";
  return req<ErrandsPedido[]>(`/pedidos${suffix}`);
};
export const getErrandsPedidoNextNumero = () => req<{ numeroPedido: string }>("/pedidos-next-numero");
export const getErrandsDrivinEsquemas = () => req<ErrandsDrivinEsquema[]>("/drivin-esquemas");
export interface ErrandsPedidoInput {
  clienteId: number;
  puntoVentaId?: number | null;
  domiciliarioId?: number | null;
  kilos?: number;
  estado?: ErrandsPedido["estado"];
  observaciones?: string;
  // Esquema Drivin elegido a mano; si se omite el backend lo autodetecta por el PDV.
  schemaName?: string;
}
export const crearErrandsPedido = (data: ErrandsPedidoInput) => req<ErrandsPedido>("/pedidos", { method: "POST", body: JSON.stringify(data) });
export const crearErrandsPedidosLote = (pedidos: ErrandsPedidoInput[]) =>
  req<{ creados: ErrandsPedido[] }>("/pedidos", { method: "POST", body: JSON.stringify({ pedidos }) });
export const editarErrandsPedido = (id: number, data: Partial<ErrandsPedidoInput>) =>
  req<ErrandsPedido>(`/pedidos/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const cambiarEstadoErrandsPedido = (id: number, estado: ErrandsPedido["estado"]) =>
  req<ErrandsPedido>(`/pedidos/${id}/estado`, { method: "PUT", body: JSON.stringify({ estado }) });
export const eliminarErrandsPedido = (id: number) => req(`/pedidos/${id}`, { method: "DELETE" });
export const borrarTodosErrandsPedidos = () => req<{ eliminados: number }>("/pedidos/borrar-todos", { method: "POST" });
export const reenviarErrandsPedidoDrivin = (id: number) => req<ErrandsPedido>(`/pedidos/${id}/reenviar-drivin`, { method: "POST" });
export const sincronizarErrandsPedidosDrivin = (params?: { desde?: string; hasta?: string }) => {
  const qs = new URLSearchParams();
  if (params?.desde) qs.set("desde", params.desde);
  if (params?.hasta) qs.set("hasta", params.hasta);
  const suffix = qs.toString() ? `?${qs}` : "";
  return req<{ consultados: number; actualizados: number }>(`/pedidos/sync-drivin${suffix}`, { method: "POST" });
};

export async function exportarErrandsFreeOrder(ids: number[]) {
  const blob = await req<Blob>("/pedidos/export-free-order", { method: "POST", body: JSON.stringify({ ids }) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Free_Order.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Dashboard ────────────────────────────────────────────────────────────
export interface ErrandsDashboard {
  totalPedidos: number;
  totalKilos: number;
  totalClientes: number;
  totalPuntosVenta: number;
  porEstado: { label: string; value: number }[];
  porPdv: { label: string; value: number }[];
  porCliente: { label: string; value: number }[];
  porDia: { label: string; value: number }[];
}
export const getErrandsDashboard = (params?: { desde?: string; hasta?: string }) => {
  const qs = new URLSearchParams();
  if (params?.desde) qs.set("desde", params.desde);
  if (params?.hasta) qs.set("hasta", params.hasta);
  const suffix = qs.toString() ? `?${qs}` : "";
  return req<ErrandsDashboard>(`/dashboard${suffix}`);
};
