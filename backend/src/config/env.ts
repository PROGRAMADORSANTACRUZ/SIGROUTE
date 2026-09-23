import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // Una sola base de datos (Ejecución ya se migró a este mismo esquema).
  DATABASE_URL_PLAN: z.string().min(1, "DATABASE_URL_PLAN es obligatoria"),
  // Clave para firmar la cookie de sesión (equivalente a SECRET_KEY de rutas_web/FastAPI).
  SECRET_KEY: z.string().min(16, "SECRET_KEY debe tener al menos 16 caracteres"),
  SESSION_HTTPS_ONLY: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  DRIVIN_API_URL: z
    .string()
    .default("https://external.driv.in/api/external"),
  DRIVIN_API_KEY: z.string().optional(),
  // Org Drivin DISTINTA ("CO - Santacruz Domicilios", id 10004169): confirmado
  // 2026-09-23 con soporte de Drivin que son 2 organizaciones separadas (la de
  // arriba es la de distribución/flota de camiones; esta es la de los 14
  // esquemas de PDV y la flota de motos/domiciliarios) — no se pueden unificar
  // en una sola API key, así que Run Errands usa esta y nada más la usa.
  DRIVIN_ERRANDS_API_KEY: z.string().optional(),
  // Token de apiconsulta (mismo que PRICE_LISTS_TOKEN de SIGCOM). Se envía como ?token=
  CLIENTES_TAT_TOKEN: z.string().optional(),
  TAT_INVOICES_URL: z
    .string()
    .default(
      "https://sigcom.grupo-santacruz.com/api/public/dispatch/tat-invoices?cia={cia}"
    ),
  // Token de la API pública de despacho de SIGCOM (DISPATCH_API_TOKEN). Se envía
  // en el header x-api-key; sin él la API responde 401.
  TAT_INVOICES_TOKEN: z.string().optional(),
  // Consulta directa a apiconsulta (Siesa) por factura: reemplaza el intermediario
  // SIGCOM. Se consulta con ?cia=&fecha_inicio=&fecha_fin=&documento=&token=
  // (el token es el mismo CLIENTES_TAT_TOKEN de apiconsulta).
  FACTURAS_AGRO_URL: z
    .string()
    .default("https://apiconsulta.grupo-santacruz.com/ventas/facturas-agropecuaria-tat"),
  FACTURAS_INV_URL: z
    .string()
    .default("https://apiconsulta.grupo-santacruz.com/ventas/facturas-tat-inversiones"),
  // Piso del consecutivo OSRunXXXXX de Run Errands: en Drivin ya existían
  // pedidos hasta OSRun01755 (creados antes de esta app), así que los nuevos
  // deben seguir desde ahí en vez de reiniciar en OSRun00001 y chocar/quedar
  // desalineados con lo que ya está allá.
  ERRANDS_NUMERO_PEDIDO_BASE: z.coerce.number().default(1755),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Variables de entorno inválidas:",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const env = parsed.data;
