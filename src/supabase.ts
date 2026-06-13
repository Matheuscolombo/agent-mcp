import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  // Não derruba o servidor: tools Cademi seguem funcionando; as de Supabase
  // retornam erro descritivo por chamada até a service key entrar no .env.
  console.error(
    "[agent-mcp] AVISO: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes — tools de banco indisponíveis",
  );
}

export const supabase = createClient(
  url || "https://pendente.supabase.co",
  key || "pendente-configurar-service-key",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

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
