import type { Db } from "@paperclipai/db";
import { createDbRateLimiter, type DbRateLimiter } from "./db-rate-limiter.js";

/**
 * Default rate-limit parameters for model execution.
 *
 * 5 requests per 60 seconds is a safe default that prevents free-tier or
 * shared API plans from hitting upstream rate limits (e.g., DeepSeek's
 * free tier allows very few concurrent requests).
 */
export const MODEL_RATE_LIMIT_DEFAULT_WINDOW_MS = 60_000;
export const MODEL_RATE_LIMIT_DEFAULT_MAX_REQUESTS = 5;

export type ModelRateLimitConfig = {
  /** Time window in milliseconds. */
  windowMs: number;
  /** Maximum number of adapter invocations in the window. */
  maxRequests: number;
};

export type ModelRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export type ModelRateLimiter = {
  /**
   * Test whether a heartbeat run for a given adapter type and model profile
   * is allowed to proceed. Returns a result with backpressure metadata.
   *
   * The rate-limit key is `model:{adapterType}:{modelProfile}`, so runs
   * using the same model on the same adapter type share a single bucket.
   */
  consume(
    adapterType: string,
    modelProfile: string | null,
    now?: Date,
  ): Promise<ModelRateLimitResult>;
};

/**
 * Build the rate-limit key for a model/adapter pair.
 *
 * Format: `model:{adapterType}:{modelProfile}`
 * Falls back to `model:{adapterType}` when no profile is set.
 */
export function modelRateLimitKey(
  adapterType: string,
  modelProfile: string | null,
): string {
  const profile = modelProfile?.trim();
  return profile ? `model:${adapterType}:${profile}` : `model:${adapterType}`;
}

export function createModelRateLimiter(
  db: Db,
  config?: Partial<ModelRateLimitConfig>,
): ModelRateLimiter {
  const windowMs = config?.windowMs ?? MODEL_RATE_LIMIT_DEFAULT_WINDOW_MS;
  const maxRequests = config?.maxRequests ?? MODEL_RATE_LIMIT_DEFAULT_MAX_REQUESTS;
  const limiter: DbRateLimiter = createDbRateLimiter(db, { windowMs, maxRequests });

  return {
    async consume(adapterType, modelProfile, now) {
      return limiter.consume(modelRateLimitKey(adapterType, modelProfile), now);
    },
  };
}
