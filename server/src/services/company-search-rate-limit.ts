import type { Db } from "@paperclipai/db";
import { createDbRateLimiter, type DbRateLimiter } from "./db-rate-limiter.js";

export const COMPANY_SEARCH_RATE_LIMIT_WINDOW_MS = 60_000;
export const COMPANY_SEARCH_RATE_LIMIT_MAX_REQUESTS = 60;

export type CompanySearchRateLimitActor = {
  companyId: string;
  actorType: "agent" | "board";
  actorId: string;
};

export type CompanySearchRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export type CompanySearchRateLimiter = {
  consume(actor: CompanySearchRateLimitActor, now?: Date): Promise<CompanySearchRateLimitResult>;
};

function key(actor: CompanySearchRateLimitActor) {
  return `${actor.companyId}:${actor.actorType}:${actor.actorId}`;
}

export function createCompanySearchRateLimiter(
  db: Db,
  options: {
    windowMs?: number;
    maxRequests?: number;
  } = {},
): CompanySearchRateLimiter {
  const windowMs = options.windowMs ?? COMPANY_SEARCH_RATE_LIMIT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? COMPANY_SEARCH_RATE_LIMIT_MAX_REQUESTS;
  const limiter: DbRateLimiter = createDbRateLimiter(db, { windowMs, maxRequests });

  return {
    async consume(actor, now?: Date) {
      return limiter.consume(key(actor), now);
    },
  };
}
