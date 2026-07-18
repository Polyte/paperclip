import { Router } from "express";
import multer from "multer";
import type { Db } from "@paperclipai/db";
import { biometricSelfieResponseSchema, biometricSelfieDataResponseSchema } from "@paperclipai/shared";
import { biometricSelfieService } from "../services/biometric-selfie.js";
import { assertAuthenticated, getActorInfo } from "./authz.js";
import { isAllowedContentType, MAX_ATTACHMENT_BYTES } from "../attachment-types.js";
import { badRequest } from "../errors.js";

const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function biometricSelfieRoutes(db: Db) {
  const router = Router();
  const svc = biometricSelfieService(db);

  const selfieUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  });

  async function runUpload(
    upload: ReturnType<typeof multer>,
    req: import("express").Request,
    res: import("express").Response,
  ) {
    await new Promise<void>((resolve, reject) => {
      upload.single("file")(req, res, (err: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  router.post("/users/:userId/biometric-selfie", async (req, res) => {
    assertAuthenticated(req);
    const targetUserId = req.params.userId;

    const actor = getActorInfo(req);
    if (actor.actorId !== targetUserId && actor.actorType !== "agent") {
      throw badRequest("Users can only upload their own biometric selfie");
    }

    try {
      await runUpload(selfieUpload, req, res);
    } catch (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(422).json({ error: `File exceeds ${MAX_ATTACHMENT_BYTES} bytes` });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    const file = (req as import("express").Request & { file?: { mimetype: string; buffer: Buffer; originalname: string } }).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field 'file'" });
      return;
    }

    const contentType = (file.mimetype || "").toLowerCase();
    if (!IMAGE_CONTENT_TYPES.has(contentType) && !isAllowedContentType(contentType)) {
      res.status(422).json({ error: `Unsupported content type: ${contentType || "unknown"}` });
      return;
    }

    if (file.buffer.length <= 0) {
      res.status(422).json({ error: "Selfie image is empty" });
      return;
    }

    const selfie = await svc.upload(targetUserId, file.buffer, contentType);

    res.status(201).json(biometricSelfieResponseSchema.parse({
      id: selfie.id,
      userId: selfie.userId,
      contentType: selfie.contentType,
      sha256: selfie.sha256,
      status: selfie.status,
      createdAt: selfie.createdAt.toISOString(),
      updatedAt: selfie.updatedAt.toISOString(),
    }));
  });

  router.get("/users/:userId/biometric-selfie", async (req, res) => {
    assertAuthenticated(req);
    const targetUserId = req.params.userId;

    const selfie = await svc.getActiveByUserId(targetUserId);
    if (!selfie) {
      res.status(404).json({ error: "No active biometric selfie found" });
      return;
    }

    const decrypted = await svc.getDecryptedData(selfie);
    const dataBase64 = decrypted.toString("base64");

    res.json(biometricSelfieDataResponseSchema.parse({
      id: selfie.id,
      userId: selfie.userId,
      contentType: selfie.contentType,
      data: dataBase64,
      sha256: selfie.sha256,
      status: selfie.status,
      createdAt: selfie.createdAt.toISOString(),
      updatedAt: selfie.updatedAt.toISOString(),
    }));
  });

  router.get("/users/:userId/biometric-selfie/metadata", async (req, res) => {
    assertAuthenticated(req);
    const targetUserId = req.params.userId;

    const selfie = await svc.getActiveByUserId(targetUserId);
    if (!selfie) {
      res.status(404).json({ error: "No active biometric selfie found" });
      return;
    }

    res.json(biometricSelfieResponseSchema.parse({
      id: selfie.id,
      userId: selfie.userId,
      contentType: selfie.contentType,
      sha256: selfie.sha256,
      status: selfie.status,
      createdAt: selfie.createdAt.toISOString(),
      updatedAt: selfie.updatedAt.toISOString(),
    }));
  });

  router.patch("/users/:userId/biometric-selfie/archive", async (req, res) => {
    assertAuthenticated(req);
    const targetUserId = req.params.userId;

    const actor = getActorInfo(req);
    if (actor.actorId !== targetUserId && actor.actorType !== "agent") {
      throw badRequest("Users can only archive their own biometric selfie");
    }

    const selfie = await svc.getActiveByUserId(targetUserId);
    if (!selfie) {
      res.status(404).json({ error: "No active biometric selfie found" });
      return;
    }

    const archived = await svc.archive(selfie.id);

    res.json(biometricSelfieResponseSchema.parse({
      id: archived.id,
      userId: archived.userId,
      contentType: archived.contentType,
      sha256: archived.sha256,
      status: archived.status,
      createdAt: archived.createdAt.toISOString(),
      updatedAt: archived.updatedAt.toISOString(),
    }));
  });

  return router;
}
