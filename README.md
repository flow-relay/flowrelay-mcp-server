# Flow Relay MCP Server

[![M8ven Verified](https://m8ven.ai/badge/mcp/flow-relay-flowrelay-mcp-server-15i3wg?variant=verified)](https://m8ven.ai/mcp/flow-relay-flowrelay-mcp-server-15i3wg)

Flow Relay MCP Server adds project-aware, multi-tenant Flow Relay tools to MCP clients such as Claude Desktop, Claude Code, Cursor and Windsurf.

It connects to Flow Relay API v1 using an API key and supports:

- Project scope (personal project or organization project). Every handoff and AI insight is tied to a project. Events and integrations remain user-level.

## Package

- Name: @flowrelay/mcp-server
- Version: 1.7.0

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

The server currently exposes 36 tools. Every tool carries the four MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`): the `list_*` and `get_*` tools are read-only and idempotent, the `generate_*` tools (including `generate_plan_review`), `ask_project`, `create_work_item`, `request_change` and `discord_send_message` are non-idempotent (each call spends credits, creates an item, files a request or posts a message), `update_work_item` and `link_evidence` write but are idempotent (the same values twice leave the item unchanged) and no tool is destructive.

- `get_workspace_context`: Show current Flow Relay context (account mode, organizations count, accessible projects count, active project scope and caller role).
- `list_projects`: List every accessible project (personal and organization) with id, scope, role and the prefix of its work item keys.
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
- `list_my_work`: List the work items assigned to you across every accessible project (open items plus those finished in the last 7 days) with status, progress and dates.
- `list_work_items`: List the tasks and milestones of a project plan with key, status, progress, dates and assignees. Filter by status or to your own items (`mine`); paginate with `cursor`.
- `get_work_item`: Read one work item by key (such as `FR-12`) or id: description, dates, assignees, dependencies, linked evidence and comment count.
- `create_work_item`: Create a task or milestone, optionally nested under a parent, with a duration (`3d`, `2w`, `4h`), a deadline and `assign_to_me`.
- `update_work_item`: Change status, progress, title, description, priority, the blocked flag, duration or deadline of an item.
- `list_suggestions`: List the pending suggestions of a project you can act on: status changes proposed from linked activity (an opened or merged pull request, a deploy), new items from meeting action items, dependencies from tracker links and activity suggested as evidence. Suggestions routed to you are marked; nothing changes until someone accepts one in Flow Relay.
- `link_evidence`: Attach an https link (pull request, commit, build, deploy, incident, document) to an item as evidence, with an optional title, kind and time.
- `list_raid`: Read the RAID register of a project: risks, assumptions, issues, decisions and dependencies with their score (probability times impact) and response. Filter by type and status; entries that are not closed by default.
- `get_earned_value`: Read the cost picture of a project plan at its status date – planned and actual cost, planned value, earned value, variances, SPI, CPI, TCPI and the estimates at completion – against a baseline. Project managers only, on plans that include costs.
- `get_portfolio`: Read the portfolio of an organization – every project you can open with its progress, forecast finish, next milestone, open risks and health (on track, at risk or off track, computed every night from the plan and the build, deploy and incident signals, or set by hand by a project manager) – to see which projects need attention. Business plan and above.
- `get_forecast`: Forecast when a project plan finishes by simulating it thousands of times – the finish of the project and of each milestone as the dates by which half, four out of five and nineteen out of twenty of the runs are done, the chance of meeting the target or a deadline and the items most often on the critical path. Business plan and above.
- `plan_whatif`: Ask a what-if question about a plan in words (for example, what if the payment integration takes three weeks longer?): the model turns it into changes to the work and the scheduler computes the new finish dates. Nothing is saved. Costs 5 credits per question.
- `list_automations`: List the automation rules of a plan as sentences, with how often they ran and how the last run went. Team plan and above.
- `list_templates`: List the templates saved for a plan, with the id to give to `apply_template`.
- `apply_template`: Add a saved template to a plan, at the top level or under an item key. Project managers only.
- `list_approvals`: List the change requests of a plan: what was asked in plain language, who asked, who decided and what they said. Business plan and above, organization projects.
- `request_change`: Ask for a change to an item (status, progress, priority, blocked flag, duration or deadline) that a second person must approve. It only files the request; approving applies it. Business plan and above, organization projects.
- `generate_plan_review`: Write a status report for a project plan (progress, concerns, milestone outlook, suggested register entries, next steps) from numbers the scheduler computed and the last 14 days of linked activity. Returns Markdown. Costs 5 credits per run.

Work item tools, `list_raid`, `get_earned_value`, `get_portfolio`, `get_forecast`, `list_automations`, `list_templates`, `apply_template`, `list_approvals` and `request_change` cost no credits. Dates are wall-clock times in the plan time zone (`YYYY-MM-DDTHH:mm`), which every reply names. Contributors can create items when the project allows it, assign only themselves and update the items assigned to them or created by them; schedule changes may need a project manager. A commit message, branch name or pull request title that mentions an item key (`FR-12`) is linked to that item as evidence. Items mirrored from Jira, Linear or GitHub Issues also answer to the key the tracker gave them (`PAY-123`, `acme/web#42`).

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
