import { z } from "zod";

export const ovgDataSourceTypeSchema = z.enum(["csv", "api"]);

export const csvDataSourceConfigSchema = z.object({
  type: z.literal("csv"),
  filePath: z.string().optional(),
  url: z.string().optional(),
  delimiter: z.string().optional().default(","),
  encoding: z.string().optional().default("utf-8"),
});

export const apiDataSourceConfigSchema = z.object({
  type: z.literal("api"),
  baseUrl: z.string().min(1),
  endpoint: z.string().min(1),
  apiKey: z.string().optional(),
  pagination: z.object({
    pageSize: z.number().int().positive().optional().default(50),
  }).optional(),
});

export const ovgDataSourceConfigSchema = z.discriminatedUnion("type", [
  csvDataSourceConfigSchema,
  apiDataSourceConfigSchema,
]);

export const createOvgDataSourceRequestSchema = z.object({
  name: z.string().min(1).max(200),
  type: ovgDataSourceTypeSchema,
  config: ovgDataSourceConfigSchema,
  enabled: z.boolean().optional().default(true),
});

export const updateOvgDataSourceRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  config: ovgDataSourceConfigSchema.optional(),
  enabled: z.boolean().optional(),
});

export const ovgListingStatusSchema = z.enum(["active", "sold", "expired"]);

export const ovgVehicleConditionSchema = z.enum(["new", "used", "certified"]);

export const ovgTransmissionTypeSchema = z.enum(["automatic", "manual"]);

export const ovgFuelTypeSchema = z.enum(["gasoline", "diesel", "electric", "hybrid", "other"]);

export const ovgDriveTypeSchema = z.enum(["AWD", "FWD", "RWD", "4WD"]);

export const listOvgListingsQuerySchema = z.object({
  sourceId: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  priceMin: z.coerce.number().int().optional(),
  priceMax: z.coerce.number().int().optional(),
  status: ovgListingStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type CreateOvgDataSourceRequest = z.infer<typeof createOvgDataSourceRequestSchema>;
export type UpdateOvgDataSourceRequest = z.infer<typeof updateOvgDataSourceRequestSchema>;
export type ListOvgListingsQuery = z.infer<typeof listOvgListingsQuerySchema>;
