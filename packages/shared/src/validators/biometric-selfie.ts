import { z } from "zod";

export const biometricSelfieStatusSchema = z.enum(["active", "archived", "revoked"]);

export const uploadBiometricSelfieSchema = z.object({
  contentType: z.string().min(1).max(128),
});

export const biometricSelfieResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  contentType: z.string(),
  sha256: z.string(),
  status: biometricSelfieStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const biometricSelfieDataResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  contentType: z.string(),
  data: z.string(),
  sha256: z.string(),
  status: biometricSelfieStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UploadBiometricSelfie = z.infer<typeof uploadBiometricSelfieSchema>;
export type BiometricSelfieResponse = z.infer<typeof biometricSelfieResponseSchema>;
export type BiometricSelfieDataResponse = z.infer<typeof biometricSelfieDataResponseSchema>;
