import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "../supabase.js";
import { checkRate } from "../ratelimit.js";
import { logAction } from "../audit.js";
import { jsonContent, errorContent } from "./helpers.js";

/** Wrapper de escrita: rate limit + RPC allowlisted + auditoria. */
async function callWriteRpc(tool: string, rpc: string, params: Record<string, unknown>) {
  checkRate("write");
  const { data, error } = await supabase.rpc(rpc, params);
  await logAction(tool, params, error ? { error: error.message } : data, !error);
  if (error) return errorContent(error.message);
  return jsonContent(data);
}

export function registerAutomationTools(server: McpServer) {
  server.registerTool(
    "list_automations",
    {
      title: "Listar automações (wz_flows)",
      description:
        "Lista flows de automação de WhatsApp com status, funis vinculados e execuções recentes.",
      inputSchema: {},
    },
    async () => {
      checkRate("read");
      const [flows, links] = await Promise.all([
        supabase.from("wz_flows").select("id, name, is_active, updated_at").order("name"),
        supabase
          .from("lead_funnel_automations")
          .select("wz_flow_id, funnel_id, lead_funnels(name)"),
      ]);
      if (flows.error) return errorContent(flows.error.message);
      const linkMap = new Map<string, string[]>();
      for (const l of (links.data ?? []) as any[]) {
        const arr = linkMap.get(l.wz_flow_id) ?? [];
        arr.push(l.lead_funnels?.name ?? l.funnel_id);
        linkMap.set(l.wz_flow_id, arr);
      }
      return jsonContent(
        (flows.data ?? []).map((f) => ({
          id: f.id,
          name: f.name,
          is_active: f.is_active,
          funnels: linkMap.get(f.id) ?? [],
        })),
      );
    },
  );

  server.registerTool(
    "clone_automation",
    {
      title: "Clonar automação",
      description:
        "Duplica um wz_flow trocando produto (productIdFilter dos triggers) e textos das " +
        "mensagens. O clone SEMPRE nasce inativo — ativação é manual na UI. " +
        "Use dry_run=true para pré-visualizar sem criar.",
      inputSchema: {
        source_flow_id: z.string().uuid(),
        new_name: z.string().min(3),
        product_ids: z.array(z.string()).optional().describe("product_ids da plataforma (guru/ticto)"),
        product_labels: z.record(z.string()).optional().describe("{id: label} para exibição"),
        text_replacements: z
          .array(z.object({ from: z.string(), to: z.string() }))
          .optional()
          .describe("Substituições de texto nas mensagens"),
        dry_run: z.boolean().optional(),
      },
    },
    async ({ source_flow_id, new_name, product_ids, product_labels, text_replacements, dry_run }) =>
      callWriteRpc("clone_automation", "agent_clone_wz_flow", {
        p_source_flow_id: source_flow_id,
        p_new_name: new_name,
        p_replacements: {
          ...(product_ids ? { product_ids } : {}),
          ...(product_labels ? { product_labels } : {}),
          text_replacements: text_replacements ?? [],
        },
        p_dry_run: dry_run ?? false,
      }),
  );

  server.registerTool(
    "setup_funnel_product",
    {
      title: "Configurar produto no funil",
      description:
        "Cria/atualiza a config do produto no funil (lead_funnel_products) e vincula os nomes " +
        "reais de venda (lead_product_mappings). Retorna colisões e product_ids por plataforma.",
      inputSchema: {
        funnel_id: z.string().uuid(),
        contains: z.string().min(2).describe("Fragmento distintivo para matching (ILIKE)"),
        display_name: z.string(),
        recontact_days: z.number().nullable().optional(),
        raw_names: z.array(z.string()).describe("Nomes exatos como chegam das plataformas"),
      },
    },
    async ({ funnel_id, contains, display_name, recontact_days, raw_names }) =>
      callWriteRpc("setup_funnel_product", "agent_upsert_funnel_product", {
        p_funnel_id: funnel_id,
        p_contains: contains,
        p_display_name: display_name,
        p_recontact_days: recontact_days ?? null,
        p_raw_names: raw_names,
      }),
  );

  server.registerTool(
    "link_automation",
    {
      title: "Vincular automação a funil",
      description: "Cria o vínculo lead_funnel_automations entre um flow e um funil (idempotente).",
      inputSchema: {
        funnel_id: z.string().uuid(),
        flow_id: z.string().uuid(),
        show_in_automations: z.boolean().optional(),
      },
    },
    async ({ funnel_id, flow_id, show_in_automations }) =>
      callWriteRpc("link_automation", "agent_link_flow_to_funnel", {
        p_funnel_id: funnel_id,
        p_flow_id: flow_id,
        p_trigger_events: [],
        p_show_in_automations: show_in_automations ?? false,
      }),
  );

  server.registerTool(
    "onboard_product",
    {
      title: "Onboarding completo de produto",
      description:
        "Orquestrador: configura o produto no funil, resolve product_ids das vendas, clona o " +
        "flow-fonte com as substituições e vincula ao funil. O flow nasce INATIVO. " +
        "Omita source_flow_id para fazer só o mapeamento (sem flow).",
      inputSchema: {
        funnel_id: z.string().uuid(),
        display_name: z.string(),
        contains: z.string().min(2),
        raw_names: z.array(z.string()),
        recontact_days: z.number().nullable().optional(),
        source_flow_id: z.string().uuid().optional(),
        flow_name: z.string().optional(),
        product_ids: z.array(z.string()).optional(),
        text_replacements: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
      },
    },
    async (args) =>
      callWriteRpc("onboard_product", "agent_onboard_product", {
        p_funnel_id: args.funnel_id,
        p_display_name: args.display_name,
        p_contains: args.contains,
        p_raw_names: args.raw_names,
        p_recontact_days: args.recontact_days ?? null,
        p_source_flow_id: args.source_flow_id ?? null,
        p_flow_name: args.flow_name ?? null,
        p_product_ids: args.product_ids ?? null,
        p_text_replacements: args.text_replacements ?? [],
      }),
  );
}
