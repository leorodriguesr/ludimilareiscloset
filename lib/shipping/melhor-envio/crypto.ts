import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function resolveKey(): Buffer {
  const candidates = [
    process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY,
    process.env.SESSION_SECRET,
    process.env.IRON_SESSION_PASSWORD,
  ];
  const raw = candidates
    .map((value) => value?.trim())
    .find((value) => value && value.length >= 16);
  if (!raw) {
    throw new Error(
      "MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY (ou SESSION_SECRET) não configurado (mín. 16 caracteres)."
    );
  }
  return createHash("sha256").update(raw).digest();
}

/** Formato: v1:<iv_b64>:<tag_b64>:<cipher_b64> */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, resolveKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Formato de token criptografado inválido.");
  }
  const decipher = createDecipheriv(
    ALGO,
    resolveKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
