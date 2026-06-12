import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkRate } from "../ratelimit.js";
import { logAction } from "../audit.js";
import { jsonContent, errorContent } from "./helpers.js";

/**
 * Integração Cademi (área de membros) — API v1.
 * Doc: https://api-docs.cademi.com.br/ (Postman collection pública).
 *
 * Auth: Bearer {CADEMI_API_KEY} + base {CADEMI_DOMAIN}/api/v1.
 * Observação: a API v1 NÃO tem endpoint de reset de senha — o fluxo de
 * suporte é REENVIAR a entrega (entrega/enviar), que faz a Cademi mandar
 * novo email de acesso ao aluno.
 *
 * Tools só são registradas se CADEMI_DOMAIN e CADEMI_API_KEY estiverem no .env.
 */

const DOMAIN = (process.env.CADEMI_DOMAIN || "").replace(/\/+$/, "");
const API_KEY = process.env.CADEMI_API_KEY || "";

async function cademi(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${DOMAIN}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Cademi ${path} → HTTP ${res.status}: ${JSON.stringify(body)?.slice(0, 300)}`);
  }
  return body;
}

export function registerCademiTools(server: McpServer) {
  if (!DOMAIN || !API_KEY) {
    console.error("[agent-mcp] Cademi desabilitada (CADEMI_DOMAIN/CADEMI_API_KEY ausentes no .env)");
    return;
  }

  server.registerTool(
    "cademi_get_user",
    {
      title: "Consultar aluno na Cademi",
      description:
        "Busca um aluno na área de membros Cademi por email ou ID e retorna seus dados/acessos.",
      inputSchema: {
        email_or_id: z.string().describe("Email do aluno ou usuario_id numérico"),
      },
    },
    async ({ email_or_id }) => {
      checkRate("read");
      try {
        return jsonContent(await cademi(`/usuario/${encodeURIComponent(email_or_id.trim())}`));
      } catch (err) {
        return errorContent(String(err));
      }
    },
  );

  server.registerTool(
    "cademi_list_products",
    {
      title: "Listar produtos da Cademi",
      description: "Lista os produtos/cursos cadastrados na área de membros (com IDs para entrega).",
      inputSchema: {},
    },
    async () => {
      checkRate("read");
      try {
        return jsonContent(await cademi("/produto"));
      } catch (err) {
        return errorContent(String(err));
      }
    },
  );

  server.registerTool(
    "cademi_grant_access",
    {
      title: "Liberar/reenviar acesso na Cademi",
      description:
        "Envia uma entrega (entrega/enviar) liberando o acesso do aluno ao produto — a Cademi " +
        "envia o email de acesso. Serve tanto para matricular quanto para REENVIAR acesso " +
        "(o 'reset de senha' do suporte). Exige confirm=true.",
      inputSchema: {
        cliente_email: z.string().email(),
        cliente_nome: z.string(),
        produto_id: z.string().describe("ID do produto na Cademi (ver cademi_list_products)"),
        codigo: z
          .string()
          .optional()
          .describe("Código/transação de referência (default: gerado suporte-<timestamp>)"),
        confirm: z.literal(true).describe("Obrigatório: confirma a ação"),
      },
    },
    async ({ cliente_email, cliente_nome, produto_id, codigo }) => {
      checkRate("write");
      const payload = {
        codigo: codigo || `suporte-${Date.now()}`,
        status: "aprovado",
        produto_id,
        cliente_nome,
        cliente_email,
        token: API_KEY,
      };
      try {
        const result = await cademi("/entrega/enviar", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        await logAction("cademi_grant_access", { cliente_email, produto_id, codigo: payload.codigo }, result, true);
        return jsonContent(result);
      } catch (err) {
        await logAction("cademi_grant_access", { cliente_email, produto_id }, { error: String(err) }, false);
        return errorContent(String(err));
      }
    },
  );
}
