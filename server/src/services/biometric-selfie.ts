import { eq, and, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { biometricSelfies } from "@paperclipai/db";
import { encryptBiometricData, decryptBiometricData, sha256Hex } from "../encryption/biometric-encryption.js";
import { notFound, badRequest } from "../errors.js";

export function biometricSelfieService(db: Db) {
  return {
    async upload(userId: string, imageBuffer: Buffer, contentType: string) {
      const existing = await db
        .select({ id: biometricSelfies.id })
        .from(biometricSelfies)
        .where(
          and(
            eq(biometricSelfies.userId, userId),
            eq(biometricSelfies.status, "active"),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (existing) {
        throw badRequest("User already has an active biometric selfie. Archive it first before uploading a new one.");
      }

      const sha256 = sha256Hex(imageBuffer);
      const encryptedData = encryptBiometricData(imageBuffer);

      const selfie = await db
        .insert(biometricSelfies)
        .values({
          userId,
          encryptedData,
          contentType,
          sha256,
          status: "active",
        })
        .returning()
        .then((rows) => rows[0]);

      return selfie;
    },

    async getActiveByUserId(userId: string) {
      const selfie = await db
        .select()
        .from(biometricSelfies)
        .where(
          and(
            eq(biometricSelfies.userId, userId),
            eq(biometricSelfies.status, "active"),
          ),
        )
        .then((rows) => rows[0] ?? null);

      return selfie;
    },

    async getById(id: string) {
      const selfie = await db
        .select()
        .from(biometricSelfies)
        .where(eq(biometricSelfies.id, id))
        .then((rows) => rows[0] ?? null);

      return selfie;
    },

    async getDecryptedData(selfie: typeof biometricSelfies.$inferSelect) {
      return decryptBiometricData(selfie.encryptedData);
    },

    async archive(id: string) {
      const selfie = await db
        .update(biometricSelfies)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(biometricSelfies.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!selfie) {
        throw notFound("Biometric selfie not found");
      }

      return selfie;
    },

    async revoke(id: string) {
      const selfie = await db
        .update(biometricSelfies)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(biometricSelfies.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!selfie) {
        throw notFound("Biometric selfie not found");
      }

      return selfie;
    },

    async listByUser(userId: string) {
      return db
        .select()
        .from(biometricSelfies)
        .where(eq(biometricSelfies.userId, userId))
        .orderBy(desc(biometricSelfies.createdAt));
    },
  };
}
