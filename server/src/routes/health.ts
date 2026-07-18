import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { and, count, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import { agents as agentsTable, heartbeatRuns, instanceUserRoles, invites } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import { readPersistedDevServerStatus, toDevServerHealthStatus, writeDevServerRestartRequest } from "../dev-server-status.js";
import { logger } from "../middleware/logger.js";
import { instanceSettingsService } from "../services/instance-settings.js";
import { serverVersion } from "../version.js";
import { assertCompanyAccess } from "./authz.js";

function shouldExposeFullHealthDetails(
  actorType: "none" | "board" | "agent" | null | undefined,
  deploymentMode: DeploymentMode,
) {
  if (deploymentMode !== "authenticated") return true;
  return actorType === "board" || actorType === "agent";
}

function hasDevServerStatusToken(providedToken: string | undefined) {
  const expectedToken = process.env.PAPERCLIP_DEV_SERVER_STATUS_TOKEN?.trim();
  const token = providedToken?.trim();
  if (!expectedToken || !token) return false;

  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function healthRoutes(
  db?: Db,
  opts: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    authReady: boolean;
    companyDeletionEnabled: boolean;
  } = {
    deploymentMode: "local_trusted",
    deploymentExposure: "private",
    authReady: true,
    companyDeletionEnabled: true,
  },
) {
  const router = Router();

  router.post("/dev-server/restart", async (req, res) => {
    const actorType = "actor" in req ? req.actor?.type : null;
    if (opts.deploymentMode === "authenticated" && actorType !== "board") {
      res.status(403).json({ error: "board_access_required" });
      return;
    }

    const persistedDevServerStatus = readPersistedDevServerStatus();
    if (!persistedDevServerStatus) {
      res.status(404).json({ error: "dev_server_supervisor_unavailable" });
      return;
    }

    const restartRequired =
      persistedDevServerStatus.dirty ||
      persistedDevServerStatus.changedPathCount > 0 ||
      persistedDevServerStatus.pendingMigrations.length > 0;
    if (!restartRequired) {
      res.status(409).json({ error: "restart_not_required" });
      return;
    }

    const written = writeDevServerRestartRequest({
      requestedAt: new Date().toISOString(),
      reason: "manual_restart_now",
    });
    if (!written) {
      res.status(404).json({ error: "dev_server_supervisor_unavailable" });
      return;
    }

    res.status(202).json({ status: "restart_requested" });
  });

  router.get("/", async (req, res) => {
    const actorType = "actor" in req ? req.actor?.type : null;
    const exposeFullDetails = shouldExposeFullHealthDetails(
      actorType,
      opts.deploymentMode,
    );
    const exposeDevServerDetails =
      exposeFullDetails || hasDevServerStatusToken(req.get("x-paperclip-dev-server-status-token"));

    if (!db) {
      res.json(
        exposeFullDetails
          ? { status: "ok", version: serverVersion }
          : { status: "ok", deploymentMode: opts.deploymentMode },
      );
      return;
    }

    try {
      await db.execute(sql`SELECT 1`);
    } catch (error) {
      logger.warn({ err: error }, "Health check database probe failed");
      res.status(503).json({
        status: "unhealthy",
        version: serverVersion,
        error: "database_unreachable"
      });
      return;
    }

    let bootstrapStatus: "ready" | "bootstrap_pending" = "ready";
    let bootstrapInviteActive = false;
    if (opts.deploymentMode === "authenticated") {
      const roleCount = await db
        .select({ count: count() })
        .from(instanceUserRoles)
        .where(sql`${instanceUserRoles.role} = 'instance_admin'`)
        .then((rows) => Number(rows[0]?.count ?? 0));
      bootstrapStatus = roleCount > 0 ? "ready" : "bootstrap_pending";

      if (bootstrapStatus === "bootstrap_pending") {
        const now = new Date();
        const inviteCount = await db
          .select({ count: count() })
          .from(invites)
          .where(
            and(
              eq(invites.inviteType, "bootstrap_ceo"),
              isNull(invites.revokedAt),
              isNull(invites.acceptedAt),
              gt(invites.expiresAt, now),
            ),
          )
          .then((rows) => Number(rows[0]?.count ?? 0));
        bootstrapInviteActive = inviteCount > 0;
      }
    }

    const persistedDevServerStatus = readPersistedDevServerStatus();
    let devServer: ReturnType<typeof toDevServerHealthStatus> | undefined;
    if (exposeDevServerDetails && persistedDevServerStatus && typeof (db as { select?: unknown }).select === "function") {
      const instanceSettings = instanceSettingsService(db);
      const experimentalSettings = await instanceSettings.getExperimental();
      const activeRunCount = await db
        .select({ count: count() })
        .from(heartbeatRuns)
        .where(inArray(heartbeatRuns.status, ["queued", "running"]))
        .then((rows) => Number(rows[0]?.count ?? 0));

      devServer = toDevServerHealthStatus(persistedDevServerStatus, {
        autoRestartEnabled: experimentalSettings.autoRestartDevServerWhenIdle ?? false,
        activeRunCount,
      });
    }

    if (!exposeFullDetails) {
      res.json({
        status: "ok",
        deploymentMode: opts.deploymentMode,
        deploymentExposure: opts.deploymentExposure,
        bootstrapStatus,
        bootstrapInviteActive,
        ...(devServer ? { devServer } : {}),
      });
      return;
    }

    res.json({
      status: "ok",
      version: serverVersion,
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      authReady: opts.authReady,
      bootstrapStatus,
      bootstrapInviteActive,
      features: {
        companyDeletionEnabled: opts.companyDeletionEnabled,
      },
      ...(devServer ? { devServer } : {}),
    });
  });

  // GET /api/health/instance — richer health-check mirroring scripts/health-check.mjs logic.
  // Accepts optional ?companyId=<id>&windowHours=<hours> (default 24).
  // When companyId is provided, includes agent counts by status and recent
  // heartbeat-run failure tallies, and computes an aggregated verdict
  // (healthy / degraded / unhealthy).
  router.get("/instance", async (req, res) => {
    const actorType = "actor" in req ? req.actor?.type : null;
    const exposeFullDetails = shouldExposeFullHealthDetails(actorType, opts.deploymentMode);

    const companyId = (req.query.companyId as string | undefined) ?? null;
    const windowHours = Math.max(1, Number(req.query.windowHours) || 24);

    const report: Record<string, unknown> = {
      checkedAt: new Date().toISOString(),
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      companyId,
      windowHours,
      api: null,
      agents: null,
      recentErrors: null,
      verdict: "healthy",
    };

    if (!db) {
      report.api = { reachable: false, error: "no_database_available" };
      report.verdict = "unhealthy";
      const statusCode = report.verdict === "unhealthy" ? 503 : 200;
      res.status(statusCode).json(report);
      return;
    }

    // 1. DB reachability probe
    try {
      await db.execute(sql`SELECT 1`);
      report.api = {
        reachable: true,
        status: "ok",
        version: exposeFullDetails ? serverVersion : undefined,
        deploymentMode: opts.deploymentMode,
        deploymentExposure: opts.deploymentExposure,
        bootstrapStatus: undefined as string | undefined,
      };
    } catch (error) {
      logger.warn({ err: error }, "Health check /instance database probe failed");
      report.api = { reachable: false, error: "database_unreachable" };
      report.verdict = "unhealthy";
      res.status(503).json(report);
      return;
    }

    // Resolve bootstrap status (same logic as GET /)
    let bootstrapStatus: "ready" | "bootstrap_pending" = "ready";
    if (opts.deploymentMode === "authenticated") {
      const roleCount = await db
        .select({ count: count() })
        .from(instanceUserRoles)
        .where(sql`${instanceUserRoles.role} = 'instance_admin'`)
        .then((rows) => Number(rows[0]?.count ?? 0));
      bootstrapStatus = roleCount > 0 ? "ready" : "bootstrap_pending";
    }
    (report.api as Record<string, unknown>).bootstrapStatus = bootstrapStatus;
    if (bootstrapStatus !== "ready" && report.verdict === "healthy") {
      report.verdict = "degraded";
    }

    // 2 & 3 require company scope
    if (companyId && report.verdict !== "unhealthy") {
      try {
        assertCompanyAccess(req, companyId);
      } catch {
        res.status(403).json({ error: "company_access_denied", companyId });
        return;
      }

      // 2. Agent counts by status
      try {
        const agentRows = await db
          .select({ status: agentsTable.status })
          .from(agentsTable)
          .where(eq(agentsTable.companyId, companyId));

        const byStatus: Record<string, number> = {};
        for (const row of agentRows) {
          const s = row.status || "unknown";
          byStatus[s] = (byStatus[s] || 0) + 1;
        }
        report.agents = {
          total: agentRows.length,
          byStatus,
        };
        if ((byStatus.paused ?? 0) > 0 && report.verdict === "healthy") {
          report.verdict = "degraded";
        }
      } catch (err) {
        report.agents = { error: String((err as Error)?.message || err) };
      }

      // 3. Recent heartbeat-run errors
      try {
        const cutoff = new Date(Date.now() - windowHours * 3600 * 1000);
        const runRows = await db
          .select({
            id: heartbeatRuns.id,
            agentId: heartbeatRuns.agentId,
            status: heartbeatRuns.status,
            exitCode: heartbeatRuns.exitCode,
            errorCode: heartbeatRuns.errorCode,
            error: heartbeatRuns.error,
            startedAt: heartbeatRuns.startedAt,
          })
          .from(heartbeatRuns)
          .where(
            and(
              eq(heartbeatRuns.companyId, companyId),
              gte(heartbeatRuns.startedAt, cutoff),
            ),
          )
          .orderBy(sql`${heartbeatRuns.startedAt} DESC`)
          .limit(200);

        // Genuine failures only — "cancelled" runs are benign lifecycle events.
        const failed = runRows.filter(
          (r) => r.status === "failed" || r.status === "timed_out" || r.status === "crashed",
        );
        const cancelledCount = runRows.filter((r) => r.status === "cancelled").length;

        report.recentErrors = {
          runsInWindow: runRows.length,
          cancelledCount,
          failedCount: failed.length,
          failures: failed.slice(0, 10).map((r) => ({
            id: r.id,
            agentId: r.agentId,
            status: r.status,
            exitCode: r.exitCode ?? null,
            errorCode: r.errorCode ?? null,
            error: r.error ? String(r.error).slice(0, 200) : null,
            startedAt: r.startedAt,
          })),
        };
        if (failed.length > 0 && report.verdict === "healthy") {
          report.verdict = "degraded";
        }
      } catch (err) {
        report.recentErrors = { error: String((err as Error)?.message || err) };
      }
    }

    const statusCode = report.verdict === "unhealthy" ? 503 : 200;
    res.status(statusCode).json(report);
  });

  return router;
}
