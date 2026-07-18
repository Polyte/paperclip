import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, startEmbeddedPostgresTestDatabase } from "@paperclipai/db";
import { issueRoutes } from "../routes/issues.js";
import { createCompanySearchRateLimiter } from "../services/company-search-rate-limit.js";
import type { CompanySearchQuery, CompanySearchResponse } from "@paperclipai/shared";
import type { Db } from "@paperclipai/db";

function createSearchResponse(query: CompanySearchQuery): CompanySearchResponse {
  return {
    query: query.q,
    normalizedQuery: query.q.trim().toLowerCase(),
    scope: query.scope,
    limit: query.limit,
    offset: query.offset,
    results: [],
    countsByType: { issue: 0, agent: 0, project: 0 },
    hasMore: false,
  };
}

describe("company search route rate limiting", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: Db;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-search-rate-limit-");
    db = createDb(tempDb.connectionString);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("rejects repeated same-actor search calls before invoking search", async () => {
    const search = vi.fn(async (_companyId: string, query: CompanySearchQuery) => createSearchResponse(query));
    const app = express();
    app.use((req, _res, next) => {
      req.actor = {
        type: "agent",
        agentId: "agent-1",
        companyId: "company-1",
        source: "agent_key",
      };
      next();
    });
    app.use("/api", issueRoutes(db, {} as never, {
      searchService: { search },
      searchRateLimiter: createCompanySearchRateLimiter(db, {
        maxRequests: 1,
        windowMs: 60_000,
      }),
    }));

    await request(app).get("/api/companies/company-1/search?q=wizard").expect(200);
    const limited = await request(app).get("/api/companies/company-1/search?q=wizard").expect(429);

    expect(search).toHaveBeenCalledTimes(1);
    expect(limited.body).toMatchObject({
      error: "Search rate limit exceeded",
    });
    expect(limited.body.retryAfterSeconds).toBeGreaterThanOrEqual(59);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(Number(limited.headers["retry-after"])).toBeGreaterThanOrEqual(59);
  });
});
