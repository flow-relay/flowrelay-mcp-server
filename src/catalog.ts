import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';

/**
 * What the two Flow Relay MCP servers (this npm package and the hosted /mcp
 * endpoint) share besides their tool definitions: the output schemas of the
 * data tools, the way a tool's structured result is built from what its API
 * calls returned, and which tool opens which interactive view.
 *
 * This file is the single source. `npm run mcp:catalog` in the web app copies
 * it to src/lib/mcp/catalog.generated.ts and the test compares the two byte
 * for byte, so the surfaces cannot drift.
 */

const Obj = z.record(z.string(), z.unknown());

export const OUTPUT_SCHEMAS = {
  list_projects: z.object({
    projects: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        scope: z.string(),
        role: z.string(),
        key: z.string().nullable().optional(),
        organization_id: z.string().nullable().optional(),
        organization_name: z.string().nullable().optional(),
      }),
    ),
  }),
  list_work_items: z.object({
    timezone: z.string().optional(),
    nextCursor: z.number().nullable().optional(),
    items: z.array(Obj),
  }),
  get_work_item: z.object({ timezone: z.string().optional(), item: Obj }),
  get_forecast: z.object({ forecast: Obj }),
  get_earned_value: z.object({ evm: Obj }),
  list_raid: z.object({ entries: z.array(Obj) }),
  get_portfolio: z.object({ portfolio: Obj }),
  ask_project: z.object({
    thread_id: z.string(),
    message_id: z.string().optional(),
    answer: z.string(),
    tier: z.string().optional(),
    credits: z.number().optional(),
    citations: z.array(Obj),
  }),
  list_handoffs: z.object({ handoffs: z.array(Obj) }),
  list_insights: z.object({ insights: z.array(Obj) }),
} as const;

export type StructuredToolName = keyof typeof OUTPUT_SCHEMAS;

/** The interactive view a tool's result can open in a client that supports MCP Apps. */
export const APP_VIEW_OF_TOOL: Partial<Record<StructuredToolName, AppView>> = {
  ask_project: 'ask',
  list_handoffs: 'handoff',
  list_insights: 'insight',
  list_work_items: 'work',
  get_work_item: 'work',
  get_forecast: 'forecast',
  list_raid: 'raid',
};

export type AppView = 'ask' | 'handoff' | 'insight' | 'work' | 'forecast' | 'raid';

export const APP_VIEWS: Record<AppView, { title: string; description: string }> = {
  ask: { title: 'Answer with sources', description: 'An Ask answer with the sources it used.' },
  handoff: { title: 'Handoff', description: 'A project handoff: changes, decisions, next steps, open questions.' },
  insight: { title: 'Insight', description: 'A correlation, onboarding or architecture insight.' },
  work: { title: 'Work items', description: 'Work items of a plan, or one item with its evidence.' },
  forecast: { title: 'Forecast', description: 'When the plan finishes: the dates by which 50, 80 and 95 percent of simulated runs are done.' },
  raid: { title: 'RAID register', description: 'Risks, assumptions, issues and decisions on a probability and impact grid.' },
};

export const APP_MIME_TYPE = 'text/html;profile=mcp-app';

export function appResourceUri(view: AppView): string {
  return `ui://flowrelay/${view}`;
}

/** The `_meta` a tool carries so a host knows which view renders its result. */
export function appMetaFor(tool: StructuredToolName): { ui: { resourceUri: string } } | undefined {
  const view = APP_VIEW_OF_TOOL[tool];
  return view ? { ui: { resourceUri: appResourceUri(view) } } : undefined;
}

interface RecordedCall {
  method: string;
  result: unknown;
}

interface Recorder {
  calls: RecordedCall[];
}

const recorderStore = new AsyncLocalStorage<Recorder>();

/**
 * Wrap an API client so every call made while a structured tool runs is
 * remembered. A tool's handler stays as it is, building the text for the
 * reader; the structured result is derived from the same data.
 */
export function recordApi<T extends object>(api: T): T {
  return new Proxy(api, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string') return value;
      return async (...args: unknown[]) => {
        const result = await (value as (...a: unknown[]) => unknown).apply(target, args);
        recorderStore.getStore()?.calls.push({ method: property, result });
        return result;
      };
    },
  });
}

function lastResult(calls: RecordedCall[], method: string): Record<string, unknown> | null {
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i].method === method && calls[i].result && typeof calls[i].result === 'object') {
      return calls[i].result as Record<string, unknown>;
    }
  }
  return null;
}

type Mapper = (calls: RecordedCall[]) => Record<string, unknown> | null;

const MAPPERS: Record<StructuredToolName, Mapper> = {
  list_projects: (calls) => {
    const context = lastResult(calls, 'listProjects') as { projects?: Array<Record<string, unknown>> } | null;
    if (!context?.projects) return null;
    return {
      projects: context.projects.map((p) => ({
        id: String(p.id),
        name: String(p.name),
        scope: p.project_type === 'personal' ? 'personal' : `org:${String(p.organization_name ?? 'unknown')}`,
        role: String(p.access_role),
        key: (p.key as string | null | undefined) ?? null,
        organization_id: (p.organization_id as string | null | undefined) ?? null,
        organization_name: (p.organization_name as string | null | undefined) ?? null,
      })),
    };
  },
  list_work_items: (calls) => {
    const page = lastResult(calls, 'listWorkItems');
    return page ? { timezone: page.timezone, nextCursor: page.nextCursor ?? null, items: page.items ?? [] } : null;
  },
  get_work_item: (calls) => {
    const found = lastResult(calls, 'getWorkItem');
    return found ? { timezone: found.timezone, item: found.item } : null;
  },
  get_forecast: (calls) => {
    const forecast = lastResult(calls, 'getForecast');
    return forecast ? { forecast } : null;
  },
  get_earned_value: (calls) => {
    const evm = lastResult(calls, 'getEarnedValue');
    return evm ? { evm } : null;
  },
  list_raid: (calls) => {
    const raid = lastResult(calls, 'listRaid');
    return raid ? { entries: raid.entries ?? [] } : null;
  },
  get_portfolio: (calls) => {
    const portfolio = lastResult(calls, 'getPortfolio');
    return portfolio ? { portfolio } : null;
  },
  ask_project: (calls) => {
    const answer = lastResult(calls, 'askProject');
    return answer
      ? {
          thread_id: answer.thread_id,
          message_id: answer.message_id,
          answer: answer.answer,
          tier: answer.tier,
          credits: answer.credits,
          citations: answer.citations ?? [],
        }
      : null;
  },
  list_handoffs: (calls) => {
    const result = lastResult(calls, 'listHandoffs');
    return result ? { handoffs: result.handoffs ?? [] } : null;
  },
  list_insights: (calls) => {
    const result = lastResult(calls, 'listInsights');
    return result ? { insights: result.insights ?? [] } : null;
  },
};

interface ToolResult {
  content?: unknown;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

/**
 * Run a tool handler with the recorder on and attach `structuredContent` built
 * from what its API calls returned. The text stays as written. A failed run
 * (`isError`) carries no structured content, as the spec asks. A path that
 * ends before any data call (no project selected) yields an empty list rather
 * than a result that breaks the output schema.
 */
export function structured(name: StructuredToolName, handler: (...args: never[]) => Promise<unknown>): never {
  const wrapped = async (...args: never[]): Promise<unknown> => {
    const recorder: Recorder = { calls: [] };
    const result = (await recorderStore.run(recorder, () => handler(...args))) as ToolResult;
    if (result.isError || result.structuredContent) return result;
    const data = MAPPERS[name](recorder.calls);
    result.structuredContent = data ?? EMPTY_RESULTS[name];
    return result;
  };
  return wrapped as never;
}

const EMPTY_RESULTS: Record<StructuredToolName, Record<string, unknown>> = {
  list_projects: { projects: [] },
  list_work_items: { items: [] },
  get_work_item: { item: {} },
  get_forecast: { forecast: {} },
  get_earned_value: { evm: {} },
  list_raid: { entries: [] },
  get_portfolio: { portfolio: {} },
  ask_project: { thread_id: '', answer: '', citations: [] },
  list_handoffs: { handoffs: [] },
  list_insights: { insights: [] },
};

/**
 * Event text is written by other people and tools. Where it reaches the model
 * inside a tool result it is fenced, so an instruction a message carries reads
 * as content to report, not as a command.
 */
export function fenceUntrusted(label: string, text: string): string {
  const safe = text.replace(/<\/?untrusted_source_content/gi, '&lt;untrusted_source_content');
  return `<untrusted_source_content source="${label.replace(/"/g, '')}">\n${safe}\n</untrusted_source_content>`;
}

/**
 * Register the six interactive views as `ui://` resources. The HTML is the
 * generated bundle; its content security policy declares no network origin, so
 * a view can only draw what the tool returned.
 */
export function registerAppViews(server: McpServer, html: Record<AppView, string>): void {
  for (const view of Object.keys(APP_VIEWS) as AppView[]) {
    const uri = appResourceUri(view);
    server.registerResource(
      `app_${view}`,
      uri,
      {
        title: APP_VIEWS[view].title,
        description: APP_VIEWS[view].description,
        mimeType: APP_MIME_TYPE,
        _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
      },
      async () => ({ contents: [{ uri, mimeType: APP_MIME_TYPE, text: html[view] }] }),
    );
  }
}

/** What a generation tool answers when called with wait set to false. */
export function jobStartedText(jobId: string): string {
  return `Started. The artifact is not ready yet: read flowrelay://jobs/${jobId} for its state, and again in a few seconds until it shows the finished document.`;
}

export interface ToolCatalogEntry {
  readonly name: string;
  readonly summary: string;
}

export interface ToolCatalogGroup {
  readonly label: string;
  readonly tools: readonly ToolCatalogEntry[];
}

/**
 * Grouped tool table shared with the Downloads page (`src/app/downloads/page.tsx`).
 * Tested against `tools/list` in `tests/mcp-catalog-parity.test.ts` so every
 * shipped tool stays listed.
 */
export const TOOL_CATALOG_GROUPS: readonly ToolCatalogGroup[] = [
  {
    label: 'Context',
    tools: [
      { name: 'get_workspace_context', summary: 'See the workspaces your key reaches, the active project and your role in it' },
      { name: 'list_projects', summary: 'List personal and organization projects you can access' },
      { name: 'set_active_project', summary: 'Set or clear the project the other tools work on' },
      { name: 'list_filter_options', summary: 'List selectable resources, branches, event types and priorities per source so filters use real values' },
    ],
  },
  {
    label: 'Handoffs',
    tools: [
      { name: 'list_handoffs', summary: 'List your handoffs filtered by status (active or archived) and limit' },
      { name: 'generate_handoff', summary: 'Generate a project handoff for the active or selected project with optional source filters' },
    ],
  },
  {
    label: 'Integrations and events',
    tools: [
      { name: 'list_integrations', summary: 'List connected integrations in personal or project scope' },
      { name: 'list_untracked_resources', summary: 'List discovered active resources not yet assigned to any project' },
      { name: 'list_events', summary: 'Browse recent events in personal or project scope' },
    ],
  },
  {
    label: 'Insights and analysis',
    tools: [
      { name: 'generate_correlation_insight', summary: 'Generate cross-source correlation AI insight for the project scope with optional source filters' },
      { name: 'generate_onboarding_brief', summary: 'Generate onboarding brief AI insight for the project scope with optional source filters' },
      { name: 'generate_architecture_insight', summary: 'Generate architecture insight for the project scope with optional source filters' },
      { name: 'generate_release_notes', summary: 'Generate release notes for the active project' },
      { name: 'list_insights', summary: 'List project AI insights for a selected project scope' },
      { name: 'list_digests', summary: 'List project digests for a selected project scope' },
      { name: 'ask_project', summary: 'Ask the active project a question, by depth, and continue a thread; answers carry their sources' },
    ],
  },
  {
    label: 'Work items',
    tools: [
      { name: 'list_work_items', summary: 'List work items in the active project with optional status and assignee filters' },
      { name: 'get_work_item', summary: 'Get full details of a single work item by ID' },
      { name: 'list_my_work', summary: 'List work items assigned to the current user' },
      { name: 'create_work_item', summary: 'Create a new work item in the active project' },
      { name: 'update_work_item', summary: 'Update fields on an existing work item' },
      { name: 'list_suggestions', summary: 'List AI-generated suggestions for new work items or improvements' },
      { name: 'link_evidence', summary: 'Link an event or artifact as evidence to a work item' },
      { name: 'resolve_suggestion', summary: 'Accept or dismiss a suggestion' },
      { name: 'delete_work_item', summary: 'Delete a work item – a soft delete, restorable from the change history' },
    ],
  },
  {
    label: 'Plan and portfolio',
    tools: [
      { name: 'generate_plan_review', summary: 'Generate a plan review for the active project' },
      { name: 'get_earned_value', summary: 'Get earned value management metrics for the project' },
      { name: 'list_raid', summary: 'List the project RAID register (risks, assumptions, issues and dependencies)' },
      { name: 'get_portfolio', summary: 'Get portfolio-level overview across projects' },
      { name: 'get_forecast', summary: 'Get project forecast and schedule projections' },
      { name: 'plan_whatif', summary: 'Run a what-if scenario against the plan' },
      { name: 'list_automations', summary: 'List automation rules configured for the project' },
      { name: 'list_templates', summary: 'List available work-item templates' },
      { name: 'apply_template', summary: 'Apply a work-item template to the active project' },
      { name: 'list_approvals', summary: 'List pending change requests and approvals' },
      { name: 'request_change', summary: 'Submit a change request for a work item' },
      { name: 'decide_approval', summary: 'Approve, reject or withdraw a pending change request' },
      { name: 'create_raid_entry', summary: 'Add a risk, assumption, issue or dependency to the RAID register' },
    ],
  },
  {
    label: 'Discord',
    tools: [
      { name: 'discord_list_channels', summary: 'List text channels in your connected Discord server' },
      { name: 'discord_send_message', summary: 'Send a message to a Discord channel in your connected server' },
    ],
  },
];
