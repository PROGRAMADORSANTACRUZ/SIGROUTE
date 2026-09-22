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
}

function habilitado(): boolean {
  return Boolean(env.DRIVIN_API_KEY);
}

async function llamarDrivin(path: string, body: unknown): Promise<{ ok: boolean; mensaje?: string }> {
  if (!habilitado()) return { ok: false, mensaje: "DRIVIN_API_KEY no configurada" };
  try {
    const resp = await fetch(`${env.DRIVIN_API_URL}${path}`, {
      method: "POST",
      headers: { "X-API-Key": env.DRIVIN_API_KEY!, "Content-Type": "application/json" },
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

// Crea el pedido como una orden real en Drivin (1 cliente, 1 orden, 1 tramo).
export async function crearPedidoDrivin(p: DrivinPedidoInput): Promise<{ ok: boolean; mensaje?: string }> {
  return llamarDrivin("/v2/multipleleg", {
    clients: [{
      code: p.clienteCodigo,
      orders: [{
        code: p.numeroPedido,
        units_1: p.kilos,
        delivery_date: p.fecha,
        items: [{ code: "RUN-ERRANDS", description: "Run Errands", units: 1, units_1: p.kilos }],
        legs: [{ schema_name: env.DRIVIN_SCHEMA_NAME, address_code: p.clienteCodigo, departure_date: p.fecha, service_time: 10 }],
      }],
    }],
  });
}
