import { CONFIG } from "./config.js";

/** Textos enviados pelo bot recentemente — distingue eco fromMe do bot vs humano. */
const recentBotTexts = new Map<string, number>();

function rememberBotText(text: string) {
  recentBotTexts.set(text.trim(), Date.now());
  // limpeza simples
  for (const [t, at] of recentBotTexts) {
    if (Date.now() - at > 10 * 60_000) recentBotTexts.delete(t);
  }
}

export function wasSentByBot(text: string): boolean {
  return recentBotTexts.has(text.trim());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Envia resposta em blocos (split por \n\n) com delay humano entre eles. */
export async function sendBlocks(phone: string, fullText: string): Promise<void> {
  const blocks = fullText
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  for (const [i, block] of blocks.entries()) {
    if (CONFIG.dryRun) {
      console.log(`[girassol DRY_RUN] → ${phone} (${i + 1}/${blocks.length}): ${block.slice(0, 200)}`);
    } else {
      const res = await fetch(`${CONFIG.uazapiUrl}/send/text`, {
        method: "POST",
        headers: { token: CONFIG.uazapiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ number: phone, text: block }),
      });
      if (!res.ok) {
        console.error(`[girassol] falha no envio p/ ${phone}: HTTP ${res.status} ${await res.text().catch(() => "")}`);
      }
      rememberBotText(block);
    }
    if (i < blocks.length - 1) await sleep(3000 + Math.random() * 3000);
  }
}

export async function notifyTeam(message: string): Promise<void> {
  if (!CONFIG.teamPhone) {
    console.log(`[girassol] (sem GIRASSOL_TEAM_PHONE) notificação: ${message}`);
    return;
  }
  await sendBlocks(CONFIG.teamPhone, message);
}

export interface IncomingMessage {
  phone: string;
  text: string;
  senderName: string | null;
  fromMe: boolean;
  isGroup: boolean;
  messageType: string;
}

/** Parser do webhook UAZAPI v2 (formato do uazapi-webhook do metric-streamer). */
export function parseWebhook(payload: any): IncomingMessage | null {
  const msg = payload?.message;
  if (!msg) return null;

  const chatid: string = msg.chatid || payload?.chat?.wa_chatid || payload?.chat?.jid || "";
  if (!chatid) return null;

  const isGroup = chatid.endsWith("@g.us");
  const phone = (chatid.split("@")[0] || "").replace(/\D/g, "");
  if (!phone) return null;

  const text: string =
    msg.text ||
    (typeof msg.content === "string" ? msg.content : "") ||
    msg.conversation ||
    "";

  const messageType: string = msg.messageType || msg.type || payload?.type || "text";

  return {
    phone,
    text: String(text).trim(),
    senderName: msg.senderName || payload?.chat?.name || null,
    fromMe: msg.fromMe === true,
    isGroup,
    messageType,
  };
}
