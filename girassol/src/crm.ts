import { CONFIG } from "./config.js";

const ORG = "00000000-0000-0000-0000-000000000001";
const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${CONFIG.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: CONFIG.supabaseKey,
      Authorization: `Bearer ${CONFIG.supabaseKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

/**
 * Igual ao rest(), mas CHECA res.ok e LOGA falhas. Um 4xx (RLS/schema) não rejeita
 * o fetch — sem esse check, o erro passava batido (ticket não abria e nada no log).
 * Retorna true só se a operação realmente teve sucesso.
 */
async function restChecked(label: string, path: string, init: RequestInit = {}): Promise<boolean> {
  try {
    const res = await rest(path, init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[girassol] ticket/${label}: HTTP ${res.status} ${body.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[girassol] ticket/${label}: ${(err as Error)?.message || err}`);
    return false;
  }
}

/** Acha o lead pelos últimos 8 dígitos do telefone (mais recente) ou cria um novo. */
async function findOrCreateLead(phone: string, nome?: string, email?: string): Promise<string | null> {
  const last8 = onlyDigits(phone).slice(-8);
  if (last8.length >= 7) {
    const res = await rest(`leads?select=id&phone=like.*${last8}&order=updated_at.desc.nullslast&limit=1`);
    if (res.ok) {
      const rows = (await res.json()) as Array<{ id: string }>;
      if (rows.length) return rows[0].id;
    }
  }
  const create = await rest("leads", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ organization_id: ORG, phone: onlyDigits(phone), name: nome || null, email: email || null }),
  });
  if (create.ok) {
    const rows = (await create.json()) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }
  return null;
}

/**
 * Abre um ticket de suporte no board "Suporte — Atendimento Humano":
 * card em "Aguardando atendimento" + nota com o motivo + evento no histórico.
 * Tudo best-effort — nunca derruba a transferência se o CRM falhar.
 */
export async function createSupportTicket(
  phone: string,
  nome: string | undefined,
  email: string | undefined,
  motivo: string,
): Promise<void> {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey || !CONFIG.supportFunnelId) {
    console.error("[girassol] ticket: abortado — supabase/funil de suporte não configurados");
    return;
  }

  // Nota no contato (por telefone — independe do lead, dribla os duplicados)
  const noteOk = await restChecked("nota", "whatsapp_contact_notes", {
    method: "POST",
    body: JSON.stringify({
      organization_id: ORG,
      phone: onlyDigits(phone),
      content: `🌻 Transferência da Girassol\nMotivo: ${motivo}${nome ? `\nCliente: ${nome}` : ""}${email ? `\nEmail: ${email}` : ""}`,
    }),
  });

  const leadId = await findOrCreateLead(phone, nome, email);
  if (!leadId) {
    console.error(`[girassol] ticket: não consegui achar/criar lead p/ ${onlyDigits(phone)} — card NÃO criado (nota=${noteOk})`);
    return;
  }

  // Move o card pro board Suporte / Aguardando atendimento (substitui posição anterior nesse funil)
  await restChecked("card-del", `lead_stage_positions?lead_id=eq.${leadId}&funnel_id=eq.${CONFIG.supportFunnelId}`, {
    method: "DELETE",
  });
  const cardOk = await restChecked("card", "lead_stage_positions", {
    method: "POST",
    body: JSON.stringify({
      lead_id: leadId,
      funnel_id: CONFIG.supportFunnelId,
      stage_id: CONFIG.supportStageWaiting,
      entered_at: new Date().toISOString(),
    }),
  });

  // Evento no histórico do lead
  const evtOk = await restChecked("evento", "lead_events", {
    method: "POST",
    body: JSON.stringify({
      lead_id: leadId,
      funnel_id: CONFIG.supportFunnelId,
      event_name: "transferencia_girassol",
      metadata: { motivo, nome: nome || null, email: email || null, phone: onlyDigits(phone) },
      created_at: new Date().toISOString(),
    }),
  });

  if (cardOk) {
    console.log(`[girassol] ✅ ticket aberto: lead ${leadId} → board suporte (nota=${noteOk} evento=${evtOk})`);
  } else {
    console.error(`[girassol] ⚠️ ticket PARCIAL: lead ${leadId} mas card NÃO entrou no board (nota=${noteOk} evento=${evtOk})`);
  }
}

/** Tag que marca um contato como bloqueado por suspeita de fraude/abuso. */
export const BLOCK_TAG = "fraude_suspeita";

/** Campo no lead que segura o bot enquanto um humano atende (timestamp ISO). */
const HUMAN_PAUSE_KEY = "bot_paused_until";

/**
 * Marca atendimento humano ativo: silencia o bot por `minutes` p/ este contato (renovável).
 * Grava `metadata.bot_paused_until` no lead — o MESMO campo que o botão "Assumir" do CRM usa.
 */
export async function markHumanActive(phone: string, minutes: number): Promise<void> {
  const leadId = await findOrCreateLead(phone);
  if (!leadId) return;
  let metadata: any = {};
  try {
    const res = await rest(`leads?id=eq.${leadId}&select=metadata`);
    if (res.ok) metadata = ((await res.json()) as Array<{ metadata: any }>)[0]?.metadata || {};
  } catch { /* metadata vazio */ }
  const untilIso = new Date(Date.now() + minutes * 60_000).toISOString();
  await restChecked("human-pause", `leads?id=eq.${leadId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ metadata: { ...metadata, [HUMAN_PAUSE_KEY]: untilIso } }),
  });
  console.log(`[girassol] 👤 humano atendendo ${onlyDigits(phone)} — bot calado até ${untilIso}`);
}

/** Há atendimento humano ativo (bot_paused_until no futuro) p/ este contato? */
export async function isBotPausedByHuman(phone: string): Promise<boolean> {
  const last8 = onlyDigits(phone).slice(-8);
  if (last8.length < 7) return false;
  try {
    const res = await rest(`leads?select=metadata&phone=like.*${last8}&order=updated_at.desc.nullslast&limit=5`);
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ metadata: any }>;
    return rows.some((r) => {
      const u = r.metadata?.[HUMAN_PAUSE_KEY];
      return typeof u === "string" && Date.parse(u) > Date.now();
    });
  } catch {
    return false;
  }
}

/**
 * O contato está bloqueado? (lead com a tag de fraude). Consulta os leads do telefone
 * (pega duplicados) e checa metadata.tags. Best-effort: qualquer erro = NÃO bloqueia
 * (fail-open, pra um problema de rede nunca derrubar o atendimento legítimo).
 */
export async function isContactBlocked(phone: string): Promise<boolean> {
  const last8 = onlyDigits(phone).slice(-8);
  if (last8.length < 7) return false;
  try {
    const res = await rest(`leads?select=metadata&phone=like.*${last8}&order=updated_at.desc.nullslast&limit=5`);
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ metadata: any }>;
    return rows.some((r) => Array.isArray(r.metadata?.tags) && r.metadata.tags.includes(BLOCK_TAG));
  } catch {
    return false;
  }
}

/**
 * Registra um strike de suspeita no lead. Ao atingir CONFIG.strikeLimit, adiciona a tag
 * `fraude_suspeita` (bloqueio CRM-backed, visível/gerenciável no kanban) + evento.
 * Retorna {strikes, blocked}.
 */
export async function flagSuspect(
  phone: string,
  nome: string | undefined,
  email: string | undefined,
  motivo: string,
): Promise<{ strikes: number; blocked: boolean }> {
  const leadId = await findOrCreateLead(phone, nome, email);
  if (!leadId) {
    console.error(`[girassol] suspeito: não consegui achar/criar lead p/ ${onlyDigits(phone)}`);
    return { strikes: 0, blocked: false };
  }

  let metadata: any = {};
  try {
    const res = await rest(`leads?id=eq.${leadId}&select=metadata`);
    if (res.ok) {
      const rows = (await res.json()) as Array<{ metadata: any }>;
      metadata = rows[0]?.metadata || {};
    }
  } catch { /* usa metadata vazio */ }

  const strikes = Number(metadata.girassol_strikes || 0) + 1;
  const blocked = strikes >= CONFIG.strikeLimit;
  const tags: string[] = Array.isArray(metadata.tags) ? [...metadata.tags] : [];
  if (blocked && !tags.includes(BLOCK_TAG)) tags.push(BLOCK_TAG);

  await restChecked("suspeito-meta", `leads?id=eq.${leadId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ metadata: { ...metadata, girassol_strikes: strikes, tags } }),
  });
  await restChecked("suspeito-evento", "lead_events", {
    method: "POST",
    body: JSON.stringify({
      lead_id: leadId,
      funnel_id: CONFIG.supportFunnelId,
      event_name: blocked ? "girassol_bloqueado" : "girassol_suspeita",
      metadata: { motivo, strikes, phone: onlyDigits(phone) },
      created_at: new Date().toISOString(),
    }),
  });

  console.log(`[girassol] ${blocked ? "🚫 BLOQUEADO" : "⚠️ strike"} ${strikes}/${CONFIG.strikeLimit} lead ${leadId} — ${motivo}`);
  return { strikes, blocked };
}
