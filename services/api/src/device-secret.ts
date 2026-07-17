import crypto from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

export type DeviceSecretHash = string;

export function generateDeviceSecret(): string {
  // Hex is MCU/serial friendly and avoids base64 special chars.
  return crypto.randomBytes(32).toString("hex");
}

export function hashDeviceSecret(secret: string): DeviceSecretHash {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = crypto.scryptSync(secret, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });

  const saltB64 = salt.toString("base64");
  const keyB64 = key.toString("base64");
  return (
    "scrypt" +
    `$N=${String(SCRYPT_N)}` +
    `$r=${String(SCRYPT_R)}` +
    `$p=${String(SCRYPT_P)}` +
    `$salt=${saltB64}` +
    `$hash=${keyB64}`
  );
}

export function verifyDeviceSecret(secret: string, stored: DeviceSecretHash): boolean {
  const parts = stored.split("$");
  if (parts.length < 6) return false;
  if (parts[0] !== "scrypt") return false;

  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const [k, v] = p.split("=", 2);
    if (!k || !v) return false;
    params[k] = v;
  }

  const N = Number(params.N);
  const r = Number(params.r);
  const p = Number(params.p);
  const saltB64 = params.salt;
  const hashB64 = params.hash;
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  if (!saltB64 || !hashB64) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(secret, salt, expected.length, { N, r, p });

  return crypto.timingSafeEqual(actual, expected);
}
