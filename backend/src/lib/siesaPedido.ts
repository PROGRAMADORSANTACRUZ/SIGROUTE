// Compartido entre ordenes.ts (carga TAT) y preplanificacion.ts: helpers para
// las 3 queries de Siesa/apiconsulta que ahora devuelven cufe/qr/firma
// digital directo (ya no hay que escanear el QR físico para TAT/Inversiones)
// y clasifican cada pedido como DESPACHO o RECOGIDA en `pedido_notas`
// (prefijo "TIPO_ENTREGA:DESPACHO ..." / "TIPO_ENTREGA:RECOGIDA ..." que
// agrega SIGCOM al subir el pedido a Siesa — confirmado en vivo 2026-09-24).
import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";

export interface TatInvoiceRaw {
  nro_documento?: string;
  fecha_documento?: string;
  tipo_comercial?: string;
  cliente_factura?: string;
  razon_social_cliente?: string;
  codigo_sucursal?: string;
  descripcion_sucursal?: string;
  direccion_sucursal?: string;
  cantidad_inv?: number;
  valor_subtotal?: number;
  // Vendedor real de la factura (agregado por Siesa/SIGCOM 2026-09-24,
  // confirmado en vivo) — antes solo se conseguía (a veces) desde el maestro
  // TAT local por NIT, que casi nunca lo tenía poblado.
  codigo_vendedor?: string | null;
  nombre_vendedor?: string | null;
  npedido_sigcom?: string | null;
  num_docto_referencia_pedido?: string | null;
  pedido_notas?: string | null;
  cufe?: string | null;
  qr_code_url?: string | null;
  firma_digital?: string | null;
  fecha_aprobacion_dian?: string | null;
}

// true = DESPACHO o sin clasificar (pedidos anteriores a este cambio en
// Siesa/SIGCOM, sin el prefijo, se asumen despacho para no perder datos
// históricos); false = RECOGIDA explícito, se descarta.
export function esDespacho(pedidoNotas: string | null | undefined): boolean {
  const m = /^TIPO_ENTREGA:(DESPACHO|RECOGIDA)\b/i.exec(String(pedidoNotas ?? "").trim());
  if (!m) return true;
  return m[1].toUpperCase() === "DESPACHO";
}

// Cada origen TAT corresponde a una compañía distinta en apiconsulta/Siesa.
export const CIA_POR_ORIGEN: Record<string, string> = { AGROPECUARIA: "3", INVERSIONES: "8" };

const PAGE_SIZE = 1000;
interface TatInvoicesResponse {
  has_more?: boolean;
  next_offset?: number | null;
  data?: TatInvoiceRaw[];
}

// Trae TODAS las líneas de un origen en el rango de fechas (paginado), igual
// que hace SIGCOM internamente para su propio flujo de despacho. Compartido
// por Preplanificación (reporte) y la carga masiva de Cargar Órdenes.
export async function fetchFacturasRango(origen: string, fechaInicio: string, fechaFin: string): Promise<TatInvoiceRaw[]> {
  const cia = CIA_POR_ORIGEN[origen];
  if (!cia) return [];
  const base = origen === "INVERSIONES" ? env.FACTURAS_INV_URL : env.FACTURAS_AGRO_URL;
  const lineas: TatInvoiceRaw[] = [];
  let offset = 0;
  for (let guard = 0; guard < 200; guard++) {
    const qs = new URLSearchParams({
      cia, fecha_inicio: fechaInicio, fecha_fin: fechaFin,
      limit: String(PAGE_SIZE), offset: String(offset),
      ...(env.CLIENTES_TAT_TOKEN ? { token: env.CLIENTES_TAT_TOKEN } : {}),
    });
    let resp: Response;
    try {
      resp = await fetch(`${base}?${qs}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    } catch (err) {
      throw new HttpError(502, `No se pudo conectar con Siesa (${(err as Error)?.name ?? "error"})`);
    }
    if (!resp.ok) throw new HttpError(502, `Siesa respondió ${resp.status} para ${origen}`);
    const json = (await resp.json().catch(() => ({}))) as TatInvoicesResponse;
    lineas.push(...(json.data ?? []));
    const nextOffset = json.next_offset;
    if (json.has_more && typeof nextOffset === "number") offset = nextOffset;
    else break;
  }
  return lineas;
}
