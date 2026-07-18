#!/usr/bin/env node
/**
 * Paperclip instance health check.
 *
 * Reports a single-glance operational summary:
 *   - API + database reachability (via /api/health)
 *   - Server version, deployment mode/exposure, bootstrap status
 *   - Agent counts by status (active / paused / etc.) for a company
 *   - Recent heartbeat-run errors (failed / non-zero exit) in a lookback window
 *
 * Usage:
 *   node scripts/health-check.mjs [--company <id>] [--base <url>] [--window <hours>] [--json]
 *
 * Environment fallbacks:
 *   PAPERCLIP_API_BASE   (default http://127.0.0.1:3100/api)
 *   PAPERCLIP_COMPANY_ID (company scope for agent/run checks; optional)
 *
 * Exit codes:
 *   0  healthy
 *   1  degraded (recent run errors or paused agents)
 *   2  unhealthy (API/DB unreachable)
 */

const args = process.argv.slice(2);
function argVal(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const asJson = args.includes("--json");
const base = (argVal("--base", process.env.PAPERCLIP_API_BASE) || "http://127.0.0.1:3100/api").replace(/\/$/, "");
const companyId = argVal("--company", process.env.PAPERCLIP_COMPANY_ID) || null;
const windowHours = Number(argVal("--window", "24")) || 24;

async function getJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  base,
  companyId,
  windowHours,
  api: null,
  agents: null,
  recentErrors: null,
  verdict: "healthy",
};

// 1. API + DB health
const health = await getJson(`${base}/health`);
if (!health.ok || !health.body) {
  report.api = { reachable: false, error: health.error || `status ${health.status}` };
  report.verdict = "unhealthy";
} else {
  const h = health.body;
  report.api = {
    reachable: true,
    status: h.status,
    version: h.version ?? null,
    deploymentMode: h.deploymentMode ?? null,
    deploymentExposure: h.deploymentExposure ?? null,
    bootstrapStatus: h.bootstrapStatus ?? null,
  };
  if (h.status !== "ok") report.verdict = "unhealthy";
}

// 2 & 3 require a company scope
if (companyId && report.verdict !== "unhealthy") {
  // Agent counts by status
  const agents = await getJson(`${base}/companies/${companyId}/agents`);
  if (agents.ok && Array.isArray(agents.body)) {
    const byStatus = {};
    for (const a of agents.body) {
      const s = a.status || "unknown";
      byStatus[s] = (byStatus[s] || 0) + 1;
    }
    const paused = agents.body.filter((a) => a.status === "paused");
    report.agents = {
      total: agents.body.length,
      byStatus,
      paused: paused.map((a) => ({ name: a.name, reason: a.pauseReason ?? null })),
    };
    if (paused.length > 0 && report.verdict === "healthy") report.verdict = "degraded";
  } else {
    report.agents = { error: agents.error || `status ${agents.status}` };
  }

  // Recent heartbeat-run errors
  const runs = await getJson(`${base}/companies/${companyId}/heartbeat-runs?limit=100`);
  if (runs.ok && Array.isArray(runs.body)) {
    const cutoff = Date.now() - windowHours * 3600 * 1000;
    const inWindow = runs.body.filter((r) => {
      const t = Date.parse(r.startedAt || r.createdAt || "");
      return Number.isFinite(t) && t >= cutoff;
    });
    // Genuine failures only. "cancelled" runs are benign lifecycle events
    // (assignee changed, issue reached terminal status) — they carry an
    // errorCode too, so filter strictly on failure statuses.
    const failed = inWindow.filter(
      (r) => r.status === "failed" || r.status === "timed_out" || r.status === "crashed",
    );
    const cancelled = inWindow.filter((r) => r.status === "cancelled").length;
    report.recentErrors = {
      runsInWindow: inWindow.length,
      cancelledCount: cancelled,
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
    if (failed.length > 0 && report.verdict === "healthy") report.verdict = "degraded";
  } else {
    report.recentErrors = { error: runs.error || `status ${runs.status}` };
  }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const line = (s) => console.log(s);
  const badge = report.verdict === "healthy" ? "OK" : report.verdict === "degraded" ? "WARN" : "FAIL";
  line(`Paperclip health: [${badge}] ${report.verdict.toUpperCase()}  (${report.checkedAt})`);
  line(`  API: ${base}`);
  if (report.api?.reachable) {
    line(`    reachable=yes status=${report.api.status} version=${report.api.version}`);
    line(`    mode=${report.api.deploymentMode} exposure=${report.api.deploymentExposure} bootstrap=${report.api.bootstrapStatus}`);
  } else {
    line(`    reachable=NO error=${report.api?.error}`);
  }
  if (report.agents) {
    if (report.agents.error) {
      line(`  Agents: error=${report.agents.error}`);
    } else {
      const statuses = Object.entries(report.agents.byStatus).map(([k, v]) => `${k}=${v}`).join(" ");
      line(`  Agents: total=${report.agents.total}  ${statuses}`);
      for (const p of report.agents.paused) line(`    PAUSED: ${p.name} (${p.reason || "no reason"})`);
    }
  } else if (companyId == null) {
    line(`  Agents: skipped (no --company/PAPERCLIP_COMPANY_ID)`);
  }
  if (report.recentErrors) {
    if (report.recentErrors.error) {
      line(`  Runs: error=${report.recentErrors.error}`);
    } else {
      line(`  Runs (last ${windowHours}h): ${report.recentErrors.runsInWindow} total, ${report.recentErrors.failedCount} failed, ${report.recentErrors.cancelledCount} cancelled (benign)`);
      for (const f of report.recentErrors.failures) {
        line(`    FAIL run=${f.id.slice(0, 8)} agent=${(f.agentId || "?").slice(0, 8)} status=${f.status} exit=${f.exitCode} ${f.errorCode || ""} ${f.error || ""}`.trimEnd());
      }
    }
  }
}

process.exit(report.verdict === "unhealthy" ? 2 : report.verdict === "degraded" ? 1 : 0);
