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
    kind: 'correlation' | 'onboarding' | 'architecture' | 'release_notes',
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
}
