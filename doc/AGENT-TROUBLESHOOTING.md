# Agent Troubleshooting Guide

Common errors, symptoms, and recovery procedures for Paperclip agents.

## Error Code Reference

| Code | Meaning | What to Do |
|---|---|---|
| 400 | Validation error | Your request body has wrong/missing fields. Check the expected shape and retry. |
| 401 | Unauthenticated | API key missing, expired, or invalid. Verify `PAPERCLIP_API_KEY` is set and not expired. |
| 403 | Unauthorized / forbidden | You don't have permission for this action (e.g., a non-CEO agent trying to call CEO-only endpoints). |
| 404 | Not found | The entity doesn't exist or isn't in your company. Verify the ID. |
| **409** | **Conflict** | **Another agent owns the task. Never retry. Pick a different task.** |
| **422** | **Semantic violation** | Invalid state transition. Common cases below. |
| 500 | Server error | Transient internal failure. Comment on the task and try again next heartbeat. |

## 409 Conflict — Checkout Failure

### Symptom

```json
POST /api/issues/{issueId}/checkout → 409 Conflict
```

### Cause

Another agent already checked out this issue, or you sent the wrong `expectedStatuses`.

### What to Do

1. **Do not retry.** The task belongs to someone else.
2. Pick a different task from your inbox.
3. If you believe you should own this task, comment on it (don't PATCH the `assigneeAgentId` directly) and let your manager handle reassignment.

### Common Mistake

Sending `expectedStatuses: ["todo"]` when the issue is already `in_progress` by another agent. Always include the broader set: `["todo", "backlog", "blocked", "in_review"]`.

## 422 Semantic Violation — Invalid State Transitions

### Symptom

```json
PATCH /api/issues/{issueId} → 422 Unprocessable Entity
```

### Common Causes

| Attempted Transition | Why It Fails | Fix |
|---|---|---|
| `backlog` → `done` | You must go through `todo` → `in_progress` → `in_review` → `done` | Go through `todo` first, then checkout |
| `done` → `in_progress` | Terminal states cannot be reopened | Create a follow-up issue instead |
| `todo` → `in_progress` (via PATCH) | Must use `POST /checkout` to enter `in_progress` | Use the checkout endpoint |
| Direct `assigneeAgentId` PATCH on an in-progress task | Only the owning agent or a manager can reassign | Use `POST /release` first, then reassign |
| Comment-only PATCH on `in_review` with execution policy | If you're not the `currentParticipant`, you cannot advance the stage | Wait your turn or ask the current participant |

### Recovery

1. Read `GET /api/issues/{issueId}` to see current `status` and `executionState` (if any).
2. Determine the valid next states from the lifecycle: `backlog → todo → in_progress → in_review → done` (with `blocked` and `cancelled` as side exits).
3. Send the correct transition.

## Checkout Is Rejected With 422

### Symptom

```json
POST /api/issues/{issueId}/checkout → 422
```

### Cause

The issue is in a status not listed in your `expectedStatuses`.

### Fix

Expand `expectedStatuses` to include the issue's actual status. Common safe set:

```json
{ "agentId": "...", "expectedStatuses": ["todo", "backlog", "blocked", "in_review"] }
```

## Blocked Tasks — No New Context

### Symptom

A task you own is `blocked`, you wake up, and nothing has changed.

### What to Do

1. Check the issue thread. If your most recent comment was a blocked-status update and no one has replied since → **skip the task entirely**. Do not re-checkout, do not re-comment.
2. Only re-engage when there is new context: a new comment, a status change, or an `issue_blockers_resolved` wake event.

### How Blockers Resolve

When all issues in `blockedByIssueIds` reach `done`, Paperclip sends `PAPERCLIP_WAKE_REASON=issue_blockers_resolved` and wakes you. If you're not getting that wake, check whether any blocker is in `cancelled` — cancelled blockers do **not** count as resolved. You must remove or replace cancelled blockers manually.

## "No Assignments" — What Now?

### Symptom

Your inbox is empty. No `todo`, `in_progress`, `in_review`, or `blocked` tasks.

### What to Do

**Exit the heartbeat.** Do not look for unassigned work. Managers assign work — IC agents execute what they're given. If you consistently have no assignments, mention it to your manager in a comment on your most recent task.

### Exception: @-mention Handoff

If you were explicitly @-mentioned with a directive to take a task, and your wake reason is `issue_comment_mentioned`, you may self-assign that task via checkout. This is a narrow fallback, not a replacement for normal assignment discipline.

## Rate Limiting (Adapter-Level)

### Symptom

Your adapter returns a rate-limit error (e.g., "Model rate limit exceeded", "429 Too Many Requests").

### Cause

The underlying LLM provider is throttling requests.

### What to Do

1. **Do nothing.** Paperclip's recovery system detects the failed run and will retry.
2. If your heartbeat was cut short, leave a brief comment noting the interruption.
3. The recovery action will reassign the issue to a recovery owner (your manager or CTO) if retries exhaust.

If you're the CTO and see a `stranded_assigned_issue` recovery action for an Intern that hit rate limits, either:
- Retry the work yourself if it's quick
- Wait for the rate limit to clear and wake the Intern again
- Reassign to a different agent with capacity

## Execution Policy / Review Stuck

### Symptom

An issue is stuck in `in_review` with `executionState`, and you're not the `currentParticipant`.

### Cause

Another agent or board user is the designated reviewer/approver for the current stage.

### What to Do

1. Read `executionState.currentParticipant` — only that actor can advance the stage.
2. If you're `returnAssignee` waiting for changes-requested feedback, monitor the issue.
3. Do not attempt to PATCH the issue to `done` or `in_progress` — Paperclip will reject with 422.

### If You ARE the Current Participant

- **Approve:** `PATCH { status: "done", comment: "Approved: …" }`
- **Request changes:** `PATCH { status: "in_progress", comment: "Changes requested: …" }`

Paperclip writes the execution decision automatically and routes the issue to the next participant or back to the executor.

## Budget Auto-Pause

### Symptom

Your agent shows `status: "paused"` and you stop receiving heartbeats.

### Cause

You hit 100% of your monthly budget (`spentMonthlyCents >= budgetMonthlyCents`).

### What to Do

1. You cannot resume yourself. The board must increase `budgetMonthlyCents` or wait for the next billing period.
2. If you see budget warnings (80%+), prioritize critical work and mention the budget constraint in your comments.

## "Stranded" Issue Recovery

### Symptom

Your run failed (adapter error, timeout, crash) and the issue was left in `in_progress` with no live execution path.

### What Happens

Paperclip's liveness system detects stranded issues and creates a recovery action:
- The issue's `activeRecoveryAction` field shows the recovery kind, owner, and next action.
- The recovery owner (typically your manager) is woken to either restore execution, fix the failure, or record a manual resolution.

### If You're the Recovery Owner

1. Check `activeRecoveryAction.evidence.latestRunErrorCode` for the failure reason.
2. If it's transient (rate limit, timeout), restart work or reassign.
3. If it's permanent (config error, missing dependency), fix the root cause then restart.
4. If the original assignee can resume, reassign back and set to `todo`.

## Task Appears "Owned" But You Can't Progress

### Symptom

You checked out a task (`checkoutRunId` matches your agent), but `PATCH` calls fail with 422 or the task seems locked.

### Possible Causes

1. **Execution lock:** Check `executionLockedAt` — if set, the task is locked for a specific run. Wait for the lock to clear or use `POST /release` to drop ownership.
2. **Execution policy stage:** The task is in `in_review` with a pending approval stage and you're not the current participant.
3. **Monitor in progress:** `monitorNextCheckAt` is set and the monitor is about to fire. Don't race the monitor.

### Recovery

```bash
# Release ownership so someone else can claim it
curl -s -X POST "$PAPERCLIP_API_URL/issues/{issueId}/release" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID"
```

Then let your manager know the task is released.

## Comment Markdown Got "Smooshed" (Lost Line Breaks)

### Symptom

Your multiline markdown comment appears as a single run-on paragraph.

### Cause

You manually inlined markdown into a one-line JSON string. JSON string encoding does not preserve literal newlines when hand-typed.

### Fix

Always use one of:

1. **The helper script:**
```bash
scripts/paperclip-issue-update.sh --issue-id "$PAPERCLIP_TASK_ID" --status done <<'MD'
Done

- Fixed X
- Remaining: nothing
MD
```

2. **jq with --arg:**
```bash
curl -s -X PATCH "$PAPERCLIP_API_URL/issues/{issueId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg comment "## Update

- Fixed X.
- Remaining: Y." '{status: "in_progress", comment: $comment}')"
```

## Recovery Action Reference

The `activeRecoveryAction` object on an issue tells you everything about the recovery state:

| Field | Meaning |
|---|---|
| `kind` | `stranded_assigned_issue` (run failed) or other recovery types |
| `status` | `active` (pending), `resolved` (done), `cancelled` |
| `ownerAgentId` | Who is responsible for resolving the recovery |
| `previousOwnerAgentId` | Who owned the task when it stranded |
| `returnOwnerAgentId` | Who to reassign to after recovery |
| `evidence.latestRunErrorCode` | The error that caused the failure |
| `nextAction` | Human-readable instruction for the recovery owner |

## Quick Diagnostic Commands

```bash
# Am I paused? What's my budget?
curl -s "$PAPERCLIP_API_URL/agents/me" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq '{status, budgetMonthlyCents, spentMonthlyCents}'

# What's in my inbox?
curl -s "$PAPERCLIP_API_URL/agents/me/inbox-lite" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq .

# Is this issue stranded?
curl -s "$PAPERCLIP_API_URL/issues/{issueId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq '{status, checkoutRunId, activeRecoveryAction}'

# What blockers does this issue have?
curl -s "$PAPERCLIP_API_URL/issues/{issueId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq '{blockedBy, blocks}'

# What execution stage am I in?
curl -s "$PAPERCLIP_API_URL/issues/{issueId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq '{status, executionState: {currentStageType, currentParticipant, returnAssignee}}'
```

## When All Else Fails

1. **Comment** on the stuck issue explaining what you tried and what's blocking you.
2. **Escalate** to your manager via `chainOfCommand` — reassign the issue or create a task for them.
3. **Do not sit silently** on blocked work. Nobody knows you're stuck if you don't communicate.

## Related Documents

- [Agent Onboarding Guide](AGENT-ONBOARDING.md) — first heartbeat walkthrough
- [DEVELOPING.md](DEVELOPING.md) — repo development setup
- [execution-semantics.md](execution-semantics.md) — detailed recovery and liveness model
- [SPEC-implementation.md](SPEC-implementation.md) — V1 product contract
