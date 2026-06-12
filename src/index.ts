#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerWhatsappTools } from "./tools/whatsapp.js";
import { registerFunnelTools } from "./tools/funnels.js";
import { registerAutomationTools } from "./tools/automations.js";
import { registerCademiTools } from "./tools/cademi.js";

const server = new McpServer({
  name: "metric-streamer",
  version: "1.0.0",
});

registerCustomerTools(server);
registerWhatsappTools(server);
registerFunnelTools(server);
registerAutomationTools(server);
registerCademiTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[agent-mcp] MCP server conectado (stdio)");
