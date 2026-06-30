# Girassol — Agente de Suporte/Vendas WhatsApp

Agente em **Claude Agent SDK** que atende clientes no WhatsApp do Matheus Colombo, integrado ao
CRM (metric-streamer). Faz suporte + vendas consultivas, abre tickets pra humano, e coordena
atendimento IA↔humano.

> Status: **EM PRODUÇÃO, aberto a todos** (whitelist vazia) desde 29/06/2026.

---

## Arquitetura

```
Cliente WhatsApp ─┐
                  ▼
         UAZAPI (instância "GIRASSOL", nº 554899161174)
                  │  webhook
                  ▼
   CRM Supabase: tabela whatsapp_messages  ◄── fonte da verdade
                  ▲
                  │ poller consulta a cada 4s (NÃO depende de webhook chegar no servidor)
         Servidor próprio (systemd "girassol")
                  │  responde via UAZAPI /send/text
                  ├─ Claude Agent SDK (Opus 4.8) + MCP metric-streamer (tools)
                  └─ tools in-process: transferencia, marcar_suspeito
```

- **Poller** (`src/poller.ts`): lê `whatsapp_messages` (ambas direções) filtrando a instância da
  Girassol (`GIRASSOL_INSTANCE_ID`). Inbound do cliente → enfileira pro agente. Outbound que **não**
  foi o bot (`wasSentByBot`) = humano respondeu → pausa o bot pra aquele contato.
- O repasse CRM→servidor via edge **não** é confiável; por isso o servidor **puxa** (poller).

## Servidor / Deploy

| | |
|---|---|
| Host | `2.25.203.200` (user `agent`, chave `~/.ssh/agent-kvm`) |
| Código | `/opt/girassol` (NÃO é git — deploy por cópia do `dist`) |
| MCP | `/opt/agent-mcp/dist/index.js` · Prompt: `/opt/agent-mcp/prompts/girassol.md` |
| Service | systemd `girassol` (`sudo systemctl {status,restart} girassol`, sudo -n liberado) |
| Logs | `sudo journalctl -u girassol -f` |
| Repo local | `agent-mcp/girassol` |

**Deploy de mudança de código:**
```bash
cd agent-mcp/girassol && npm run build          # tsc → dist/ (vite não aplica; use tsc)
ssh -i ~/.ssh/agent-kvm agent@2.25.203.200 'cp -r /opt/girassol/dist /opt/girassol/dist.bak.$(date +%F-%H%M%S)'
scp -i ~/.ssh/agent-kvm dist/<arquivos>.js agent@2.25.203.200:/opt/girassol/dist/
ssh -i ~/.ssh/agent-kvm agent@2.25.203.200 'sudo systemctl restart girassol'
```
**Prompt** (`agent-mcp/prompts/girassol.md`) é lido no boot → editar, `scp` pra `/opt/agent-mcp/prompts/` e **restart**.

## Configuração (`.env`)

| Var | Função |
|---|---|
| `UAZAPI_URL` / `UAZAPI_TOKEN` | API + token da **instância** (define o número de envio). Hoje aponta p/ instância GIRASSOL. |
| `GIRASSOL_INSTANCE_ID` | Instância do CRM que o poller atende (`206d59ce-…`). **Obrigatório com whitelist aberta.** |
| `GIRASSOL_WHITELIST` | Se preenchida, SÓ atende esses números (match últimos 8 dígitos). **Vazia = todos.** |
| `GIRASSOL_ALLOW_GRANT_ACCESS` | `true` → libera tool `cademi_grant_access` (reenviar acesso/"reset"). |
| `GIRASSOL_ALLOW_UPDATE_LEAD` | `true` → libera `update_lead`. (hoje off) |
| `GIRASSOL_STRIKE_LIMIT` | Strikes de fraude até bloquear o contato (default 3). |
| `GIRASSOL_HUMAN_PAUSE_MIN` | Minutos que o bot cala quando humano responde (default 30, renovável). |
| `GIRASSOL_TEAM_PHONE` | Pra onde vão os avisos do time (hoje `5548996036492`). |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Acesso ao CRM (poller + tickets). |
| `GIRASSOL_PAUSE_HOURS` | Pausa após `transferencia` (default 6h). |

## Funcionalidades

- **Suporte + vendas** (Spin Selling), prompt em `agent-mcp/prompts/girassol.md`.
- **Tools (allowlist):** `get_customer`, `get_whatsapp_conversation`, `cademi_get_user`,
  `cademi_list_products`, `cademi_grant_access` (se flag), `transferencia`, `marcar_suspeito`.
  ⚠️ `search_leads` foi **removido** (vazaria dados de terceiros).
- **Transferência → ticket:** `transferencia` abre card no board **"Suporte — Atendimento Humano"**
  (`lead_funnels` `3e786611…` / stage "Aguardando atendimento" `fb745b97…`) + evento
  `transferencia_girassol` + nota no contato + pausa o bot 6h + avisa o time. Lógica em `src/crm.ts`
  (`createSupportTicket`, com logging `✅ ticket aberto`).
- **Retenção de reembolso:** não transfere de cara — tenta reverter 2-3x, só transfere se o cliente
  insistir (prompt §6).
- **Anti-fraude (auto-block):** tool `marcar_suspeito` acumula strikes; ao atingir o limite, marca
  tag `fraude_suspeita` em `leads.metadata.tags` → o poller (`isContactBlocked`) **ignora** o contato.
  Time desbloqueia tirando a tag.
- **Coordenação humano↔bot:** humano responde pelo número → poller seta `leads.metadata.bot_paused_until`
  (= agora + `GIRASSOL_HUMAN_PAUSE_MIN`, renovável) → bot cala. Volta sozinho ao expirar.
- **Segurança:** regras 11 (nunca quebrar personagem) e 12 (escopo de dados / não liberar acesso sem
  compra / anti-manipulação) no prompt. Rate limit no MCP (60 leituras/10 escritas por min, global).

## Integração com o CRM (metric-streamer)

- **Campo `leads.metadata.bot_paused_until`** (ISO): se no futuro, a Girassol não responde o contato.
  Setado pela auto-pausa (servidor) **e** pelo botão do CRM.
- **Botão "Assumir / Devolver pra IA"** na tela de atendimento (barra acima do compositor,
  `BotControlBar`) — PR #37. Usa a RPC **`set_lead_bot_pause(p_lead_id, p_until)`** (SECURITY DEFINER,
  migration `20260629233000`).
- **Indicador IA/Humano** na lista de conversas (`useBotPausedPhones`), só na instância GIRASSOL.
- Deploy do CRM: PR → merge → **Lovable publica o front**, mas **migrations precisam ser aplicadas à
  mão no Supabase SQL Editor** (Lovable não aplica). gh ativo `negociagora-tech` tem push.

## Runbook (tarefas comuns)

```bash
# Status / saúde
ssh -i ~/.ssh/agent-kvm agent@2.25.203.200 'systemctl is-active girassol; sudo journalctl -u girassol -n 30 --no-pager'

# Ver de qual número é o token atual (instance/status)
curl -s -H "token: $UAZAPI_TOKEN" "$UAZAPI_URL/instance/status"

# Desbloquear um contato (tirar tag fraude_suspeita / limpar bot_paused_until):
#   PATCH leads SET metadata = metadata - 'bot_paused_until', tags sem 'fraude_suspeita'

# Limpar sessões/pausas locais (resolve "IA retomando conversa velha"):
ssh ... 'sudo systemctl stop girassol; echo "{\"sessions\":{},\"pauses\":{}}" > /opt/girassol/girassol-state.json; sudo systemctl start girassol'
```

## Backlog (mapeado, não feito)

- **Verificação de compra server-side** no `cademi_grant_access` (blinda fraude de acesso de vez).
- **TTL de sessão** (conversa parada há muito tempo recomeça do zero em vez de retomar contexto velho).
- **Gatilho de "resolvido"** no ticket (mover card / tag quando o humano fecha).
- **Role-gating** no botão Assumir/Devolver (hoje qualquer atendente alterna).

---
*Última atualização: 30/06/2026.*
