import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, statSync } from "node:fs";
import { resolveDefaultSecretsKeyFilePath } from "../home-paths.js";
import { badRequest } from "../errors.js";

const ENCRYPTION_SCHEME = "aes-256-gcm-biometric-v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AAD_CONTEXT = Buffer.from("biometric-selfie-v1", "utf8");

interface BiometricEncryptedMaterial {
  scheme: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

function decodeMasterKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
  }

  if (Buffer.byteLength(trimmed, "utf8") === 32) {
    return Buffer.from(trimmed, "utf8");
  }
  return null;
}

function loadMasterKey(): Buffer {
  const envKeyRaw = process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  if (envKeyRaw && envKeyRaw.trim().length > 0) {
    const fromEnv = decodeMasterKey(envKeyRaw);
    if (!fromEnv) {
      throw badRequest("Invalid PAPERCLIP_SECRETS_MASTER_KEY for biometric encryption");
    }
    return fromEnv;
  }

  const keyPath = resolveDefaultSecretsKeyFilePath();
  if (!existsSync(keyPath)) {
    throw badRequest("Biometric encryption requires a secrets master key. Set PAPERCLIP_SECRETS_MASTER_KEY or run secrets setup.");
  }

  try {
    const mode = statSync(keyPath).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      chmodSync(keyPath, 0o600);
    }
  } catch {
  }

  const raw = readFileSync(keyPath, "utf8");
  const decoded = decodeMasterKey(raw);
  if (!decoded) {
    throw badRequest(`Invalid biometric encryption master key at ${keyPath}`);
  }
  return decoded;
}

export function encryptBiometricData(plaintext: Buffer): BiometricEncryptedMaterial {
  const masterKey = loadMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  cipher.setAAD(AAD_CONTEXT);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    scheme: ENCRYPTION_SCHEME,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptBiometricData(material: BiometricEncryptedMaterial): Buffer {
  if (material.scheme !== ENCRYPTION_SCHEME) {
    throw badRequest(`Unsupported biometric encryption scheme: ${material.scheme}`);
  }
  const masterKey = loadMasterKey();
  const iv = Buffer.from(material.iv, "base64");
  const tag = Buffer.from(material.tag, "base64");
  const ciphertext = Buffer.from(material.ciphertext, "base64");
  const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAAD(AAD_CONTEXT);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
