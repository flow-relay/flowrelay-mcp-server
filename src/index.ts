#!/usr/bin/env node
/**
 * @license
 * Flow Relay MCP Server
 * Copyright (c) 2026 Adriano Sorbello (atrisorb) <https://github.com/atrisorb>
 * Licensed under GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FlowRelayAPI } from './api.js';
import { createFlowRelayServer, normalizeProjectId, PKG_VERSION } from './server.js';

const apiKey = process.env.FLOWRELAY_API_KEY;
if (!apiKey) {
  console.error('Error: FLOWRELAY_API_KEY environment variable is required.');
  console.error('Create an API key at https://www.flowrelay.it/settings');
  process.exit(1);
}

const api = new FlowRelayAPI(apiKey, process.env.FLOWRELAY_BASE_URL);
const server = createFlowRelayServer(api, normalizeProjectId(process.env.FLOWRELAY_PROJECT_ID));

console.error(`Flow Relay MCP Server v${PKG_VERSION} - Copyright (c) 2026 Adriano Sorbello (atrisorb) <https://github.com/atrisorb> (AGPL-3.0-or-later)`);

await server.connect(new StdioServerTransport());
