# Churrasco do Joe — Landing Page Pública

> **Para o Claude Code:** este documento complementa `docs/SPEC.md` (sistema interno) e `docs/SPEC_adendo_rateio_custos.md`. Salve como `docs/SPEC_landing_page.md`. A landing page vive no mesmo monorepo, usa a mesma API e a mesma identidade visual. Onde houver `TODO(confirmar)`, deixe configurável e pergunte ao Eduardo.

---

## 1. Objetivo

Criar o site público do Churrasco do Joe no domínio principal, onde o cliente:

1. Vê o **cardápio e os combos com preço atualizado** (vindo do sistema interno, sem digitar nada duas vezes).
2. Monta o pedido e **envia**: o pedido cai no sistema interno como pré-pedido **e** abre o WhatsApp com o resumo pronto.
3. Sabe **quando** funcionamos (fins de semana e feriados, pico 11h–14h), **onde** atendemos (bairros e taxas), **como falar** com a gente e segue o Instagram.

E a equipe tem um botão discreto no canto superior direito para entrar no **sistema interno**.

O WhatsApp continua sendo o canal principal de conversão. O site não substitui o WhatsApp; ele organiza o pedido antes de chegar lá.

---

## 2. Domínios e arquitetura

| Endereço | O que é |
|---|---|
| `https://DOMINIO` e `https://www.DOMINIO` (redireciona para o sem www) | Landing page pública |
| `https://app.DOMINIO` | Sistema interno (já especificado) |
| `https://api.DOMINIO/v1/public/*` | Rotas públicas, **sem login** |
| `https://api.DOMINIO/v1/*` | Rotas internas, com login (já especificadas) |

### Stack
- **Astro** (site estático, ótimo para SEO e carregamento rápido no celular) + **ilhas React** apenas no cardápio/carrinho e no status "aberto/fechado".
- Tailwind com os mesmos tokens de cor e fontes do sistema interno (mover os tokens para `packages/shared/theme`).
- Pasta nova: `apps/site/`.

### AWS (acrescentar ao CDK)
- **SiteStack**: bucket S3 privado + CloudFront com OAC, certificado ACM `us-east-1` para `DOMINIO` e `www.DOMINIO`, redirecionamento `www → raiz` via CloudFront Function, registros no Route 53.
- As rotas `/v1/public/*` usam a **mesma Lambda** da API, porém **sem o JWT authorizer**, com **throttling** no API Gateway (ex.: 5 req/s, burst 20) para as rotas públicas.
- CORS das rotas públicas liberado apenas para `https://DOMINIO`.
- Deploy no mesmo workflow do GitHub Actions: build do Astro → `s3 sync` → invalidação do CloudFront.

---

## 3. Estrutura da página (uma página, rolagem com âncoras)

Mobile first — a maioria dos acessos vem do Instagram e do WhatsApp no celular.

### 3.1 Cabeçalho fixo
- Logo "CHURRASCO DO JOE" (Bebas Neue, laranja) à esquerda.
- Menu âncora (desktop): Cardápio · Combos · Como funciona · Entrega · Onde estamos · Contato.
- **Canto superior direito:** botão pequeno, contorno dourado, texto "Área interna" com ícone de cadeado → abre `https://app.DOMINIO` na mesma aba. No celular vira só o ícone de cadeado com `aria-label="Área interna"`, ao lado do ícone do carrinho.
- No celular: menu hambúrguer + ícone do carrinho com contador.

### 3.2 Hero
- Fundo com o gradiente da marca (`#0D0A07 → #2B1507 → #D4420A → #F07020`) ou foto do churrasco (imagem configurável).
- Título: "CHURRASCO DO JOE" (Bebas Neue); tagline em Playfair Display Italic: "O Autêntico Sabor Gaúcho"; linha em Barlow Condensed: "AUTÊNTICO · GAÚCHO · DELICIOSO".
- **Selo de status** (ilha React, vem da API): "🔥 Aberto agora — pedidos até 14h" / "Fechado agora — encomende para sábado" / "Abrimos no feriado de DD/MM".
- Botões: **Ver cardápio** (primário, laranja) e **Chamar no WhatsApp** (secundário).

### 3.3 Combos em destaque
Cards dos combos (Combo 1 – 2 pessoas, Combo 2 – 4 pessoas e futuros kits) com a composição, seletor de carne mostrando o preço de cada variante e botão **Adicionar**. Mostrar a economia em relação ao avulso ("Você economiza R$ X") usando os preços da tabela individual.

### 3.4 Cardápio
Abas ou chips por categoria: Carnes · Acompanhamentos · Bebidas · Doces & Geleias. Card com foto, nome, descrição curta, unidade (espeto, bandeja, porção...), preço e botão **+**. Itens com `disponivel_hoje = false` aparecem esmaecidos com "Esgotado hoje" (e somem se `visivel_site = false`). Parceiros com selo: "Doces by Nick", "King of Geleia".

### 3.5 Carrinho e envio do pedido
Gaveta lateral (desktop) ou tela cheia (celular):
1. Itens com quantidade e observação ("ao ponto", "bem passada").
2. **Entrega ou retirada.**
3. Entrega: bairro (lista da API, mostra a taxa) + endereço + referência. Bairro fora da lista → "Não entregamos aí ainda, chama no WhatsApp".
4. **Quando:** "Hoje, o quanto antes" (só se estiver aberto) ou data/horário agendado, limitado aos próximos dias de operação e aos horários configurados.
5. Nome e WhatsApp do cliente (máscara `(51) 9XXXX-XXXX`).
6. Forma de pagamento pretendida (Pix, dinheiro com troco, cartão na entrega).
7. Resumo com subtotal, taxa e total.
8. Botão **Enviar pedido pelo WhatsApp**:
   - chama `POST /v1/public/pedidos`;
   - recebe o número do pré-pedido e o texto pronto;
   - abre `https://wa.me/55NUMERO?text=<texto>`;
   - mostra a tela "Pedido #017 enviado! Confirme no WhatsApp para garantirmos o seu".
- Carrinho salvo no `localStorage` para o cliente não perder o que montou.
- Aviso claro: "O pedido só vale depois da nossa confirmação no WhatsApp."

### 3.6 Como funciona
Três passos com ícones: **Escolhe** no cardápio → **Envia** pelo WhatsApp → **Recebe** em casa ou **retira** no ponto. Destaque: "Encomende durante a semana para o fim de semana."

### 3.7 Entrega
Lista de bairros atendidos com taxa (da API), cidades (Canoas, Estância Velha) e horário de entrega.

### 3.8 Onde estamos
Endereço do ponto de retirada, mapa e horários: sábados, domingos e feriados — `TODO(confirmar)` horário de abertura e encerramento. Botão "Como chegar" (link para o Google Maps).
- `TODO(confirmar)`: como a operação é no endereço de casa, decidir se o site mostra o endereço completo, só a rua/bairro, ou apenas "retirada combinada pelo WhatsApp". O mapa deve ser configurável para essas três opções.

### 3.9 Parceiros
Cards de Doces by Nick e King of Geleia com logo e link do Instagram de cada um.

### 3.10 Instagram
Chamada "Segue a gente" com o @ e 3–6 fotos configuradas manualmente (sem integração com a API do Instagram nesta fase).

### 3.11 FAQ
Perguntas configuráveis: funcionam durante a semana? · qual a área de entrega? · posso encomendar para outro dia? · quais formas de pagamento? · fazem para eventos?

### 3.12 Rodapé
Logo, WhatsApp, Instagram, horário, área de entrega, dados legais do vendedor (ver pendências), link "Política de privacidade", e novamente o link "Área interna" em texto pequeno.

### 3.13 Botão flutuante
Botão redondo do WhatsApp fixo no canto inferior direito em todas as seções (vira "Ver carrinho (3) · R$ 187,98" quando há itens).

---

## 4. API pública

Todas sem autenticação, com throttling, retornando **apenas campos públicos** (nunca custo, margem, fornecedor ou dados de clientes).

| Rota | Retorno | Cache |
|---|---|---|
| `GET /v1/public/cardapio` | categorias → produtos (id, nome, descrição curta, unidade, preço, foto, disponível hoje, parceiro, permite fracionado) e combos → itens + variantes (carne, preço) | `Cache-Control: max-age=60` |
| `GET /v1/public/bairros` | bairros atendidos com taxa | 300 s |
| `GET /v1/public/status` | aberto agora (bool), mensagem, próximo dia/horário de funcionamento, horários disponíveis para agendamento | 30 s |
| `GET /v1/public/site` | textos configuráveis: WhatsApp, Instagram, endereço/modo de exibição, horários, FAQ, fotos do Instagram, parceiros | 300 s |
| `POST /v1/public/pedidos` | cria pré-pedido; retorna `{ numero, data_operacao, total, texto_whatsapp, whatsapp_url }` | sem cache |

### Regras do `POST /v1/public/pedidos`
- **O servidor recalcula tudo:** preços, taxa de entrega e total vêm do banco pelo `produto_id` / `combo_variante_id` / `bairro_id`. Valores enviados pelo navegador são ignorados.
- Rejeita item inativo, esgotado ou fora do site; bairro que não atende; horário fora da operação.
- Faz **upsert do cliente pelo telefone** (nome e endereço atualizados).
- Cria o pedido com `canal = 'site'` e `status = 'aguardando_confirmacao'`.
- Antispam: campo honeypot oculto, limite de 3 pedidos por telefone por hora e de 10 por IP por hora, tamanho máximo de texto nas observações.
- Texto do WhatsApp gerado no servidor, por exemplo:

```
Olá! Fiz o pedido #017 pelo site 🔥
2x Combo 2 – Picanha (Refri: Coca)
1x Pão de alho (bandeja)
Entrega: Mathias Velho – Rua X, 123 (ref.: portão preto)
Para: sáb 04/10, 12h
Pagamento: Pix
Total: R$ 629,88 (taxa R$ 8,00)
Nome: Fulano
```

---

## 5. Mudanças no sistema interno

1. **Enum `canal`:** adicionar `site`.
2. **Enum `status` do pedido:** adicionar `aguardando_confirmacao` antes de `confirmado`, e `recusado` (com motivo).
3. **Pedidos do dia:** nova coluna/grupo "Do site — aguardando confirmação" no topo, com **alerta sonoro e badge** quando chega um pedido novo (polling a cada 20 s). Ações: **Confirmar** (vira `confirmado`), **Editar** (ex.: trocar item esgotado) e **Recusar** (motivo obrigatório). Botão "Abrir conversa no WhatsApp" com o telefone do cliente.
4. **Produtos:** novos campos `descricao_curta text`, `imagem_key text` (S3), `visivel_site boolean default true`, `destaque_site boolean`, `ordem_site int`. Na tela **Cardápio e Preços**, adicionar upload de foto e toggles "Site" e "Destaque".
5. **Combos:** mesmos campos de site (`descricao_curta`, `imagem_key`, `visivel_site`, `ordem_site`).
6. **Bairros:** campo `visivel_site`.
7. **Nova tela 🔒 Configurações → Site:** WhatsApp, Instagram, horários por dia da semana, feriados em que abre, modo de exibição do endereço, textos do hero, FAQ, fotos do Instagram, parceiros, e a chave "Aceitar pedidos pelo site" (liga/desliga o botão de envio; quando desligado, o carrinho vira só "Chamar no WhatsApp").
8. **Imagens:** bucket S3 público-por-CloudFront `site-media` (separado do bucket privado de anexos), servido em `https://DOMINIO/media/*`. Ao subir a foto, gerar versões WebP 400 px e 800 px (Lambda com `sharp`).
9. **Relatórios:** incluir `site` nos gráficos por canal e a taxa de conversão "pré-pedidos do site → confirmados".

---

## 6. SEO, compartilhamento e medição

- `<title>` e `meta description` com "churrasco", "delivery", "Canoas", "fim de semana".
- **JSON-LD `Restaurant`** (schema.org) com nome, telefone, área atendida, horários, `servesCuisine: "Churrasco gaúcho"`, `priceRange`, link do menu.
- Open Graph e Twitter Card com imagem 1200×630 da marca (é o preview que aparece quando o link é mandado no WhatsApp — caprichar).
- `sitemap.xml`, `robots.txt`, favicon e ícones.
- Link para o perfil no Google (Perfil da Empresa) — `TODO(confirmar)` se existe.
- **Meta Pixel** opcional (desligado por padrão) com eventos `ViewContent` (cardápio), `AddToCart` e `Contact` (envio pelo WhatsApp), carregado só após consentimento no banner de cookies.
- Métricas mínimas sem cookies: contagem de cliques em "Enviar pedido" e "Chamar no WhatsApp" registrada via `POST /v1/public/eventos` (sem dado pessoal).

---

## 7. Requisitos não funcionais

- Lighthouse no celular ≥ 90 em Performance, Acessibilidade e SEO.
- Página inicial < 200 KB de JS; fontes com `font-display: swap`; imagens WebP com `loading="lazy"`.
- Contraste AA no tema escuro; todos os botões com texto ou `aria-label`; carrinho navegável por teclado.
- Se a API estiver fora (ou o banco "acordando"), o site mostra o cardápio do último build estático (gerar `cardapio.json` no build como fallback) e o botão cai para "Chamar no WhatsApp".
- **Política de privacidade (LGPD):** página simples explicando que nome, telefone e endereço são usados só para entregar o pedido e contatar o cliente.

---

## 8. Plano de implementação

**Fase A — Site estático:** Astro, tema da marca, todas as seções com dados de `/public/site`, `/public/cardapio`, `/public/bairros` e `/public/status`; botão "Área interna"; botão flutuante do WhatsApp; SEO.
✅ Pronto quando: o site mostra o cardápio com os mesmos preços do sistema interno e o botão leva para `app.DOMINIO`.

**Fase B — Carrinho e pré-pedido:** carrinho, `POST /public/pedidos`, antispam, status `aguardando_confirmacao`, alerta na tela de pedidos, confirmar/recusar.
✅ Pronto quando: um pedido feito no site aparece no sistema interno em até 20 s e o WhatsApp abre com o resumo correto.

**Fase C — Gestão do site no sistema:** fotos dos produtos, toggles de site, tela Configurações → Site.
✅ Pronto quando: dá para trocar foto, texto e horário sem mexer em código.

**Fase D — Infra e publicação:** SiteStack no CDK, domínio raiz e www, throttling, deploy automático, Pixel opcional.
✅ Pronto quando: `https://DOMINIO` está no ar com HTTPS e Lighthouse ≥ 90.

---

## 9. Pendências para o Eduardo

1. Número do WhatsApp e @ do Instagram (e dos parceiros).
2. Horário de funcionamento por dia e quais feriados abrem.
3. Como mostrar o local de retirada: endereço completo, só rua/bairro, ou combinado pelo WhatsApp.
4. Bairros atendidos e taxas (a mesma pendência do sistema interno).
5. Fotos dos produtos e combos (as imagens já tratadas com fundo removido servem).
6. **Dados legais no rodapé:** quem vende online precisa informar nome/razão social e CNPJ no site (Decreto 7.962/2013). Definir qual CNPJ e nome vão aparecer.
7. Se quer o Meta Pixel ligado para as campanhas.
