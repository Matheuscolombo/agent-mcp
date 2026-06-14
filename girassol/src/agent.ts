import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { CONFIG, loadSystemPrompt } from "./config.js";
import { getSession, setSession, clearSession, pauseBot } from "./state.js";
import { notifyTeam } from "./uazapi.js";
import { createSupportTicket } from "./crm.js";

const SYSTEM_PROMPT = loadSystemPrompt();

/** Tool in-process: transferência para atendimento humano. */
function makeTransferencia(phone: string) {
  return tool(
    "transferencia",
    "Transfere o atendimento deste cliente para um humano do time. Use nos casos definidos " +
      "nas suas instruções (reembolso, suporte falhou 3x, interesse qualificado no Erveiros, " +
      "assunto fora da base). Após chamar, envie a mensagem padrão de transferência ao cliente.",
    {
      nome: z.string().optional().describe("Nome do cliente, se souber"),
      email: z.string().optional().describe("Email do cliente, se souber"),
      motivo: z.string().describe("Resumo do que o cliente precisa"),
    },
    async ({ nome, email, motivo }) => {
      pauseBot(phone);
      // Abre o ticket no board "Suporte — Atendimento Humano" (best-effort)
      await createSupportTicket(phone, nome, email, motivo).catch((e) =>
        console.error("[girassol] erro ao abrir ticket de suporte:", (e as Error)?.message || e),
      );
      await notifyTeam(
        `🌻 *Girassol — transferência*\n\nCliente: ${nome || "?"} (${phone})\nEmail: ${email || "?"}\n\nMotivo: ${motivo}`,
      );
      console.log(`[girassol] transferência: ${phone} — ${motivo}`);
      return {
        content: [
          {
            type: "text" as const,
            text: "Transferência registrada. O time foi notificado e o bot está pausado para este cliente. Envie agora a mensagem padrão de transferência.",
          },
        ],
      };
    },
  );
}

const READ_TOOLS = [
  "mcp__metric-streamer__get_customer",
  "mcp__metric-streamer__search_leads",
  "mcp__metric-streamer__get_whatsapp_conversation",
  "mcp__metric-streamer__cademi_get_user",
  "mcp__metric-streamer__cademi_list_products",
  "mcp__girassol__transferencia", // pausa + notifica o time (sem escrita em sistemas)
];

const WRITE_TOOLS = [
  "mcp__metric-streamer__update_lead",
  "mcp__metric-streamer__cademi_grant_access",
];

const ALLOWED_TOOLS = CONFIG.readonly ? READ_TOOLS : [...READ_TOOLS, ...WRITE_TOOLS];

/** Roda um turno da Girassol para um telefone; retorna o texto final. */
export async function runGirassol(phone: string, userText: string): Promise<string> {
  const girassolServer = createSdkMcpServer({
    name: "girassol",
    version: "1.0.0",
    tools: [makeTransferencia(phone)],
  });

  const buildOptions = (resume?: string) => ({
    model: CONFIG.model,
    maxTurns: CONFIG.maxTurns,
    systemPrompt: SYSTEM_PROMPT,
    permissionMode: "bypassPermissions" as const,
    allowedTools: ALLOWED_TOOLS,
    mcpServers: {
      "metric-streamer": {
        type: "stdio" as const,
        command: "node",
        args: [CONFIG.mcpPath],
      },
      girassol: {
        type: "sdk" as const,
        name: "girassol",
        instance: girassolServer.instance,
      },
    },
    ...(resume ? { resume } : {}),
  });

  const prompt = `[Mensagem de WhatsApp do cliente ${phone}]\n\n${userText}`;

  const run = async (resume?: string): Promise<string> => {
    let result = "";
    for await (const message of query({ prompt, options: buildOptions(resume) })) {
      if (message.type === "system" && (message as any).subtype === "init") {
        const sid = (message as any).session_id;
        if (sid) setSession(phone, sid);
      }
      if (message.type === "result") {
        if ((message as any).subtype === "success") {
          result = (message as any).result ?? "";
        } else {
          throw new Error(`girassol result: ${(message as any).subtype}`);
        }
      }
    }
    return result;
  };

  const existing = getSession(phone);
  try {
    return await run(existing);
  } catch (err) {
    if (existing) {
      // sessão antiga pode ter expirado — tenta do zero
      console.warn(`[girassol] resume falhou p/ ${phone}, recomeçando sessão:`, err);
      clearSession(phone);
      return await run(undefined);
    }
    throw err;
  }
}
