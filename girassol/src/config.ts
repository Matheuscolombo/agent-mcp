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
  // Whitelist: se preenchida, a Girassol SÓ atende esses números (resto é ignorado).
  // Comparação pelos últimos 8 dígitos — robusta ao 9º dígito dos celulares BR.
  whitelist: (process.env.GIRASSOL_WHITELIST || "")
    .split(",")
    .map((s) => s.replace(/\D/g, "").slice(-8))
    .filter(Boolean),
  // Supabase — o poller consulta a tabela whatsapp_messages do CRM direto
  // (substitui o repasse do edge, que não alcança o servidor de forma confiável).
  supabaseUrl: (process.env.SUPABASE_URL || "").replace(/\/+$/, ""),
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  pollMs: Number(process.env.GIRASSOL_POLL_MS || 4000),
  // Board "Suporte — Atendimento Humano" (kanban de tickets das transferências)
  supportFunnelId: process.env.GIRASSOL_SUPPORT_FUNNEL_ID || "3e786611-b27a-4e3a-8063-6579d38dd31a",
  supportStageWaiting: process.env.GIRASSOL_SUPPORT_STAGE || "fb745b97-5cf4-4a2b-aa3d-6ceb4499e6b4",
};

/** Telefone está liberado? (whitelist vazia = libera todos) */
export function isWhitelisted(phone: string): boolean {
  if (CONFIG.whitelist.length === 0) return true;
  return CONFIG.whitelist.includes(phone.replace(/\D/g, "").slice(-8));
}

export function loadSystemPrompt(): string {
  try {
    return readFileSync(CONFIG.promptPath, "utf-8");
  } catch (err) {
    console.error(`[girassol] não consegui ler o prompt em ${CONFIG.promptPath}:`, err);
    process.exit(1);
  }
}
