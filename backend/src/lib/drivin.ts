// Integración Drivin para Run Errands — crea/actualiza el cliente en el
// Maestro de Direcciones de Drivin y crea el pedido como orden real allá.
// Ver docs/drivin-api.md (POST /v2/addresses y POST /v2/multipleleg).
// Best-effort: si Drivin no está configurado o falla, se registra el error
// pero NUNCA bloquea la operación local (crear cliente/pedido en Run Errands).
import { env } from "../config/env";

export interface DrivinClienteInput {
  codigo: string;
  nombre: string;
  direccion?: string | null;
  barrio?: string | null;
  ciudad?: string | null;
  region?: string | null;
  telefono?: string | null;
  email?: string | null;
}

export interface DrivinPedidoInput {
  clienteCodigo: string;
  numeroPedido: string;
  kilos: number;
  fecha: string; // yyyy-mm-dd
  schemaCode: string;
}

function habilitado(): boolean {
  return Boolean(env.DRIVIN_ERRANDS_API_KEY);
}

async function llamarDrivin(path: string, body: unknown): Promise<{ ok: boolean; mensaje?: string }> {
  if (!habilitado()) return { ok: false, mensaje: "DRIVIN_ERRANDS_API_KEY no configurada" };
  try {
    const resp = await fetch(`${env.DRIVIN_API_URL}${path}`, {
      method: "POST",
      headers: { "X-API-Key": env.DRIVIN_ERRANDS_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await resp.json().catch(() => ({}))) as { success?: boolean };
    if (!resp.ok || json?.success === false) {
      return { ok: false, mensaje: `Drivin ${resp.status}: ${JSON.stringify(json).slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: (err as Error)?.message ?? "Error de red con Drivin" };
  }
}

// Crea o actualiza (update_all) la dirección/cliente en el Maestro de Drivin.
// Nombre guardado como "Run Errands - {nombre}" (convención pedida por el negocio).
export async function sincronizarClienteDrivin(c: DrivinClienteInput): Promise<{ ok: boolean; mensaje?: string }> {
  const nombreDrivin = `Run Errands - ${c.nombre}`;
  return llamarDrivin("/v2/addresses", {
    addresses: [{
      code: c.codigo,
      address1: c.direccion || c.nombre,
      address2: c.barrio || undefined,
      city: c.ciudad || "Barranquilla",
      state: c.region || "Atlántico",
      country: "Colombia",
      name: nombreDrivin,
      client: nombreDrivin,
      client_code: c.codigo,
      phone: c.telefono || undefined,
      email: c.email || undefined,
      update_all: true,
    }],
  });
}

// Crea el pedido como una orden suelta en el Gestor de Órdenes de Drivin
// (un "mandado"), NO como un escenario/Plan con tramos optimizados — Drivin
// confirmó (24/09/2026) que Run Errands debía usar POST /v2/orders?schema_code=
// en vez de /v2/multipleleg, que crea un escenario (Plan) con pipeline de
// optimización de rutas — eso es lo que "se estaba subiendo mal como planes".
// schemaCode = código (no el nombre) del esquema real de Drivin, ver
// listarEsquemasDrivin().
export async function crearPedidoDrivin(p: DrivinPedidoInput): Promise<{ ok: boolean; mensaje?: string }> {
  return llamarDrivin(`/v2/orders?schema_code=${encodeURIComponent(p.schemaCode)}`, {
    clients: [{
      code: p.clienteCodigo,
      orders: [{
        code: p.numeroPedido,
        category: "Delivery",
        units_1: p.kilos,
        delivery_date: p.fecha,
        deploy_date: p.fecha,
        items: [{ code: "RUN-ERRANDS", description: "Run Errands", units: 1, units_1: p.kilos }],
      }],
    }],
  });
}

export interface DrivinEsquema { code: string; name: string }

// Lista los esquemas reales configurados en la organización Drivin de Run
// Errands (GET /v2/schemas) — se usan para el selector del modal de pedido y
// para el auto-match por punto de venta.
export async function listarEsquemasDrivin(): Promise<DrivinEsquema[]> {
  if (!habilitado()) return [];
  try {
    const resp = await fetch(`${env.DRIVIN_API_URL}/v2/schemas`, {
      headers: { "X-API-Key": env.DRIVIN_ERRANDS_API_KEY! },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as { response?: { code?: string; name?: string }[] };
    return (json.response ?? [])
      .filter((s): s is { code: string; name: string } => Boolean(s.code && s.name))
      .map((s) => ({ code: s.code, name: s.name }));
  } catch {
    return [];
  }
}

export interface DrivinPodInfo { status: string; reason: string | null }

// Consulta las pruebas de entrega (POD) de Drivin en un rango de fechas y
// devuelve un mapa código de orden -> {status, reason} (ver GET /v3/pods).
// Igual que fetchPodEstados en routes/ordenes.ts, pero reutilizable para
// cualquier módulo (aquí: Run Errands).
export async function consultarPodsDrivin(desdeISO: string, hastaISO: string): Promise<Map<string, DrivinPodInfo>> {
  const map = new Map<string, DrivinPodInfo>();
  if (!habilitado()) return map;
  try {
    const resp = await fetch(`${env.DRIVIN_API_URL}/v3/pods?start_date=${desdeISO}&end_date=${hastaISO}`, {
      headers: { "X-API-Key": env.DRIVIN_ERRANDS_API_KEY! },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return map;
    const json = (await resp.json()) as { data?: { attributes?: { code?: string | null; status?: string | null; reason?: string | null } }[] };
    for (const item of json.data ?? []) {
      const a = item.attributes ?? {};
      if (!a.code) continue;
      map.set(a.code, { status: (a.status ?? "").toLowerCase(), reason: a.reason ?? null });
    }
  } catch {
    // best-effort: si Drivin falla, se deja el mapa vacío (no rompe el sync).
  }
  return map;
}

