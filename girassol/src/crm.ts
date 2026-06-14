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
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey || !CONFIG.supportFunnelId) return;

  // Nota no contato (por telefone — independe do lead, dribla os duplicados)
  await rest("whatsapp_contact_notes", {
    method: "POST",
    body: JSON.stringify({
      organization_id: ORG,
      phone: onlyDigits(phone),
      content: `🌻 Transferência da Girassol\nMotivo: ${motivo}${nome ? `\nCliente: ${nome}` : ""}${email ? `\nEmail: ${email}` : ""}`,
    }),
  }).catch(() => {});

  const leadId = await findOrCreateLead(phone, nome, email);
  if (!leadId) return;

  // Move o card pro board Suporte / Aguardando atendimento (substitui posição anterior nesse funil)
  await rest(`lead_stage_positions?lead_id=eq.${leadId}&funnel_id=eq.${CONFIG.supportFunnelId}`, {
    method: "DELETE",
  }).catch(() => {});
  await rest("lead_stage_positions", {
    method: "POST",
    body: JSON.stringify({
      lead_id: leadId,
      funnel_id: CONFIG.supportFunnelId,
      stage_id: CONFIG.supportStageWaiting,
      entered_at: new Date().toISOString(),
    }),
  }).catch(() => {});

  // Evento no histórico do lead
  await rest("lead_events", {
    method: "POST",
    body: JSON.stringify({
      lead_id: leadId,
      funnel_id: CONFIG.supportFunnelId,
      event_name: "transferencia_girassol",
      metadata: { motivo, nome: nome || null, email: email || null, phone: onlyDigits(phone) },
      created_at: new Date().toISOString(),
    }),
  }).catch(() => {});
}
