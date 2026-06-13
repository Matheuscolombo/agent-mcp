import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[girassol] env ${name} é obrigatória`);
    process.exit(1);
  }
  return v;
}

export const CONFIG = {
  port: Number(process.env.GIRASSOL_PORT || 8787),
  webhookSecret: required("GIRASSOL_WEBHOOK_SECRET"),
  // Claude
  model: process.env.GIRASSOL_MODEL || "claude-opus-4-8",
  maxTurns: Number(process.env.GIRASSOL_MAX_TURNS || 15),
  // UAZAPI
  uazapiUrl: (process.env.UAZAPI_URL || "https://matheuscolombo.uazapi.com").replace(/\/+$/, ""),
  uazapiToken: required("UAZAPI_TOKEN"),
  // MCP do metric-streamer (stdio)
  mcpPath: process.env.MCP_PATH || "/opt/agent-mcp/dist/index.js",
  promptPath: process.env.PROMPT_PATH || "/opt/agent-mcp/prompts/girassol.md",
  // Comportamento
  dryRun: process.env.GIRASSOL_DRY_RUN === "true",
  // Read-only: remove as tools de ESCRITA (cademi_grant_access, update_lead) do
  // agente — recomendado no rollout inicial e obrigatório em testes.
  readonly: process.env.GIRASSOL_READONLY === "true",
  debounceMs: Number(process.env.GIRASSOL_DEBOUNCE_MS || 15000),
  pauseHours: Number(process.env.GIRASSOL_PAUSE_HOURS || 6),
  teamPhone: process.env.GIRASSOL_TEAM_PHONE || "",
  stateFile: process.env.GIRASSOL_STATE_FILE || resolve(process.cwd(), "girassol-state.json"),
};

export function loadSystemPrompt(): string {
  try {
    return readFileSync(CONFIG.promptPath, "utf-8");
  } catch (err) {
    console.error(`[girassol] não consegui ler o prompt em ${CONFIG.promptPath}:`, err);
    process.exit(1);
  }
}
