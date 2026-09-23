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
  // Nombre del esquema/origen de ruta configurado en Drivin para las órdenes
  // de Run Errands (requerido por POST /v2/multipleleg, legs[].schema_name).
  // Ajustar al nombre real que tengan configurado en su cuenta Drivin.
  DRIVIN_SCHEMA_NAME: z.string().default("Run Errands"),
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
