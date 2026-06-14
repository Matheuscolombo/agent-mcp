# Produtos Girassol — tabela reconstruída (DRAFT)

> Reconstruída em 2026-06-13 garimpando os 70 workflows do n8n + resolvendo os links
> de checkout nas páginas públicas. A tabela original (`produtos` no Supabase
> `yfefwkvqokkjkxbpufkl`) foi **deletada** (projeto não existe mais — NXDOMAIN).
>
> ✅ = confirmado | ❓ = falta o Matheus preencher/confirmar (preços não vieram: checkout é JS).
> Os preços marcados foram os únicos achados literais nos textos das automações.

## Esteira principal (links go.cursosmatheuscolombo.com.br/pay/<slug>)

| # | Produto | Link de compra (canônico) | Preço |
|---|---------|---------------------------|-------|
| 1 | **Curso dos Erveiros** (carro-chefe, 1ª prioridade) | https://go.cursosmatheuscolombo.com.br/pay/curso-dos-erveiros-oficial | ❓ |
| 2 | **Mestre das Tinturas** (2ª prioridade) | https://go.cursosmatheuscolombo.com.br/pay/mestre-tinturas-oficial | ❓ |
| 3 | **Mestre em Méis Medicinais** | https://go.cursosmatheuscolombo.com.br/pay/mestre-mel-medicinal | ❓ |
| 4 | **Combo Mestre das Tinturas + Méis** | https://go.cursosmatheuscolombo.com.br/pay/combo-mestre-ervas-oficial | economia de R$297 vs separados ✅ |
| 5 | **Programa Diabetes (Diabetes Sem Segredos)** (3ª prioridade) | https://go.cursosmatheuscolombo.com.br/pay/programa-diabetes-oficial | ❓ |
| 6 | **Revolução do Ser** | https://go.cursosmatheuscolombo.com.br/pay/revolucao-do-ser-oficial | ❓ |
| 7 | **Alinhamento das Ervas** (confirmar nome) | https://go.cursosmatheuscolombo.com.br/pay/alinhamento-ervas-oficial | ❓ |
| 8 | **Articulabem** (1ª compra grátis / isca) | https://go.cursosmatheuscolombo.com.br/pay/articulabem-1compra-free | grátis na 1ª compra ✅ |

## Produtos via Ticto / Eduzz (links diretos)

| # | Produto | Link de compra | Preço |
|---|---------|----------------|-------|
| 9  | **Guia de Preparo de Tinturas** ("Como preparar tinturas de ervas medicinais" — livro digital) | https://checkout.ticto.app/OA0FC6C5C | ❓ |
| 10 | **Manual das Ervas para Dores** (livro digital, Eduzz) | https://sun.eduzz.com/801VJPG697 | ❓ |
| 11 | **Desafio Protocolos Anti-Doenças / Detox** (evento 5 dias) | https://payment.ticto.app/O694B9DA8 | R$190,00 ✅ |
| 12 | **Renda Natural** (programa de renda extra / afiliação) | https://checkout.ticto.app/O8FE7DB0A | ❓ |
| 13 | **Clube Secreto das Plantas** (assinatura/comunidade) | https://checkout.ticto.app/O7553D3A6 | ❓ |
| 14 | **Upsell Exclusivo** (order bump — "leve todos") | https://payment.ticto.app/OB0F93610 | R$97 (de R$213) ✅ |

## Outros / referência

| Item | Link | Obs |
|------|------|-----|
| **Loja dos Erveiros** (produtos físicos prontos: tinturas, géis, pomadas) | https://www.lojadoserveiros.com.br/ | só quando cliente pede produto pronto |
| **Despertar da Vida Plena** | (sem link /pay/ direto achado; entra via webhook `despertar-vida-plena`) | ❓ link de compra |
| **Portal Fluxo do Ser** | ❓ não encontrado nos workflows | ❓ |
| **YouTube do Matheus** | https://www.youtube.com/channel/UCgWpIkLdfHlm64qZgPBTJ0A | quando cliente não pode comprar |
| **Área de membros (entrega)** | https://portal.cursosmatheuscolombo.com.br/ e Cademi (portalmc.cademi.com.br) | onde o acesso é liberado |
| **Grupo de alunos (WhatsApp)** | https://chat.whatsapp.com/JiUn2dd1TFlLCfmL8UmUhu | exclusivo de alunos |

## Pendências para o Matheus preencher

1. **Preços** dos produtos marcados ❓ (a maioria — o checkout renderiza valor via JS, não consegui ler).
2. Confirmar nome do **Alinhamento das Ervas** (slug `alinhamento-ervas-oficial`).
3. Link de compra do **Despertar da Vida Plena** e do **Portal Fluxo do Ser** (se ainda vendem).
4. Há UTMs padrão? (os fluxos usavam `?utm_source=agente&utm_medium=ia&utm_campaign=rec`).
