/**
 * @license
 * Flow Relay MCP Server API Client
 * Copyright (c) 2026 Adriano Sorbello (atrisorb) <https://github.com/atrisorb>
 * Licensed under GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)
 */

const DEFAULT_BASE_URL = 'https://www.flowrelay.it';

export type AccountType = 'personal' | 'business';
export type AccessRole = 'owner' | 'admin' | 'member';

export interface TenantOrganization {
  id: string;
  name: string;
  slug: string;
  role: 'admin' | 'member';
  is_temporary_admin: boolean;
}

export interface TenantProject {
  id: string;
  name: string;
  slug: string;
  key?: string | null;
  description: string;
  organization_id: string | null;
  organization_name: string | null;
  organization_slug: string | null;
  project_type: 'personal' | 'organization';
  access_role: AccessRole;
  created_at: string;
  updated_at: string;
}

export interface TenantContext {
  account_type: AccountType;
  organizations: TenantOrganization[];
  projects: TenantProject[];
}

export type AiJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface AiJob {
  id: string;
  project_id: string;
  kind: string;
  status: AiJobStatus;
  result_kind: 'handoff' | 'insight' | null;
  result_id: string | null;
  error: string | null;
  error_code: string | null;
  error_meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HandoffResult {
  id: string;
  user_id: string;
  project_id: string | null;
  project_name?: string | null;
  scope_type?: 'personal' | 'project';
  title: string;
  summary: string;
  status: string;
  sources: string[];
  key_changes?: string[];
  decisions: string[];
  open_questions: string[];
  next_steps: string[];
  created_at: string;
  updated_at?: string;
  /** Canonical Markdown rendered server-side – identical to the dashboard copy button. */
  markdown?: string;
}

export interface InsightResult {
  id: string;
  project_id: string;
  requested_by: string;
  kind: 'onboarding_brief' | 'cross_source_correlation' | 'architecture_insight' | 'release_notes';
  title: string;
  summary: string;
  data: Record<string, unknown>;
  model_used: string;
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  status: string;
  related_event_ids: string[];
  created_at: string;
  updated_at?: string;
  /** Canonical Markdown rendered server-side – identical to the dashboard copy button. */
  markdown?: string;
}

export interface UntrackedResource {
  source: string;
  resource_id: string;
  resource_name: string;
  resource_type: string;
}

export interface SourceFilter {
  projects?: string[];
  eventTypes?: string[];
  branches?: string[];
  priorities?: string[];
}

export type GenerateHandoffResponse = {
  jobId: string;
  status: AiJobStatus;
};

export type GenerateInsightResponse = {
  jobId: string;
  status: AiJobStatus;
};

export interface AvailableSourceFilter {
  projects: { id: string; label: string }[];
  eventTypes: { value: string; label: string }[];
  branches?: { value: string; label: string }[];
  branchesByProject?: Record<string, { value: string; label: string }[]>;
  defaultBranchByProject?: Record<string, string>;
  priorities: { value: string; label: string }[];
}

export type AvailableFilters = Record<string, AvailableSourceFilter>;

export interface FigmaGateInfo {
  selectable: boolean;
  region: string;
  scope: string;
  canManageResidency: boolean;
  residencyHref: string | null;
}

export interface WorkItemSummary {
  id: string;
  key: string;
  number: number;
  title: string;
  kind: string;
  status: string;
  blocked: boolean;
  priority: number;
  isSummary: boolean;
  parentId: string | null;
  percentComplete: number;
  start: string | null;
  finish: string | null;
  deadline: string | null;
  durationMinutes: number | null;
  critical: boolean;
  assignees: { userId: string | null; name: string }[];
  version: number;
  updatedAt: string;
  url: string;
}

export interface WorkItemDetail extends WorkItemSummary {
  description: string;
  predecessors: { key: string | null; type: string; lagMinutes: number }[];
  successors: { key: string | null; type: string; lagMinutes: number }[];
  evidence: { source: string; kind: string; title: string | null; url: string | null; occurredAt: string }[];
  commentCount: number;
}

export interface MyWorkEntry {
  id: string;
  key: string;
  title: string;
  status: string;
  blocked: boolean;
  priority: number;
  kind: string;
  percentComplete: number;
  start: string | null;
  finish: string | null;
  deadline: string | null;
  updatedAt: string;
  url: string;
  project: { id: string; name: string; timezone: string };
}

export interface WorkItemInput {
  title?: string;
  description?: string;
  parent?: string;
  kind?: 'task' | 'milestone';
  status?: string;
  priority?: number;
  duration?: string;
  deadline?: string | null;
  assignee?: string;
  blocked?: boolean;
  percentComplete?: number;
}

export interface WorkSuggestion {
  id: string;
  type: 'status_change' | 'create_item' | 'dependency' | 'evidence';
  item: string | null;
  payload: Record<string, unknown>;
  origin: string;
  forYou: boolean;
  createdAt: string;
}

export interface EvidenceLinkInput {
  url: string;
  title?: string;
  kind?: string;
  occurredAt?: string;
}

export interface EarnedValueResult {
  currency: string;
  statusDate: string;
  baseline: number | null;
  actualsFrom: 'timesheets' | 'progress';
  plannedCostCents: number | null;
  actualCostCents: number | null;
  budgetCents: number | null;
  earnedValue: {
    budgetAtCompletionCents: number | null;
    plannedValueCents: number | null;
    earnedValueCents: number | null;
    actualCostCents: number | null;
    scheduleVarianceCents: number | null;
    costVarianceCents: number | null;
    spi: number | null;
    cpi: number | null;
    tcpi: number | null;
    estimateAtCompletionCents: { cpi: number | null; budgetRate: number | null; cpiSpi: number | null };
    estimateToCompleteCents: number | null;
    varianceAtCompletionCents: number | null;
  };
}

export interface RaidEntry {
  id: string;
  number: number;
  type: 'risk' | 'assumption' | 'issue' | 'decision' | 'dependency';
  title: string;
  description: string;
  status: 'open' | 'monitoring' | 'closed';
  probability: number | null;
  impact: number | null;
  score: number | null;
  response: string;
  dueOn: string | null;
  item: string | null;
}

export interface RaidQuery {
  kind?: string;
  status?: string;
  limit?: number;
}

export interface ScheduleForecast {
  mode: 'schedule';
  uncertainty: string;
  iterations: number;
  project: { plan: string | null; target: string | null; p50: string | null; p80: string | null; p95: string | null; chance: number | null };
  milestones: { ref: string; title: string; plan: string | null; deadline: string | null; p50: string | null; p80: string | null; p95: string | null; chance: number | null }[];
  critical: { ref: string; title: string; index: number }[];
}

export interface ThroughputForecast {
  mode: 'throughput';
  iterations: number;
  available: boolean;
  backlog: number;
  weeksOfHistory: number;
  p50: string | null;
  p80: string | null;
  p95: string | null;
  weeks: { p50: number; p80: number; p95: number } | null;
  chance: number | null;
  capped: boolean;
}

export type ForecastResult = ScheduleForecast | ThroughputForecast;

export interface WhatIfResult {
  explanation: string;
  changes: string[];
  left_out: string[];
  comparison: {
    projectFinish: { now: string | null; scenario: string | null; deltaWorkingDays: number | null };
    milestones: { ref: string; title: string; now: string | null; scenario: string | null; deltaWorkingDays: number | null }[];
    moved: number;
    criticalBecame: number;
    criticalLeft: number;
    warnings: number;
  } | null;
  errors: string[];
}
export interface AutomationSummary {
  id: string;
  name: string;
  enabled: boolean;
  summary: string;
  runCount: number;
  lastRunAt: string | null;
  lastStatus: string | null;
}

export interface TemplateSummary {
  id: string;
  kind: 'project' | 'item';
  name: string;
  description: string;
  itemCount: number;
}

export interface ApprovalSummary {
  id: string;
  kind: 'scope' | 'baseline';
  title: string;
  note: string;
  summary: string[];
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'failed';
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface RequestChangeInput {
  item: string;
  title: string;
  note?: string;
  changes: Record<string, unknown>;
}

export interface PortfolioProject {
  id: string;
  key: string;
  name: string;
  status: string;
  programId: string | null;
  percentComplete: number | null;
  projectStart: string | null;
  scheduledFinish: string | null;
  targetFinish: string | null;
  openRisks: number;
  nextMilestone: { ref: string; title: string; finish: string } | null;
  health: {
    verdict: 'green' | 'amber' | 'red';
    overridden: boolean;
    comment: string | null;
    schedule: 'green' | 'amber' | 'red';
    scope: 'green' | 'amber' | 'red' | null;
    delivery: 'green' | 'amber' | 'red' | null;
    computedOn: string;
    slipWorkingDays: number | null;
    overdueItems: number | null;
    openItems: number | null;
  } | null;
}

export interface PortfolioResult {
  organizationId: string;
  projects: PortfolioProject[];
  programs: { id: string; name: string }[];
  dependencies: { from: string; to: string; count: number }[];
}
export class FlowRelayAPI {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
  }

  private async requestRaw<T>(path: string, options?: RequestInit): Promise<{ status: number; body: T }> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const signal = options?.signal ?? AbortSignal.timeout(30_000);
    const res = await fetch(url, {
      ...options,
      signal,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? `API error ${res.status}`);
    }
    if (res.status === 204) return { status: 204, body: {} as T };
    return { status: res.status, body: (await res.json()) as T };
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const { body } = await this.requestRaw<T>(path, options);
    return body;
  }

  async listProjects() {
    return this.request<TenantContext>('/projects');
  }

  async getHandoffFilters(
    projectId: string,
  ): Promise<{ filters: AvailableFilters; figma: FigmaGateInfo | null }> {
    const { filters, figma } = await this.request<{
      filters: AvailableFilters;
      figma?: FigmaGateInfo;
    }>(`/handoffs/filters?project_id=${encodeURIComponent(projectId)}`);
    return { filters: filters ?? {}, figma: figma ?? null };
  }

  async listHandoffs(status = 'active', limit = 10, projectId?: string | null) {
    const params = new URLSearchParams();
    params.set('status', status);
    params.set('limit', String(limit));
    if (projectId) params.set('project_id', projectId);

    return this.request<{
      handoffs: HandoffResult[];
    }>(`/handoffs?${params.toString()}`);
  }

  async generateHandoff(
    sources: string[] | undefined,
    filters: Record<string, SourceFilter> | undefined,
    projectId: string,
  ): Promise<GenerateHandoffResponse> {
    const body: Record<string, unknown> = {};
    if (sources?.length) body.sources = sources;
    if (filters && Object.keys(filters).length > 0) body.filters = filters;
    body.project_id = projectId;

    return this.request<GenerateHandoffResponse>('/handoffs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getJob(jobId: string): Promise<{ job: AiJob; result: HandoffResult | InsightResult | null }> {
    return (await this.requestRaw<{ job: AiJob; result: HandoffResult | InsightResult | null }>(
      `/jobs/${jobId}`,
    )).body;
  }

  async waitForJob(
    jobId: string,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<{ job: AiJob; result: HandoffResult | InsightResult | null }> {
    const intervalMs = opts.intervalMs ?? 2500;
    const timeoutMs = opts.timeoutMs ?? 180_000; // 3 min hard cap
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const res = await this.getJob(jobId);
      if (res.job.status === 'completed' || res.job.status === 'failed') {
        return res;
      }
      if (Date.now() > deadline) {
        throw new Error(`AI Job timed out after ${Math.round(timeoutMs / 1000)}s (job ${jobId} still ${res.job.status}).`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  async listInsights(projectId: string, kind?: string, status = 'active', limit = 20) {
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    params.set('status', status);
    params.set('limit', String(limit));
    return this.request<{ insights: InsightResult[] }>(`/projects/${projectId}/insights?${params.toString()}`);
  }

  async askProject(
    projectId: string,
    question: string,
    filters?: Record<string, unknown>,
  ): Promise<{ answer: string; citations: string[] }> {
    return this.request<{ answer: string; citations: string[] }>(`/projects/${projectId}/qa`, {
      method: 'POST',
      body: JSON.stringify(filters ? { question, filters } : { question }),
    });
  }

  async generateInsight(
    projectId: string,
    kind: 'correlation' | 'onboarding' | 'architecture' | 'release_notes' | 'plan_review',
    body?: Record<string, unknown>,
  ): Promise<GenerateInsightResponse> {
    return this.request<GenerateInsightResponse>(`/projects/${projectId}/insights/${kind}`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    });
  }

  async listDigests(projectId: string, limit = 10) {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    return this.request<{
      digests: Array<{
        id: string;
        projectId: string;
        generatedBy: string;
        periodStart: string;
        periodEnd: string;
        content: Record<string, unknown>;
        markdown: string;
        createdAt: string;
      }>;
    }>(`/projects/${projectId}/digests?${params.toString()}`);
  }

  async listIntegrations(projectId?: string | null) {
    const params = new URLSearchParams();
    if (projectId) params.set('project_id', projectId);
    const suffix = params.toString();

    return this.request<{
      integrations: Array<{
        source: string;
        workspace_id: string | null;
        workspace_name: string | null;
        connected_at: string;
        scope?: 'personal' | 'project';
        resource_type?: string | null;
        connection_status?: string | null;
        providers_connected?: number;
        last_validated_at?: string | null;
      }>;
    }>(`/integrations${suffix ? `?${suffix}` : ''}`);
  }

  async listEvents(source?: string, limit = 20, projectId?: string | null) {
    const params = new URLSearchParams();
    if (source) params.set('source', source);
    params.set('limit', String(limit));
    if (projectId) params.set('project_id', projectId);
    return this.request<{
      events: Array<{
        id: string;
        user_id?: string;
        source: string;
        event_type: string;
        title: string;
        content: string;
        created_at: string;
      }>;
    }>(`/events?${params}`);
  }

  async discordListChannels() {
    return this.request<{
      channels: Array<{ id: string; name: string; topic: string }>;
    }>('/discord/channels');
  }

  async discordSendMessage(
    channelId: string,
    payload: {
      content?: string;
      handoff_id?: string;
      insight_id?: string;
      artifact?: 'last_handoff' | 'last_correlation' | 'last_onboarding' | 'last_architecture' | 'last_release_notes';
      project_id?: string;
    },
  ) {
    return this.request<{ ok: boolean; message_id: string }>('/discord/send', {
      method: 'POST',
      body: JSON.stringify({ channel_id: channelId, ...payload }),
    });
  }

  async listUntrackedResources() {
    return this.request<UntrackedResource[]>('/integrations/untracked');
  }

  async listWorkItems(
    projectId: string,
    opts: { status?: string[]; assignee?: 'me'; limit?: number; cursor?: number } = {},
  ) {
    const params = new URLSearchParams();
    if (opts.status?.length) params.set('status', opts.status.join(','));
    if (opts.assignee) params.set('assignee', opts.assignee);
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.cursor !== undefined) params.set('cursor', String(opts.cursor));
    const suffix = params.toString();
    return this.request<{ timezone: string; items: WorkItemSummary[]; nextCursor: number | null }>(
      `/projects/${projectId}/work-items${suffix ? `?${suffix}` : ''}`,
    );
  }

  async getWorkItem(projectId: string, ref: string) {
    return this.request<{ timezone: string; item: WorkItemDetail }>(
      `/projects/${projectId}/work-items/${encodeURIComponent(ref)}`,
    );
  }

  async createWorkItem(projectId: string, input: WorkItemInput) {
    return this.request<{ item: WorkItemDetail }>(`/projects/${projectId}/work-items`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateWorkItem(projectId: string, ref: string, input: WorkItemInput) {
    return this.request<{ item: WorkItemDetail }>(`/projects/${projectId}/work-items/${encodeURIComponent(ref)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async listMyWork() {
    return this.request<{ items: MyWorkEntry[] }>('/my-work');
  }

  async listSuggestions(projectId: string) {
    return this.request<{ suggestions: WorkSuggestion[] }>(`/projects/${projectId}/suggestions`);
  }

  async linkEvidence(projectId: string, ref: string, input: EvidenceLinkInput) {
    return this.request<{ linked: boolean; url: string }>(`/projects/${projectId}/work-items/${encodeURIComponent(ref)}/evidence`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getEarnedValue(projectId: string, baseline?: number) {
    const params = new URLSearchParams();
    if (baseline !== undefined) params.set('baseline', String(baseline));
    const qs = params.toString();
    return this.request<EarnedValueResult>(`/projects/${projectId}/evm${qs ? `?${qs}` : ''}`);
  }

  async listRaid(projectId: string, query: RaidQuery = {}) {
    const params = new URLSearchParams();
    if (query.kind) params.set('kind', query.kind);
    if (query.status) params.set('status', query.status);
    if (query.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return this.request<{ entries: RaidEntry[] }>(`/projects/${projectId}/raid${qs ? `?${qs}` : ''}`);
  }

  async getPortfolio(organizationId: string) {
    return this.request<PortfolioResult>(`/portfolio?organization_id=${encodeURIComponent(organizationId)}`);
  }

  async getForecast(projectId: string, query: { mode?: string; uncertainty?: string } = {}) {
    const params = new URLSearchParams();
    if (query.mode) params.set('mode', query.mode);
    if (query.uncertainty) params.set('uncertainty', query.uncertainty);
    const qs = params.toString();
    return this.request<ForecastResult>(`/projects/${projectId}/forecast${qs ? `?${qs}` : ''}`);
  }

  async planWhatIf(projectId: string, question: string) {
    return this.request<WhatIfResult>(`/projects/${projectId}/whatif`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  }

  async listAutomations(projectId: string) {
    return this.request<{ automations: AutomationSummary[] }>(`/projects/${projectId}/automations`);
  }

  async listTemplates(projectId: string) {
    return this.request<{ templates: TemplateSummary[] }>(`/projects/${projectId}/templates`);
  }

  async applyTemplate(projectId: string, templateId: string, parent?: string) {
    return this.request<{ created: number; version: number }>(`/projects/${projectId}/templates/${encodeURIComponent(templateId)}/apply`, {
      method: 'POST',
      body: JSON.stringify(parent ? { parent } : {}),
    });
  }

  async listApprovals(projectId: string, pendingOnly: boolean) {
    return this.request<{ approvals: ApprovalSummary[] }>(`/projects/${projectId}/approvals${pendingOnly ? '?status=pending' : ''}`);
  }

  async requestChange(projectId: string, input: RequestChangeInput) {
    return this.request<{ id: string; status: string }>(`/projects/${projectId}/approvals`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}
