import crypto from "crypto";

// ── AES-256-GCM encryption for credentials at rest ─────────────────────
//
// Wrapper around Node's built-in crypto. Used to encrypt OAuth tokens and
// API keys before storing them in sourceConfigs.encryptedCredentials.
//
// Key comes from SOURCES_ENCRYPTION_KEY env var. Must be 32 bytes,
// hex-encoded (so 64 hex chars). Generate one locally with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// and set it in Vercel env vars. NEVER rotate this key while
// encryptedCredentials rows exist — they become unreadable.

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12; // GCM standard
const TAG_LENGTH_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env.SOURCES_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "SOURCES_ENCRYPTION_KEY is not set. Generate with `node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"` and add to env."
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `SOURCES_ENCRYPTION_KEY must be ${KEY_LENGTH_BYTES} bytes (${
        KEY_LENGTH_BYTES * 2
      } hex chars). Got ${key.length} bytes.`
    );
  }
  return key;
}

/**
 * Encrypts a JSON-serializable payload. Returns a single base64 string
 * containing IV || authTag || ciphertext, which is what we store.
 */
export function encryptJson(payload: unknown): string {
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * Reverses encryptJson. Throws if the key is wrong, the blob is corrupt,
 * or the auth tag fails to verify.
 */
export function decryptJson<T = unknown>(blob: string): T {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LENGTH_BYTES + TAG_LENGTH_BYTES) {
    throw new Error("Encrypted blob is too short to be valid");
  }
  const iv = buf.subarray(0, IV_LENGTH_BYTES);
  const tag = buf.subarray(
    IV_LENGTH_BYTES,
    IV_LENGTH_BYTES + TAG_LENGTH_BYTES
  );
  const ciphertext = buf.subarray(IV_LENGTH_BYTES + TAG_LENGTH_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
