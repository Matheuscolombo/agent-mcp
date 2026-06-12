# agent-mcp — MCP server do metric-streamer

Servidor MCP (stdio) que expõe o metric-streamer para agentes de IA: visão 360 de cliente,
funis, e criação/duplicação de automações de WhatsApp. Consumido pelo **Claude Code** (no Mac)
e pelo futuro **agente de suporte** (Claude Agent SDK, no servidor Ubuntu).

## Setup

```bash
npm install
cp .env.example .env   # preencher SUPABASE_SERVICE_ROLE_KEY (Dashboard → Settings → API)
chmod 600 .env
npm run build
```

## Registrar no Claude Code

```bash
claude mcp add metric-streamer -- node /caminho/para/agent-mcp/dist/index.js
```

## Usar no Claude Agent SDK (agente de suporte)

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

const result = query({
  prompt: "Cliente 5511999999999 diz que não recebeu o acesso. O que ele comprou?",
  options: {
    mcpServers: {
      "metric-streamer": {
        command: "node",
        args: ["/opt/agent-mcp/dist/index.js"],
      },
    },
    allowedTools: [
      "mcp__metric-streamer__get_customer",
      "mcp__metric-streamer__get_whatsapp_conversation",
      "mcp__metric-streamer__search_leads",
      // writes só com aprovação explícita do orquestrador:
      // "mcp__metric-streamer__clone_automation", ...
    ],
  },
});
```

## Tools

| Tool | Tipo | Descrição |
|---|---|---|
| `get_customer` | read | 360 por phone/email: perfil, LTV, compras, funis, eventos, últimas msgs |
| `search_leads` | read | Busca leads por nome/telefone/email |
| `get_whatsapp_conversation` | read | Histórico de mensagens de um telefone |
| `list_funnels` | read | Funis de lead com contagens |
| `get_funnel_overview` | read | Etapas, regras, produtos, automações de um funil |
| `list_unmapped_products` | read | Produtos vendidos sem mapeamento no funil |
| `list_automations` | read | Flows com status e funis vinculados |
| `clone_automation` | **write** | Duplica flow (sempre nasce inativo); `dry_run` disponível |
| `setup_funnel_product` | **write** | Produto + raw names no funil; acusa colisões |
| `link_automation` | **write** | Vincula flow a funil (idempotente) |
| `onboard_product` | **write** | Orquestrador: produto → clone → vínculo |
| `cademi_get_user` | read | Aluno na área de membros (por email/ID) — requer CADEMI_* no .env |
| `cademi_list_products` | read | Produtos/cursos da Cademi (IDs para entrega) |
| `cademi_grant_access` | **write** | Libera/REENVIA acesso (Cademi manda email) — `confirm:true` obrigatório |

## Segurança

- Writes passam **somente** por RPCs `agent_*` do banco (SECURITY DEFINER, allowlisted) —
  nenhuma tool de SQL genérico. Clones de automação **sempre nascem inativos**; ativação é
  exclusivamente manual na UI do metric-streamer.
- Toda escrita é auditada em `agent_action_logs` (RPC loga no banco + wrapper loga `mcp:*`
  com o `AGENT_ACTOR` do `.env`).
- Rate limit in-process: ~60 reads/min, ~10 writes/min.
- `MCP_ENABLE_WHATSAPP_SEND` reservado (envio de WhatsApp fica fora do v1).
- A service key vive só no `.env` (chmod 600, fora do git). Nunca logar/ecoar.

## Deploy no servidor (Ubuntu)

```bash
# 1. Higiene primeiro (a senha root foi exposta — trocar antes de qualquer coisa):
#    - trocar senha root, criar usuário `agent` com chave ed25519
#    - PermitRootLogin no / PasswordAuthentication no em /etc/ssh/sshd_config
# 2. Node 20+:
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
# 3. App:
git clone <repo> /opt/agent-mcp && cd /opt/agent-mcp
npm install && npm run build
cp .env.example .env && nano .env && chmod 600 .env
```

O processo é spawnado via stdio pelo orquestrador do agente (não fica escutando porta).

## Cademi

API v1 (https://api-docs.cademi.com.br/): Bearer `CADEMI_API_KEY`, base `CADEMI_DOMAIN/api/v1`.
A v1 **não tem reset de senha** — o fluxo de suporte é `cademi_grant_access` (entrega/enviar),
que faz a Cademi reenviar o email de acesso ao aluno. Sem `CADEMI_DOMAIN`/`CADEMI_API_KEY` no
`.env`, as tools nem são registradas.

## Fase 2 (pendente)

- `send_whatsapp_message` — atrás de flag, via edge function `whatsapp-send` (guards de
  instância/atribuição), `confirm: true` obrigatório.
