import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase, phoneVariants } from "../supabase.js";
import { checkRate } from "../ratelimit.js";
import { jsonContent, errorContent, clampLimit } from "./helpers.js";

export function registerWhatsappTools(server: McpServer) {
  server.registerTool(
    "get_whatsapp_conversation",
    {
      title: "Conversa de WhatsApp",
      description: "Histórico de mensagens de WhatsApp de um telefone (mais recentes primeiro).",
      inputSchema: {
        phone: z.string().describe("Telefone em qualquer formato"),
        limit: z.number().optional().describe("Máx. de mensagens (default 30, máx 100)"),
      },
    },
    async ({ phone, limit }) => {
      checkRate("read");
      const variants = phoneVariants(phone);
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("created_at, direction, message_type, body, sender_name, status, media_url")
        .in("phone", variants)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(clampLimit(limit, 30));
      if (error) return errorContent(error.message);
      return jsonContent(
        (data ?? []).map((m) => ({
          at: m.created_at,
          dir: m.direction,
          type: m.message_type,
          from: m.sender_name,
          status: m.status,
          text: typeof m.body === "string" ? m.body.slice(0, 1000) : m.body,
          media: m.media_url ? true : undefined,
        })),
      );
    },
  );

  // send_whatsapp_message fica FORA do v1 — quando entrar (MCP_ENABLE_WHATSAPP_SEND=true),
  // deve chamar a edge function whatsapp-send (que valida instância/atribuição do lead),
  // exigir confirm:true e ter rate limit dedicado.
}
