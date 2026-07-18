import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Db } from "@paperclipai/db";
import { healthRoutes } from "../routes/health.js";
import * as devServerStatus from "../dev-server-status.js";
import { serverVersion } from "../version.js";

const mockReadPersistedDevServerStatus = vi.hoisted(() => vi.fn());
const mockAssertCompanyAccess = vi.hoisted(() => vi.fn());

vi.mock("../dev-server-status.js", () => ({
  readPersistedDevServerStatus: mockReadPersistedDevServerStatus,
  toDevServerHealthStatus: vi.fn(),
}));

vi.mock("../routes/authz.js", () => ({
  assertCompanyAccess: mockAssertCompanyAccess,
}));

function createApp(db?: Db) {
  const app = express();
  app.use("/health", healthRoutes(db));
  return app;
}

/**
 * Create a mock Db whose select chain returns a controlled set of rows.
 * Callers pass a map of table name -> rows array. Calls are matched positionally
 * (first select → first entry, second → second, etc.).
 */
function mockDb(selectResults: Record<string, unknown[]>[] = []) {
  let selectCall = 0;
  return {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    select: vi.fn(() => {
      const result = selectResults[selectCall] ?? {};
      selectCall += 1;
      const tableName = Object.keys(result)[0] ?? "default";
      return {
        from: vi.fn(() => ({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(result[tableName] ?? []),
            }),
            then: vi.fn(),
          }),
        })),
      };
    }),
  } as unknown as Db;
}

describe("GET /health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadPersistedDevServerStatus.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("returns 200 with status ok", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", version: serverVersion });
  }, 15_000);

  it("returns 200 when the database probe succeeds", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    } as unknown as Db;
    const app = createApp(db);

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ status: "ok", version: serverVersion });
  });

  it("returns 503 when the database probe fails", async () => {
    const db = {
      execute: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    } as unknown as Db;
    const app = createApp(db);

    const res = await request(app).get("/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: "unhealthy",
      version: serverVersion,
      error: "database_unreachable"
    });
  });

  it("redacts detailed metadata for anonymous requests in authenticated mode", async () => {
    const devServerStatus = await import("../dev-server-status.js");
    vi.spyOn(devServerStatus, "readPersistedDevServerStatus").mockReturnValue(undefined);
    const { healthRoutes } = await import("../routes/health.js");
    const db = {
      execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        })),
      })),
    } as unknown as Db;
    const app = express();
    app.use((req, _res, next) => {
      (req as any).actor = { type: "none", source: "none" };
      next();
    });
    app.use(
      "/health",
      healthRoutes(db, {
        deploymentMode: "authenticated",
        deploymentExposure: "public",
        authReady: true,
        companyDeletionEnabled: false,
      }),
    );

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      deploymentMode: "authenticated",
      deploymentExposure: "public",
      bootstrapStatus: "ready",
      bootstrapInviteActive: false,
    });
  });

  it("redacts detailed metadata when authenticated mode is reached without auth middleware", async () => {
    const devServerStatus = await import("../dev-server-status.js");
    vi.spyOn(devServerStatus, "readPersistedDevServerStatus").mockReturnValue(undefined);
    const { healthRoutes } = await import("../routes/health.js");
    const db = {
      execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        })),
      })),
    } as unknown as Db;
    const app = express();
    app.use(
      "/health",
      healthRoutes(db, {
        deploymentMode: "authenticated",
        deploymentExposure: "public",
        authReady: true,
        companyDeletionEnabled: false,
      }),
    );

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      deploymentMode: "authenticated",
      deploymentExposure: "public",
      bootstrapStatus: "ready",
      bootstrapInviteActive: false,
    });
  });

  it("keeps detailed metadata for authenticated requests in authenticated mode", async () => {
    const devServerStatus = await import("../dev-server-status.js");
    vi.spyOn(devServerStatus, "readPersistedDevServerStatus").mockReturnValue(undefined);
    const { healthRoutes } = await import("../routes/health.js");
    const db = {
      execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        })),
      })),
    } as unknown as Db;
    const app = express();
    app.use((req, _res, next) => {
      (req as any).actor = { type: "board", userId: "user-1", source: "session" };
      next();
    });
    app.use(
      "/health",
      healthRoutes(db, {
        deploymentMode: "authenticated",
        deploymentExposure: "public",
        authReady: true,
        companyDeletionEnabled: false,
      }),
    );

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      version: serverVersion,
      deploymentMode: "authenticated",
      deploymentExposure: "public",
      authReady: true,
      bootstrapStatus: "ready",
      bootstrapInviteActive: false,
      features: {
        companyDeletionEnabled: false,
      },
    });
  });
});

describe("GET /health/instance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadPersistedDevServerStatus.mockReturnValue(undefined);
    mockAssertCompanyAccess.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with verdict healthy when DB probe succeeds (no companyId)", async () => {
    const db = mockDb();
    const app = createApp(db);

    const res = await request(app).get("/health/instance");

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe("healthy");
    expect(res.body.api).toMatchObject({
      reachable: true,
      status: "ok",
    });
    expect(res.body.agents).toBeNull();
    expect(res.body.recentErrors).toBeNull();
    expect(res.body.checkedAt).toEqual(expect.any(String));
  });

  it("returns 503 with verdict unhealthy when DB probe fails", async () => {
    const db = {
      execute: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
      select: vi.fn(),
    } as unknown as Db;
    const app = createApp(db);

    const res = await request(app).get("/health/instance");

    expect(res.status).toBe(503);
    expect(res.body.verdict).toBe("unhealthy");
    expect(res.body.api).toEqual({ reachable: false, error: "database_unreachable" });
  });

  it("returns 503 with verdict unhealthy when no db is available", async () => {
    const app = createApp();

    const res = await request(app).get("/health/instance");

    expect(res.status).toBe(503);
    expect(res.body.verdict).toBe("unhealthy");
    expect(res.body.api).toEqual({ reachable: false, error: "no_database_available" });
  });

  it("includes bootstrap status when deployment mode is authenticated (ready)", async () => {
    const db = mockDb([
      { instanceUserRoles: [{ count: 1 }] },
    ]);
    const app = express();
    app.use((req, _res, next) => {
      (req as any).actor = { type: "board", userId: "user-1", source: "session" };
      next();
    });
    app.use(
      "/health",
      healthRoutes(db, {
        deploymentMode: "authenticated",
        deploymentExposure: "private",
        authReady: true,
        companyDeletionEnabled: true,
      }),
    );

    const res = await request(app).get("/health/instance");

    expect(res.status).toBe(200);
    expect(res.body.api.bootstrapStatus).toBe("ready");
    expect(res.body.verdict).toBe("healthy");
  });

  it("returns degraded when bootstrap is pending", async () => {
    const db = mockDb([
      { instanceUserRoles: [{ count: 0 }] },
      // no invites table needed — select for bootstrapInviteActive not triggered when bootstrapStatus is pending
    ]);
    const app = express();
    app.use((req, _res, next) => {
      (req as any).actor = { type: "board", userId: "user-1", source: "session" };
      next();
    });
    app.use(
      "/health",
      healthRoutes(db, {
        deploymentMode: "authenticated",
        deploymentExposure: "private",
        authReady: true,
        companyDeletionEnabled: true,
      }),
    );

    const res = await request(app).get("/health/instance");

    expect(res.status).toBe(200);
    expect(res.body.api.bootstrapStatus).toBe("bootstrap_pending");
    expect(res.body.verdict).toBe("degraded");
  });

  it("returns agent summary and recent errors when companyId is provided", async () => {
    const db = mockDb([
      // 1st select: bootstrap (instanceUserRoles) — not called in local_trusted mode
      // In local_trusted mode, bootstrapStatus is always "ready" and no select is made for it
      // 1st select: agent statuses
      { agents: [
        { status: "active" },
        { status: "active" },
        { status: "active" },
      ]},
      // 2nd select: heartbeat runs
      { heartbeatRuns: [
        {
          id: "run-1", agentId: "agent-1", status: "completed",
          exitCode: 0, errorCode: null, error: null,
          startedAt: new Date().toISOString(),
        },
      ]},
    ]);
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=test-company");

    expect(res.status).toBe(200);
    expect(res.body.agents).toEqual({
      total: 3,
      byStatus: { active: 3 },
    });
    expect(res.body.recentErrors).toMatchObject({
      runsInWindow: 1,
      failedCount: 0,
    });
    expect(res.body.verdict).toBe("healthy");
  });

  it("returns degraded when paused agents exist", async () => {
    const db = mockDb([
      { agents: [
        { status: "active" },
        { status: "paused" },
        { status: "paused" },
      ]},
      { heartbeatRuns: [] },
    ]);
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=test-company");

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe("degraded");
    expect(res.body.agents.byStatus).toMatchObject({ active: 1, paused: 2 });
  });

  it("returns degraded when recent run failures exist", async () => {
    const db = mockDb([
      { agents: [{ status: "active" }] },
      { heartbeatRuns: [
        {
          id: "run-1", agentId: "agent-1", status: "failed",
          exitCode: 1, errorCode: "E_TIMEOUT", error: "Heartbeat timed out",
          startedAt: new Date().toISOString(),
        },
      ]},
    ]);
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=test-company");

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe("degraded");
    expect(res.body.recentErrors).toMatchObject({
      runsInWindow: 1,
      failedCount: 1,
      cancelledCount: 0,
    });
    expect(res.body.recentErrors.failures).toHaveLength(1);
    expect(res.body.recentErrors.failures[0]).toMatchObject({
      id: "run-1",
      status: "failed",
      exitCode: 1,
      errorCode: "E_TIMEOUT",
    });
  });

  it("excludes cancelled runs from failure count", async () => {
    const db = mockDb([
      { agents: [{ status: "active" }] },
      { heartbeatRuns: [
        {
          id: "run-1", agentId: "agent-1", status: "cancelled",
          exitCode: 0, errorCode: "RUNTIME_RESET",
          error: "Task reassigned during checkout",
          startedAt: new Date().toISOString(),
        },
        {
          id: "run-2", agentId: "agent-2", status: "completed",
          exitCode: 0, errorCode: null, error: null,
          startedAt: new Date().toISOString(),
        },
      ]},
    ]);
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=test-company");

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe("healthy");
    expect(res.body.recentErrors).toMatchObject({
      runsInWindow: 2,
      cancelledCount: 1,
      failedCount: 0,
    });
    expect(res.body.recentErrors.failures).toHaveLength(0);
  });

  it("returns 403 when company access is denied", async () => {
    mockAssertCompanyAccess.mockImplementation(() => {
      throw Object.assign(new Error("forbidden"), { statusCode: 403 });
    });
    const db = mockDb();
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=other-company");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("company_access_denied");
    expect(res.body.companyId).toBe("other-company");
  });

  it("redacts server version for anonymous requests in authenticated mode", async () => {
    const db = mockDb([
      { instanceUserRoles: [{ count: 1 }] },
    ]);
    const app = express();
    app.use((req, _res, next) => {
      (req as any).actor = { type: "none", source: "none" };
      next();
    });
    app.use(
      "/health",
      healthRoutes(db, {
        deploymentMode: "authenticated",
        deploymentExposure: "public",
        authReady: true,
        companyDeletionEnabled: false,
      }),
    );

    const res = await request(app).get("/health/instance");

    expect(res.status).toBe(200);
    expect(res.body.api.version).toBeUndefined();
    expect(res.body.api.status).toBe("ok");
  });

  it("includes server version for board requests in authenticated mode", async () => {
    const db = mockDb([
      { instanceUserRoles: [{ count: 1 }] },
    ]);
    const app = express();
    app.use((req, _res, next) => {
      (req as any).actor = { type: "board", userId: "user-1", source: "session" };
      next();
    });
    app.use(
      "/health",
      healthRoutes(db, {
        deploymentMode: "authenticated",
        deploymentExposure: "public",
        authReady: true,
        companyDeletionEnabled: false,
      }),
    );

    const res = await request(app).get("/health/instance");

    expect(res.status).toBe(200);
    expect(res.body.api.version).toBe(serverVersion);
  });

  it("respects custom windowHours parameter", async () => {
    const db = mockDb([
      { agents: [{ status: "active" }] },
      { heartbeatRuns: [] },
    ]);
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=test-company&windowHours=48");

    expect(res.status).toBe(200);
    expect(res.body.windowHours).toBe(48);
  });

  it("clamps windowHours to minimum 1", async () => {
    const db = mockDb([
      { agents: [{ status: "active" }] },
      { heartbeatRuns: [] },
    ]);
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=test-company&windowHours=0");

    expect(res.status).toBe(200);
    expect(res.body.windowHours).toBe(1);
  });

  it("defaults windowHours to 24 when not provided", async () => {
    const db = mockDb([
      { agents: [{ status: "active" }] },
      { heartbeatRuns: [] },
    ]);
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=test-company");

    expect(res.status).toBe(200);
    expect(res.body.windowHours).toBe(24);
  });

  it("handles agent query errors gracefully", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockRejectedValue(new Error("agents table unavailable")),
        })),
      })),
    } as unknown as Db;
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=test-company");

    expect(res.status).toBe(200);
    expect(res.body.agents).toEqual({ error: "agents table unavailable" });
    expect(res.body.verdict).toBe("healthy");
  });

  it("handles heartbeat run query errors gracefully", async () => {
    let call = 0;
    const db = {
      execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      select: vi.fn(() => {
        call += 1;
        if (call === 1) {
          // agents query succeeds
          return {
            from: vi.fn(() => ({
              where: vi.fn().mockResolvedValue([{ status: "active" }]),
            })),
          };
        }
        // heartbeat runs query fails
        return {
          from: vi.fn(() => ({
            where: vi.fn().mockImplementation(() => {
              throw new Error("runs table unavailable");
            }),
          })),
        };
      }),
    } as unknown as Db;
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=test-company");

    expect(res.status).toBe(200);
    expect(res.body.agents).toEqual({ total: 1, byStatus: { active: 1 } });
    expect(res.body.recentErrors).toEqual({ error: "runs table unavailable" });
    expect(res.body.verdict).toBe("healthy");
  });

  it("limits failures array to 10 entries", async () => {
    const failures = Array.from({ length: 15 }, (_, i) => ({
      id: `run-${i + 1}`, agentId: `agent-${i + 1}`, status: "failed",
      exitCode: 1, errorCode: "E_ERR", error: `error ${i + 1}`,
      startedAt: new Date().toISOString(),
    }));
    const db = mockDb([
      { agents: [{ status: "active" }] },
      { heartbeatRuns: failures },
    ]);
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=test-company");

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe("degraded");
    expect(res.body.recentErrors.failedCount).toBe(15);
    expect(res.body.recentErrors.failures).toHaveLength(10);
  });

  it("truncates long error messages to 200 chars", async () => {
    const longError = "x".repeat(500);
    const db = mockDb([
      { agents: [{ status: "active" }] },
      { heartbeatRuns: [{
        id: "run-1", agentId: "agent-1", status: "failed",
        exitCode: 1, errorCode: null, error: longError,
        startedAt: new Date().toISOString(),
      }]},
    ]);
    const app = createApp(db);

    const res = await request(app).get("/health/instance?companyId=test-company");

    expect(res.status).toBe(200);
    expect(res.body.recentErrors.failures[0].error.length).toBe(200);
  });
});
