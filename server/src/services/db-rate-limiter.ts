import { and, count, eq, gt, lt } from "drizzle-orm";
import { rateLimitEntries } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";

export type DbRateLimiterConfig = {
  maxRequests: number;
  windowMs: number;
};

export type DbRateLimiterConsumeResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export type DbRateLimiter = {
  consume(key: string, now?: Date): Promise<DbRateLimiterConsumeResult>;
};

export function createDbRateLimiter(
  db: Db,
  config: DbRateLimiterConfig,
): DbRateLimiter {
  const { maxRequests, windowMs } = config;

  return {
    async consume(key: string, now?: Date) {
      const nowDate = now ?? new Date();
      const cutoff = new Date(nowDate.getTime() - windowMs);

      await db
        .delete(rateLimitEntries)
        .where(
          and(
            eq(rateLimitEntries.key, key),
            lt(rateLimitEntries.createdAt, cutoff),
          ),
        );

      const [result] = await db
        .select({ count: count() })
        .from(rateLimitEntries)
        .where(
          and(
            eq(rateLimitEntries.key, key),
            gt(rateLimitEntries.createdAt, cutoff),
          ),
        );

      const recentCount = result?.count ?? 0;

      if (recentCount >= maxRequests) {
        const [oldest] = await db
          .select({ createdAt: rateLimitEntries.createdAt })
          .from(rateLimitEntries)
          .where(
            and(
              eq(rateLimitEntries.key, key),
              gt(rateLimitEntries.createdAt, cutoff),
            ),
          )
          .orderBy(rateLimitEntries.createdAt)
          .limit(1);

        const oldestHit = oldest?.createdAt ?? nowDate;
        return {
          allowed: false,
          limit: maxRequests,
          remaining: 0,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(
              (oldestHit.getTime() + windowMs - nowDate.getTime()) / 1000,
            ),
          ),
        };
      }

      await db.insert(rateLimitEntries).values({
        key,
        createdAt: nowDate,
      });

      return {
        allowed: true,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - recentCount - 1),
        retryAfterSeconds: 0,
      };
    },
  };
}
