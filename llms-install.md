# Install Flow Relay in Cline

Flow Relay gives an agent the context of a team's work: handoffs, insights and answers built from the tools the team connected (GitHub, Slack, Jira, Linear and more), plus plans, risks and forecasts. This file is written for an agent. Follow it from top to bottom and finish with the check.

## What you need first

- A Flow Relay account with at least one project (https://www.flowrelay.it). Neither option below creates an account or a project. If the user has none, stop and ask them to create one.
- Option A needs only a web browser. Option B needs Node.js 26 or later (`node --version`) and a Flow Relay API key.

Use option A unless the user asks for a local process or Cline cannot start a browser sign-in. Both options expose the same 40 tools.

## Option A: the hosted server with a browser sign-in

Server URL: `https://www.flowrelay.it/mcp` (Streamable HTTP). There is no key to copy.

1. Open the Cline MCP settings file.
   - In Cline for an IDE: the MCP Servers icon, the Configure tab, then Configure MCP Servers.
   - In the Cline CLI: `~/.cline/data/settings/cline_mcp_settings.json`.
2. Add the server under `mcpServers` and keep every other entry:

```json
{
  "mcpServers": {
    "flowrelay": {
      "type": "streamableHttp",
      "url": "https://www.flowrelay.it/mcp",
      "disabled": false
    }
  }
}
```

   Keep `"type": "streamableHttp"`. Without it Cline uses the legacy SSE transport, which this server does not offer. The same server can be added from the Remote Servers tab (transport Streamable HTTP) or with `cline mcp add flowrelay https://www.flowrelay.it/mcp --transport http --yes`.
3. Sign in. Flow Relay answers a request without a token with HTTP 401 and a sign-in challenge, which MCP clients that support authorization turn into a browser sign-in. Start it from Cline's authorization action for the server (in the CLI run `cline mcp` and choose Authorize OAuth). The user signs in to Flow Relay if needed, reads the consent screen and chooses Allow. Read is always granted. Generate runs Flow Relay's AI for them (handoffs, insights, release notes and Ask) and Change lets the agent create and edit work items, risks and approvals and send a document to Discord; the user can untick either.
4. Go to the check below.

If your Cline version has no authorization action, create an API key as in option B and add this line inside the same `flowrelay` entry:

```json
"headers": { "Authorization": "Bearer fr_your_api_key_here" }
```

## Option B: the npm package with an API key

1. Check Node.js. `node --version` must print v26 or later. If it does not, tell the user to install Node.js 26 or use option A.
2. Ask the user to create an API key: open https://www.flowrelay.it/settings, find API keys, create a key and copy it. It starts with `fr_` and Flow Relay shows it once. Write it only into the Cline settings file and never print it back in the conversation.
3. Add the server under `mcpServers` and keep every other entry:

```json
{
  "mcpServers": {
    "flowrelay": {
      "command": "npx",
      "args": ["-y", "@flowrelay/mcp-server"],
      "env": {
        "FLOWRELAY_API_KEY": "fr_your_api_key_here"
      },
      "disabled": false
    }
  }
}
```

   On Windows, if Cline cannot start `npx`, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@flowrelay/mcp-server"]`.

   Optional entries in `env`: `FLOWRELAY_PROJECT_ID` (a project id from `list_projects`, used when a tool omits `project_id`) and `FLOWRELAY_BASE_URL` (default `https://www.flowrelay.it`).
4. Go to the check below.

## Check the install

1. Call `get_workspace_context`. It names the workspaces the connection reaches.
2. Call `list_projects`. It lists every project the connection can open with its id. An empty list means the account has no project yet: ask the user to create one in Flow Relay.
3. Tell the user what you found: how many projects and their names.

Useful first requests once it works: `list_handoffs` to read the latest handoff of a project, `generate_handoff` to write a new one, `ask_project` to ask a question about the project's activity and `list_my_work` for the work items assigned to the user. Pass `project_id` from `list_projects` or call `set_active_project` once.

## If something fails

- `Flow Relay answered 401`: the key is missing, mistyped or revoked. Create a new key in Settings, API keys and update `FLOWRELAY_API_KEY`. With option A, run the authorization again.
- The consent screen says the connection can't be authorized: start the connection again from Cline, because a sign-in that expired or stopped halfway cannot be resumed.
- `Could not reach Flow Relay` or no answer within 30 seconds: check the network. Only set `FLOWRELAY_BASE_URL` if the user runs their own deployment.
- `Project not found or inaccessible`: use an id from `list_projects`.
- The local server will not start: check that `node --version` prints v26 or later.

More: https://www.flowrelay.it/docs/mcp
