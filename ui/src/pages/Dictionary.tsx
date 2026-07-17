import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ExternalLink, Search, X } from "lucide-react";
import { cn } from "../lib/utils";
import { MarkdownBody } from "../components/MarkdownBody";

/* ------------------------------------------------------------------ */
/*  Dictionary entry type                                              */
/* ------------------------------------------------------------------ */

interface DictionaryEntry {
  term: string;
  definition: string;
  category: string;
  /** Optional link to a relevant page or doc */
  link?: string;
  aliases?: string[];
}

/* ------------------------------------------------------------------ */
/*  Paperclip Dictionary Entries                                       */
/* ------------------------------------------------------------------ */

const DICTIONARY_ENTRIES: DictionaryEntry[] = [
  {
    term: "Agent",
    definition: "An AI employee in a Paperclip company. Each agent has an adapter type, configuration, role, reporting chain, capabilities description, and budget. Agents run in heartbeats — short execution windows where they check their work, do something useful, and exit.",
    category: "Core Concepts",
    aliases: ["Employee", "AI Agent", "Worker"],
  },
  {
    term: "Company",
    definition: "A first-order object in Paperclip representing an autonomous AI organization. Each company has a goal, employees (agents), org structure, projects, task hierarchy, and cost tracking. One Paperclip instance can run multiple companies.",
    category: "Core Concepts",
    aliases: ["Organization"],
  },
  {
    term: "Heartbeat",
    definition: "A short execution window triggered by Paperclip where an agent wakes up, checks its assignments, does something useful, and exits. Heartbeats are the fundamental unit of agent work — agents do not run continuously.",
    category: "Core Concepts",
    aliases: ["Run", "Execution"],
  },
  {
    term: "Adapter",
    definition: "Connects an external execution environment to the Paperclip control plane. Defines how a heartbeat is invoked, observed, and cancelled. Supports local CLI/session adapters (Claude Code, Codex, Pi, Cursor), external plugin adapters, and HTTP/webhook-style integrations.",
    category: "Core Concepts",
    aliases: ["Agent Adapter", "Execution Adapter"],
  },
  {
    term: "Issue",
    definition: "The fundamental unit of work in Paperclip. Each issue has a status, priority, assignee, parent/child relationships, comments, documents, and can be blocked by other issues. All work traces back to a company goal through issue hierarchies.",
    category: "Core Concepts",
    aliases: ["Task", "Ticket"],
  },
  {
    term: "Goal",
    definition: "A hierarchical objective that work traces back to. Goals can be company-level, team-level, or task-level. Every piece of work in Paperclip should ultimately connect to a goal through parent/child issue chains.",
    category: "Core Concepts",
    aliases: ["Objective", "Mission"],
  },
  {
    term: "Project",
    definition: "A collection of related issues and goals within a company. Projects provide organizational grouping, workspaces, and budget tracking scopes.",
    category: "Core Concepts",
  },
  {
    term: "Control Plane",
    definition: "Paperclip's central nervous system — manages agent registry, org charts, task assignment, status tracking, budget and spend monitoring, goal hierarchies, and heartbeat monitoring.",
    category: "Architecture",
  },
  {
    term: "Execution Workspace",
    definition: "An isolated filesystem environment where agent work takes place. Workspaces use git worktrees, managed runtime services (preview/dev servers), and adapter-specific session state. Each issue or project can have its own workspace.",
    category: "Architecture",
    aliases: ["Workspace"],
  },
  {
    term: "Checkout",
    definition: "The atomic operation where an agent claims an issue for execution. Only one agent can have an issue checked out at a time. Prevents concurrent work conflicts via atomic execution locks.",
    category: "Execution",
  },
  {
    term: "Execution Lock",
    definition: "A server-enforced guarantee that only one agent runs an issue at a time. When an agent checks out an issue, it obtains an exclusive lock that prevents other agents from working on it simultaneously.",
    category: "Execution",
  },
  {
    term: "Blocker",
    definition: "A first-class dependency relationship where one issue cannot proceed until other issues are resolved. Blockers auto-wake dependent issues when resolved. Represented via `blockedByIssueIds` on the issue.",
    category: "Execution",
    aliases: ["Blocked By", "Dependency"],
  },
  {
    term: "Approval Gate",
    definition: "A governance mechanism requiring board/user approval before certain actions proceed. Agents request approvals for spending, sensitive operations, or plan acceptance. Approvals pause work until resolved.",
    category: "Governance",
    aliases: ["Board Approval"],
  },
  {
    term: "Budget",
    definition: "Per-agent monthly spending limit in cents. Budget enforcement includes hard-stop auto-pause at 100% spend, warning thresholds at 80%, and detailed billing ledgers for cost tracking.",
    category: "Governance",
    aliases: ["Token Budget", "Spend Limit"],
  },
  {
    term: "Chain of Command",
    definition: "The reporting hierarchy of agents within a company. Each agent has a `reportsTo` relationship, forming an org chart. Agents can escalate blocked work up the chain.",
    category: "Governance",
    aliases: ["Org Chart", "Reporting Chain"],
  },
  {
    term: "Execution Policy",
    definition: "A configurable multi-stage review workflow for issues. Defines approval stages, participants, and decision flows. Issues in execution policy follow structured review paths before completion.",
    category: "Governance",
  },
  {
    term: "Routine",
    definition: "A recurring scheduled task. Each routine fires on a schedule (cron), webhook, or API trigger, creating execution issues assigned to the routine's agent. Supports concurrency policies and catch-up behavior.",
    category: "Execution",
    aliases: ["Scheduled Task", "Cron Job", "Recurring Task"],
  },
  {
    term: "Plan",
    definition: "A special issue document (key: `plan`) that captures the implementation plan for a task. Plans can be approved via `request_confirmation` interactions before implementation subtasks are created.",
    category: "Documents",
    aliases: ["Issue Plan", "Implementation Plan"],
  },
  {
    term: "Issue Document",
    definition: "A markdown document attached to an issue. Supports revision history, diff viewing, locking, annotations, feedback voting, and autosave. The `plan` document is a reserved system key.",
    category: "Documents",
    aliases: ["Document"],
  },
  {
    term: "Comment Thread",
    definition: "The conversation history on an issue. Agents and board users post markdown comments. Supports @-mentions that trigger heartbeats, and issue-thread interactions for structured decision flows.",
    category: "Documents",
  },
  {
    term: "Issue Thread Interaction",
    definition: "A structured UI component embedded in issue comment threads for decisions: `suggest_tasks`, `ask_user_questions`, and `request_confirmation`. Board users accept, reject, or respond. Can wake assignees on resolution.",
    category: "Documents",
    aliases: ["Interaction"],
  },
  {
    term: "Work Product",
    definition: "Tangible output from an agent's work on an issue — code changes, documents, data, or other artifacts. Attached to issues and preserved across heartbeats.",
    category: "Execution",
  },
  {
    term: "Activity Log",
    definition: "An immutable audit trail of all mutating actions within a company. Every status change, assignment, comment, and approval is logged with actor identity and timestamps.",
    category: "Architecture",
  },
  {
    term: "Company Skills",
    definition: "Installable capabilities assigned to agents. Skills provide specialized instructions for specific tasks (e.g., paperclip, terminal-bench-loop). Managers install skills at the company level, then assign them to agents.",
    category: "Configuration",
    aliases: ["Skills"],
  },
  {
    term: "Plugin",
    definition: "External packages that extend Paperclip with custom adapters, UI pages, settings pages, launchers, and sidebar slots. Loaded via the adapter/plugin manager without hardcoding in core.",
    category: "Configuration",
    aliases: ["Adapter Plugin", "External Plugin"],
  },
  {
    term: "Billing Code",
    definition: "A tag on issues enabling cross-team cost tracking and accounting. Used to attribute agent spend to specific projects, clients, or cost centers.",
    category: "Governance",
  },
  {
    term: "Inbox",
    definition: "The agent's personal task queue showing assigned issues prioritized by status. Categories include mine, recent, unread, blocked, and all. Agents pick work from their inbox each heartbeat.",
    category: "Core Concepts",
  },
  {
    term: "Dashboard",
    definition: "The company-level overview showing metrics (agent count, issues, costs), activity feed, active agents, and charts (run activity, priorities, status distribution, success rate).",
    category: "UI",
  },
  {
    term: "Sidebar",
    definition: "The left navigation panel providing access to Dashboard, Inbox, Issues, Routines, Goals, Workspaces, Projects, Agents, and Settings. Company-scoped with prefix-based routing.",
    category: "UI",
  },
  {
    term: "Command Palette",
    definition: "A keyboard-accessible (Cmd+K/Ctrl+K) search-and-navigate overlay for quick access to pages, issues, agents, and actions across the application.",
    category: "UI",
  },
  {
    term: "Status",
    definition: "The lifecycle state of an issue: `backlog` (parked), `todo` (ready), `in_progress` (actively owned), `in_review` (pending feedback), `blocked` (waiting on dependency), `done` (complete), `cancelled` (abandoned).",
    category: "Core Concepts",
  },
  {
    term: "Priority",
    definition: "The urgency level of an issue: `critical`, `high`, `medium`, or `low`. Affects inbox ordering and agent work selection priority.",
    category: "Core Concepts",
  },
  {
    term: "Feedback Vote",
    definition: "Board feedback on agent-generated document revisions. Supports upvote/downvote with optional data-sharing preferences and reasons. Tracks votes per document revision.",
    category: "Documents",
  },
  {
    term: "Secret",
    definition: "Encrypted configuration values (API keys, tokens, credentials) managed at the company level. Secrets can be bound to agent environments and execution workspaces via references.",
    category: "Configuration",
    aliases: ["Environment Variable", "Credential"],
  },
  {
    term: "Company Prefix",
    definition: "A short alphanumeric code (e.g., `PAP`, `ZEU`) that identifies a company in issue identifiers (PAP-224) and URL routing (`/PAP/issues/PAP-224`). Ensures company isolation in multi-tenant instances.",
    category: "Architecture",
    aliases: ["Issue Prefix"],
  },
  {
    term: "Invocation Source",
    definition: "How an agent run was triggered: `assignment` (new task), `on_demand` (manual wake), `timer` (scheduled/routine), `webhook` (external trigger), or system events like blocker resolution.",
    category: "Execution",
  },
  {
    term: "Pause / Auto-Pause",
    definition: "Budget enforcement mechanism: agents are automatically paused when monthly spend reaches 100%. Can also be manually paused by board users. Paused agents do not receive heartbeats.",
    category: "Governance",
  },
  {
    term: "Recovery Action",
    definition: "An automated remediation available when an agent is stuck, looping, or producing no productive output. Presented as a card on the issue detail for board users to invoke.",
    category: "Execution",
  },
  {
    term: "Kanban Board",
    definition: "A visual board view of issues organized by status columns. Supports drag-and-drop status changes, filtering, and scaled views for large issue sets.",
    category: "UI",
  },
  {
    term: "Org Chart",
    definition: "A visual representation of the company's agent hierarchy showing reporting relationships. Each agent node shows name, role, and status with expandable reporting chains.",
    category: "UI",
  },
  {
    term: "Onboarding Wizard",
    definition: "A step-by-step guided flow for creating a new company and its first agent. Walks through company naming, goal setting, agent selection, and initial task creation.",
    category: "UI",
  },
];

/* ------------------------------------------------------------------ */
/*  Categories (derived)                                               */
/* ------------------------------------------------------------------ */

const CATEGORIES = [...new Set(DICTIONARY_ENTRIES.map((e) => e.category))].sort();

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function Dictionary() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const prefix = selectedCompany?.issuePrefix ?? "PAP";
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Dictionary" }]);
  }, [setBreadcrumbs]);

  const filtered = useMemo(() => {
    let entries = DICTIONARY_ENTRIES;
    const q = query.trim().toLowerCase();

    if (q) {
      entries = entries.filter(
        (e) =>
          e.term.toLowerCase().includes(q) ||
          e.definition.toLowerCase().includes(q) ||
          (e.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
      );
    }

    if (activeCategory) {
      entries = entries.filter((e) => e.category === activeCategory);
    }

    return entries;
  }, [query, activeCategory]);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold">Document Dictionary</h2>
        <p className="text-sm text-muted-foreground mt-1">
          A glossary of Paperclip terminology — concepts, components, and conventions
          used across the control plane.
        </p>
      </div>

      {/* Search + category pills */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms and definitions..."
            className="pl-9 pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-medium border border-border transition-colors",
              !activeCategory
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium border border-border transition-colors",
                activeCategory === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">No matching terms</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Try a different search or category filter
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((entry) => (
            <DictionaryCard key={entry.term} entry={entry} prefix={prefix} />
          ))}
        </div>
      )}

      {/* Entry count */}
      <p className="text-xs text-muted-foreground text-center">
        {filtered.length} of {DICTIONARY_ENTRIES.length} term{filtered.length !== 1 ? "s" : ""}
        {(query || activeCategory) ? " matching filters" : ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dictionary Card                                                    */
/* ------------------------------------------------------------------ */

function DictionaryCard({
  entry,
  prefix,
}: {
  entry: DictionaryEntry;
  prefix: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasAliases = Boolean(entry.aliases && entry.aliases.length > 0);
  const hasLink = Boolean(entry.link);

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 hover:bg-card/80 transition-colors">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 text-left flex items-start gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{entry.term}</span>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
              {entry.category}
            </Badge>
          </div>
          <div
            className={cn(
              "text-sm text-muted-foreground mt-1",
              !expanded && "line-clamp-2",
            )}
          >
            <MarkdownBody className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:text-[12px]">
              {entry.definition}
            </MarkdownBody>
          </div>
          {hasAliases && (
            <div className="flex flex-wrap items-center gap-1 mt-2">
              <span className="text-[10px] text-muted-foreground/60">Also:</span>
              {entry.aliases!.map((alias) => (
                <span
                  key={alias}
                  className="text-[10px] text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded font-mono"
                >
                  {alias}
                </span>
              ))}
            </div>
          )}
          {hasLink && (
            <div className="mt-1.5">
              <Link
                to={entry.link!}
                className="inline-flex items-center gap-1 text-[11px] text-primary/80 hover:text-primary transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                View related
              </Link>
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
