// Vacío para que las llamadas sean relativas (/api/...) y pasen por el proxy de Next.js.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface AuthUser {
  id: number;
  username: string;
  nombreCompleto: string;
  role: string;
  permisos: string[];
  mustChangePassword: boolean;
  areasVisibles: string[] | null;
  areasEditables: string[] | null;
}

export interface LoginResponse {
  user: AuthUser;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Mensaje legible cuando el backend no entrega uno (p. ej. página HTML 502 del proxy).
function mensajePorStatus(status: number): string {
  switch (status) {
    case 0: return "No se pudo conectar con el servidor. Verifica tu conexión a internet.";
    case 400: return "Datos inválidos en la solicitud.";
    case 401: return "Tu sesión expiró. Vuelve a iniciar sesión.";
    case 403: return "No tienes permiso para realizar esta acción.";
    case 404: return "No se encontró el recurso solicitado.";
    case 408: return "La solicitud tardó demasiado. Intenta de nuevo.";
    case 413: return "La solicitud es demasiado grande.";
    case 429: return "Demasiadas solicitudes. Espera un momento e intenta de nuevo.";
    case 500: return "Error interno del servidor. Intenta de nuevo o contacta a soporte.";
    case 502:
    case 503:
    case 504:
      return `El servidor no respondió correctamente (${status}). Puede estar reiniciándose o la operación tardó demasiado; intenta de nuevo en unos segundos.`;
    default: return `Ocurrió un error (${status}).`;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      cache: "no-store", // siempre datos frescos: evita ver clientes/direcciones cacheados
      credentials: "include", // envía/recibe la cookie de sesión (mismo origen vía proxy)
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, mensajePorStatus(0));
  }

  if (!res.ok) {
    // Sesión inválida/expirada o sin token: limpia y redirige a login.
    if (res.status === 401) redirigirALogin();
    // Intenta leer el mensaje del backend (JSON { error }); si la respuesta no es
    // JSON (p. ej. página 502 del proxy/Cloudflare) usa un mensaje claro por status.
    let backendMsg = "";
    try {
      const err = await res.clone().json();
      backendMsg = typeof err?.error === "string" ? err.error
        : typeof err?.message === "string" ? err.message : "";
    } catch { /* respuesta no-JSON */ }
    throw new ApiError(res.status, backendMsg || mensajePorStatus(res.status));
  }

  return (await res.json().catch(() => ({}))) as T;
}

// Cierra la sesión local y lleva al usuario a /login (evita bucles si ya está ahí).
function redirigirALogin(): void {
  if (typeof window === "undefined") return;
  clearSession();
  if (!window.location.pathname.startsWith("/login")) {
    window.location.replace("/login");
  }
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const data = await request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  saveSession(data.user);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } finally {
    clearSession();
  }
}

// Versículo del día para la pantalla de login (público, no requiere sesión).
export interface Versiculo { texto: string; cita: string }
export async function getVersiculo(): Promise<Versiculo> {
  return request<Versiculo>("/api/auth/versiculo");
}

// Confirma con el backend si la cookie de sesión sigue siendo válida (y trae el
// usuario fresco: permisos/áreas releídos de la BD). Úsala en el guard de layout.
export async function fetchMe(): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>("/api/auth/me");
  saveSession(data.user);
  return data.user;
}

export async function changePassword(nueva: string, confirmar: string): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ nueva, confirmar }),
  });
  saveSession(data.user);
  return data.user;
}

export interface Vehiculo {
  id: string;
  placa: string;
  modelo: string | null;
  anio: number | null;
  horaInicioJornada: string | null;
  horaFinJornada: string | null;
  caracteristica: string | null;
  capacidad: string | null;
  capacidadReal: string | null;
  cubicaje: string | null;
  empleadores: string | null;
  flotas: string | null;
  estado: string;
  createdAt: string;
}

export interface Conductor {
  id: string;
  nombres: string;
  apellidos: string;
  cedula: string | null;
  correo: string | null;
  celular: string | null;
  perfil: string;
  depositos: string | null;
  clientes: string | null;
  activo: boolean;
  createdAt: string;
}

export interface ConductorInput {
  nombres: string;
  apellidos: string;
  cedula: string;
  correo?: string;
  celular?: string;
  perfil?: string;
  depositos?: string;
  clientes?: string;
  activo?: boolean;
}

export function getVehiculos(): Promise<Vehiculo[]> {
  return request<Vehiculo[]>("/api/vehiculos");
}

export interface VehiculoExterno extends Vehiculo {
  conductor: string | null;
  conductorDni: string | null;
}

export function getVehiculosExternos(): Promise<VehiculoExterno[]> {
  return request<VehiculoExterno[]>("/api/vehiculos/externos");
}

// Solo informativo: rutas de Preasignación (Planeación) que ya usan cada placa
// hoy, para avisar en Asignación de Órdenes sin tocar la lógica de Drivin.
export interface PreasignacionHoy { numeroRuta: number; destinos: string[] }
export function getPreasignacionHoy(): Promise<Record<string, PreasignacionHoy>> {
  return request<Record<string, PreasignacionHoy>>("/api/ordenes/preasignacion-hoy");
}

export function setCapacidadReal(
  placa: string,
  capacidadReal: string | null,
  cubicaje?: string | null
): Promise<{ placa: string; capacidadReal: string | null; cubicaje: string | null }> {
  return request<{ placa: string; capacidadReal: string | null; cubicaje: string | null }>(
    "/api/vehiculos/capacidad-real",
    {
      method: "PATCH",
      body: JSON.stringify({ placa, capacidadReal, cubicaje }),
    }
  );
}

export function createVehiculo(placa: string): Promise<Vehiculo> {
  return request<Vehiculo>("/api/vehiculos", {
    method: "POST",
    body: JSON.stringify({ placa }),
  });
}

// NOTA: la gestión de usuarios de DISTRILOG (AppUser, /api/users) fue
// retirada — la reemplaza el módulo Usuarios+Roles de Planeación
// (ver lib/planApi.ts, rutas /api/planeacion/usuarios y /api/planeacion/roles).

export function getConductores(): Promise<Conductor[]> {
  return request<Conductor[]>("/api/conductores");
}

export function syncConductores(): Promise<{ total: number; creados: number; actualizados: number }> {
  return request<{ total: number; creados: number; actualizados: number }>("/api/conductores/sync", {
    method: "POST",
  });
}

export function createConductor(data: ConductorInput): Promise<Conductor> {
  return request<Conductor>("/api/conductores", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateConductor(
  id: string,
  data: ConductorInput
): Promise<Conductor> {
  return request<Conductor>(`/api/conductores/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function setConductorEstado(
  id: string,
  activo: boolean
): Promise<Conductor> {
  return request<Conductor>(`/api/conductores/${id}/estado`, {
    method: "PATCH",
    body: JSON.stringify({ activo }),
  });
}

export function deleteConductor(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/conductores/${id}`, { method: "DELETE" });
}

export interface Orden {
  id: string;
  fecha: string;
  numeroOrden: string;
  cliente: string;
  destino: string;
  producto: string;
  cantidadKg: number;
  estado: string;
  distribucion: string;
  tatOrigen: string | null;
  nit: string | null;
  codigo: string | null;
  valor: number;
  direccion: string | null;
  vendedor: string | null;
  reenviado: boolean;
  reenviadoAt: string | null;
  asignadoVehiculo: string | null;
  ruta: string | null;
  cargado: boolean;
  cargadoAt: string | null;
  createdAt: string;
  // Novedad de entrega que llega de Drivin (POD) por producto/remisión.
  reasonName?: string | null;
  reasonCode?: string | null;
  // Cliente enrutado por concatenado (NIT) hacia otro cliente distinto al del Excel.
  clienteOriginal?: string;
  clienteAsignado?: string;
  sobrescritoConcatenado?: boolean;
  // Si no es null, cliente/codigo/direccion se re-escribieron con los datos
  // reales del Cliente (por destino/consecutivo/NIT/parecido de nombre) en
  // vez de quedarse con lo que traia el Excel/factura.
  clienteSistemaId?: string | null;
}

export function getOrdenes(all = false): Promise<Orden[]> {
  return request<Orden[]>(`/api/ordenes${all ? "?all=true" : ""}`);
}

export interface ClienteSinRegistrar {
  cliente: string;
  destino: string;
  nit?: string | null;
  codigo?: string | null;
  direccion?: string | null;
  distribucion?: string;
  pedidos: number;
  numeros?: string[];
  ids?: string[];
}

export interface ClienteRegistrado {
  cliente: string;
  destino: string;
  codigo: string | null;
  pedidos: number;
}

export interface VerificacionClientes {
  totalDestinos: number;
  registrados: ClienteRegistrado[];
  totalDirecciones?: number;
  sinRegistrar: ClienteSinRegistrar[];
}

export function verificarClientesOrdenes(): Promise<VerificacionClientes> {
  return request<VerificacionClientes>("/api/ordenes/verificar-clientes");
}

export interface FacturaResult {
  numeroOrden: string;
  cliente: string;
  destino: string;
  direccion: string | null;
  productos: { producto: string; kg: number; valor: number }[];
  totalKg: number;
  totalValor: number;
  origen: string;
  ruta?: string | null;
}

// Consulta una factura directo en Siesa (apiconsulta) por su NumFac y una fecha o
// rango de fechas (fecFac = inicio, fecFin = fin opcional) y la guarda como orden TAT.
// ruta = grupo/ruta opcional (ej. "Ruta 1") para organizar en asignación.
export function consultarFactura(
  origen: "AGROPECUARIA" | "INVERSIONES",
  numFac: string,
  fecFac: string,
  fecFin?: string,
  ruta?: string
): Promise<FacturaResult> {
  return request<FacturaResult>("/api/ordenes/factura", {
    method: "POST",
    body: JSON.stringify({ origen, numFac, fecFac, fecFin, ruta }),
  });
}

// ── Plantillas TAT (captura masiva sin escanear QR uno a uno) ─────────────
export interface FilaPlantillaTat {
  fecha: string;
  numFac: string;
  placa?: string | null;
  conductor?: string | null;
  auxiliar?: string | null;
  ruta?: string | null;
  extra?: Record<string, string>;
}
export interface ResultadoPlantillaTat {
  total: number;
  cruzados: number;
  errores: number;
  detalle: {
    numFac: string; estado: "CRUZADO" | "ERROR"; mensaje?: string;
    cliente?: string; nit?: string | null; barrio?: string | null; direccion?: string | null;
    totalKg?: number; totalValor?: number;
  }[];
}
export interface RegistroPlantillaTat extends FilaPlantillaTat {
  id: string;
  origen: string;
  numeroOrden: string;
  estado: string;
  mensaje: string | null;
  createdAt: string;
}

// URL para descargar el Excel vacío (solo encabezados) de una plantilla.
export function urlPlantillaTatFormato(origen: "AGROPECUARIA" | "INVERSIONES"): string {
  return `${API_URL}/api/ordenes/tat-plantilla/formato?origen=${origen}`;
}

export function subirPlantillaTat(
  origen: "AGROPECUARIA" | "INVERSIONES",
  filas: FilaPlantillaTat[]
): Promise<ResultadoPlantillaTat> {
  return request<ResultadoPlantillaTat>("/api/ordenes/tat-plantilla", {
    method: "POST",
    body: JSON.stringify({ origen, filas }),
  });
}

// ── Borrador de la plantilla (persistido en BD, no localStorage) ──────────
// Cualquier usuario que abra la página ve/edita el mismo avance del día.
export interface BorradorPlantillaTat<T = Record<string, unknown>> {
  jornada: string;
  filas: T[];
}
export function getBorradorPlantillaTat<T = Record<string, unknown>>(
  origen: "AGROPECUARIA" | "INVERSIONES"
): Promise<BorradorPlantillaTat<T>> {
  return request<BorradorPlantillaTat<T>>(`/api/ordenes/tat-plantilla/borrador?origen=${origen}`);
}
export function guardarBorradorPlantillaTat(
  origen: "AGROPECUARIA" | "INVERSIONES",
  filas: unknown[]
): Promise<{ ok: boolean; jornada: string }> {
  return request(`/api/ordenes/tat-plantilla/borrador`, {
    method: "PUT",
    body: JSON.stringify({ origen, filas }),
  });
}

export async function importarPlantillaTat(
  origen: "AGROPECUARIA" | "INVERSIONES",
  file: File
): Promise<ResultadoPlantillaTat> {
  const formData = new FormData();
  formData.append("origen", origen);
  formData.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/ordenes/tat-plantilla/importar`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
  } catch {
    throw new ApiError(0, mensajePorStatus(0));
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err?.error ?? mensajePorStatus(res.status));
  }
  return res.json();
}

export function getRegistrosPlantillaTat(
  origen?: "AGROPECUARIA" | "INVERSIONES",
  estado?: string
): Promise<RegistroPlantillaTat[]> {
  const qs = new URLSearchParams();
  if (origen) qs.set("origen", origen);
  if (estado) qs.set("estado", estado);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<RegistroPlantillaTat[]>(`/api/ordenes/tat-plantilla${suffix}`);
}

export function deleteOrdenes(
  tipo?: "B" | "P" | "I" | "AGRO" | "TAT" | "TATAGRO" | "TATINV"
): Promise<{ eliminados: number }> {
  const qs = tipo ? `?tipo=${tipo}` : "";
  return request<{ eliminados: number }>(`/api/ordenes${qs}`, {
    method: "DELETE",
  });
}

export function eliminarOrdenesPorIds(
  ids: string[]
): Promise<{ eliminados: number }> {
  return request<{ eliminados: number }>("/api/ordenes/eliminar", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

// Asigna (o limpia con ruta vacía) la ruta/grupo a un conjunto de órdenes por ids.
export function asignarRutaOrdenes(
  ids: string[],
  ruta: string
): Promise<{ actualizados: number; ruta: string | null }> {
  return request<{ actualizados: number; ruta: string | null }>("/api/ordenes/asignar-ruta", {
    method: "POST",
    body: JSON.stringify({ ids, ruta }),
  });
}

export function asignarOrdenes(
  ids: string[],
  placa: string | null
): Promise<{ actualizados: number }> {
  return request<{ actualizados: number }>("/api/ordenes/asignar", {
    method: "POST",
    body: JSON.stringify({ ids, placa }),
  });
}

export function reenviarOrdenes(
  ids: string[]
): Promise<{ reenviados: number; errores: string[] }> {
  return request<{ reenviados: number; errores: string[] }>(
    "/api/ordenes/reenviar",
    { method: "POST", body: JSON.stringify({ ids }) }
  );
}

export function syncEstadoDrivin(): Promise<{ actualizados: number; escenarios: number }> {
  return request<{ actualizados: number; escenarios: number }>(
    "/api/ordenes/sync-drivin-estado",
    { method: "POST" }
  );
}

export interface Cliente {
  id: string;
  codigoDireccion: string | null;
  nombreDireccion: string | null;
  cliente: string | null;
  tipoDireccion: string | null;
  direccion: string | null;
  referencia: string | null;
  descripcion: string | null;
  comuna: string | null;
  provincia: string | null;
  region: string | null;
  pais: string | null;
  codigoPostal: string | null;
  lat: string | null;
  lon: string | null;
  barrio: string | null;
  manzana: string | null;
  lote: string | null;
  tipoVia: string | null;
  telefono: string | null;
  correo: string | null;
  puntoVenta: string | null;
  tipo: string | null;
  vendedor: string | null;
  // JSON con columnas de Drivin sin campo propio (Nombre de Esquema, ventanas
  // horarias, etc.); no se edita desde la app, solo viaja en import/export.
  extraDrivin: string | null;
  activo: boolean;
  consecutivos: string[];
  createdAt: string;
}

export function getClientes(): Promise<Cliente[]> {
  return request<Cliente[]>("/api/clientes");
}

export type ClienteInput = Partial<Omit<Cliente, "id" | "createdAt">>;

export function updateCliente(id: string, data: ClienteInput): Promise<Cliente> {
  return request<Cliente>(`/api/clientes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function crearCliente(data: ClienteInput): Promise<Cliente> {
  return request<Cliente>("/api/clientes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Elimina TODO el maestro de clientes (Distribución). Requiere rol administrador.
export function eliminarTodosClientes(): Promise<{ eliminados: number }> {
  return request("/api/clientes", { method: "DELETE" });
}

export function asignarConsecutivo(
  id: string,
  consecutivo: string
): Promise<Cliente> {
  return request<Cliente>(`/api/clientes/${id}/consecutivo`, {
    method: "POST",
    body: JSON.stringify({ consecutivo }),
  });
}

export function cruzarConsecutivosAuto(): Promise<{
  asignados: number;
  clientesAfectados: number;
}> {
  return request("/api/clientes/auto-consecutivos", { method: "POST" });
}

export interface ImportacionClientesResumen {
  totalFilas: number;
  creados: number;
  actualizados: number;
  sinCambios: number;
  descartadas: number;
  importados: number;
}

export async function importClientes(
  file: File
): Promise<ImportacionClientesResumen> {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/clientes/import`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) redirigirALogin();
    throw new ApiError(res.status, data?.error ?? "Error al importar");
  }
  return data as ImportacionClientesResumen;
}

// Descarga el maestro de clientes en un Excel editable (para actualizar y reimportar).
export async function exportClientes(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/clientes/export`, {
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }
  if (!res.ok) {
    if (res.status === 401) redirigirALogin();
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err?.error ?? "No se pudo exportar");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clientes-distrilog-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface Plan {
  token: string;
  deploy_date: string;
  description: string;
  status: string;
  schema_name: string;
  schema_code: string;
  created_at: string;
}

export interface PlanInput {
  descripcion: string;
  fecha: string;
  schemaName: string;
  fleetName?: string;
  placas?: string[];
  reenviar?: boolean;
}

export interface PlanMeta {
  vehiculos: number;
  direcciones: number;
  ordenes: number;
  nuevas?: number;
  duplicadas?: number;
  existentes?: number;
  descripcion?: string;
  mensaje?: string;
  scenarioToken?: string;
  estado?: string;
  added?: number;
  skipped?: number;
  conflictos?: { cliente: string; destino: string; vehiculos: string[] }[];
}

export function getPlanes(date: string): Promise<Plan[]> {
  return request<Plan[]>(`/api/planes?date=${date}`);
}

export function getSchemas(): Promise<string[]> {
  return request<string[]>("/api/planes/schemas");
}

export function getFlotas(): Promise<string[]> {
  return request<string[]>("/api/planes/flotas");
}

// Veces que se ha enviado (replicado) el plan de cada vehículo a Drivin.
export function getReplicas(): Promise<Record<string, number>> {
  return request<Record<string, number>>("/api/planes/replicas");
}

export function crearPlan(
  data: PlanInput
): Promise<{ _meta: PlanMeta; [key: string]: unknown }> {
  return request<{ _meta: PlanMeta; [key: string]: unknown }>("/api/planes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function agregarAPlan(
  scenarioToken: string,
  opts?: { reenviar?: boolean; placas?: string[] }
): Promise<{ _meta: PlanMeta; [key: string]: unknown }> {
  return request<{ _meta: PlanMeta; [key: string]: unknown }>(
    "/api/planes/agregar",
    { method: "POST", body: JSON.stringify({ scenarioToken, reenviar: opts?.reenviar, placas: opts?.placas }) }
  );
}

export async function importOrdenes(
  file: File,
  tipo: "B" | "P" | "I"
): Promise<{
  importados: number;
  entregados: number;
  rechazados: number;
  pendientes: number;
  sinCodigo?: number;
  noCreadas?: number;
  clientesAutoAsignados?: number;
}> {
  const form = new FormData();
  form.append("tipo", tipo);
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/ordenes/import`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "Error al importar");
  }
  return data as {
    importados: number;
    entregados: number;
    rechazados: number;
    pendientes: number;
    sinCodigo?: number;
  };
}

// La sesión REAL vive en una cookie httpOnly (el navegador no puede leerla ni
// falsificarla); esto es solo una copia en sessionStorage para poder mostrar
// el usuario en la UI sin esperar un round-trip a /api/auth/me en cada render.
const USER_KEY = "rutas_web_user";

export function saveSession(user: AuthUser) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(USER_KEY);
}

// ¿El usuario tiene la clave de permiso indicada? ADMIN siempre true.
// Úsala para gatear acciones puntuales (ver lib/permisos.ts para el caso
// típico "ver módulo de solo lectura" vs "puede editar/crear/eliminar").
export function tienePermiso(clave: string): boolean {
  const u = getUser();
  if (!u) return false;
  if (u.role === "ADMIN") return true;
  return u.permisos.includes(clave);
}

// ── Planillas de despacho ──────────────────────────────────────────────────
export interface PlanillaItem {
  numeroOrden: string;
  cliente: string;
  destino: string;
  area?: string;
  codigoArea?: string;
  nombreDestino?: string;
  direccion?: string;
  kg: number;
}

export interface Planilla {
  id: string;
  consecutivo: number;
  fecha: string;
  placa: string;
  conductor: string | null;
  origen: string | null;
  horaSalida: string | null;
  auxiliarRuta: string | null;
  tipoDespacho: string | null;
  ruta: string | null;
  docs: number;
  kilos: number;
  clientes: string[];
  items: PlanillaItem[];
  anulada: boolean;
  anuladaAt: string | null;
  impresa: boolean;
  impresaAt: string | null;
  reemplazadaPorConsecutivo: number | null;
  reemplazaDeConsecutivo: number | null;
  createdAt: string;
}

export interface PlanillaInput {
  fecha: string;
  placa: string;
  conductor?: string | null;
  origen?: string | null;
  horaSalida?: string | null;
  auxiliarRuta?: string | null;
  tipoDespacho?: string | null;
  ruta?: string | null;
  docs?: number;
  kilos?: number;
  clientes?: string[];
  items?: PlanillaItem[];
}

export interface PlanillaPatch {
  placa?: string;
  conductor?: string | null;
  auxiliarRuta?: string | null;
  ruta?: string | null;
  tipoDespacho?: string | null;
  horaSalida?: string | null;
  items?: PlanillaItem[];
  anulada?: boolean;
  impresa?: boolean;
}

export function getPlanillas(): Promise<Planilla[]> {
  return request<Planilla[]>("/api/planillas");
}

export function crearPlanilla(data: PlanillaInput): Promise<Planilla> {
  return request<Planilla>("/api/planillas", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function editarPlanilla(id: string, data: PlanillaPatch): Promise<Planilla> {
  return request<Planilla>(`/api/planillas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function eliminarPlanilla(id: string): Promise<{ eliminado: boolean }> {
  return request<{ eliminado: boolean }>(`/api/planillas/${id}`, {
    method: "DELETE",
  });
}

export interface AnularPlanillaOverride {
  placa?: string;
  conductor?: string | null;
  auxiliarRuta?: string | null;
  ruta?: string | null;
  tipoDespacho?: string | null;
  items?: PlanillaItem[];
  clientes?: string[];
}

export function anularPlanilla(
  id: string,
  override?: AnularPlanillaOverride
): Promise<{ anulada: Planilla; nueva: Planilla }> {
  return request<{ anulada: Planilla; nueva: Planilla }>(`/api/planillas/${id}/anular`, {
    method: "POST",
    body: JSON.stringify(override ?? {}),
  });
}

export function marcarImpresa(id: string): Promise<Planilla> {
  return editarPlanilla(id, { impresa: true });
}

// ── Novedades (nivel de servicio) ──────────────────────────────────────────
export type NovedadEstado = "Pendiente" | "En tramitación" | "Resuelto" | "Cerrada";
export type NovedadPrioridad = "Alta" | "Media" | "Baja";
export type NivelEstado = "Sin Novedad" | "Con Novedad" | "Doc.Pendiente" | "Reenvio" | "Rechazado" | "Parcial Con Novedad";

export interface Novedad {
  id: string;
  consecutivo: number;
  fecha: string;
  tipo: string;
  prioridad: NovedadPrioridad;
  estado: NovedadEstado;
  estadoEntrega: NivelEstado;
  novedad: string | null;
  responsabilidad: string | null;
  noLlego: string | null;
  productos: string | null;
  planillaId: string | null;
  placa: string | null;
  conductor: string | null;
  auxiliarRuta: string | null;
  cliente: string | null;
  numeroOrden: string | null;
  descripcion: string;
  resolucion: string | null;
  resueltaAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NovedadInput = {
  fecha?: string;
  tipo?: string;
  prioridad?: NovedadPrioridad;
  estado?: NovedadEstado;
  estadoEntrega?: NivelEstado;
  novedad?: string | null;
  responsabilidad?: string | null;
  noLlego?: string | null;
  productos?: string | null;
  planillaId?: string | null;
  placa?: string | null;
  conductor?: string | null;
  auxiliarRuta?: string | null;
  cliente?: string | null;
  numeroOrden?: string | null;
  descripcion?: string;
  resolucion?: string | null;
};

export function getNovedades(): Promise<Novedad[]> {
  return request<Novedad[]>("/api/novedades");
}

export function crearNovedad(data: NovedadInput): Promise<Novedad> {
  return request<Novedad>("/api/novedades", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function editarNovedad(id: string, data: Partial<NovedadInput>): Promise<Novedad> {
  return request<Novedad>(`/api/novedades/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function eliminarNovedad(id: string): Promise<{ eliminado: boolean }> {
  return request<{ eliminado: boolean }>(`/api/novedades/${id}`, {
    method: "DELETE",
  });
}

// Envía remisiones (con vehículo asignado) al Nivel de Servicio sin generar DL.
// No duplica: si ya está en el Nivel, se omite.
export function enviarANivel(numerosOrden: string[]): Promise<{ creadas: number; omitidas: number }> {
  return request<{ creadas: number; omitidas: number }>("/api/novedades/enviar-nivel", {
    method: "POST",
    body: JSON.stringify({ numerosOrden }),
  });
}

// ── Configuración (auxiliares, rutas, nombres de planes, cambios) ───────────
export interface Auxiliar {
  id: string;
  nombre: string;
  telefono?: string | null;
  orden?: number;
}

export interface Ruta {
  id: string;
  nombre: string;
  recorrido?: string | null;
  ciudad?: string | null;
  kls?: number | null;
  tiempo?: string | null;
  grupo?: string | null;
  orden?: number;
}

export interface PlanNombre {
  id: string;
  nombre: string;
  tipo?: string | null;
  orden?: number;
}

export function getAuxiliares(): Promise<Auxiliar[]> {
  return request<Auxiliar[]>("/api/config/auxiliares");
}

export function saveAuxiliares(data: Auxiliar[]): Promise<Auxiliar[]> {
  return request<Auxiliar[]>("/api/config/auxiliares", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function getRutas(): Promise<Ruta[]> {
  return request<Ruta[]>("/api/config/rutas");
}

export function saveRutas(data: Ruta[]): Promise<Ruta[]> {
  return request<Ruta[]>("/api/config/rutas", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function getPlanNombres(): Promise<PlanNombre[]> {
  return request<PlanNombre[]>("/api/config/plan-nombres");
}

export function savePlanNombres(data: PlanNombre[]): Promise<PlanNombre[]> {
  return request<PlanNombre[]>("/api/config/plan-nombres", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export type TipoCambio = "movimiento" | "anulacion" | "reimpresion" | "liberacion";

export interface CambioDespacho {
  id: string;
  tipo: TipoCambio;
  remision?: string | null;
  deVehiculo?: string | null;
  aVehiculo?: string | null;
  dlOrigen?: number | null;
  dlNuevo?: number | null;
  detalle?: string | null;
  hecho: boolean;
  createdAt: string;
}

export type CambioInput = {
  tipo: TipoCambio;
  remision?: string | null;
  deVehiculo?: string | null;
  aVehiculo?: string | null;
  dlOrigen?: number | null;
  dlNuevo?: number | null;
  detalle?: string | null;
};

export function getCambios(): Promise<CambioDespacho[]> {
  return request<CambioDespacho[]>("/api/config/cambios");
}

export function addCambio(data: CambioInput): Promise<CambioDespacho> {
  return request<CambioDespacho>("/api/config/cambios", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function marcarCambioHecho(id: string, hecho: boolean): Promise<CambioDespacho> {
  return request<CambioDespacho>(`/api/config/cambios/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ hecho }),
  });
}

export function limpiarCambiosHechos(): Promise<{ eliminados: number }> {
  return request<{ eliminados: number }>("/api/config/cambios/hechos", {
    method: "DELETE",
  });
}

// ── Resumen de órdenes (dashboard) ──────────────────────────────────────────
export interface OrdenesResumen {
  totalOrdenes: number;
  vivas: number;
  asignadas: number;
  sinAsig: number;
  enviadas: number;
  entregadas: number;
  rechazadas: number;
  reenviadas: number;
  kilosVivas: number;
  kilosEnviadas: number;
  tat: number;
  agro: number;
  vehiculosConCarga: number;
}

export function getResumen(): Promise<OrdenesResumen> {
  return request<OrdenesResumen>("/api/ordenes/resumen");
}
