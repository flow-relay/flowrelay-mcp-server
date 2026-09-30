import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FlowRelayAPI } from '../src/api.js';
import { createFlowRelayServer } from '../src/server.js';

const API_KEY = 'fr_test_key';

const PROJECTS = {
  account_type: 'business',
  organizations: [{ id: 'org-1', name: 'Acme', slug: 'acme', role: 'admin', is_temporary_admin: false }],
  projects: [
    {
      id: 'e6a1f4d2-0c3b-4f8e-9a71-2b6c5d8e9f01', name: 'Relay web', slug: 'relay-web', description: '',
      organization_id: null, organization_name: null, organization_slug: null,
      project_type: 'personal', access_role: 'owner', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    },
    {
      id: '7d2c9b10-5e4a-4c1f-8b3d-0a9e8f7c6b52', name: 'Billing', slug: 'billing', description: '',
      organization_id: 'org-1', organization_name: 'Acme', organization_slug: 'acme',
      project_type: 'organization', access_role: 'admin', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    },
  ],
};

const HANDOFF = {
  id: 'handoff-1', user_id: 'user-1', project_id: PROJECTS.projects[1].id, project_name: 'Billing',
  title: 'Billing handoff', summary: 'Invoices moved to Paddle.', status: 'active', sources: ['github'],
  key_changes: [], decisions: [], next_steps: [], open_questions: [], related_event_ids: [],
  created_at: '2026-09-10T10:00:00Z', markdown: '# Billing handoff\n\nInvoices moved to Paddle.\n',
};

const WORK_ITEM = {
  id: '4b8e2f1a-9c3d-4e5f-8a7b-6c5d4e3f2a10', key: 'BI-7', number: 7, title: 'Move invoices to Paddle', kind: 'task',
  status: 'in_progress', blocked: false, priority: 3, isSummary: false, parentId: null, percentComplete: 40,
  start: '2026-09-28T08:00', finish: '2026-10-02T17:00', deadline: null, durationMinutes: 2400, critical: true,
  assignees: [{ userId: 'user-1', name: 'Ada Rossi' }], version: 12, updatedAt: '2026-09-28T09:00:00Z',
  url: 'https://www.flowrelay.it/business/organizations/acme/projects/billing/work?item=BI-7',
  description: 'Replace the legacy invoice job.', predecessors: [{ key: 'BI-3', type: 'fs', lagMinutes: 0 }], successors: [],
  evidence: [{ source: 'github', kind: 'commit', title: 'BI-7 switch invoice webhook', url: 'https://github.com/acme/billing/commit/abc', occurredAt: '2026-09-28T08:30:00Z' }],
  commentCount: 2,
};

const SUGGESTIONS = [
  { id: '0f3e1d2c-4b5a-4987-8a6b-5c4d3e2f1a09', type: 'status_change', item: 'BI-7', payload: { from: 'in_progress', to: 'in_review', reason: 'Pull request opened: acme/billing#41' }, origin: 'evidence_rule', forYou: true, createdAt: '2026-09-28T10:00:00Z' },
  { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', type: 'dependency', item: 'BI-7', payload: { predecessor: 'BI-3', successor: 'BI-7', type: 'fs', reason: 'Linked as blocking in Jira' }, origin: 'mirror_link', forYou: false, createdAt: '2026-09-28T09:00:00Z' },
];

const EVM = {
  currency: 'EUR', statusDate: '2026-09-29', baseline: 0, actualsFrom: 'timesheets', plannedCostCents: 4820000, actualCostCents: 2130000, budgetCents: 5000000,
  earnedValue: {
    budgetAtCompletionCents: 4800000, plannedValueCents: 2400000, earnedValueCents: 2160000, actualCostCents: 2130000, scheduleVarianceCents: -240000,
    costVarianceCents: 30000, spi: 0.9, cpi: 1.01, tcpi: 0.99,
    estimateAtCompletionCents: { cpi: 4733000, budgetRate: 4770000, cpiSpi: 4818000 }, estimateToCompleteCents: 2603000, varianceAtCompletionCents: 67000,
  },
};

const RAID = [
  { id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a', number: 4, type: 'risk', title: 'Payment provider certification may slip', description: '', status: 'open', probability: 3, impact: 5, score: 15, response: 'Book the slot now', ownerId: null, dueOn: '2026-10-16', item: 'BI-7', createdAt: '2026-09-28T09:10:00Z' },
  { id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', number: 3, type: 'decision', title: 'Use Paddle for invoices', description: '', status: 'closed', probability: null, impact: null, score: null, response: '', ownerId: null, dueOn: null, item: null, createdAt: '2026-09-20T09:10:00Z' },
];

const PORTFOLIO = {
  organizationId: '4b1f0c6e-2a3d-4e5f-8a9b-0c1d2e3f4a5b',
  projects: [
    {
      id: 'p-1', key: 'BI', name: 'Billing', status: 'active', programId: 'g-1', percentComplete: 61.6,
      projectStart: '2026-08-03T08:00', scheduledFinish: '2026-12-18T17:00', targetFinish: '2026-12-11T17:00', openRisks: 3,
      nextMilestone: { ref: 'BI-14', title: 'Design freeze', finish: '2026-10-09T17:00' },
      health: { verdict: 'amber', overridden: true, comment: 'Waiting on the vendor', schedule: 'amber', scope: null, delivery: 'green', computedOn: '2026-09-29', slipWorkingDays: 5, overdueItems: 2, openItems: 31 },
    },
    {
      id: 'p-2', key: 'WEB', name: 'Website', status: 'active', programId: null, percentComplete: null,
      projectStart: null, scheduledFinish: null, targetFinish: null, openRisks: 0, nextMilestone: null, health: null,
    },
  ],
  programs: [{ id: 'g-1', name: 'Growth' }],
  dependencies: [{ from: 'p-2', to: 'p-1', count: 2 }],
};

const FORECAST = {
  mode: 'schedule', uncertainty: 'medium', iterations: 2000,
  project: { plan: '2026-12-18T17:00', target: '2026-12-11T17:00', p50: '2026-12-22T17:00', p80: '2027-01-08T17:00', p95: '2027-01-20T17:00', chance: 0.18 },
  milestones: [{ ref: 'BI-14', title: 'Design freeze', plan: '2026-10-09T17:00', deadline: null, p50: '2026-10-12T17:00', p80: '2026-10-16T17:00', p95: '2026-10-23T17:00', chance: 0.31 }],
  critical: [{ ref: 'BI-7', title: 'Invoice webhook', index: 0.92 }],
};

const WHATIF = {
  explanation: 'Made the payment integration three weeks longer.',
  changes: ['Set BI-7 to 3w'],
  left_out: [],
  comparison: {
    projectFinish: { now: '2026-12-18T17:00', scenario: '2027-01-08T17:00', deltaWorkingDays: 15 },
    milestones: [{ ref: 'BI-14', title: 'Design freeze', now: '2026-10-09T17:00', scenario: '2026-10-30T17:00', deltaWorkingDays: 15 }],
    moved: 4, criticalBecame: 1, criticalLeft: 0, warnings: 0,
  },
  errors: [],
};

const AUTOMATIONS = {
  automations: [
    { id: 'a1', name: 'Close out', enabled: true, summary: 'When an item moves to Done: notify the assignees.', runCount: 4, lastRunAt: '2026-09-28T10:00:00Z', lastStatus: 'ok' },
    { id: 'a2', name: 'Weekly nudge', enabled: false, summary: 'Run every Friday at 08:00: notify the project managers.', runCount: 0, lastRunAt: null, lastStatus: null },
  ],
};

const APPROVALS = {
  approvals: [
    { id: 'ap1', kind: 'scope', title: 'Move the launch by one week', note: 'Vendor delay', summary: ['Change duration of BI-7 "Launch"'], status: 'pending', requestedBy: 'Ada Lovelace', decidedBy: null, decidedAt: null, decisionNote: null, createdAt: '2026-09-28T09:00:00Z' },
    { id: 'ap2', kind: 'baseline', title: 'Save baseline 1', note: '', summary: ['Save baseline 1 as "Q3"'], status: 'rejected', requestedBy: 'Bob', decidedBy: 'Cy', decidedAt: '2026-09-27T09:00:00Z', decisionNote: 'Wait for the review', createdAt: '2026-09-26T09:00:00Z' },
  ],
};

const TEMPLATES = { templates: [{ id: 't1', kind: 'item', name: 'Release checklist', description: 'Steps before a release', itemCount: 6 }] };

const PLAN_REVIEW = { id: 'ins-1', kind: 'plan_review', title: 'Billing plan review', summary: 'Two items are behind.', markdown: '# Billing plan review\n\nTwo items are behind.\n' };

interface Captured { method: string; url: string; auth: string | undefined; body: string }
const captured: Captured[] = [];

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

let http: Server;
let baseUrl: string;
let client: Client;

before(async () => {
  http = createServer(async (req, res) => {
    const body = await readBody(req);
    captured.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization, body });
    const path = (req.url ?? '').split('?')[0];
    const reply = (status: number, payload: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.headers.authorization !== `Bearer ${API_KEY}`) return reply(401, { error: 'Unauthorized' });
    if (path === '/api/v1/projects') return reply(200, PROJECTS);
    if (path === '/api/v1/events') return reply(200, { events: [{ id: 'ev-1', source: 'github', event_type: 'push', title: 'Push to main', content: '', created_at: '2026-09-10T09:00:00Z' }] });
    if (path === '/api/v1/handoffs' && req.method === 'POST') return reply(202, { jobId: 'job-1', status: 'pending' });
    if (path === '/api/v1/portfolio') return reply(200, PORTFOLIO);
    if (path === `/api/v1/projects/${PROJECTS.projects[1].id}/automations`) return reply(200, AUTOMATIONS);
    if (path === `/api/v1/projects/${PROJECTS.projects[1].id}/approvals` && req.method === 'GET') return reply(200, APPROVALS);
    if (path === `/api/v1/projects/${PROJECTS.projects[1].id}/approvals` && req.method === 'POST') return reply(201, { id: 'ap3', status: 'pending' });
    if (path === `/api/v1/projects/${PROJECTS.projects[1].id}/templates`) return reply(200, TEMPLATES);
    if (path === `/api/v1/projects/${PROJECTS.projects[1].id}/templates/t1/apply` && req.method === 'POST') return reply(201, { created: 6, version: 42 });
    if (path === `/api/v1/projects/${PROJECTS.projects[1].id}/forecast`) return reply(200, FORECAST);
    if (path === `/api/v1/projects/${PROJECTS.projects[1].id}/whatif` && req.method === 'POST') return reply(200, WHATIF);
    if (path === `/api/v1/projects/${PROJECTS.projects[1].id}/evm`) return reply(200, EVM);
    if (path === `/api/v1/projects/${PROJECTS.projects[1].id}/raid`) return reply(200, { entries: RAID });
    if (path === `/api/v1/projects/${PROJECTS.projects[1].id}/insights/plan_review` && req.method === 'POST') return reply(202, { jobId: 'job-2', status: 'pending' });
    if (path === '/api/v1/jobs/job-2') return reply(200, { job: { id: 'job-2', status: 'completed', result_kind: 'insight', error: null }, result: PLAN_REVIEW });
    if (path === '/api/v1/jobs/job-1') return reply(200, { job: { id: 'job-1', status: 'completed', result_kind: 'handoff', error: null }, result: HANDOFF });
    if (path === '/api/v1/discord/channels') return reply(403, { error: 'Discord is not connected' });
    const billing = `/api/v1/projects/${PROJECTS.projects[1].id}/work-items`;
    if (path === billing && req.method === 'GET') return reply(200, { timezone: 'Europe/Rome', items: [WORK_ITEM], nextCursor: 7 });
    if (path === billing && req.method === 'POST') return reply(201, { item: { ...WORK_ITEM, key: 'BI-8', title: JSON.parse(body).title } });
    if (path === `${billing}/BI-7` && req.method === 'GET') return reply(200, { timezone: 'Europe/Rome', item: WORK_ITEM });
    if (path === `${billing}/BI-7` && req.method === 'PATCH') return reply(200, { item: { ...WORK_ITEM, ...JSON.parse(body) } });
    if (path === `/api/v1/projects/${PROJECTS.projects[1].id}/suggestions`) return reply(200, { suggestions: SUGGESTIONS });
    if (path === `${billing}/BI-7/evidence` && req.method === 'POST') return reply(201, { linked: true, url: JSON.parse(body).url });
    if (path === '/api/v1/my-work') {
      return reply(200, { items: [{ ...WORK_ITEM, project: { id: PROJECTS.projects[1].id, name: 'Billing', timezone: 'Europe/Rome' } }] });
    }
    return reply(404, { error: `Unhandled ${path}` });
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const address = http.address();
  assert.ok(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const server = createFlowRelayServer(new FlowRelayAPI(API_KEY, baseUrl), null);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
});

after(async () => {
  await client.close();
  http.close();
});

function textOf(result: Awaited<ReturnType<Client['callTool']>>) {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? '').join('\n');
}

describe('tool surface', () => {
  test('declares 36 tools, each with all four annotation hints', async () => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 36);
    for (const tool of tools) {
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
        assert.equal(typeof tool.annotations?.[hint], 'boolean', `${tool.name} missing ${hint}`);
      }
      assert.equal(tool.annotations?.destructiveHint, false, `${tool.name} must not be destructive`);
    }
  });

  test('read tools are read-only, generation tools are not', async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t.annotations]));
    for (const name of ['list_projects', 'list_handoffs', 'list_events', 'list_filter_options', 'discord_list_channels']) {
      assert.equal(byName.get(name)?.readOnlyHint, true, name);
    }
    for (const name of ['generate_handoff', 'generate_architecture_insight', 'ask_project', 'discord_send_message']) {
      assert.equal(byName.get(name)?.readOnlyHint, false, name);
      assert.equal(byName.get(name)?.idempotentHint, false, name);
    }
    assert.equal(byName.get('set_active_project')?.openWorldHint, false);
    for (const name of ['list_work_items', 'get_work_item', 'list_my_work', 'list_suggestions']) {
      assert.equal(byName.get(name)?.readOnlyHint, true, name);
    }
    assert.equal(byName.get('create_work_item')?.idempotentHint, false);
    assert.equal(byName.get('update_work_item')?.readOnlyHint, false);
    assert.equal(byName.get('update_work_item')?.idempotentHint, true);
    assert.equal(byName.get('link_evidence')?.readOnlyHint, false);
    assert.equal(byName.get('link_evidence')?.idempotentHint, true);
    for (const name of ['list_raid', 'get_earned_value', 'get_portfolio', 'get_forecast', 'list_automations', 'list_templates']) assert.equal(byName.get(name)?.readOnlyHint, true, name);
    assert.equal(byName.get('list_approvals')?.readOnlyHint, true);
    assert.equal(byName.get('request_change')?.readOnlyHint, false);
    assert.equal(byName.get('request_change')?.idempotentHint, false);
    assert.equal(byName.get('apply_template')?.readOnlyHint, false);
    assert.equal(byName.get('apply_template')?.idempotentHint, false);
    assert.equal(byName.get('plan_whatif')?.readOnlyHint, false);
    assert.equal(byName.get('plan_whatif')?.idempotentHint, false);
    assert.equal(byName.get('generate_plan_review')?.readOnlyHint, false);
    assert.equal(byName.get('generate_plan_review')?.idempotentHint, false);
  });
});

describe('tool calls', () => {
  test('every request carries the bearer API key', async () => {
    await client.callTool({ name: 'list_projects', arguments: {} });
    assert.ok(captured.length > 0);
    for (const req of captured) assert.equal(req.auth, `Bearer ${API_KEY}`);
  });

  test('list_projects renders every accessible project with its id', async () => {
    const text = textOf(await client.callTool({ name: 'list_projects', arguments: {} }));
    for (const project of PROJECTS.projects) {
      assert.match(text, new RegExp(project.name));
      assert.match(text, new RegExp(project.id));
    }
  });

  test('generate_handoff without a project explains what to do instead of throwing', async () => {
    const result = await client.callTool({ name: 'generate_handoff', arguments: {} });
    assert.match(textOf(result), /A project is required/);
  });

  test('set_active_project makes get_workspace_context report that scope', async () => {
    const target = PROJECTS.projects[1];
    await client.callTool({ name: 'set_active_project', arguments: { project_id: target.id } });
    const text = textOf(await client.callTool({ name: 'get_workspace_context', arguments: {} }));
    assert.match(text, /Account mode: business/);
    assert.match(text, /Org project: Billing \(Acme, admin\)/);
    assert.match(text, /Role: admin/);
  });

  test('set_active_project rejects an unknown id and keeps the previous scope', async () => {
    const result = await client.callTool({ name: 'set_active_project', arguments: { project_id: '00000000-0000-4000-8000-000000000000' } });
    assert.match(textOf(result), /Project not found or inaccessible/);
    const text = textOf(await client.callTool({ name: 'get_workspace_context', arguments: {} }));
    assert.match(text, /Org project: Billing/);
  });

  test('set_active_project with clear drops the scope', async () => {
    await client.callTool({ name: 'set_active_project', arguments: { clear: true } });
    const text = textOf(await client.callTool({ name: 'get_workspace_context', arguments: {} }));
    assert.match(text, /No project selected/);
  });

  test('generate_handoff posts the project and sources, waits for the job and returns the server markdown', async () => {
    captured.length = 0;
    const target = PROJECTS.projects[1];
    const result = await client.callTool({
      name: 'generate_handoff',
      arguments: { project_id: target.id, sources: ['github'], filters: { github: { branches: ['main'] } } },
    });
    assert.equal(textOf(result), HANDOFF.markdown);
    const post = captured.find((r) => r.method === 'POST' && r.url === '/api/v1/handoffs');
    assert.ok(post, 'handoff POST missing');
    assert.deepEqual(JSON.parse(post.body), { sources: ['github'], filters: { github: { branches: ['main'] } }, project_id: target.id });
    assert.ok(captured.some((r) => r.url === '/api/v1/jobs/job-1'), 'job poll missing');
  });

  test('list_events forwards source, limit and project scope as query params', async () => {
    captured.length = 0;
    const target = PROJECTS.projects[0];
    const text = textOf(await client.callTool({ name: 'list_events', arguments: { source: 'github', limit: 5, project_id: target.id } }));
    assert.match(text, /\[github\/push\]\*\* Push to main/);
    const events = captured.find((r) => r.url.startsWith('/api/v1/events?'));
    assert.ok(events, 'events GET missing');
    const params = new URLSearchParams(events.url.split('?')[1]);
    assert.equal(params.get('source'), 'github');
    assert.equal(params.get('limit'), '5');
    assert.equal(params.get('project_id'), target.id);
  });

  test('an API error surfaces as tool text, not as a protocol error', async () => {
    const result = await client.callTool({ name: 'discord_list_channels', arguments: {} });
    assert.equal(textOf(result), 'Could not list Discord channels: Discord is not connected');
  });

  test('list_work_items forwards status, mine and cursor and prints the next cursor', async () => {
    captured.length = 0;
    const target = PROJECTS.projects[1];
    const text = textOf(await client.callTool({
      name: 'list_work_items',
      arguments: { project_id: target.id, status: ['todo', 'in_progress'], mine: true, cursor: 3 },
    }));
    assert.match(text, /BI-7 \[in_progress\] Move invoices to Paddle \(40%, finish 2026-10-02T17:00, Ada Rossi\)/);
    assert.match(text, /cursor=7/);
    const get = captured.find((r) => r.url.startsWith(`/api/v1/projects/${target.id}/work-items?`));
    assert.ok(get, 'work items GET missing');
    const params = new URLSearchParams(get.url.split('?')[1]);
    assert.equal(params.get('status'), 'todo,in_progress');
    assert.equal(params.get('assignee'), 'me');
    assert.equal(params.get('cursor'), '3');
  });

  test('get_work_item renders dependencies and evidence', async () => {
    const text = textOf(await client.callTool({ name: 'get_work_item', arguments: { ref: 'BI-7', project_id: PROJECTS.projects[1].id } }));
    assert.match(text, /# BI-7 Move invoices to Paddle/);
    assert.match(text, /\*\*Predecessors:\*\* BI-3 \(FS\)/);
    assert.match(text, /\[github\/commit\] BI-7 switch invoice webhook/);
  });

  test('create_work_item maps assign_to_me onto the assignee field', async () => {
    captured.length = 0;
    const text = textOf(await client.callTool({
      name: 'create_work_item',
      arguments: { title: 'Refund flow', duration: '3d', assign_to_me: true, project_id: PROJECTS.projects[1].id },
    }));
    assert.match(text, /Created BI-8: Refund flow/);
    const post = captured.find((r) => r.method === 'POST');
    assert.ok(post, 'work item POST missing');
    assert.deepEqual(JSON.parse(post.body), { title: 'Refund flow', duration: '3d', assignee: 'me' });
  });

  test('update_work_item sends percent_complete as percentComplete', async () => {
    captured.length = 0;
    const text = textOf(await client.callTool({
      name: 'update_work_item',
      arguments: { ref: 'BI-7', status: 'done', percent_complete: 100, project_id: PROJECTS.projects[1].id },
    }));
    assert.match(text, /Updated BI-7 \[done\] 100%/);
    const patch = captured.find((r) => r.method === 'PATCH');
    assert.ok(patch, 'work item PATCH missing');
    assert.deepEqual(JSON.parse(patch.body), { status: 'done', percentComplete: 100 });
  });

  test('list_my_work names the project of every item', async () => {
    const text = textOf(await client.callTool({ name: 'list_my_work', arguments: {} }));
    assert.match(text, /BI-7 \[in_progress\] Move invoices to Paddle .* – Billing/);
  });

  test('list_suggestions renders proposals with their item keys and ids', async () => {
    const text = textOf(await client.callTool({ name: 'list_suggestions', arguments: { project_id: PROJECTS.projects[1].id } }));
    assert.ok(text.includes('- BI-7: move to in_review – Pull request opened: acme/billing#41 (id 0f3e1d2c-4b5a-4987-8a6b-5c4d3e2f1a09, for you)'), text);
    assert.ok(text.includes('- BI-3 should finish before BI-7 starts – Linked as blocking in Jira (id 1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d)'), text);
  });

  test('link_evidence posts the link with occurred_at as occurredAt', async () => {
    captured.length = 0;
    const text = textOf(await client.callTool({
      name: 'link_evidence',
      arguments: { ref: 'BI-7', url: 'https://github.com/acme/billing/pull/41', kind: 'pull_request', occurred_at: '2026-09-28T10:00:00Z', project_id: PROJECTS.projects[1].id },
    }));
    assert.equal(text, 'Linked https://github.com/acme/billing/pull/41 to BI-7.');
    const post = captured.find((r) => r.method === 'POST' && r.url.endsWith('/BI-7/evidence'));
    assert.ok(post, 'evidence POST missing');
    assert.deepEqual(JSON.parse(post.body), { url: 'https://github.com/acme/billing/pull/41', kind: 'pull_request', occurredAt: '2026-09-28T10:00:00Z' });
  });

  test('list_raid renders each entry with its score, due date and item', async () => {
    captured.length = 0;
    const text = textOf(await client.callTool({ name: 'list_raid', arguments: { project_id: PROJECTS.projects[1].id, kind: 'risk', limit: 10 } }));
    assert.ok(text.includes('- R-4 risk [open, score 15 (probability 3 x impact 5), due 2026-10-16, on BI-7]: Payment provider certification may slip – Book the slot now'), text);
    assert.ok(text.includes('R-3 decision [closed]: Use Paddle for invoices'), text);
    const request = captured.find((r) => r.url.includes('/raid'));
    assert.match(request!.url, /kind=risk/);
    assert.match(request!.url, /limit=10/);
  });

  test('get_earned_value formats the figures in the currency of the plan', async () => {
    captured.length = 0;
    const text = textOf(await client.callTool({ name: 'get_earned_value', arguments: { project_id: PROJECTS.projects[1].id, baseline: 1 } }));
    assert.match(text, /Earned value of Billing as of 2026-09-29 against baseline 0/);
    assert.ok(text.includes('Planned cost €48,200.00, actual cost €21,300.00, budget €50,000.00.'), text);
    assert.ok(text.includes('SPI 0.90, CPI 1.01, TCPI 0.99'), text);
    assert.match(captured.find((r) => r.url.includes('/evm'))!.url, /baseline=1/);
  });

  test('get_portfolio lists each project with its verdict, forecast and dependencies', async () => {
    captured.length = 0;
    const text = textOf(await client.callTool({ name: 'get_portfolio', arguments: { organization_id: PORTFOLIO.organizationId } }));
    assert.ok(text.startsWith('Portfolio, 2 projects:'), text);
    assert.ok(
      text.includes('- BI Billing: at risk (set by hand), 62% complete, forecast finish 2026-12-18, target 2026-12-11, 5 working days late, 2 overdue items, 3 open risks, next milestone BI-14 Design freeze on 2026-10-09, program Growth – Waiting on the vendor'),
      text,
    );
    assert.ok(text.includes('- WEB Website: health not computed yet'), text);
    assert.ok(text.includes('- Billing waits for Website (2 links)'), text);
    assert.match(captured.find((r) => r.url.includes('/portfolio'))!.url, /organization_id=4b1f0c6e-2a3d-4e5f-8a9b-0c1d2e3f4a5b/);
  });

  test('get_forecast gives the plan date and the dates that four out of five runs hold', async () => {
    captured.length = 0;
    const text = textOf(await client.callTool({ name: 'get_forecast', arguments: { project_id: PROJECTS.projects[1].id, uncertainty: 'high' } }));
    assert.ok(text.startsWith('Forecast of Billing: 2000 simulated runs with medium uncertainty'), text);
    assert.ok(text.includes('The plan says 2026-12-18. The project is done by 2026-12-22 in half of the runs, by 2027-01-08 in four out of five and by 2027-01-20 in nineteen out of twenty; chance of the target finish 2026-12-11: 18%.'), text);
    assert.ok(text.includes('- BI-14 Design freeze: plan 2026-10-09, likely by 2026-10-16, 31% chance'), text);
    assert.ok(text.includes('- BI-7 Invoice webhook: 92% of runs'), text);
    assert.match(captured.find((r) => r.url.includes('/forecast'))!.url, /uncertainty=high/);
  });

  test('list_automations shows each rule with its sentence and how it ran', async () => {
    const text = textOf(await client.callTool({ name: 'list_automations', arguments: { project_id: PROJECTS.projects[1].id } }));
    assert.ok(text.startsWith('Automation rules of Billing:'), text);
    assert.ok(text.includes('- Close out [on, ran 4 times, last ok]: When an item moves to Done: notify the assignees.'), text);
    assert.ok(text.includes('- Weekly nudge [off, not run yet]: Run every Friday at 08:00: notify the project managers.'), text);
  });

  test('list_templates gives the id apply_template needs', async () => {
    const text = textOf(await client.callTool({ name: 'list_templates', arguments: { project_id: PROJECTS.projects[1].id } }));
    assert.ok(text.includes('- Release checklist (one item with its subtasks, 6 items) id t1 – Steps before a release'), text);
  });

  test('apply_template posts the parent and reports what was added', async () => {
    captured.length = 0;
    const text = textOf(await client.callTool({ name: 'apply_template', arguments: { project_id: PROJECTS.projects[1].id, template_id: 't1', parent: 'BI-7' } }));
    assert.equal(text, 'Added 6 items from the template to Billing.');
    const post = captured.find((r) => r.method === 'POST' && r.url.includes('/templates/t1/apply'))!;
    assert.deepEqual(JSON.parse(post.body), { parent: 'BI-7' });
  });

  test('list_approvals says what each request asks and who decided', async () => {
    const text = textOf(await client.callTool({ name: 'list_approvals', arguments: { project_id: PROJECTS.projects[1].id } }));
    assert.ok(text.includes('- Move the launch by one week [plan change, waiting for a decision, asked by Ada Lovelace]: Change duration of BI-7 "Launch"'), text);
    assert.ok(text.includes('- Save baseline 1 [baseline, rejected, asked by Bob, Cy said: Wait for the review]: Save baseline 1 as "Q3"'), text);
  });

  test('list_approvals asks only for the pending ones when told to', async () => {
    captured.length = 0;
    await client.callTool({ name: 'list_approvals', arguments: { project_id: PROJECTS.projects[1].id, pending_only: true } });
    assert.ok(captured.some((r) => r.url.endsWith('/approvals?status=pending')));
  });

  test('request_change posts the item and only the changes that were given', async () => {
    captured.length = 0;
    const text = textOf(await client.callTool({ name: 'request_change', arguments: { project_id: PROJECTS.projects[1].id, ref: 'BI-7', title: 'Move the launch', duration: '6d', deadline: null } }));
    assert.equal(text, 'Change request sent to the approvers of Billing: "Move the launch". Nothing changes in the plan until someone else approves it.');
    const post = captured.find((r) => r.method === 'POST' && r.url.endsWith('/approvals'))!;
    assert.deepEqual(JSON.parse(post.body), { item: 'BI-7', title: 'Move the launch', changes: { duration: '6d', deadline: null } });
  });

  test('request_change refuses to send an empty request', async () => {
    captured.length = 0;
    const text = textOf(await client.callTool({ name: 'request_change', arguments: { project_id: PROJECTS.projects[1].id, ref: 'BI-7', title: 'Nothing' } }));
    assert.equal(text, 'Give at least one change to ask for.');
    assert.ok(!captured.some((r) => r.method === 'POST'));
  });

  test('plan_whatif posts the question and says nothing was changed', async () => {
    captured.length = 0;
    const text = textOf(await client.callTool({ name: 'plan_whatif', arguments: { project_id: PROJECTS.projects[1].id, question: 'What if the payment integration takes three weeks longer?' } }));
    assert.ok(text.includes('Changes tried:\n- Set BI-7 to 3w'), text);
    assert.ok(text.includes('The project would finish 2027-01-08 instead of 2026-12-18 (+15 working days); 4 items move, 1 become critical and 0 stop being critical.'), text);
    assert.ok(text.endsWith('Nothing was saved or changed in the plan.'), text);
    const post = captured.find((r) => r.method === 'POST' && r.url.includes('/whatif'))!;
    assert.deepEqual(JSON.parse(post.body), { question: 'What if the payment integration takes three weeks longer?' });
  });

  test('list_projects names the organization of each organization project', async () => {
    const text = textOf(await client.callTool({ name: 'list_projects', arguments: {} }));
    assert.match(text, /organization_id=/);
  });

  test('generate_plan_review runs the job and returns its Markdown', async () => {
    const text = textOf(await client.callTool({ name: 'generate_plan_review', arguments: { project_id: PROJECTS.projects[1].id } }));
    assert.equal(text, '# Billing plan review\n\nTwo items are behind.\n');
  });

  test('an invalid argument is rejected by the input schema before any HTTP call', async () => {
    captured.length = 0;
    const result = await client.callTool({ name: 'list_events', arguments: { source: 'not_a_source' } });
    assert.equal(result.isError, true);
    assert.equal(captured.length, 0);
  });
});
