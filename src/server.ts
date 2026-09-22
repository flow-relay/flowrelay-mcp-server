/**
 * @license
 * Flow Relay MCP Server
 * Copyright (c) 2026 Adriano Sorbello (atrisorb) <https://github.com/atrisorb>
 * Licensed under GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FlowRelayAPI, TenantProject, HandoffResult, InsightResult, SourceFilter } from './api.js';
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
    'List every project the API key can access (personal and organization), each with its id, scope and the caller\'s role. The id returned here is what you pass as project_id to the generate_* and list tools – start here whenever you need one.',
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
          return `- ${project.name} (${scope}, role=${project.access_role})\n  id: ${project.id}${active}`;
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
      kind: z.enum(['onboarding_brief', 'cross_source_correlation', 'architecture_insight', 'release_notes']).optional().describe('Restrict to one kind. Omit for all kinds.'),
      status: z.enum(['active', 'archived', 'all']).default('active').describe('active = current, archived = superseded, all = both.'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max insights to return (1-50, default 20).'),
    },
    READ_ONLY,
    async ({ project_id, kind, status, limit }: { project_id: string; kind?: 'onboarding_brief' | 'cross_source_correlation' | 'architecture_insight' | 'release_notes'; status: 'active' | 'archived' | 'all'; limit: number }) => {
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

  return server;
}
