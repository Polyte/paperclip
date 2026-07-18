import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const TEST_KEY_BASE64 = randomBytes(32).toString("base64");

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "biometric-encryption-test-"));
  process.env.PAPERCLIP_HOME = tempDir;
});

afterAll(() => {
  delete process.env.PAPERCLIP_HOME;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("biometric encryption", () => {
  it("encrypts and decrypts data successfully", async () => {
    process.env.PAPERCLIP_SECRETS_MASTER_KEY = TEST_KEY_BASE64;

    const { encryptBiometricData, decryptBiometricData } = await import("../encryption/biometric-encryption.js");
    const plaintext = Buffer.from("test-biometric-selfie-data");
    const encrypted = encryptBiometricData(plaintext);
    expect(encrypted.scheme).toBe("aes-256-gcm-biometric-v1");
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.tag).toBeTruthy();
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.ciphertext).not.toBe(plaintext.toString("base64"));

    const decrypted = decryptBiometricData(encrypted);
    expect(decrypted).toEqual(plaintext);

    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  });

  it("produces different ciphertext for the same plaintext (random IV)", async () => {
    process.env.PAPERCLIP_SECRETS_MASTER_KEY = TEST_KEY_BASE64;

    const { encryptBiometricData } = await import("../encryption/biometric-encryption.js");
    const plaintext = Buffer.from("same-data");
    const result1 = encryptBiometricData(plaintext);
    const result2 = encryptBiometricData(plaintext);
    expect(result1.iv).not.toBe(result2.iv);
    expect(result1.ciphertext).not.toBe(result2.ciphertext);

    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  });

  it("rejects tampered ciphertext", async () => {
    process.env.PAPERCLIP_SECRETS_MASTER_KEY = TEST_KEY_BASE64;

    const { encryptBiometricData, decryptBiometricData } = await import("../encryption/biometric-encryption.js");
    const plaintext = Buffer.from("tamper-test");
    const encrypted = encryptBiometricData(plaintext);
    const tampered = { ...encrypted, ciphertext: "AAAA" + encrypted.ciphertext.slice(4) };

    expect(() => decryptBiometricData(tampered)).toThrow();

    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  });

  it("rejects wrong encryption scheme", async () => {
    process.env.PAPERCLIP_SECRETS_MASTER_KEY = TEST_KEY_BASE64;

    const { encryptBiometricData, decryptBiometricData } = await import("../encryption/biometric-encryption.js");
    const encrypted = encryptBiometricData(Buffer.from("scheme-test"));
    const wrongScheme = { ...encrypted, scheme: "aes-256-gcm-secrets-v1" };

    expect(() => decryptBiometricData(wrongScheme)).toThrow("Unsupported biometric encryption scheme");

    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  });

  it("rejects decryption with a different key", async () => {
    process.env.PAPERCLIP_SECRETS_MASTER_KEY = TEST_KEY_BASE64;

    const { encryptBiometricData } = await import("../encryption/biometric-encryption.js");
    const encrypted = encryptBiometricData(Buffer.from("wrong-key-test"));

    const differentKey = randomBytes(32).toString("base64");
    process.env.PAPERCLIP_SECRETS_MASTER_KEY = differentKey;

    const { decryptBiometricData } = await import("../encryption/biometric-encryption.js");
    expect(() => decryptBiometricData(encrypted)).toThrow();

    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  });

  it("decrypts JPEG-sized data", async () => {
    process.env.PAPERCLIP_SECRETS_MASTER_KEY = TEST_KEY_BASE64;

    const { encryptBiometricData, decryptBiometricData } = await import("../encryption/biometric-encryption.js");
    const jpegBuffer = randomBytes(500 * 1024);
    const encrypted = encryptBiometricData(jpegBuffer);
    const decrypted = decryptBiometricData(encrypted);
    expect(decrypted.equals(jpegBuffer)).toBe(true);

    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  });
});
