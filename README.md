# Flow Relay MCP Server

[![M8ven Verified](https://m8ven.ai/badge/mcp/flow-relay-flowrelay-mcp-server-15i3wg?variant=verified)](https://m8ven.ai/mcp/flow-relay-flowrelay-mcp-server-15i3wg)

Flow Relay MCP Server adds project-aware, multi-tenant Flow Relay tools to MCP clients such as Claude Desktop, Claude Code, Cursor and Windsurf.

It connects to Flow Relay API v1 using an API key and supports:

- Project scope (personal project or organization project). Every handoff and AI insight is tied to a project. Events and integrations remain user-level.

## Package

- Name: @flowrelay/mcp-server
- Version: 1.0.29

## Supported Sources (52 Integrations)

Flow Relay MCP Server supports 52 integration sources across the entire engineering lifecycle:

- **Code & Version Control**: `github`, `gitlab`, `bitbucket`, `azure_devops` (support branch filtering)
- **CI/CD & Deployment**: `buildkite`, `circleci`, `vercel`, `netlify`, `render`, `railway`, `cloudflare_pages`, `heroku`
- **Issue Tracking & Project Management**: `linear`, `jira`, `clickup`, `monday_com`, `shortcut`, `asana`
- **Observability & Incidents**: `sentry`, `datadog`, `pagerduty`, `incident_io`, `grafana`, `alertmanager`, `new_relic`
- **Product Analytics**: `posthog`
- **Security & Code Quality**: `snyk`, `sonarqube`
- **Feature Flags & Infrastructure**: `launchdarkly`, `hcp_terraform`, `pulumi`
- **Meetings & Collaboration**: `fireflies`, `zoom`, `google_meet`, `microsoft_teams_meetings`, `fathom`, `google_calendar`, `miro`
- **Customer Support**: `intercom`, `zendesk`, `jira_service_management`
- **CRM**: `hubspot`, `salesforce`
- **Communication & Email**: `slack`, `discord`, `microsoft_teams`, `microsoft_outlook`, `gmail`
- **Documents & Design**: `notion`, `confluence`, `google_drive`, `figma`

## What Is Included

The server currently exposes 18 tools. Every tool carries the four MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`): the `list_*` and `get_*` tools are read-only and idempotent, the `generate_*` tools, `ask_project` and `discord_send_message` are non-idempotent (each call spends credits or posts a message) and no tool is destructive.

- `get_workspace_context`: Show current Flow Relay context (account mode, organizations count, accessible projects count, active project scope and caller role).
- `list_projects`: List every accessible project (personal and organization) with id, scope and role.
- `set_active_project`: Set or clear the active project for subsequent tool calls so `project_id` can be omitted.
- `list_filter_options`: List selectable resources (projects/repos/channels/boards), branches, event types and priorities per source for a project. Call this before generating so handoff and insight filters use real values instead of guesses. Also reports whether Figma visual context is selectable (requires Global processing region).
- `list_handoffs`: List handoffs for the active project or across accessible projects. Filter by status (`active`, `archived` or `all`). Outputs server-rendered Markdown.
- `generate_handoff`: Generate an async handoff with automated polling until completion. Requires active project or explicit `project_id`. Accepts per-source `filters` (`projects`, `eventTypes`, `branches`, `priorities`).
- `generate_correlation_insight`: Generate a cross-source correlation insight. Accepts per-source `filters`.
- `generate_onboarding_brief`: Generate an onboarding brief insight. Accepts per-source `filters`.
- `generate_architecture_insight`: Generate an architecture insight. Accepts per-source `filters`.
- `generate_release_notes`: Turn a project's merged work into release notes or a PR description (`style: 'release_notes' | 'pr_description'`). Accepts code source, repo and per-source `filters`. Costs 3 credits per run.
- `ask_project`: Ask one question about a project and get an answer grounded in its indexed codebase, baselines and last 14 days of activity. Answers synchronously and cites used events (`ev:...`). Costs 2 credits per question.
- `list_digests`: Browse scheduled activity digests of a project, newest first. Reading is free.
- `list_insights`: List project AI insights by kind and status.
- `list_integrations`: List connected integrations in personal or project scope.
- `list_events`: Browse recent events in personal or project scope.
- `list_untracked_resources`: List event-producing resources not scoped to any project (useful for discovering unassigned activity).
- `discord_list_channels`: List text channels in connected Discord servers.
- `discord_send_message`: Send a Discord message – plain text, or attach a rendered Markdown artifact (`last_handoff`, `last_correlation`, `last_onboarding`, `last_architecture` or `last_release_notes`) as a `.md` file.

### Filter Dimensions

When calling `generate_handoff`, insight tools or `generate_release_notes`, per-source `filters` accept:

- `projects`: Resource ids from `list_filter_options[source].projects` (repos, channels, boards, spaces, services, sites, projects).
- `eventTypes`: Event-type values from `list_filter_options` (e.g. `push`, `issue_created`, `workflow_job`).
- `branches`: Git branch names (`main`, `develop`) – git sources only (`github`, `gitlab`, `bitbucket`, `azure_devops`).
- `priorities`: Priority values – supported on `github` (security alerts), `jira`, `jira_service_management`, `linear`, `sentry`, `pagerduty`, `incident_io`, `clickup`, `zendesk`, `snyk`, `grafana`, `alertmanager`, `new_relic`, `hubspot` and `salesforce`.

## Environment Variables

Required:

- `FLOWRELAY_API_KEY`: Your Flow Relay API key (`fr_...`).

Optional:

- `FLOWRELAY_PROJECT_ID`: Initial active project context for project-aware tools.
- `FLOWRELAY_BASE_URL`: Base URL of the Flow Relay API (defaults to `https://www.flowrelay.it`).

## Quick Start (Claude Desktop)

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flowrelay": {
      "command": "npx",
      "args": ["-y", "@flowrelay/mcp-server"],
      "env": {
        "FLOWRELAY_API_KEY": "fr_your_api_key_here",
        "FLOWRELAY_PROJECT_ID": "your_project_id"
      }
    }
  }
}
```

## Multi-Tenant Behavior

- Every handoff and insight is tied to a project; you need an active project (`set_active_project`) or `project_id`. Events and integrations remain user-level.
- You can select a project during the MCP session with `set_active_project`.
- You can override scope per call by passing `project_id` where supported.

Recommended flow:

1. Call `get_workspace_context`
2. Call `list_projects`
3. Call `set_active_project`
4. Call `list_filter_options` to inspect selectable resources
5. Run handoff, insight, Q&A and query tools in the selected scope

## Local Development

From this folder:

```bash
npm install
npm run build
npm test
```

`npm test` runs the suite in `tests/` with Node's built-in runner: it drives the server through an in-memory MCP client against a stub Flow Relay API, so it needs no API key and no network.

Create a tarball package:

```bash
npm pack
```

## Troubleshooting

- Error: Missing `FLOWRELAY_API_KEY`
  - Set `FLOWRELAY_API_KEY` in your MCP client configuration.
- Project not found or inaccessible
  - Run `list_projects` and use one of the returned IDs.
- No events or handoffs returned
  - Verify active scope and data availability in that scope.

## Related Docs

- Documentation & Platform: https://www.flowrelay.it
- MCP Documentation: https://www.flowrelay.it/docs/mcp

## License

Copyright © 2026 Adriano Sorbello ([@atrisorb](https://github.com/atrisorb)). All rights reserved.

Distributed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later). See [LICENSE](LICENSE) for more information.
