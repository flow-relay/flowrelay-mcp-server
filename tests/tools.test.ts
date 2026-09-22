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
    if (path === '/api/v1/jobs/job-1') return reply(200, { job: { id: 'job-1', status: 'completed', result_kind: 'handoff', error: null }, result: HANDOFF });
    if (path === '/api/v1/discord/channels') return reply(403, { error: 'Discord is not connected' });
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
  test('declares 18 tools, each with all four annotation hints', async () => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 18);
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

  test('an invalid argument is rejected by the input schema before any HTTP call', async () => {
    captured.length = 0;
    const result = await client.callTool({ name: 'list_events', arguments: { source: 'not_a_source' } });
    assert.equal(result.isError, true);
    assert.equal(captured.length, 0);
  });
});
