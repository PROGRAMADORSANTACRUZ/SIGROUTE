// Hash de contraseñas — puerto exacto de legacy_fastapi/app/security.py (pbkdf2_hmac-sha256,
// 200000 iteraciones, sal de 16 bytes), para poder verificar/crear los mismos hashes que la
// app FastAPI original guardó en `usuarios.password_hash`.
import crypto from "crypto";

const ITERATIONS = 200_000;
const SALT_BYTES = 16;
const KEY_LEN = 32; // sha256 digest = 32 bytes = 64 hex chars

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, "sha256");
  return `pbkdf2_sha256$${ITERATIONS}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;

  // Formato legado: SHA-256 puro, 64 chars hex sin separadores.
  if (/^[0-9a-f]{64}$/i.test(stored)) {
    const digest = crypto.createHash("sha256").update(password, "utf8").digest("hex");
    return timingSafeEqualHex(digest, stored);
  }

  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  const salt = Buffer.from(parts[2], "hex");
  const expected = parts[3];
  const hash = crypto.pbkdf2Sync(password, salt, iterations, expected.length / 2, "sha256");
  return timingSafeEqualHex(hash.toString("hex"), expected);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
