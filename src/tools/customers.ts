import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase, phoneVariants } from "../supabase.js";
import { checkRate } from "../ratelimit.js";
import { jsonContent, errorContent, clampLimit } from "./helpers.js";

/** Resolve unified_customer ids por email/telefone (links + colunas primárias). */
async function resolveCustomerIds(phone?: string, email?: string): Promise<string[]> {
  const ids = new Set<string>();

  if (email) {
    const norm = email.toLowerCase().trim();
    const [links, direct] = await Promise.all([
      supabase
        .from("customer_identity_links")
        .select("unified_customer_id")
        .eq("identifier_type", "email")
        .eq("identifier_value", norm),
      supabase.from("unified_customers").select("id").eq("primary_email", norm),
    ]);
    for (const r of links.data ?? []) ids.add(r.unified_customer_id);
    for (const r of direct.data ?? []) ids.add(r.id);
  }

  if (phone) {
    const variants = phoneVariants(phone);
    const digits = phone.replace(/\D/g, "");
    const [links, direct] = await Promise.all([
      supabase
        .from("customer_identity_links")
        .select("unified_customer_id")
        .eq("identifier_type", "phone")
        .in("identifier_value", [digits, ...variants]),
      supabase.from("unified_customers").select("id").in("primary_phone", variants),
    ]);
    for (const r of links.data ?? []) ids.add(r.unified_customer_id);
    for (const r of direct.data ?? []) ids.add(r.id);
  }

  return [...ids];
}

export function registerCustomerTools(server: McpServer) {
  server.registerTool(
    "get_customer",
    {
      title: "Visão 360 do cliente",
      description:
        "Busca um cliente por telefone e/ou email e retorna perfil unificado: dados, LTV, " +
        "compras, posição nos funis de lead, eventos recentes e últimas mensagens de WhatsApp.",
      inputSchema: {
        phone: z.string().optional().describe("Telefone em qualquer formato (com ou sem 55/DDD)"),
        email: z.string().optional().describe("Email do cliente"),
      },
    },
    async ({ phone, email }) => {
      checkRate("read");
      if (!phone && !email) return errorContent("Informe phone e/ou email.");

      const customerIds = await resolveCustomerIds(phone, email);
      const variants = phone ? phoneVariants(phone) : [];

      const [customers, purchases, leads] = await Promise.all([
        customerIds.length
          ? supabase
              .from("unified_customers")
              .select("id, full_name, primary_email, primary_phone, total_spent, total_orders, first_purchase_at, last_purchase_at")
              .in("id", customerIds)
          : Promise.resolve({ data: [] as any[] }),
        customerIds.length
          ? supabase
              .from("customer_purchases")
              .select("product_name, offer_name, gross_amount, status, platform, payment_method, purchased_at")
              .in("unified_customer_id", customerIds)
              .order("purchased_at", { ascending: false })
              .limit(25)
          : Promise.resolve({ data: [] as any[] }),
        phone || email
          ? supabase
              .from("leads")
              .select("id, name, phone, email, assigned_to, created_at")
              .or(
                [
                  variants.length ? `phone.in.(${variants.map((v) => `"${v}"`).join(",")})` : null,
                  email ? `email.ilike.${email.toLowerCase().trim()}` : null,
                ]
                  .filter(Boolean)
                  .join(","),
              )
              .limit(10)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const leadIds = (leads.data ?? []).map((l: any) => l.id);
      const [positions, events, messages] = await Promise.all([
        leadIds.length
          ? supabase
              .from("lead_stage_positions")
              .select("entered_at, lead_funnels(name), lead_funnel_stages(name)")
              .in("lead_id", leadIds)
          : Promise.resolve({ data: [] as any[] }),
        leadIds.length
          ? supabase
              .from("lead_events")
              .select("event_name, metadata, created_at")
              .in("lead_id", leadIds)
              .order("created_at", { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] as any[] }),
        variants.length
          ? supabase
              .from("whatsapp_messages")
              .select("created_at, direction, message_type, body, sender_name")
              .in("phone", variants)
              .eq("is_deleted", false)
              .order("created_at", { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      return jsonContent({
        customers: customers.data ?? [],
        purchases: purchases.data ?? [],
        leads: leads.data ?? [],
        funnel_positions: (positions.data ?? []).map((p: any) => ({
          funnel: p.lead_funnels?.name,
          stage: p.lead_funnel_stages?.name,
          entered_at: p.entered_at,
        })),
        recent_events: events.data ?? [],
        whatsapp_last_messages: (messages.data ?? []).map((m: any) => ({
          at: m.created_at,
          dir: m.direction,
          type: m.message_type,
          from: m.sender_name,
          text: typeof m.body === "string" ? m.body.slice(0, 500) : m.body,
        })),
      });
    },
  );

  server.registerTool(
    "search_leads",
    {
      title: "Buscar leads",
      description: "Busca leads por nome, telefone ou email (ilike).",
      inputSchema: {
        query: z.string().min(2).describe("Trecho de nome, telefone ou email"),
        limit: z.number().optional(),
      },
    },
    async ({ query, limit }) => {
      checkRate("read");
      const q = query.trim();
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, phone, email, assigned_to, created_at")
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(clampLimit(limit, 20));
      if (error) return errorContent(error.message);
      return jsonContent(data);
    },
  );
}
