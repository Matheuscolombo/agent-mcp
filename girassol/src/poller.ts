import { CONFIG, isWhitelisted } from "./config.js";
import { isPaused } from "./state.js";

type Enqueue = (phone: string, text: string) => void;
type Log = (msg: string) => void;

// Cursor: só processa mensagens criadas a partir de AGORA — nunca reprocessa histórico.
let cursor = new Date().toISOString();

async function pollOnce(enqueue: Enqueue, log: Log): Promise<void> {
  const url =
    `${CONFIG.supabaseUrl}/rest/v1/whatsapp_messages` +
    `?select=id,phone,body,direction,created_at` +
    `&direction=eq.inbound&created_at=gt.${encodeURIComponent(cursor)}` +
    `&order=created_at.asc&limit=30`;
  const res = await fetch(url, {
    headers: { apikey: CONFIG.supabaseKey, Authorization: `Bearer ${CONFIG.supabaseKey}` },
  });
  if (!res.ok) {
    log(`[poller] HTTP ${res.status} ao consultar o CRM`);
    return;
  }
  const rows = (await res.json()) as Array<{
    id: string;
    phone: string;
    body: string | null;
    created_at: string;
  }>;
  for (const m of rows) {
    if (m.created_at > cursor) cursor = m.created_at; // avança o cursor
    const phone = (m.phone || "").trim();
    const text = (m.body || "").trim();
    if (!phone || !text) continue;
    if (!isWhitelisted(phone)) continue; // só números liberados
    if (isPaused(phone)) continue; // humano assumiu → bot calado
    log(`[poller] nova mensagem de ${phone}: "${text.slice(0, 50)}"`);
    enqueue(phone, text);
  }
}

/**
 * Liga o poller: consulta a tabela whatsapp_messages do CRM a cada CONFIG.pollMs
 * e enfileira as mensagens novas (inbound, na whitelist). Substitui o repasse do
 * edge — o servidor "puxa" em vez de depender do CRM "ligar" pra cá.
 */
export function startPoller(enqueue: Enqueue, log: Log): void {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    log("[poller] SUPABASE_URL/SERVICE_ROLE_KEY ausentes — poller DESLIGADO");
    return;
  }
  log(`[poller] ligado (consulta a cada ${CONFIG.pollMs}ms, a partir de ${cursor})`);
  setInterval(() => {
    pollOnce(enqueue, log).catch((e) => log(`[poller] falhou: ${(e as Error)?.message || e}`));
  }, CONFIG.pollMs);
}
