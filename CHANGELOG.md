# Changelog

All notable changes to `@flowrelay/mcp-server`. Version numbers move in lockstep with the VS Code extension for any change to the tool vocabulary or to a source's capabilities; releases that only touch one surface (an extension-only UI fix, a server-only dependency bump) advance that surface alone.

## 1.7.0 – 2026-10-03

### Added
- `list_approvals`: the change requests of a project plan – what was asked in plain language, who asked, who decided and what they said. `pending_only` lists only those waiting for a decision. Business plan and above, organization projects; read-only and free.
- `request_change`: ask for a change to a work item (status, progress, priority, the blocked flag, duration or deadline) that a second person must approve. The approvers are notified and approving applies the change as the approver; the tool only files the request, so it is not idempotent. Free. The server exposes 36 tools.

## 1.6.0 – 2026-10-02

### Added
- `list_automations`: the automation rules of a project plan, each as a sentence ("When an item moves to Done: notify the assignees") with whether it is on, how many times it ran and how the last run went. Read-only: rules are changed in the app. Team plan and above; free.
- `list_templates`: the templates saved for a plan, a whole plan or one item with its subtasks, with the id `apply_template` needs. Free.
- `apply_template`: adds a saved template to a plan, at the top level or under an item key. Project managers only. It creates items, so the tool is not read-only or idempotent; the change history can undo it. Free. The server exposes 34 tools.

## 1.5.0 – 2026-10-01

### Added
- `get_forecast`: how likely each finish date of a project plan is, from simulating the plan thousands of times. Mode `schedule` (default) varies the durations of the open tasks (`uncertainty` low, medium or high; tasks marked as estimates vary more) and reports the finish of the project and of each milestone as the date by which half, four out of five and nineteen out of twenty of the runs are done, the chance of meeting the target finish or a milestone deadline and the items most often on the critical path. Mode `throughput` uses how many items the team finished each week over the last twelve weeks. Business plan and above; read-only and free.
- `plan_whatif`: a what-if question about a plan, in words. The model turns it into changes to the work (a duration, a delay, a cancellation, a link) and the scheduler computes the new finish of the project and of each milestone, how many items move and what becomes critical. Nothing is saved and the plan is not changed. Costs 5 credits. The server exposes 31 tools.

## 1.4.0 – 2026-09-30

### Added
- `get_portfolio`: the portfolio of an organization – every project the key can open with its progress, forecast finish against the target, next milestone, open risks and health. Health is a verdict (on track, at risk or off track) computed every night from the plan (schedule slip against the baseline or the target finish, overdue items, scope added since the baseline) and from the latest build, deploy and incident signals; a project manager can set it by hand and the comment comes with it. Programs and the dependencies between projects are listed too. Costs are not part of it: use `get_earned_value`. Business plan and above; read-only and free. The server exposes 29 tools.

### Changed
- `list_projects` shows the `organization_id` of each organization project, which is what `get_portfolio` takes.

## 1.3.0 – 2026-09-29

### Added
- `list_raid`: the RAID register of a project – risks, assumptions, issues, decisions and dependencies, highest number first, each with its score (probability times impact), due date, linked item and response. Filter by `kind` and `status`; entries that are not closed by default. Read-only and free.
- `get_earned_value`: costs and earned value of a project plan at its status date, measured against a baseline slot (`baseline`, default 0): planned and actual cost, planned value, earned value, schedule and cost variance, SPI, CPI, TCPI and the three estimates at completion. Amounts are in the currency of the organization. Project managers only, on plans that include costs (Business and above). Read-only and free.
- `generate_plan_review`: a status report written from the numbers of the plan (dates, variances, milestone slack, earned value and the open register) plus the last 14 days of linked activity. Returns Markdown with progress, concerns, the outlook of each upcoming milestone, suggested register entries and next steps. Runs synchronously like the other `generate_*` tools, consumes 5 credits on success and cannot be run by viewers. The server exposes 28 tools.
- `list_insights` accepts `kind: plan_review`.

## 1.2.0 – 2026-09-29

### Added
- `list_suggestions`: the pending suggestions of a project plan that the caller can act on – status changes proposed from linked activity (a pull request opened or merged, a deploy that shipped a linked commit), new items from the action items of a meeting transcript, dependencies from "blocks" links in a mirrored tracker and activity suggested as evidence for an item. Each line carries the suggestion id and marks the ones routed to you. Read-only and free.
- `link_evidence`: attach an https link (pull request, commit, build, deploy, incident, document or anything else) to a work item as evidence, with an optional title, kind and time. It joins the activity trail of the item and its evidence coverage. Idempotent: the same link twice leaves the item unchanged. Free. The server exposes 25 tools.
- `get_work_item`, `update_work_item` and `link_evidence` accept the key a tracker gave a mirrored item (`PAY-123`, `acme/web#42`) and a former project key, alongside the Flow Relay key and the id.

### Changed
- `list_projects` names the prefix of each project's work item keys (`keys=PAY-n`), so an agent can tell which project a key such as `PAY-12` belongs to without listing items.

## 1.1.0 – 2026-09-28

### Added
- Work management tools for the new project plans: `list_my_work` (your assigned items across projects), `list_work_items` (a project's tasks and milestones, filterable by status or to your own items, paginated by cursor), `get_work_item` (one item by key such as `FR-12` or by id, with dependencies and linked evidence), `create_work_item` and `update_work_item`. Work item tools cost no credits. The server exposes 23 tools.
- A fourth annotation set: `update_work_item` writes but is idempotent (`readOnlyHint: false`, `idempotentHint: true`), because sending the same values twice leaves the item unchanged. `create_work_item` is non-idempotent like the generation tools. No tool is destructive.
- The server instructions describe work items and item keys, so an agent can find the right tool and knows that mentioning a key in a commit, branch or pull request links that work to the item.

## 1.0.29 – 2026-09-22

### Added
- `google_meet`, `microsoft_teams_meetings` and `fathom` join the source enum, so the wave 5 meeting transcripts can be selected in `sources` and in per-source `filters` like every other source. All three scope by meeting rule rather than by resource: the project dimension is the meeting organizer (Google Meet lists only the conferences the connected account organized, so that account is its one organizer), none carries a branch or a priority dimension and the single event type is `meeting_transcribed`. Like Fireflies and Zoom, a transcript in scope bars China-hosted models for that generation regardless of the project setting.

## 1.0.28 – 2026-09-21

### Added
- `heroku`, `alertmanager` and `pulumi` join the source enum, so wave 4 activity can be selected in `sources` and in per-source `filters` like every other source. Project dimensions: the Heroku app, the Alertmanager receiver and the Pulumi stack (`org/project/stack`). Alertmanager carries a priority dimension (the `severity` label, same ladder as Grafana); Heroku and Pulumi carry none, and none of the three carries a branch dimension.
- `github` now carries a priority dimension too: the Dependabot and code scanning alert families report the advisory or rule severity (`critical`, `high`, `medium`, `low`). Every other GitHub event matches no priority filter. The new GitHub event types (`dependabot_alert_*`, `code_scanning_alert_*`, `secret_scanning_alert_*`, `project_item_*`) and GitLab event types (`release_created`, `release_updated`, `deployment_success`, `deployment_failed`, `deployment_canceled`, `tag_pushed`) arrive through `list_filter_options` like any other value.

## 1.0.27 – 2026-09-11

### Changed
- The M8ven Trust Index badge and listing URL updated to the verified slug (`flow-relay-flowrelay-mcp-server-15i3wg`).

## 1.0.26 – 2026-09-11

### Changed
- The repository moved to the `flow-relay` GitHub organization (`github.com/flow-relay/flowrelay-mcp-server`); `repository.url` follows.

## 1.0.25 – 2026-09-11

### Added
- Every tool now declares the four MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) as explicit booleans, so hosts can tell a read from a credit-consuming generation before invoking it and directories that require the full hint set (OpenAI's among them) accept the server. The `list_*`/`get_*` tools and `discord_list_channels` are read-only and idempotent; the `generate_*` tools, `ask_project` and `discord_send_message` are non-idempotent side effects; `set_active_project` is idempotent session state that reaches no external system. No tool is destructive.
- A test suite (`npm test`, Node's built-in runner via `tsx`) drives the server through an in-memory MCP client against a stub Flow Relay API: the 18-tool surface and its annotations, the bearer key on every request, active-project resolution, the handoff generate-then-poll flow, query-param forwarding, schema rejection of an invalid argument and API errors surfacing as tool text rather than protocol errors.

### Changed
- `@modelcontextprotocol/sdk` floor raised from `^1.12.1` to `^1.30.0`. The declared floor still admitted releases carrying three high-severity advisories (cross-client data leak via shared transport reuse, ReDoS, DNS rebinding protection off by default); the installed version was already past them, but a fresh install resolving the floor was not. The transitive advisories reported by `npm audit` on the resolved tree (`hono`, `fast-uri`, `body-parser`, `qs`) are cleared as well – the production tree audits clean.
- The server factory (`createFlowRelayServer`) lives in `src/server.ts`; `src/index.ts` is now only the bin entry (env check, stdio transport). Same 18 tools, same behaviour, importable without touching stdio.
- The six tools that let an API failure propagate as a protocol error (`get_workspace_context`, `list_projects`, `set_active_project`, `list_handoffs`, `list_integrations`, `list_events`) now return it as tool text like the other twelve.

## 1.0.24 – 2026-09-09

### Added
- `new_relic`, `jira_service_management`, `posthog`, `hubspot` and `salesforce` join the source enum, so wave 3 activity can be selected in `sources` and in per-source `filters` like every other source. Project dimensions: the New Relic alert policy, the JSM service desk, the PostHog project, the HubSpot pipeline and the Salesforce account. New Relic, Jira Service Management, HubSpot and Salesforce also carry a priority dimension; none of the five carries a branch dimension.

## 1.0.23 – 2026-09-06

### Added
- `launchdarkly`, `hcp_terraform`, `sonarqube` and `miro` join the source enum, so wave 2 activity can be selected in `sources` and in per-source `filters` like every other source. Project dimensions: the LaunchDarkly project, the HCP Terraform workspace, the SonarQube project and the Miro board. None of the four carries a branch or a priority dimension.

## 1.0.22 – 2026-09-05

### Added
- `zoom`, `grafana`, `google_calendar` and `google_drive` join the source enum, so wave 1 activity can be selected in `sources` and in per-source `filters` like every other source. Project dimensions: the meeting organizer for Zoom (same shape as Fireflies), the alert folder for Grafana, the calendar for Google Calendar and the picked document for Google Drive. Grafana additionally carries a priority dimension (critical, high, warning, info); the other three carry none, and none of the four carries a branch dimension.

## 1.0.21 – 2026-09-02

### Added
- `fireflies` joins the source enum, so meeting transcripts can be selected in `sources` and in per-source `filters` like every other source. Its project dimension is the meeting organizer; it carries no branch and no priority dimension.

## 1.0.20 – 2026-09-01

### Added
- `snyk` joins the source enum, so security scan results can be selected in `sources` and in per-source `filters` like every other source. Its project dimension is the monitored Snyk project; severities (critical, high, medium, low) are its priority dimension and it carries no branch dimension.

## 1.0.19 – 2026-09-01

### Added
- `intercom` and `zendesk` join the source enum, so customer-support activity can be selected in `sources` and in per-source `filters` like every other source. Their project dimension is the Intercom team or the Zendesk group; Zendesk additionally carries a priority dimension (urgent, high, normal, low), Intercom carries none, and neither carries a branch dimension.

## 1.0.18 – 2026-08-28

### Added
- `clickup`, `monday_com` and `shortcut` join the source enum, so issue-tracker activity outside Jira and Linear can be selected in `sources` and in per-source `filters` like every other source. Their project dimension is the space (ClickUp), the board (monday.com) or the team (Shortcut); ClickUp additionally carries a priority dimension (urgent, high, normal, low), the other two carry none, and none of the three carries a branch dimension.

## 1.0.17 – 2026-08-28

### Added
- `netlify`, `render`, `railway` and `cloudflare_pages` join the source enum, so deploy activity from those platforms can be selected in `sources` and in per-source `filters` like every other source. Their project dimension is the site (Netlify), the service (Render) or the project (Railway, Cloudflare Pages); none of them carries a branch or priority dimension.

## 1.0.16 – 2026-08-06

### Changed
- `zod` moved from `^3.24` to `^4.4`. No tool schema changed: `z.record` already used the two-argument form v4 requires, and the only modifiers in play (`.describe`, `.optional`, `.int`, `.default`, `.min`, `.max`) are unchanged. The web app's copy moved in the same change, which is mandatory – the 18 tool schemas are shared verbatim between the two surfaces and compared by `tests/mcp-tool-parity.test.ts`, so a version skew between the two dependency trees produces schemas that no longer match. The JSON Schema emitted to clients was diffed before and after: 18 tools, all `type: object`, descriptions and source enums identical.

## 1.0.15 – 2026-08-02

### Added
- Explicit author metadata in `package.json`.
- Startup banner on `stderr` logging version, copyright, and license when the server connects.
- `## License` section in `README.md` and `@license` headers across TypeScript source files.

## 1.0.14 – 2026-07-29

### Fixed
- Added a default 30-second `AbortSignal` timeout to API client HTTP requests (`FlowRelayAPI.prototype.requestRaw`) to prevent MCP tools from hanging indefinitely if the server or network connection drops.

## 1.0.13 – 2026-07-25

### Added
- `discord_send_message` accepts `last_release_notes` as an artifact shortcut, so the latest release notes of a project can be posted as a `.md` attachment like every other artifact.

### Fixed
- Release-notes generation now persists: the server was writing the insight row with a column that does not exist, so every `generate_release_notes` call failed at save time with a database error after the model had already run.
- Release notes honour the per-source `filters` passed alongside `source` / `repo` / `style` instead of silently ignoring them.
- `source`, `repo` and `style` are validated server-side: an unknown source or a style outside `release_notes` / `pr_description` now returns a 400 naming the field, instead of being accepted and quietly changing the output.

## 1.0.12 – 2026-07-24

### Added
- `generate_release_notes`: turn a project's merged work into release notes or a PR description, returned as Markdown. Costs 3 credits per run.
- `list_digests`: read the scheduled activity digests of a project, newest first. Reading is free – digests are generated on the schedule configured in the dashboard.

## 1.0.11 – 2026-07-24

### Added
- `ask_project`: ask one question about a project and get an answer grounded in its indexed codebase, connected baselines and last 14 days of activity. Answers synchronously (no job to poll) and cites the events it used as `ev:` ids. Costs 2 credits per question.

## 1.0.10 – 2026-07-22

### Added
- `incident_io` joins the source enum: incident.io public incident events (created / updated / status updated) are now filterable in `generate_handoff` and the insight tools, with incident types surfaced by `list_filter_options` and severities as the priority dimension.

## 1.0.9 – 2026-07-20

### Added
- `vercel` joins the source enum: Vercel deployment results (succeeded / failed / cancelled / promoted) are now filterable in `generate_handoff` and the insight tools, with projects surfaced by `list_filter_options`.

## 1.0.8 – 2026-07-16

### Added
- `circleci` joins the source enum: CircleCI workflow results (succeeded / failed / cancelled) are now filterable in `generate_handoff` and the insight tools, with projects surfaced by `list_filter_options`.

## 1.0.7 – 2026-07-15

### Added
- `buildkite` joins the source enum: Buildkite build results (passed / failed / cancelled) are now filterable in `generate_handoff` and the insight tools, with pipelines surfaced by `list_filter_options`.

## 1.0.6 – 2026-07-14

### Added
- `gmail` and `asana` complete the source enum.

## 1.0.5 – 2026-07-08

### Fixed
- Added `pagerduty` to the source enum. It was added to the platform but never reached the client, so `generate_handoff` / the insight tools rejected `sources: ["pagerduty"]` locally before the request left the machine.
- `set_active_project` `clear` parameter description referenced the retired no-project personal scope; it now states that clearing requires selecting a project again before generating.

### Changed
- Every tool description is now self-contained: sources, filters, the async job flow, credit costs and how to discover ids are spelled out in-tool so an agent can operate without opening the docs. Filter descriptions state that source ids are validated (unknown → `400`) while `eventTypes` / `priorities` / `projects` values are matched leniently and discoverable via `list_filter_options`.

## 1.0.4 – 2026-07-04

### Fixed
- Server announced stale version `1.0.0` to MCP clients; now reads from `package.json`.
- `generate_handoff` tool description no longer mentions personal scope (removed since 1.0.0).


## 1.0.3 – 2026-07-03

### Added
- Figma visual context support. `list_filter_options` now surfaces whether Figma is selectable for the project: Figma filters require the project's processing region to be Global. When Figma is selected, generations attach rendered frame previews plus the indexed design scene (layout, texts, prototype flows) and cost 1 extra credit.

### Changed
- Generation endpoints return `400` when Figma is the only selected source on a non-Global project; the error message explains the region requirement.

## 1.0.2 – 2026-07-03

### Changed
- `generate_handoff` and the three insight tools output the server-rendered `markdown` field (canonical serializer, byte-identical to the dashboard copy button) with a title+summary fallback for pre-markdown servers.

## 1.0.1 – 2026-06-29

### Changed
- `discord_send_message` can now send a Flow Relay artifact instead of plain text. Provide exactly one of: `content` (inline text); `handoff_id` or `insight_id` (renders that artifact to Markdown and attaches it as a `.md` file); or `artifact` (`last_handoff` / `last_correlation` / `last_onboarding` / `last_architecture`, with `project_id`) to send the latest active artifact of that kind. The Markdown matches the dashboard copy button.

## 1.0.0 – 2026-06-28

### Added
- `list_filter_options` tool – fetches the real selectable filter values (resources, branches, event types, priorities) per source for a project via `GET /api/v1/handoffs/filters`. Agents call it before generating so `filters` use real values instead of guesses. Brings the tool count to 15.

### Changed
- `generate_handoff` and the three insight tools (`generate_correlation_insight`, `generate_onboarding_brief`, `generate_architecture_insight`) accept per-source `filters`: `projects`, `eventTypes`, `branches`, `priorities`.
- `list_handoffs` status enum aligned to the database: `active`, `archived`, `all` (dropped the non-existent `paused`/`completed`).
- `list_insights` status enum aligned to the database: `active`, `archived`, `all` (dropped `completed`).

### Removed
- Dead inline-handoff response branch – `generate_handoff` is always asynchronous (202 + jobId) and the server polls to completion.
