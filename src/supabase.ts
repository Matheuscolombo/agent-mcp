import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("[agent-mcp] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios (.env)");
  process.exit(1);
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const ORG_ID = "00000000-0000-0000-0000-000000000001";
export const ACTOR = process.env.AGENT_ACTOR || "support-agent";

/** Variantes de telefone BR — mesmo padrão do sales-copilot/recompra. */
export function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  const variants = new Set<string>([raw, digits, `+${digits}`]);
  if (digits.startsWith("55") && digits.length >= 12) {
    variants.add(digits.slice(2));
  } else if (digits.length >= 10 && digits.length <= 11) {
    variants.add(`55${digits}`);
    variants.add(`+55${digits}`);
  }
  return [...variants].filter(Boolean);
}
