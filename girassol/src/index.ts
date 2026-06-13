import Fastify from "fastify";
import { CONFIG } from "./config.js";
import { parseWebhook, sendBlocks, wasSentByBot } from "./uazapi.js";
import { isPaused, pauseBot } from "./state.js";
import { runGirassol } from "./agent.js";

const app = Fastify({ logger: true });

/** Debounce: junta mensagens do mesmo telefone por GIRASSOL_DEBOUNCE_MS antes de responder. */
const buffers = new Map<string, { texts: string[]; timer: NodeJS.Timeout }>();
const processing = new Set<string>();

function enqueue(phone: string, text: string) {
  const existing = buffers.get(phone);
  if (existing) {
    existing.texts.push(text);
    existing.timer.refresh();
    return;
  }
  const timer = setTimeout(() => flush(phone), CONFIG.debounceMs);
  buffers.set(phone, { texts: [text], timer });
}

async function flush(phone: string) {
  const buf = buffers.get(phone);
  if (!buf) return;
  buffers.delete(phone);

  if (processing.has(phone)) {
    // turno anterior ainda rodando — re-enfileira e espera
    for (const t of buf.texts) enqueue(phone, t);
    return;
  }

  processing.add(phone);
  const combined = buf.texts.join("\n");
  try {
    app.log.info({ phone, combined }, "girassol: processando");
    const answer = await runGirassol(phone, combined);
    if (answer.trim()) await sendBlocks(phone, answer);
  } catch (err) {
    app.log.error({ err, phone }, "girassol: erro no turno");
  } finally {
    processing.delete(phone);
  }
}

app.get("/health", async () => ({ ok: true, dryRun: CONFIG.dryRun, model: CONFIG.model }));

app.post("/webhook/uazapi", async (req, reply) => {
  // secret no header OU na query string (?secret=) — painéis de webhook nem sempre
  // permitem headers customizados
  const secret = req.headers["x-girassol-secret"] || (req.query as any)?.secret;
  if (secret !== CONFIG.webhookSecret) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  const msg = parseWebhook(req.body);
  if (!msg) return { ignored: "payload sem mensagem" };
  if (msg.isGroup) return { ignored: "grupo" };

  if (msg.fromMe) {
    // Eco da própria instância: se NÃO foi o bot, é um humano atendendo → pausa.
    if (msg.text && !wasSentByBot(msg.text)) {
      pauseBot(msg.phone);
      app.log.info({ phone: msg.phone }, "girassol: humano assumiu — bot pausado");
    }
    return { ignored: "fromMe" };
  }

  if (isPaused(msg.phone)) return { ignored: "pausado (atendimento humano)" };

  let text = msg.text;
  if (!text) {
    // v1: mídia ainda não processada — o agente sabe lidar com isso educadamente
    text = `[o cliente enviou ${msg.messageType || "uma mídia"} que ainda não consigo abrir — peça gentilmente para escrever em texto]`;
  }

  enqueue(msg.phone, text);
  return { queued: true };
});

app
  .listen({ port: CONFIG.port, host: "0.0.0.0" })
  .then(() => console.log(`[girassol] ouvindo na porta ${CONFIG.port} (dryRun=${CONFIG.dryRun}, model=${CONFIG.model})`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
