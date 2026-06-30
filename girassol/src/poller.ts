import { CONFIG, isWhitelisted } from "./config.js";
import { isPaused } from "./state.js";
import { isContactBlocked, isBotPausedByHuman, markHumanActive } from "./crm.js";
import { wasSentByBot } from "./uazapi.js";

type Enqueue = (phone: string, text: string) => void;
type Log = (msg: string) => void;

// Cursor: só processa mensagens criadas a partir de AGORA — nunca reprocessa histórico.
let cursor = new Date().toISOString();

async function pollOnce(enqueue: Enqueue, log: Log): Promise<void> {
  const instanceFilter = CONFIG.instanceId
    ? `&instance_id=eq.${encodeURIComponent(CONFIG.instanceId)}`
    : "";
  // Lê AMBAS as direções: inbound = mensagem do cliente (responder); outbound = se NÃO foi o
  // bot, é um humano atendendo → silencia o bot pra aquele contato (coordenação humano↔bot).
  const url =
    `${CONFIG.supabaseUrl}/rest/v1/whatsapp_messages` +
    `?select=id,phone,body,direction,created_at` +
    `&created_at=gt.${encodeURIComponent(cursor)}` +
    instanceFilter +
    `&order=created_at.asc&limit=50`;
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
    direction: string;
    created_at: string;
  }>;
  for (const m of rows) {
    if (m.created_at > cursor) cursor = m.created_at; // avança o cursor
    const phone = (m.phone || "").trim();
    const text = (m.body || "").trim();
    if (!phone) continue;

    // Outbound: se a mensagem que saiu NÃO foi o bot, é um humano atendendo → pausa o bot.
    if (m.direction === "outbound") {
      if (text && !wasSentByBot(text)) {
        await markHumanActive(phone, CONFIG.humanPauseMinutes).catch(() => {});
        log(`[poller] humano respondeu ${phone} — bot pausado ${CONFIG.humanPauseMinutes}min`);
      }
      continue;
    }

    // Inbound: mensagem do cliente.
    if (!text) continue;
    if (!isWhitelisted(phone)) continue; // só números liberados
    if (isPaused(phone)) continue; // transferência/bloqueio local → bot calado
    if (await isContactBlocked(phone)) { // marcado como fraude/abuso → ignorado
      log(`[poller] ${phone} bloqueado (fraude/abuso) — ignorado`);
      continue;
    }
    if (await isBotPausedByHuman(phone)) { // humano atendendo (auto ou botão) → bot calado
      log(`[poller] ${phone} em atendimento humano — bot calado`);
      continue;
    }
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
  if (!CONFIG.instanceId) {
    log(
      "[poller] ⚠️ GIRASSOL_INSTANCE_ID vazio — vai ler inbound de TODAS as instâncias. " +
        "NÃO abra a whitelist sem setar a instância, ou a Girassol responde conversas de outras vendedoras.",
    );
  } else {
    log(`[poller] filtrando instância ${CONFIG.instanceId}`);
  }
  log(`[poller] ligado (consulta a cada ${CONFIG.pollMs}ms, a partir de ${cursor})`);
  setInterval(() => {
    pollOnce(enqueue, log).catch((e) => log(`[poller] falhou: ${(e as Error)?.message || e}`));
  }, CONFIG.pollMs);
}
