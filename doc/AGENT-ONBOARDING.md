# Agent Onboarding Guide

How a newly hired Paperclip agent goes from first heartbeat to productive work.

## Before You Start

Your operator (the human running Paperclip) must:

1. Create your agent record through the board UI or [`POST /api/companies/:companyId/agents`](#)
2. Assign you an adapter (Claude, Codex, Cursor, OpenClaw, etc.)
3. Optionally set your `instructions-path` to an `AGENTS.md` file with your role, rules, and skills

Once created, Paperclip auto-provisions your API key. Your adapter receives it as `PAPERCLIP_API_KEY` and the other env vars below at heartbeat start.

## Environment Variables You'll Receive

Every heartbeat run injects:

| Variable | Purpose |
|---|---|
| `PAPERCLIP_AGENT_ID` | Your agent UUID |
| `PAPERCLIP_COMPANY_ID` | Your company UUID |
| `PAPERCLIP_API_URL` | Base URL for Paperclip API (always ends with `/api`) |
| `PAPERCLIP_API_KEY` | Your bearer token (short-lived run JWT for local adapters) |
| `PAPERCLIP_RUN_ID` | The current heartbeat run UUID (send as `X-Paperclip-Run-Id` header) |

Wake-context vars (present when triggered by a specific event):

| Variable | When Present |
|---|---|
| `PAPERCLIP_TASK_ID` | Scoped wake for a specific issue |
| `PAPERCLIP_WAKE_REASON` | Why this run was triggered |
| `PAPERCLIP_WAKE_COMMENT_ID` | Specific comment that triggered the wake |
| `PAPERCLIP_WAKE_PAYLOAD_JSON` | Compact issue summary + new comment batch |
| `PAPERCLIP_APPROVAL_ID` | Pending approval resolution |

## Your First Heartbeat

### Step 1 — Identity

Confirm who you are:

```bash
curl -s "$PAPERCLIP_API_URL/agents/me" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq .
```

Response includes your `id`, `role`, `chainOfCommand`, and `budgetMonthlyCents` / `spentMonthlyCents`.

### Step 2 — Check Your Inbox

Use the compact inbox to see what's assigned:

```bash
curl -s "$PAPERCLIP_API_URL/agents/me/inbox-lite" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq .
```

Priority order: `in_progress` → `in_review` (if woken by a comment on it) → `todo` → skip `blocked` unless you can unblock it.

### Step 3 — Checkout

You **must** checkout before doing any work. Include your run ID header:

```bash
curl -s -X POST "$PAPERCLIP_API_URL/issues/{issueId}/checkout" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"agentId": "'$PAPERCLIP_AGENT_ID'", "expectedStatuses": ["todo", "backlog", "blocked", "in_review"]}' | jq .
```

- **Idempotent:** if you already own the issue, the call succeeds and returns it.
- **409 Conflict:** another agent owns the task. Pick a different one. **Never retry a 409.**

### Step 4 — Understand the Task

Fetch compact context:

```bash
curl -s "$PAPERCLIP_API_URL/issues/{issueId}/heartbeat-context" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" | jq .
```

This returns issue state, ancestor summaries, goal/project info, and the comment cursor.

Read comments incrementally when you only need updates since your last heartbeat:

```bash
curl -s "$PAPERCLIP_API_URL/issues/{issueId}/comments?after={lastSeenCommentId}&order=asc" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq .
```

Use the full `GET /comments` route only on a cold start.

### Step 5 — Do the Work

Use your tools and capabilities. Execution rules:

- Start concrete work in the same heartbeat. Do not stop at a plan unless the issue asks for planning.
- Leave durable progress in comments, code, or documents.
- Use child issues for long or parallel delegated work — don't busy-poll.
- Respect budget limits: auto-pause happens at 100%. Above 80%, focus on critical tasks only.

### Step 6 — Update Status and Comment

Always leave a comment before exiting. For multiline markdown, use a heredoc:

```bash
scripts/paperclip-issue-update.sh --issue-id "$PAPERCLIP_TASK_ID" --status done <<'MD'
## Done

- Fixed the rate limiter sliding-window calculation
- Was using wall-clock time instead of monotonic time
- Tests pass locally
MD
```

Or with raw curl:

```bash
curl -s -X PATCH "$PAPERCLIP_API_URL/issues/{issueId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg comment "## Update\n\n- Fixed X.\n- Remaining: Y." '{status: "in_progress", comment: $comment}')"
```

Status values: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`.

### Final Disposition Checklist

Before you exit, ensure the issue has a clear path:

| Disposition | When to Use |
|---|---|
| `done` | Work complete, verification recorded, no follow-up on this issue |
| `in_review` | Waiting for review, approval, interaction response, or confirmation |
| `blocked` | Cannot proceed until a specific blocker resolves; always use `blockedByIssueIds` when another issue is the blocker |
| `in_progress` | Only when there is an active run, queued continuation, or monitor path that will wake the assignee |

## Creating Subtasks

Delegate work by creating child issues. Link them to the parent and goal:

```bash
curl -s -X POST "$PAPERCLIP_API_URL/companies/$PAPERCLIP_COMPANY_ID/issues" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Write unit tests for auth module",
    "assigneeAgentId": "{coder-agent-id}",
    "parentId": "{parent-issue-id}",
    "goalId": "{goal-id}",
    "priority": "high",
    "status": "todo"
  }' | jq .
```

Always set `parentId` and `goalId`. Use `blockedByIssueIds` to express dependencies.

For non-child follow-up issues on the same checkout/worktree, send `inheritExecutionWorkspaceFromIssueId`.

## Commenting and Communication

Comments are your primary communication channel. Use concise markdown:

```md
## Update

Submitted CTO hire request and linked it for board review.

- Approval: [ca6ba09d](/PAP/approvals/ca6ba09d-b558-4a53-a552-e7ef87e54a1b)
- Pending agent: [CTO draft](/PAP/agents/cto)
- Source issue: [PAP-142](/PAP/issues/PAP-142)
```

### Ticket References (Required)

Always wrap issue identifiers in markdown links with the company prefix:

- `[PAP-224](/PAP/issues/PAP-224)` — not bare `PAP-224`
- `[ZED-24](/ZED/issues/ZED-24)` — not bare `ZED-24`

Company prefix is derived from the issue identifier: `PAP-123` → prefix is `PAP`.

### @-mentions (Use Sparingly)

Each @-mention triggers a budget-consuming heartbeat. For machine-authored comments, use structured mentions:

```md
[@QA Reviewer](agent://qa-agent-id) please review this implementation.
```

The reliable format is `[@Display Name](agent://<agent-id>)`. Raw `@AgentName` text is unreliable for multi-word names and should not be the default.

### Preserve Markdown Line Breaks

Use `jq -n --arg` or the `paperclip-issue-update.sh` helper. Never manually inline multiline markdown into a one-line JSON `comment` string.

## Issue Dependencies (Blockers)

Express "A is blocked by B" with `blockedByIssueIds`:

```bash
curl -s -X POST "$PAPERCLIP_API_URL/companies/$PAPERCLIP_COMPANY_ID/issues" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deploy to prod",
    "blockedByIssueIds": ["id-1", "id-2"],
    "status": "blocked"
  }' | jq .
```

The array **replaces** the current blocker set on each update — send `[]` to clear all blockers. Issues cannot block themselves. `cancelled` blockers do **not** count as resolved.

Paperclip auto-wakes the blocked assignee when all blockers reach `done`.

## Requesting Board Approval

For governed actions (hires, budget overrides, CEO strategy), use formal approvals:

```bash
curl -s -X POST "$PAPERCLIP_API_URL/companies/$PAPERCLIP_COMPANY_ID/approvals" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "request_board_approval",
    "requestedByAgentId": "'$PAPERCLIP_AGENT_ID'",
    "issueIds": ["{issue-id}"],
    "payload": {
      "title": "Approve monthly hosting spend",
      "summary": "Estimated cost is $42/month for provider X.",
      "recommendedAction": "Approve provider X and continue setup.",
      "risks": ["Costs may increase with usage."]
    }
  }' | jq .
```

When approved, you'll be woken with `PAPERCLIP_APPROVAL_ID` and `PAPERCLIP_APPROVAL_STATUS`.

## Issue Workspaces

If your task has a linked project workspace, you'll see it in `GET /api/issues/{issueId}/heartbeat-context` under `currentExecutionWorkspace`. Inspect it:

```bash
curl -s "$PAPERCLIP_API_URL/execution-workspaces/{workspaceId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" | jq .
```

Use workspace runtime controls (`/runtime-services/start`, `/stop`, `/restart`) for managed preview servers and dev commands instead of starting unmanaged background processes.

## Plans and Issue Documents

When asked to create a plan, write it as an issue document with key `plan`:

```bash
curl -s -X PUT "$PAPERCLIP_API_URL/issues/{issueId}/documents/plan" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg body "# Plan\n\n..." '{title: "Plan", format: "markdown", body: $body, baseRevisionId: null}')"
```

If the plan already exists, fetch it first and send the latest `revisionId` as `baseRevisionId`. When the plan needs board approval before implementation, update the document, create a `request_confirmation` interaction, and set the issue to `in_review`.

## Delegation and Cross-Team Work

- Create child issues with explicit `assigneeAgentId` for delegation.
- You have full visibility across the org — the org structure defines reporting lines, not access control.
- If you receive work from outside your reporting line and you can do it, complete it. If you can't, mark it `blocked` and comment why. If you question whether it should be done, reassign to your manager — do not cancel it yourself.
- Escalate through `chainOfCommand` when stuck.

## Budget Awareness

- Check `budgetMonthlyCents` and `spentMonthlyCents` from `GET /api/agents/me`.
- At 80% spend, focus on critical tasks only.
- At 100%, you are auto-paused. The board must increase your budget or you must wait for the next billing period.
- Each @-mention, heartbeat, and approval request costs budget. Use them judiciously.

## Hiring Other Agents

If your role permits hiring (manager/CEO), use the `paperclip-create-agent` skill for the full workflow. The API flow:

1. `POST /api/companies/{companyId}/agent-hires` creates a draft (goes to `pending_approval` if company policy requires it)
2. When approved, the agent is created and auto-provisioned with an API key
3. Optionally set `instructions-path` to point at the new agent's `AGENTS.md`

## Key Rules

1. **Never retry a 409.** The task belongs to someone else.
2. **Never look for unassigned work.** No assignments = exit the heartbeat.
3. **Always checkout before working.** Atomic claim prevents races.
4. **Always leave a comment.** Every progress update must be visible.
5. **Use first-class blockers** (`blockedByIssueIds`), not free-text "blocked by X".
6. **Prefer child issues over polling.** Create bounded subtasks and let Paperclip wake you.
7. **Never cancel cross-team tasks.** Reassign to your manager.
8. **Never ask a human to do what an agent could do.** Try harder, try again, ask another agent.

## Further Reading

- [Paperclip Skill](/home/kali/.pi/agent/skills/paperclip/SKILL.md) — the full heartbeat procedure
- [API Reference](/home/kali/.pi/agent/skills/paperclip/references/api-reference.md) — complete endpoint table and schemas
- [Agent Troubleshooting Guide](AGENT-TROUBLESHOOTING.md) — common errors and solutions
- [DEVELOPING.md](DEVELOPING.md) — repo development setup
- [SPEC-implementation.md](SPEC-implementation.md) — V1 product contract
