import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AppError } from "./errors";

/**
 * Field encryption for bank details. AES-256-GCM with a key derived from BANK_DATA_KEY (any long
 * random secret; Render generates one). The record ID is bound in as associated data, so a value
 * copied onto another worker's row does not decrypt. Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 *
 * Losing BANK_DATA_KEY makes stored IBANs unreadable: keep a copy of it with the database backups.
 */
function key(): Buffer {
  const secret = process.env.BANK_DATA_KEY;
  if (!secret || secret.length < 32) throw new AppError("Bank details can't be saved: encryption is not configured (BANK_DATA_KEY).", "no_key");
  return createHash("sha256").update(secret).digest();
}

export function encryptField(plain: string, recordId: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(recordId));
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptField(stored: string, recordId: string): string {
  const [v, iv, tag, body] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new AppError("Stored bank details are unreadable.");
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAAD(Buffer.from(recordId));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
  } catch {
    throw new AppError("Stored bank details can't be decrypted with the current key.");
  }
}
