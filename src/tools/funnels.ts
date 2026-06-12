import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "../supabase.js";
import { checkRate } from "../ratelimit.js";
import { jsonContent, errorContent } from "./helpers.js";

export function registerFunnelTools(server: McpServer) {
  server.registerTool(
    "list_funnels",
    {
      title: "Listar funis de lead",
      description: "Lista todos os funis de lead com contagem de leads e etapas.",
      inputSchema: {},
    },
    async () => {
      checkRate("read");
      const { data, error } = await supabase
        .from("lead_funnels")
        .select("id, name, description, is_active, lead_funnel_stages(count), lead_stage_positions(count)")
        .order("name");
      if (error) return errorContent(error.message);
      return jsonContent(
        (data ?? []).map((f: any) => ({
          id: f.id,
          name: f.name,
          is_active: f.is_active,
          stages: f.lead_funnel_stages?.[0]?.count ?? 0,
          leads: f.lead_stage_positions?.[0]?.count ?? 0,
        })),
      );
    },
  );

  server.registerTool(
    "get_funnel_overview",
    {
      title: "Visão completa de um funil",
      description:
        "Etapas, regras de transição, produtos configurados (com raw names), automações " +
        "vinculadas (com triggers e execuções 30d) e contagem de leads.",
      inputSchema: { funnel_id: z.string().uuid() },
    },
    async ({ funnel_id }) => {
      checkRate("read");
      const { data, error } = await supabase.rpc("agent_get_funnel_overview", {
        p_funnel_id: funnel_id,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    },
  );

  server.registerTool(
    "list_unmapped_products",
    {
      title: "Produtos vendidos sem mapeamento",
      description:
        "Produtos com vendas autorizadas no período que NÃO estão mapeados no funil " +
        "(nem por raw name nem por contains). Fila de trabalho do onboarding.",
      inputSchema: {
        funnel_id: z.string().uuid(),
        days: z.number().optional().describe("Janela em dias (default 365)"),
        min_sales: z.number().optional().describe("Mínimo de vendas (default 20)"),
      },
    },
    async ({ funnel_id, days, min_sales }) => {
      checkRate("read");
      const { data, error } = await supabase.rpc("agent_list_unmapped_products", {
        p_funnel_id: funnel_id,
        p_days: days ?? 365,
        p_min_sales: min_sales ?? 20,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    },
  );
}
