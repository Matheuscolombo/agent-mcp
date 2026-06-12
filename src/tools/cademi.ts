import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * FASE 2 — Integração Cademi (área de membros).
 *
 * Stubs aguardando a documentação da API da Cademi. Quando ela chegar:
 *   • cademi_get_access(email)      — consulta produtos/turmas do aluno
 *   • cademi_reset_password(email)  — dispara reset de senha
 *   • cademi_grant_access(email, product) — matricula em produto
 *
 * Regras ao implementar: API key em env (CADEMI_API_KEY), audit via logAction,
 * rate limit write, e confirm:true para ações destrutivas.
 */
export function registerCademiTools(_server: McpServer) {
  // intencionalmente vazio — nada registrado até a doc da API chegar
}
