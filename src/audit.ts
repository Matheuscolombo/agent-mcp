import { supabase, ACTOR } from "./supabase.js";

/**
 * Registra ações de escrita em agent_action_logs (mesma tabela usada pelas
 * RPCs agent_* do banco — o prefixo "mcp:" distingue a visão do servidor MCP,
 * incluindo falhas que nem chegam ao banco).
 */
export async function logAction(
  tool: string,
  params: unknown,
  result: unknown,
  success: boolean,
): Promise<void> {
  try {
    await supabase.from("agent_action_logs").insert({
      action: `mcp:${tool}`,
      params: params ?? {},
      result: result ?? null,
      success,
      actor: ACTOR,
    });
  } catch (err) {
    console.error(`[agent-mcp] audit log falhou para ${tool}:`, err);
  }
}
