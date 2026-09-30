/**
 * @license
 * Flow Relay MCP Server
 * Copyright (c) 2026 Adriano Sorbello (atrisorb) <https://github.com/atrisorb>
 * Licensed under GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FlowRelayAPI, TenantProject, HandoffResult, InsightResult, SourceFilter, WorkItemSummary, WorkItemDetail, MyWorkEntry, WorkSuggestion, EarnedValueResult, RaidEntry, PortfolioResult, ForecastResult, WhatIfResult, AutomationSummary, TemplateSummary, ApprovalSummary } from './api.js';
import { createRequire } from 'node:module';

export const PKG_VERSION: string = createRequire(import.meta.url)('../package.json').version;

// Canonical source vocabulary.
const SOURCES = [
  'github',
  'slack',
  'discord',
  'linear',
  'notion',
  'confluence',
  'jira',
  'gitlab',
  'bitbucket',
  'azure_devops',
  'figma',
  'microsoft_outlook',
  'microsoft_teams',
  'sentry',
  'datadog',
  'pagerduty',
  'asana',
  'gmail',
  'buildkite',
  'circleci',
  'vercel',
  'incident_io',
  'netlify',
  'render',
  'railway',
  'cloudflare_pages',
  'clickup',
  'monday_com',
  'shortcut',
  'intercom',
  'zendesk',
  'snyk',
  'fireflies',
  'zoom',
  'grafana',
  'google_calendar',
  'google_drive',
  'launchdarkly',
  'hcp_terraform',
  'sonarqube',
  'miro',
  'new_relic',
  'jira_service_management',
  'posthog',
  'hubspot',
  'salesforce',
  'heroku',
  'alertmanager',
  'pulumi',
  'google_meet',
  'microsoft_teams_meetings',
  'fathom',
] as const;

const SourceEnum = z.enum(SOURCES);

const SourceFilterSchema = z.object({
  projects: z.array(z.string()).optional().describe('Resource ids from list_filter_options[source].projects (repos, channels, boards). Use the exact id, not the display label.'),
  eventTypes: z.array(z.string()).optional().describe('Event-type values from list_filter_options (e.g. "push", "issue_created"). Case-sensitive; provider-driven. A value that does not exist matches no events (it is not rejected).'),
  branches: z.array(z.string()).optional().describe('Git branch names (e.g. "main", "develop") – git sources only (github, gitlab, bitbucket, azure_devops). Using this on a non-git source is a 400.'),
  priorities: z.array(z.string()).optional().describe('Priority values from list_filter_options (e.g. "high", "urgent") – github (security alerts only), jira, jira_service_management, linear, sentry, pagerduty, incident_io, clickup, zendesk, snyk, grafana, alertmanager, new_relic, hubspot, salesforce only. Using this on another source is a 400; unrecognized values simply match no events.'),
});

const FiltersSchema = z.record(z.string(), SourceFilterSchema)
  .optional()
  .describe('Per-source advanced filters, AND-combined across dimensions. Keys MUST be source ids (an unknown source id is rejected with 400). The dimension VALUES are matched leniently – call list_filter_options first to get the real selectable values for the project rather than guessing.');

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const MUTATING = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

const SESSION_STATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const WRITE_IDEMPOTENT = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export function normalizeProjectId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatProjectScope(project: TenantProject | null) {
  if (!project) return 'No project selected (required for handoffs & insights)';
  if (project.project_type === 'personal') {
    return `Personal project: ${project.name}`;
  }

  const role = project.access_role === 'admin'
    ? 'admin'
    : project.access_role === 'member'
      ? 'member'
      : 'owner';

  return `Org project: ${project.name} (${project.organization_name ?? 'Unknown org'}, ${role})`;
}

function workItemLine(item: WorkItemSummary | MyWorkEntry): string {
  const facts = [`${item.percentComplete}%`];
  if (item.finish) facts.push(`finish ${item.finish}`);
  if (item.deadline) facts.push(`deadline ${item.deadline}`);
  if ('assignees' in item && item.assignees.length > 0) facts.push(item.assignees.map((a) => a.name).join(', '));
  return `- ${item.key} [${item.status}${item.blocked ? ', blocked' : ''}] ${item.title} (${facts.join(', ')})`;
}

function workItemDetail(item: WorkItemDetail, timezone: string): string {
  const links = (list: WorkItemDetail['predecessors']) =>
    list.map((l) => `${l.key ?? 'unknown'} (${l.type.toUpperCase()})`).join(', ');
  const deadline = item.deadline ? ` · **Deadline:** ${item.deadline}` : '';
  const lines = [
    `# ${item.key} ${item.title}`,
    `**Status:** ${item.status}${item.blocked ? ' (blocked)' : ''} · **Progress:** ${item.percentComplete}% · **Kind:** ${item.kind}`,
    `**Start:** ${item.start ?? 'not scheduled'} · **Finish:** ${item.finish ?? 'not scheduled'}${deadline} (${timezone})`,
    `**Assignees:** ${item.assignees.map((a) => a.name).join(', ') || 'none'}`,
  ];
  if (item.predecessors.length > 0) lines.push(`**Predecessors:** ${links(item.predecessors)}`);
  if (item.successors.length > 0) lines.push(`**Successors:** ${links(item.successors)}`);
  lines.push(`**Comments:** ${item.commentCount} · **Link:** ${item.url}`);
  if (item.description) lines.push('', item.description);
  if (item.evidence.length > 0) {
    lines.push(
      '',
      '## Evidence',
      ...item.evidence.map((e) => `- [${e.source}/${e.kind}] ${e.title ?? 'Untitled'} (${e.occurredAt.slice(0, 10)})${e.url ? ` ${e.url}` : ''}`),
    );
  }
  return lines.join('\n');
}

function suggestionLine(s: WorkSuggestion): string {
  const text = (value: unknown, fallback: string) => (typeof value === 'string' && value.length > 0 ? value : fallback);
  const p = s.payload;
  const summary = {
    status_change: () => `${s.item ?? 'An item'}: move to ${text(p.to, 'a new status')}`,
    create_item: () => `New item: ${text(p.title, 'Untitled')}`,
    dependency: () => `${text(p.predecessor, 'An item')} should finish before ${text(p.successor, 'another item')} starts`,
    evidence: () => `${s.item ?? 'An item'}: "${text(p.title, 'Untitled')}" from ${text(p.source, 'activity')} as evidence`,
  }[s.type]();
  const reason = typeof p.reason === 'string' && p.reason.length > 0 ? ` – ${p.reason}` : '';
  return `- ${summary}${reason} (id ${s.id}${s.forYou ? ', for you' : ''})`;
}

function moneyText(cents: number | null, currency: string): string {
  return cents === null ? 'n/a' : new Intl.NumberFormat('en', { style: 'currency', currency }).format(cents / 100);
}

function earnedValueText(name: string, r: EarnedValueResult): string {
  const e = r.earnedValue;
  const m = (v: number | null) => moneyText(v, r.currency);
  const index = (v: number | null) => (v === null ? 'n/a' : v.toFixed(2));
  return [
    `Earned value of ${name} as of ${r.statusDate}${r.baseline === null ? ' (no baseline with costs yet)' : ` against baseline ${r.baseline}`}. Actual cost comes from ${r.actualsFrom === 'timesheets' ? 'logged hours' : 'progress'}.`,
    `Planned cost ${m(r.plannedCostCents)}, actual cost ${m(r.actualCostCents)}${r.budgetCents === null ? '' : `, budget ${m(r.budgetCents)}`}.`,
    `Budget at completion ${m(e.budgetAtCompletionCents)}, planned value ${m(e.plannedValueCents)}, earned value ${m(e.earnedValueCents)}.`,
    `Schedule variance ${m(e.scheduleVarianceCents)}, cost variance ${m(e.costVarianceCents)}, SPI ${index(e.spi)}, CPI ${index(e.cpi)}, TCPI ${index(e.tcpi)}.`,
    `Estimate at completion: ${m(e.estimateAtCompletionCents.cpi)} at the current cost efficiency, ${m(e.estimateAtCompletionCents.budgetRate)} at the budgeted rate, ${m(e.estimateAtCompletionCents.cpiSpi)} at cost and schedule efficiency. Estimate to complete ${m(e.estimateToCompleteCents)}, variance at completion ${m(e.varianceAtCompletionCents)}.`,
  ].join('\n');
}

function forecastText(name: string, f: ForecastResult): string {
  const date = (v: string | null) => (v ? v.slice(0, 10) : 'n/a');
  const pct = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v * 100)}%`);
  if (f.mode === 'throughput') {
    if (!f.available) return `No throughput forecast for ${name}: it needs at least 4 weeks of history with something finished (${f.weeksOfHistory} so far, ${f.backlog} open items).`;
    return [
      `Throughput forecast of ${name}: ${f.backlog} open items at the pace of the last ${f.weeksOfHistory} weeks (${f.iterations} simulated runs).`,
      `Done by ${date(f.p50)} (${f.weeks!.p50} weeks) in half of the runs, by ${date(f.p80)} (${f.weeks!.p80} weeks) in four out of five and by ${date(f.p95)} (${f.weeks!.p95} weeks) in nineteen out of twenty${f.chance === null ? '' : `; chance of the target finish ${pct(f.chance)}`}.`,
      ...(f.capped ? ['Some runs did not finish within ten years: the pace is too low for the backlog.'] : []),
    ].join('\n');
  }
  return [
    `Forecast of ${name}: ${f.iterations} simulated runs with ${f.uncertainty} uncertainty on the durations.`,
    `The plan says ${date(f.project.plan)}. The project is done by ${date(f.project.p50)} in half of the runs, by ${date(f.project.p80)} in four out of five and by ${date(f.project.p95)} in nineteen out of twenty${f.project.target ? `; chance of the target finish ${date(f.project.target)}: ${pct(f.project.chance)}` : ''}.`,
    ...(f.milestones.length > 0 ? ['Milestones (plan, likely by, chance on its date):', ...f.milestones.map((m) => `- ${m.ref} ${m.title}: plan ${date(m.plan)}, likely by ${date(m.p80)}, ${pct(m.chance)} chance${m.deadline ? ` of the deadline ${date(m.deadline)}` : ''}`)] : []),
    ...(f.critical.length > 0 ? ['Most often on the critical path:', ...f.critical.map((c) => `- ${c.ref} ${c.title}: ${Math.round(c.index * 100)}% of runs`)] : []),
  ].join('\n');
}

function whatIfText(r: WhatIfResult): string {
  const date = (v: string | null) => (v ? v.slice(0, 10) : 'n/a');
  const lines = [r.explanation || 'What-if result.'];
  if (r.changes.length === 0) lines.push('No change in the plan could express this question, so nothing was compared.');
  else lines.push('Changes tried:', ...r.changes.map((c) => `- ${c}`));
  if (r.left_out.length > 0) lines.push(`Left out: ${r.left_out.join('; ')}.`);
  if (r.comparison) {
    const c = r.comparison;
    const d = c.projectFinish.deltaWorkingDays;
    lines.push(`The project would finish ${date(c.projectFinish.scenario)} instead of ${date(c.projectFinish.now)} (${d === null ? 'n/a' : d === 0 ? 'no change' : `${d > 0 ? '+' : ''}${d} working days`}); ${c.moved} items move, ${c.criticalBecame} become critical and ${c.criticalLeft} stop being critical.`);
    lines.push(...c.milestones.map((m) => `- ${m.ref} ${m.title}: ${date(m.now)} to ${date(m.scenario)}${m.deltaWorkingDays === null || m.deltaWorkingDays === 0 ? '' : ` (${m.deltaWorkingDays > 0 ? '+' : ''}${m.deltaWorkingDays} working days)`}`));
  }
  if (r.errors.length > 0) lines.push(`Could not compare: ${r.errors.join('; ')}.`);
  lines.push('Nothing was saved or changed in the plan.');
  return lines.join('\n');
}
function portfolioText(r: PortfolioResult): string {
  if (r.projects.length === 0) return 'No project in this portfolio that you can open.';
  const programs = new Map(r.programs.map((p) => [p.id, p.name]));
  const names = new Map(r.projects.map((p) => [p.id, p.name]));
  const verdict = { green: 'on track', amber: 'at risk', red: 'off track' } as const;
  const lines = r.projects.map((p) => {
    const h = p.health;
    const slip = h?.slipWorkingDays ?? null;
    const parts = [
      h ? `${verdict[h.verdict]}${h.overridden ? ' (set by hand)' : ''}` : 'health not computed yet',
      p.percentComplete === null ? null : `${Math.round(p.percentComplete)}% complete`,
      p.scheduledFinish ? `forecast finish ${p.scheduledFinish.slice(0, 10)}` : null,
      p.targetFinish ? `target ${p.targetFinish.slice(0, 10)}` : null,
      slip === null ? null : slip > 0 ? `${slip} working days late` : slip < 0 ? `${-slip} working days ahead` : 'on schedule',
      h?.overdueItems ? `${h.overdueItems} overdue items` : null,
      p.openRisks > 0 ? `${p.openRisks} open risks` : null,
      p.nextMilestone ? `next milestone ${p.nextMilestone.ref} ${p.nextMilestone.title} on ${p.nextMilestone.finish.slice(0, 10)}` : null,
      p.programId ? `program ${programs.get(p.programId) ?? 'unknown'}` : null,
    ].filter((part): part is string => part !== null);
    return `- ${p.key} ${p.name}: ${parts.join(', ')}${h?.comment ? ` – ${h.comment}` : ''}`;
  });
  const waits = r.dependencies.map((d) => `- ${names.get(d.to) ?? 'A project'} waits for ${names.get(d.from) ?? 'another project'} (${d.count} ${d.count === 1 ? 'link' : 'links'})`);
  return [`Portfolio, ${r.projects.length} ${r.projects.length === 1 ? 'project' : 'projects'}:`, ...lines, ...(waits.length > 0 ? ['', 'Dependencies between projects:', ...waits] : [])].join('\n');
}
function automationLine(a: AutomationSummary): string {
  const ran = a.runCount === 0 ? 'not run yet' : `ran ${a.runCount} time${a.runCount === 1 ? '' : 's'}, last ${a.lastStatus ?? 'ok'}`;
  return `- ${a.name} [${a.enabled ? 'on' : 'off'}, ${ran}]: ${a.summary}`;
}
function templateLine(t: TemplateSummary): string {
  return `- ${t.name} (${t.kind === 'project' ? 'whole plan' : 'one item with its subtasks'}, ${t.itemCount} item${t.itemCount === 1 ? '' : 's'}) id ${t.id}${t.description ? ` – ${t.description}` : ''}`;
}
function approvalLine(a: ApprovalSummary): string {
  const state = a.status === 'pending' ? 'waiting for a decision' : a.status === 'failed' ? 'approved but not applied' : a.status;
  const by = a.requestedBy ? `, asked by ${a.requestedBy}` : '';
  const said = a.decidedBy ? `, ${a.decidedBy}${a.decisionNote ? ` said: ${a.decisionNote}` : ''}` : '';
  return `- ${a.title} [${a.kind === 'scope' ? 'plan change' : 'baseline'}, ${state}${by}${said}]: ${a.summary.join('; ')}`;
}
function raidLine(e: RaidEntry): string {
  const score = e.score === null ? '' : `, score ${e.score} (probability ${e.probability} x impact ${e.impact})`;
  const due = e.dueOn ? `, due ${e.dueOn}` : '';
  const item = e.item ? `, on ${e.item}` : '';
  const response = e.response ? ` – ${e.response}` : '';
  return `- R-${e.number} ${e.type} [${e.status}${score}${due}${item}]: ${e.title}${response}`;
}

export function createFlowRelayServer(api: FlowRelayAPI, initialProjectId: string | null): McpServer {
  let activeProjectId = initialProjectId;

  const server = new McpServer(
    {
      name: 'flowrelay',
      version: PKG_VERSION,
      websiteUrl: 'https://www.flowrelay.it',
      icons: [
        { src: 'https://www.flowrelay.it/icon.png', mimeType: 'image/png', sizes: ['1024x1024'] },
      ],
    },
    {
      instructions: [
        'Flow Relay captures your team\'s work context from connected integrations (GitHub, Slack, Jira, Linear, and more) and synthesizes it into two kinds of artifact:',
        '- A HANDOFF: a snapshot of recent activity, decisions, open questions and next steps for a project – used to hand work off or catch up.',
        '- An INSIGHT, in three flavors: CORRELATION (links related events across different sources), ONBOARDING BRIEF (a getting-started guide for someone new to the project) and ARCHITECTURE (trade-offs, risks and patterns inferred from the code).',
        '',
        'Typical flow:',
        '1. Call list_projects to see accessible projects and their ids. Every id you ever pass (project, handoff, insight, Discord channel) comes from a list_* tool – never invent one.',
        '2. Optionally set_active_project so later tools can omit project_id.',
        '3. Before generating with filters, call list_filter_options to get the real selectable values for that project.',
        '4. Call a generate_* tool. These run the AI synchronously here: the tool waits for completion (tens of seconds) and returns the finished artifact as Markdown – you do not poll.',
        '',
        'Cost: every generate_* call consumes credits from the user\'s plan and is charged once on success (architecture is the deepest and most expensive, handoff the cheapest). Do not regenerate an artifact you can retrieve with list_handoffs / list_insights, and confirm intent before generating repeatedly.',
        '',
        'Work items: a project plan holds tasks and milestones addressed by keys such as FR-12. list_my_work shows what is assigned to the caller, list_work_items and get_work_item read a plan, create_work_item and update_work_item change it, list_suggestions shows the changes Flow Relay proposes from linked activity and link_evidence attaches a link to an item, list_raid reads the risk register, get_earned_value reads costs and earned value against a baseline and get_portfolio reads the progress, forecast, risks and health of every project of an organization, get_forecast simulates a plan to say how likely each finish date is and plan_whatif tries a what-if question on a copy of the plan (5 credits). list_automations reads the rules that act on a plan by themselves, list_templates and apply_template add saved structure to a plan, list_approvals reads the change requests of a plan and request_change asks for a change that a second person must approve. Work item tools cost no credits; generate_plan_review writes a status report from the numbers of the plan (5 credits). A commit message, branch name or pull request title that mentions an item key links that work to the item.',
        '',
        'Scope and access follow the API key\'s tenant role; a tool only ever sees projects the key can access.',
      ].join('\n'),
    },
  );

  async function getTenantContext() {
    const context = await api.listProjects();

    if (activeProjectId && !context.projects.some((project) => project.id === activeProjectId)) {
      activeProjectId = null;
    }

    return context;
  }

  async function resolveProject(projectId?: string) {
    const explicitProjectId = normalizeProjectId(projectId);
    const resolvedProjectId = explicitProjectId ?? activeProjectId;
    if (!resolvedProjectId) {
      return { projectId: null, project: null };
    }

    const context = await getTenantContext();
    const project = context.projects.find((candidate) => candidate.id === resolvedProjectId) ?? null;
    if (!project) {
      activeProjectId = null;
      return { projectId: null, project: null };
    }

    return { projectId: resolvedProjectId, project };
  }

  async function requireProject(projectId?: string) {
    const explicitProjectId = normalizeProjectId(projectId);
    const resolvedProjectId = explicitProjectId ?? activeProjectId;
    if (!resolvedProjectId) {
      throw new Error('A project is required. Use set_active_project or pass project_id. Run list_projects to see available projects.');
    }

    const context = await getTenantContext();
    const project = context.projects.find((candidate) => candidate.id === resolvedProjectId) ?? null;
    if (!project) {
      activeProjectId = null;
      throw new Error('A project is required. The selected project was not found or is inaccessible. Use set_active_project or pass project_id. Run list_projects to see available projects.');
    }

    return { projectId: resolvedProjectId, project };
  }

  // ── Tool: workspace context ─────────────────────────────────────────

  server.tool(
    'get_workspace_context',
    'Show the current Flow Relay context: personal vs business mode, number of organizations and accessible projects, the active project scope and the caller\'s role. Good first call to orient yourself before other tools.',
    {},
    READ_ONLY,
    async () => {
      try {
        const context = await getTenantContext();
        const activeProject = activeProjectId
          ? context.projects.find((project) => project.id === activeProjectId) ?? null
          : null;

        const isBusiness = context.account_type === 'business' || context.organizations.length > 0;
        const roleLine = activeProject
          ? `Role: ${activeProject.access_role}`
          : 'Role: n/a (no project selected)';

        const lines = [
          `Account mode: ${isBusiness ? 'business' : 'personal'}`,
          `Organizations: ${context.organizations.length}`,
          `Accessible projects: ${context.projects.length}`,
          `Active scope: ${formatProjectScope(activeProject)}`,
          roleLine,
        ];

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not load workspace context: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: list projects ─────────────────────────────────────────────

  server.tool(
    'list_projects',
    'List every project the API key can access (personal and organization), each with its id, scope, the prefix of its work item keys and the caller\'s role. The id returned here is what you pass as project_id to the generate_* and list tools – start here whenever you need one.',
    {},
    READ_ONLY,
    async () => {
      try {
        const context = await getTenantContext();

        if (context.projects.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No accessible projects found. Create a project in Flow Relay or get added to a project team.',
            }],
          };
        }

        const lines = context.projects.map((project) => {
          const active = project.id === activeProjectId ? ' [active]' : '';
          const scope = project.project_type === 'personal'
            ? 'personal'
            : `org:${project.organization_name ?? 'unknown'}`;
          const key = project.key ? `, keys=${project.key}-n` : '';
          const org = project.organization_id ? `, organization_id=${project.organization_id}` : '';
          return `- ${project.name} (${scope}, role=${project.access_role}${key}${org})\n  id: ${project.id}${active}`;
        });

        return {
          content: [{
            type: 'text',
            text: `Projects:\n${lines.join('\n')}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list projects: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: set active project ────────────────────────────────────────

  server.tool(
    'set_active_project',
    'Set the active project so later tools can omit project_id (a convenience for a multi-step session on one project). Set it once from a list_projects id, then call generate_handoff / list_events / etc. without repeating project_id. Not required if you always pass project_id explicitly.',
    {
      project_id: z.string().optional().describe('Project id (from list_projects) to set as active. Omit, or set clear, to unset it.'),
      clear: z.boolean().default(false).describe('Clear the active project. Generation then requires an explicit project_id again.'),
    },
    SESSION_STATE,
    async ({ project_id, clear }: { project_id?: string; clear?: boolean }) => {
      try {
        if (clear || !normalizeProjectId(project_id)) {
          activeProjectId = null;
          return { content: [{ type: 'text', text: 'Active project cleared. Handoff/insight generation requires selecting a project.' }] };
        }

        const context = await getTenantContext();
        const selected = context.projects.find((project) => project.id === project_id);
        if (!selected) {
          return {
            content: [{
              type: 'text',
              text: `Project not found or inaccessible: ${project_id}. Run list_projects first.`,
            }],
          };
        }

        activeProjectId = selected.id;
        return {
          content: [{
            type: 'text',
            text: `Active project set to ${selected.name} (${selected.id}).`,
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not set active project: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: list handoffs ──────────────────────────────────────────────

  server.tool(
    'list_handoffs',
    'List existing handoffs (newest first) with their full content, across all accessible projects or one project. Use this to read what has already been generated before spending credits on a new generate_handoff. Each row\'s id can be sent to Discord via discord_send_message.',
    {
      status: z.enum(['active', 'archived', 'all']).default('active').describe('active = current handoffs, archived = superseded ones, all = both.'),
      limit: z.number().int().min(1).max(50).default(10).describe('Max handoffs to return (1-50, default 10).'),
      project_id: z.string().optional().describe('Project id (from list_projects) to scope to. Omit to span every accessible project, or rely on the active project.'),
    },
    READ_ONLY,
    async ({ status, limit, project_id }: { status: 'active' | 'archived' | 'all'; limit: number; project_id?: string }) => {
      try {
        const explicitProjectId = normalizeProjectId(project_id);
        const resolvedProjectId = explicitProjectId ?? activeProjectId;
        let resolvedProject: TenantProject | null = null;
        if (resolvedProjectId) {
          const context = await getTenantContext();
          resolvedProject = context.projects.find((p) => p.id === resolvedProjectId) ?? null;
          if (!resolvedProject) activeProjectId = null;
        }

        const { handoffs } = await api.listHandoffs(status, limit, resolvedProject?.id ?? null);

        if (handoffs.length === 0) {
          const scopeLabel = resolvedProject ? formatProjectScope(resolvedProject) : 'all projects';
          return { content: [{ type: 'text', text: `No ${status} handoffs found in scope: ${scopeLabel}.` }] };
        }

        const text = handoffs.map((h) => {
          let out = `## ${h.title}\n`;
          out += `**Status:** ${h.status} · **Sources:** ${h.sources.join(', ') || 'all'}\n`;
          out += `**Project:** ${h.project_name ?? 'Unknown'}\n`;
          out += `**Created:** ${new Date(h.created_at).toLocaleString()}\n\n`;
          out += `${h.summary}\n`;
          if (h.key_changes?.length) out += `\n**Key changes:**\n${h.key_changes.map((c: string) => `- ${c}`).join('\n')}\n`;
          if (h.decisions.length) out += `\n**Decisions:**\n${h.decisions.map((d: string) => `- ${d}`).join('\n')}\n`;
          if (h.next_steps.length) out += `\n**Next steps:**\n${h.next_steps.map((s: string) => `- ${s}`).join('\n')}\n`;
          if (h.open_questions.length) out += `\n**Open questions:**\n${h.open_questions.map((q: string) => `- ${q}`).join('\n')}\n`;
          return out;
        }).join('\n---\n\n');

        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list handoffs: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: generate handoff ───────────────────────────────────────────

  server.tool(
    'generate_handoff',
    'Generate a project handoff: an AI summary of recent activity, key changes, decisions, open questions and next steps for a project. Runs synchronously – waits for completion (tens of seconds) and returns the finished Markdown. Requires an active project (set_active_project) or an explicit project_id from list_projects. Consumes credits from the user\'s plan, charged once on success – prefer list_handoffs to read an existing one before generating a new one. To scope it, pass sources and/or filters (call list_filter_options first for valid values); omit both to use the project\'s saved scope preferences.',
    {
      sources: z.array(SourceEnum)
        .optional()
        .describe('Restrict to these source ids (omit for all connected sources). Unknown source ids are rejected with 400.'),
      filters: FiltersSchema,
      project_id: z.string().optional().describe('Project id from list_projects. Overrides the active project for this call; required if no active project is set.'),
    },
    MUTATING,
    async ({ sources, filters, project_id }: { sources?: Array<typeof SOURCES[number]>; filters?: Record<string, SourceFilter>; project_id?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const { jobId } = await api.generateHandoff(sources, filters, resolved.projectId);
        const { job, result } = await api.waitForJob(jobId);
        if (job.status === 'failed' || !result) {
          const reason = job.error ?? 'unknown error';
          return { content: [{ type: 'text', text: `Could not generate handoff: ${reason}` }] };
        }
        const handoff = result as HandoffResult;

        // Server renders the canonical Markdown; fall back for pre-markdown servers.
        const text = handoff.markdown ?? `# ${handoff.title}\n\n${handoff.summary}\n`;
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not generate handoff: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: list integrations ─────────────────────────────────────────

  server.tool(
    'list_integrations',
    'List connected integrations. With a project scope it returns the resources bound to that project plus their health (connection status, provider coverage); without one it returns the sources the API key owner has connected. Use it to check what data a generation can draw on.',
    {
      project_id: z.string().optional().describe('Project id (from list_projects) for project-scoped resources. Omit (or rely on the active project) for the owner\'s connected sources.'),
    },
    READ_ONLY,
    async ({ project_id }: { project_id?: string }) => {
      try {
        const resolved = await resolveProject(project_id);
        const { integrations } = await api.listIntegrations(resolved.projectId);

        if (integrations.length === 0) {
          if (resolved.project) {
            return { content: [{ type: 'text', text: `No integrations configured for project ${resolved.project.name}.` }] };
          }
          return { content: [{ type: 'text', text: 'No integrations connected. Visit https://www.flowrelay.it/integrations to set up.' }] };
        }

        const text = integrations.map((i) => {
          const name = i.workspace_name ? ` (${i.workspace_name})` : '';
          if (i.scope === 'project') {
            const status = i.connection_status ?? 'unknown';
            const providers = i.providers_connected ?? 0;
            return `- **${i.source}**${name} – status: ${status}, providers connected: ${providers}`;
          }
          return `- **${i.source}**${name} – connected ${new Date(i.connected_at).toLocaleDateString()}`;
        }).join('\n');

        return { content: [{ type: 'text', text: `**Connected integrations:**\n${text}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list integrations: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: list untracked resources ───────────────────────────────────

  server.tool(
    'list_untracked_resources',
    'List active resources (repos, channels, boards) that produced events recently but are not yet assigned to any project. Use it to spot data the user connected but has not organized into a project yet – mapping them (in the web dashboard) makes their events available to generations.',
    {},
    READ_ONLY,
    async () => {
      try {
        const resources = await api.listUntrackedResources();

        if (resources.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'All discovered active resources are already tracked in your projects. Good job!',
            }],
          };
        }

        const text = resources.map((r) => {
          return `- **[${r.source}]** ${r.resource_name} (type: ${r.resource_type}, id: ${r.resource_id})`;
        }).join('\n');

        return {
          content: [{
            type: 'text',
            text: `**Untracked active resources:**\n${text}\n\n*Note: Map these resources to Flow Relay projects in the web dashboard or CLI to start tracking their events.*`,
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Failed to list untracked resources: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: list recent events ─────────────────────────────────────────

  server.tool(
    'list_events',
    'List recent raw context events (individual pieces of tracked activity: a push, a message, an issue update) newest first. Use it to inspect the underlying signal a generation would draw on, or to check whether a source is producing data. With a project scope it is limited to that project\'s bound resources.',
    {
      source: SourceEnum
        .optional()
        .describe('Restrict to one source id (e.g. "github"). Unknown ids are rejected with 400.'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max events to return (1-100, default 20).'),
      project_id: z.string().optional().describe('Project id (from list_projects) to scope to. Omit (or rely on the active project) for the owner\'s personal-stream events.'),
    },
    READ_ONLY,
    async ({ source, limit, project_id }: { source?: typeof SOURCES[number]; limit: number; project_id?: string }) => {
      try {
        const resolved = await resolveProject(project_id);
        const { events } = await api.listEvents(source, limit, resolved.projectId);

        if (events.length === 0) {
          const scopeLabel = formatProjectScope(resolved.project);
          return { content: [{ type: 'text', text: `No recent events${source ? ` from ${source}` : ''} in scope: ${scopeLabel}.` }] };
        }

        const text = events.map((e) => {
          const time = new Date(e.created_at).toLocaleString();
          const author = e.user_id ? ` user=${e.user_id}` : '';
          return `- **[${e.source}/${e.event_type}]** ${e.title} _(${time})_${author}`;
        }).join('\n');

        return { content: [{ type: 'text', text: `**Recent events:**\n${text}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list events: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: discord list channels ──────────────────────────────────────

  server.tool(
    'discord_list_channels',
    'List the text channels in the Discord server connected to this account, each with its id. Call this to get a channel_id before discord_send_message.',
    {},
    READ_ONLY,
    async () => {
      try {
        const { channels } = await api.discordListChannels();

        if (channels.length === 0) {
          return { content: [{ type: 'text', text: 'No text channels found in the connected Discord server.' }] };
        }

        const text = channels.map((ch) => {
          const topic = ch.topic ? ` – ${ch.topic}` : '';
          return `- **#${ch.name}** (${ch.id})${topic}`;
        }).join('\n');

        return { content: [{ type: 'text', text: `**Discord channels:**\n${text}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list Discord channels: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: discord send message ──────────────────────────────────────

  server.tool(
    'discord_send_message',
    'Send to a Discord channel in your connected server. Provide exactly one of: content (inline text); handoff_id or insight_id (sends that artifact, rendered to Markdown, as a .md file attachment); or artifact (last_handoff / last_correlation / last_onboarding / last_architecture / last_release_notes, with project_id) to send the latest active artifact of that kind.',
    {
      channel_id: z.string().describe('Discord channel id from discord_list_channels.'),
      content: z.string().optional().describe('Inline message text. Mutually exclusive with handoff_id / insight_id / artifact'),
      handoff_id: z.string().optional().describe('Id of a handoff (from list_handoffs) to render and attach as a .md file'),
      insight_id: z.string().optional().describe('Id of an insight (from list_insights) to render and attach as a .md file'),
      artifact: z
        .enum(['last_handoff', 'last_correlation', 'last_onboarding', 'last_architecture', 'last_release_notes'])
        .optional()
        .describe('Send the latest active artifact of this kind. Requires project_id'),
      project_id: z.string().optional().describe('Project UUID. Required only when artifact is set'),
    },
    MUTATING,
    async ({
      channel_id,
      content,
      handoff_id,
      insight_id,
      artifact,
      project_id,
    }: {
      channel_id: string;
      content?: string;
      handoff_id?: string;
      insight_id?: string;
      artifact?: 'last_handoff' | 'last_correlation' | 'last_onboarding' | 'last_architecture' | 'last_release_notes';
      project_id?: string;
    }) => {
      if (!content && !handoff_id && !insight_id && !artifact) {
        return { content: [{ type: 'text', text: 'Provide content, handoff_id, insight_id, or artifact.' }] };
      }
      try {
        const result = await api.discordSendMessage(channel_id, { content, handoff_id, insight_id, artifact, project_id });
        return { content: [{ type: 'text', text: `Message sent (ID: ${result.message_id})` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Failed to send message: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: generate correlation insight ──────────────────────────────

  server.tool(
    'generate_correlation_insight',
    'Generate a cross-source correlation insight: finds related events across different sources (e.g. a Slack thread, a Jira ticket and the PR that resolved it) and surfaces the links, patterns and open threads. Use when the user wants to understand how activity connects across tools. Runs synchronously and returns Markdown. Consumes credits, charged once on success. Call list_filter_options before using filters.',
    {
      project_id: z.string().describe('Project id from list_projects to generate the insight for.'),
      sources: z.array(SourceEnum).optional().describe('Restrict to these source ids (e.g. "github", "slack"). Unknown ids are rejected with 400.'),
      filters: FiltersSchema,
      lookback_hours: z.number().int().optional().describe('Hours of activity to analyze (1-2160, default 168 = 7 days).'),
      max_events: z.number().int().optional().describe('Cap on events processed (1-1000, default 150).'),
    },
    MUTATING,
    async ({ project_id, sources, filters, lookback_hours, max_events }: { project_id: string; sources?: Array<typeof SOURCES[number]>; filters?: Record<string, SourceFilter>; lookback_hours?: number; max_events?: number }) => {
      try {
        const res = await api.generateInsight(project_id, 'correlation', {
          sources,
          filters,
          lookbackHours: lookback_hours,
          maxEvents: max_events,
        });

        const { job, result } = await api.waitForJob(res.jobId);
        if (job.status === 'failed' || !result) {
          const reason = job.error ?? 'unknown error';
          return { content: [{ type: 'text', text: `Could not generate correlation insight: ${reason}` }] };
        }

        const insight = result as InsightResult;
        return { content: [{ type: 'text', text: insight.markdown ?? `# ${insight.title}\n\n${insight.summary}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Failed: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: generate onboarding brief ──────────────────────────────────

  server.tool(
    'generate_onboarding_brief',
    'Generate an onboarding brief: a getting-started guide for someone new to the project – key people, key decisions, pitfalls and recommended reading drawn from recent activity. Use when a new team member needs to get up to speed. Runs synchronously and returns Markdown. Consumes credits, charged once on success. Call list_filter_options before using filters.',
    {
      project_id: z.string().describe('Project id from list_projects to generate the brief for.'),
      sources: z.array(SourceEnum).optional().describe('Restrict to these source ids. Unknown ids are rejected with 400.'),
      filters: FiltersSchema,
      new_member_role: z.string().optional().describe('Role/focus of the person being onboarded (e.g. "backend engineer"). Tailors the brief.'),
      focus_area: z.string().optional().describe('Repository or feature area they will work on. Narrows the brief.'),
      lookback_days: z.number().int().optional().describe('Days of history to review (1-365, default 30).'),
      max_events: z.number().int().optional().describe('Cap on events processed (1-1000, default 400).'),
    },
    MUTATING,
    async ({ project_id, sources, filters, new_member_role, focus_area, lookback_days, max_events }: { project_id: string; sources?: Array<typeof SOURCES[number]>; filters?: Record<string, SourceFilter>; new_member_role?: string; focus_area?: string; lookback_days?: number; max_events?: number }) => {
      try {
        const res = await api.generateInsight(project_id, 'onboarding', {
          sources,
          filters,
          newMemberRole: new_member_role,
          focusArea: focus_area,
          lookbackDays: lookback_days,
          maxEvents: max_events,
        });

        const { job, result } = await api.waitForJob(res.jobId);
        if (job.status === 'failed' || !result) {
          const reason = job.error ?? 'unknown error';
          return { content: [{ type: 'text', text: `Could not generate onboarding brief: ${reason}` }] };
        }

        const insight = result as InsightResult;
        return { content: [{ type: 'text', text: insight.markdown ?? `# ${insight.title}\n\n${insight.summary}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Failed: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: generate architecture insight ─────────────────────────────

  server.tool(
    'generate_architecture_insight',
    'Generate an architecture insight: trade-offs, risks, patterns and recommendations inferred from the project\'s code activity (requires a connected code source – github, gitlab, bitbucket or azure_devops). This is the deepest and most expensive insight (it runs extended reasoning). Use for technical review of architectural direction. Runs synchronously and returns Markdown. Consumes credits, charged once on success. Call list_filter_options before using filters.',
    {
      project_id: z.string().describe('Project id from list_projects to generate the insight for.'),
      sources: z.array(SourceEnum).optional().describe('Restrict to these source ids. Unknown ids are rejected with 400.'),
      filters: FiltersSchema,
      focus_question: z.string().optional().describe('A specific architectural question or component to investigate (e.g. "is the billing layer coupled to providers?").'),
      lookback_days: z.number().int().optional().describe('Days of history to review (1-365, default 14).'),
      max_events: z.number().int().optional().describe('Cap on events processed (1-1000, default 250).'),
    },
    MUTATING,
    async ({ project_id, sources, filters, focus_question, lookback_days, max_events }: { project_id: string; sources?: Array<typeof SOURCES[number]>; filters?: Record<string, SourceFilter>; focus_question?: string; lookback_days?: number; max_events?: number }) => {
      try {
        const res = await api.generateInsight(project_id, 'architecture', {
          sources,
          filters,
          focusQuestion: focus_question,
          lookbackDays: lookback_days,
          maxEvents: max_events,
        });

        const { job, result } = await api.waitForJob(res.jobId);
        if (job.status === 'failed' || !result) {
          const reason = job.error ?? 'unknown error';
          return { content: [{ type: 'text', text: `Could not generate architecture insight: ${reason}` }] };
        }

        const insight = result as InsightResult;
        return { content: [{ type: 'text', text: insight.markdown ?? `# ${insight.title}\n\n${insight.summary}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Failed: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: list insights ─────────────────────────────────────────────

  server.tool(
    'generate_release_notes',
    'Generate release notes or a PR description from recent code activity (commits, PRs, builds). Runs synchronously and returns Markdown. Consumes 3 credits on success.',
    {
      project_id: z.string().describe('Project id from list_projects.'),
      source: SourceEnum.default('github').describe('Code source id (github, gitlab, bitbucket, azure_devops).'),
      repo: z.string().optional().describe('Repository name to scope changes to.'),
      style: z.enum(['release_notes', 'pr_description']).default('release_notes').describe('Output style.'),
      filters: FiltersSchema,
    },
    MUTATING,
    async ({ project_id, source, repo, style, filters }: { project_id: string; source?: typeof SOURCES[number]; repo?: string; style?: 'release_notes' | 'pr_description'; filters?: Record<string, SourceFilter> }) => {
      try {
        const res = await api.generateInsight(project_id, 'release_notes', { source, repo, style, filters });
        const { job, result } = await api.waitForJob(res.jobId);
        if (job.status === 'failed' || !result) {
          const reason = job.error ?? 'unknown error';
          return { content: [{ type: 'text', text: `Could not generate release notes: ${reason}` }] };
        }
        const insight = result as InsightResult;
        return { content: [{ type: 'text', text: insight.markdown ?? `# ${insight.title}\n\n${insight.summary}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Failed: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'list_digests',
    'List past scheduled activity digests for a project.',
    {
      project_id: z.string().describe('Project id from list_projects.'),
      limit: z.number().int().min(1).max(50).default(10).describe('Max digests to return (1-50, default 10).'),
    },
    READ_ONLY,
    async ({ project_id, limit }: { project_id: string; limit: number }) => {
      try {
        const { digests } = await api.listDigests(project_id, limit);
        if (digests.length === 0) {
          return { content: [{ type: 'text', text: 'No digests found for this project.' }] };
        }
        const text = digests.map((d) => d.markdown).join('\n\n---\n\n');
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Failed to list digests: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'list_insights',
    'List existing insights for a project (newest first) with their content. Use this to read what has already been generated before spending credits on a new generate_*_insight. Each row\'s id can be sent to Discord via discord_send_message.',
    {
      project_id: z.string().describe('Project id from list_projects to list insights for.'),
      kind: z.enum(['onboarding_brief', 'cross_source_correlation', 'architecture_insight', 'release_notes', 'plan_review']).optional().describe('Restrict to one kind. Omit for all kinds.'),
      status: z.enum(['active', 'archived', 'all']).default('active').describe('active = current, archived = superseded, all = both.'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max insights to return (1-50, default 20).'),
    },
    READ_ONLY,
    async ({ project_id, kind, status, limit }: { project_id: string; kind?: 'onboarding_brief' | 'cross_source_correlation' | 'architecture_insight' | 'release_notes' | 'plan_review'; status: 'active' | 'archived' | 'all'; limit: number }) => {
      try {
        const { insights } = await api.listInsights(project_id, kind, status, limit);
        if (insights.length === 0) {
          return { content: [{ type: 'text', text: `No ${status} insights found.` }] };
        }

        const text = insights.map((insight) => {
          return `## ${insight.title} (${insight.kind})\n**Status:** ${insight.status} · **Created:** ${new Date(insight.created_at).toLocaleString()}\n\n${insight.summary}`;
        }).join('\n---\n\n');

        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Failed to list insights: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: ask project ───────────────────────────────────────────────

  server.tool(
    'ask_project',
    'Ask one question about a project and get an answer grounded in its indexed codebase, connected baselines and last 14 days of activity. Answers synchronously – there is no job to poll. Costs 2 credits per question, so prefer list_handoffs / list_insights when an existing artifact already answers it.',
    {
      question: z.string().min(1).max(2000).describe('The question, 1-2000 characters.'),
      project_id: z.string().optional().describe('Project scope. Omit to use the active project.'),
    },
    MUTATING,
    async ({ question, project_id }: { question: string; project_id?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const { answer, citations } = await api.askProject(resolved.projectId, question);
        const refs = citations.length > 0 ? `\n\n_Evidence: ${citations.join(' ')}_` : '';
        return { content: [{ type: 'text', text: `${answer}${refs}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not answer: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: list filter options ───────────────────────────────────────

  server.tool(
    'list_filter_options',
    'List the real per-source filter values (resources, branches, event types, priorities) available for a project. Call this BEFORE generate_handoff or any generate_*_insight so the "filters" argument uses real values instead of guesses. Pass a resource id into filters[source].projects, a branch name into .branches, an event type into .eventTypes, a priority into .priorities.',
    {
      project_id: z.string().optional().describe('Project scope. Omit to use the active project.'),
    },
    READ_ONLY,
    async ({ project_id }: { project_id?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const { filters, figma } = await api.getHandoffFilters(resolved.projectId);
        const sources = Object.keys(filters);
        if (sources.length === 0) {
          return { content: [{ type: 'text', text: `No connected sources with filter options for ${resolved.project.name}.` }] };
        }

        const blocks = sources.map((src) => {
          const f = filters[src];
          const lines = [`### ${src}`];
          if (f.projects?.length) {
            const items = f.projects.slice(0, 50).map((p) => (p.label && p.label !== p.id ? `${p.label} (id: ${p.id})` : p.id));
            const more = f.projects.length > 50 ? ` (+${f.projects.length - 50} more)` : '';
            lines.push(`- Resources: ${items.join(', ')}${more}`);
          }
          if (f.branches?.length) lines.push(`- Branches: ${f.branches.map((b) => b.value).join(', ')}`);
          if (f.eventTypes?.length) lines.push(`- Event types: ${f.eventTypes.map((e) => e.value).join(', ')}`);
          if (f.priorities?.length) lines.push(`- Priorities: ${f.priorities.map((p) => p.value).join(', ')}`);
          return lines.join('\n');
        });

        if (figma && !figma.selectable) {
          blocks.push(
            '### figma\n- NOT selectable on this project: Figma visual context requires the Global processing region. ' +
              (figma.canManageResidency
                ? 'Switch the project to Global in its Data Residency settings first.'
                : 'Ask an organization admin to switch the project to Global first.'),
          );
        }

        return { content: [{ type: 'text', text: `Filter options for ${resolved.project.name}:\n\n${blocks.join('\n\n')}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not load filter options: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'list_work_items',
    'List the work items (tasks and milestones) of a project plan with key, status, progress, dates and assignees, ordered by item number. Filter by status or to your own assignments. Dates are wall-clock times in the plan time zone. When the reply ends with a cursor, pass it back as cursor to read the next page. Free: no credits.',
    {
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
      status: z.array(z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'])).optional().describe('Only items in these statuses. Omit for every status.'),
      mine: z.boolean().default(false).describe('Only items assigned to you.'),
      limit: z.number().int().min(1).max(200).default(50).describe('Max items to return (1-200, default 50).'),
      cursor: z.number().int().min(0).optional().describe('The cursor printed at the end of a previous page.'),
    },
    READ_ONLY,
    async ({ project_id, status, mine, limit, cursor }: { project_id?: string; status?: string[]; mine: boolean; limit: number; cursor?: number }) => {
      try {
        const resolved = await requireProject(project_id);
        const page = await api.listWorkItems(resolved.projectId, { status, assignee: mine ? 'me' : undefined, limit, cursor });
        if (page.items.length === 0) {
          return { content: [{ type: 'text', text: `No work items found in ${resolved.project.name}.` }] };
        }
        const more = page.nextCursor !== null ? `\n\nMore items: call again with cursor=${page.nextCursor}` : '';
        const text = `Work items in ${resolved.project.name} (times in ${page.timezone}):\n${page.items.map(workItemLine).join('\n')}${more}`;
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list work items: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'get_work_item',
    'Read one work item by key (such as FR-12) or id: description, progress, dates, assignees, dependencies, linked evidence (commits, pull requests, deploys, messages) and the comment count. Free: no credits.',
    {
      ref: z.string().min(1).max(100).describe('Item key such as FR-12, or the item id.'),
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
    },
    READ_ONLY,
    async ({ ref, project_id }: { ref: string; project_id?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const { timezone, item } = await api.getWorkItem(resolved.projectId, ref);
        return { content: [{ type: 'text', text: workItemDetail(item, timezone) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not read work item: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'list_my_work',
    'List the work items assigned to you across every accessible project: open items plus the ones finished in the last 7 days, with status, progress and dates. A good first call for "what should I work on next". Free: no credits.',
    {},
    READ_ONLY,
    async () => {
      try {
        const { items } = await api.listMyWork();
        if (items.length === 0) {
          return { content: [{ type: 'text', text: 'Nothing is assigned to you right now.' }] };
        }
        const text = `Your work:\n${items.map((item) => `${workItemLine(item)} – ${item.project.name}`).join('\n')}`;
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list your work: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'create_work_item',
    'Create a work item (task or milestone) in a project plan and return it with its key. Dates are wall-clock times in the plan time zone. Contributors can create items when the project allows it and can assign only themselves. Free: no credits. Not idempotent: calling it twice creates two items.',
    {
      title: z.string().min(1).max(500).describe('Item title, 1-500 characters.'),
      description: z.string().max(50000).optional().describe('Description in plain text or Markdown.'),
      parent: z.string().optional().describe('Key or id of the parent item (such as FR-3) to nest the new item under. Omit for a top-level item.'),
      kind: z.enum(['task', 'milestone']).optional().describe('task (default) or milestone.'),
      status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']).optional().describe('Initial status (default todo).'),
      priority: z.number().int().min(0).max(4).optional().describe('0 lowest, 1 low, 2 medium (default), 3 high, 4 urgent.'),
      duration: z.string().optional().describe('Duration such as "4h", "3d", "2w", "3ed" (elapsed days) or "2d?" (an estimate).'),
      deadline: z.string().optional().describe('Deadline as YYYY-MM-DD or YYYY-MM-DDTHH:mm in the plan time zone.'),
      assign_to_me: z.boolean().default(false).describe('Assign the new item to yourself.'),
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
    },
    MUTATING,
    async ({ title, description, parent, kind, status, priority, duration, deadline, assign_to_me, project_id }: { title: string; description?: string; parent?: string; kind?: 'task' | 'milestone'; status?: string; priority?: number; duration?: string; deadline?: string; assign_to_me: boolean; project_id?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const { item } = await api.createWorkItem(resolved.projectId, {
          title,
          description,
          parent,
          kind,
          status,
          priority,
          duration,
          deadline,
          assignee: assign_to_me ? 'me' : undefined,
        });
        return { content: [{ type: 'text', text: `Created ${item.key}: ${item.title}\n${item.url}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not create work item: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'update_work_item',
    'Update a work item by key or id: status, progress, title, description, priority, the blocked flag, duration or deadline. Sending the same values again leaves the item unchanged. Contributors can update items assigned to them or created by them; changing dates or durations may need a project manager. Free: no credits.',
    {
      ref: z.string().min(1).max(100).describe('Item key such as FR-12, or the item id.'),
      status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']).optional().describe('New status.'),
      percent_complete: z.number().int().min(0).max(100).optional().describe('Progress 0-100. 100 marks the item done.'),
      title: z.string().min(1).max(500).optional().describe('New title, 1-500 characters.'),
      description: z.string().max(50000).optional().describe('New description in plain text or Markdown.'),
      priority: z.number().int().min(0).max(4).optional().describe('0 lowest, 1 low, 2 medium, 3 high, 4 urgent.'),
      blocked: z.boolean().optional().describe('Flag or unflag the item as blocked. A flag, not a status.'),
      duration: z.string().optional().describe('Duration such as "4h", "3d", "2w", "3ed" (elapsed days) or "2d?" (an estimate).'),
      deadline: z.string().nullable().optional().describe('Deadline as YYYY-MM-DD or YYYY-MM-DDTHH:mm in the plan time zone, or null to clear it.'),
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
    },
    WRITE_IDEMPOTENT,
    async ({ ref, status, percent_complete, title, description, priority, blocked, duration, deadline, project_id }: { ref: string; status?: string; percent_complete?: number; title?: string; description?: string; priority?: number; blocked?: boolean; duration?: string; deadline?: string | null; project_id?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const { item } = await api.updateWorkItem(resolved.projectId, ref, {
          status,
          percentComplete: percent_complete,
          title,
          description,
          priority,
          blocked,
          duration,
          deadline,
        });
        return { content: [{ type: 'text', text: `Updated ${item.key} [${item.status}] ${item.percentComplete}%: ${item.title}\n${item.url}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not update work item: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'list_suggestions',
    'List the pending suggestions in a project plan that you can act on: status changes proposed from linked activity (an opened or merged pull request, a deploy), new items from meeting action items, dependencies from tracker links and activity suggested as evidence for an item. Nothing changes until someone accepts a suggestion in Flow Relay. Free: no credits.',
    {
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
    },
    READ_ONLY,
    async ({ project_id }: { project_id?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const { suggestions } = await api.listSuggestions(resolved.projectId);
        if (suggestions.length === 0) {
          return { content: [{ type: 'text', text: `No pending suggestions in ${resolved.project.name}.` }] };
        }
        return { content: [{ type: 'text', text: `Pending suggestions in ${resolved.project.name}:\n${suggestions.map(suggestionLine).join('\n')}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list suggestions: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'link_evidence',
    'Link work to a work item as evidence: a pull request, commit, build, deploy, incident, document or any other https link. The link joins the activity trail of the item and counts toward its evidence coverage. Sending the same link again leaves the item unchanged. Viewers cannot link. Free: no credits.',
    {
      ref: z.string().min(1).max(100).describe('Item key such as FR-12, or the item id.'),
      url: z.string().min(1).max(500).describe('The https link to attach.'),
      title: z.string().min(1).max(300).optional().describe('Short title for the link. Defaults to the link itself.'),
      kind: z.enum(['commit', 'branch', 'pull_request', 'review', 'build', 'deploy', 'incident', 'ticket', 'message', 'meeting', 'document', 'other']).optional().describe('What the link points to (default other).'),
      occurred_at: z.string().optional().describe('When the work happened, as an ISO 8601 date and time. Defaults to now.'),
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
    },
    WRITE_IDEMPOTENT,
    async ({ ref, url, title, kind, occurred_at, project_id }: { ref: string; url: string; title?: string; kind?: string; occurred_at?: string; project_id?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const linked = await api.linkEvidence(resolved.projectId, ref, { url, title, kind, occurredAt: occurred_at });
        return { content: [{ type: 'text', text: `Linked ${linked.url} to ${ref}.` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not link evidence: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'generate_plan_review',
    'Write a status report for a project plan: progress, concerns, the outlook of each upcoming milestone, suggested register entries and next steps. Every date, variance and index comes from the plan itself; the model only writes the narrative from the plan facts and the last 14 days of linked activity. Runs synchronously and returns Markdown. Consumes 5 credits on success. Viewers cannot generate.',
    {
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
      filters: FiltersSchema,
    },
    MUTATING,
    async ({ project_id, filters }: { project_id?: string; filters?: Record<string, SourceFilter> }) => {
      try {
        const resolved = await requireProject(project_id);
        const res = await api.generateInsight(resolved.projectId, 'plan_review', { filters });
        const { job, result } = await api.waitForJob(res.jobId);
        if (job.status === 'failed' || !result) {
          const reason = job.error ?? 'unknown error';
          return { content: [{ type: 'text', text: `Could not generate the plan review: ${reason}` }] };
        }
        const insight = result as InsightResult;
        return { content: [{ type: 'text', text: insight.markdown ?? `# ${insight.title}\n\n${insight.summary}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Failed: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'get_earned_value',
    'Read the cost picture of a project plan at its status date: planned and actual cost, and the earned value figures (planned value, earned value, variances, SPI, CPI, TCPI and the estimates at completion) measured against a baseline. Amounts are in the currency of the organization. Project managers only, on plans that include costs. Free: no credits.',
    {
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
      baseline: z.number().int().min(0).max(10).optional().describe('Baseline slot to measure against, 0 to 10 (default 0).'),
    },
    READ_ONLY,
    async ({ project_id, baseline }: { project_id?: string; baseline?: number }) => {
      try {
        const resolved = await requireProject(project_id);
        const evm = await api.getEarnedValue(resolved.projectId, baseline);
        return { content: [{ type: 'text', text: earnedValueText(resolved.project.name, evm) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not read earned value: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'list_raid',
    'List the RAID register of a project plan: risks, assumptions, issues, decisions and dependencies, highest number first, with their score (probability times impact) and response. Entries that are not closed by default. Free: no credits.',
    {
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
      kind: z.enum(['risk', 'assumption', 'issue', 'decision', 'dependency']).optional().describe('Restrict to one type. Omit for all types.'),
      status: z.enum(['open', 'monitoring', 'closed', 'all']).optional().describe('Restrict to one status, or all. Omit for every entry that is not closed.'),
      limit: z.number().int().min(1).max(200).default(50).describe('Max entries to return (1-200, default 50).'),
    },
    READ_ONLY,
    async ({ project_id, kind, status, limit }: { project_id?: string; kind?: string; status?: string; limit?: number }) => {
      try {
        const resolved = await requireProject(project_id);
        const { entries } = await api.listRaid(resolved.projectId, { kind, status, limit });
        if (entries.length === 0) {
          return { content: [{ type: 'text', text: `No register entries match in ${resolved.project.name}.` }] };
        }
        return { content: [{ type: 'text', text: `RAID register of ${resolved.project.name}:\n${entries.map(raidLine).join('\n')}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list the register: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'get_portfolio',
    'Read the portfolio of an organization: every project you can open with its progress, forecast finish, next milestone, open risks and health (on track, at risk or off track: computed every night from the plan and the build, deploy and incident signals, or set by hand by a project manager). Use it to see which projects need attention. Business plan and above. Free: no credits.',
    {
      organization_id: z.string().describe('Organization id: shown as organization_id on the projects of list_projects.'),
    },
    READ_ONLY,
    async ({ organization_id }: { organization_id: string }) => {
      try {
        const portfolio = await api.getPortfolio(organization_id);
        return { content: [{ type: 'text', text: portfolioText(portfolio) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not read the portfolio: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'get_forecast',
    'Forecast when a project plan will finish by simulating it thousands of times: the finish of the project and of each milestone as the date by which half, four out of five and nineteen out of twenty of the runs are done, the chance of meeting the target finish or a milestone deadline, and the items most often on the critical path. Mode schedule (default) varies the durations of the plan (uncertainty low, medium or high); mode throughput uses how many items the team finished each week over the last twelve weeks. Business plan and above. Free: no credits.',
    {
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
      mode: z.enum(['schedule', 'throughput']).optional().describe('schedule varies the durations of the plan (default); throughput uses the weekly pace of the team.'),
      uncertainty: z.enum(['low', 'medium', 'high']).optional().describe('How much the durations may vary in schedule mode (default medium).'),
    },
    READ_ONLY,
    async ({ project_id, mode, uncertainty }: { project_id?: string; mode?: string; uncertainty?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const forecast = await api.getForecast(resolved.projectId, { mode, uncertainty });
        return { content: [{ type: 'text', text: forecastText(resolved.project.name, forecast) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not forecast: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'plan_whatif',
    'Ask a what-if question about a project plan, for example: what if the payment integration takes three weeks longer? The model turns the question into changes to the work (a duration, a delay, a cancellation, a link) and the scheduler computes the new finish of the project and of each milestone and how many items move. Nothing is saved and the plan is not changed. Costs 5 credits.',
    {
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
      question: z.string().min(5).max(500).describe('The what-if question, in words, about the work of the plan.'),
    },
    MUTATING,
    async ({ project_id, question }: { project_id?: string; question: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const result = await api.planWhatIf(resolved.projectId, question);
        return { content: [{ type: 'text', text: whatIfText(result) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not answer the what-if: ${(err as Error).message}` }] };
      }
    },
  );


  server.tool(
    'list_automations',
    'List the automation rules of a project plan: what starts each one, what it checks and what it does, how many times it ran and how the last run went. Read only, the rules are changed in the app. Free: no credits.',
    {
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
    },
    READ_ONLY,
    async ({ project_id }: { project_id?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const { automations } = await api.listAutomations(resolved.projectId);
        if (automations.length === 0) return { content: [{ type: 'text', text: `${resolved.project.name} has no automation rules.` }] };
        return { content: [{ type: 'text', text: `Automation rules of ${resolved.project.name}:\n${automations.map(automationLine).join('\n')}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list the automations: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'list_templates',
    'List the templates saved for a project plan, either a whole plan or one item with its subtasks, with the id to give to apply_template. A template keeps names, notes, durations and links, never people or dates. Free: no credits.',
    {
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
    },
    READ_ONLY,
    async ({ project_id }: { project_id?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const { templates } = await api.listTemplates(resolved.projectId);
        if (templates.length === 0) return { content: [{ type: 'text', text: `No templates are saved for ${resolved.project.name}.` }] };
        return { content: [{ type: 'text', text: `Templates for ${resolved.project.name}:\n${templates.map(templateLine).join('\n')}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list the templates: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'apply_template',
    'Add the items of a saved template to a project plan, at the top level or under an existing item. Only project managers can do it. Costs no credits but creates items in the plan, which the change history can undo.',
    {
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
      template_id: z.string().describe('Template id from list_templates.'),
      parent: z.string().optional().describe('Item key such as FR-12 or item id to add the template under. Omit for the top level.'),
    },
    MUTATING,
    async ({ project_id, template_id, parent }: { project_id?: string; template_id: string; parent?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const result = await api.applyTemplate(resolved.projectId, template_id, parent);
        return { content: [{ type: 'text', text: `Added ${result.created} item${result.created === 1 ? '' : 's'} from the template to ${resolved.project.name}.` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not apply the template: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'list_approvals',
    'List the change requests of a project plan: what was asked in plain language, who asked, who decided and what they said. Change requests need the Business plan and an organization project. Free: no credits.',
    {
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
      pending_only: z.boolean().optional().describe('Only the requests waiting for a decision.'),
    },
    READ_ONLY,
    async ({ project_id, pending_only }: { project_id?: string; pending_only?: boolean }) => {
      try {
        const resolved = await requireProject(project_id);
        const { approvals } = await api.listApprovals(resolved.projectId, pending_only === true);
        if (approvals.length === 0) return { content: [{ type: 'text', text: `${resolved.project.name} has no change requests${pending_only ? ' waiting for a decision' : ''}.` }] };
        return { content: [{ type: 'text', text: `Change requests of ${resolved.project.name}:\n${approvals.map(approvalLine).join('\n')}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not list the change requests: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool(
    'request_change',
    'Ask for a change to a work item that a second person must approve, when you may not make it directly or want it reviewed: status, progress, priority, the blocked flag, duration or deadline. The approvers are notified and approving applies the change. This only creates a request: nothing changes in the plan yet. Organization projects on the Business plan or above only. Free: no credits.',
    {
      ref: z.string().min(1).max(100).describe('Item key such as FR-12, or the item id.'),
      title: z.string().min(1).max(200).describe('What you want changed, in a few words.'),
      note: z.string().max(2000).optional().describe('Why the change is needed.'),
      status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']).optional().describe('New status.'),
      percent_complete: z.number().int().min(0).max(100).optional().describe('Progress 0-100.'),
      priority: z.number().int().min(0).max(4).optional().describe('0 lowest, 1 low, 2 medium, 3 high, 4 urgent.'),
      blocked: z.boolean().optional().describe('Flag or unflag the item as blocked.'),
      duration: z.string().optional().describe('Duration such as "4h", "3d", "2w", "3ed" (elapsed days) or "2d?" (an estimate).'),
      deadline: z.string().nullable().optional().describe('Deadline as YYYY-MM-DD or YYYY-MM-DDTHH:mm in the plan time zone, or null to clear it.'),
      project_id: z.string().optional().describe('Project id from list_projects. Omit to use the active project.'),
    },
    MUTATING,
    async ({ ref, title, note, status, percent_complete, priority, blocked, duration, deadline, project_id }: { ref: string; title: string; note?: string; status?: string; percent_complete?: number; priority?: number; blocked?: boolean; duration?: string; deadline?: string | null; project_id?: string }) => {
      try {
        const resolved = await requireProject(project_id);
        const changes = Object.fromEntries(
          Object.entries({ status, percentComplete: percent_complete, priority, blocked, duration, deadline }).filter(([, v]) => v !== undefined),
        );
        if (Object.keys(changes).length === 0) return { content: [{ type: 'text', text: 'Give at least one change to ask for.' }] };
        await api.requestChange(resolved.projectId, { item: ref, title, note, changes });
        return { content: [{ type: 'text', text: `Change request sent to the approvers of ${resolved.project.name}: "${title}". Nothing changes in the plan until someone else approves it.` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Could not send the change request: ${(err as Error).message}` }] };
      }
    },
  );

  return server;
}
