# Handoff: Cardápio Digital "Vai Nessa"

## Overview
Um cardápio digital (mobile-first, estilo iFood/Rappi) para uma adega/loja de bebidas, com carrinho, checkout via WhatsApp, carrossel de promoções, e um painel administrativo para gerenciar produtos, coleções, pedidos e configurações da loja. Os dados são persistidos no Supabase (com fallback local em localStorage quando não conectado).

## About the Design Files
Os arquivos `.dc.html` deste pacote são **referências de design construídas em HTML** — protótipos funcionais que mostram a aparência e o comportamento pretendidos, não código de produção para copiar diretamente. A tarefa é **recriar esses designs no ambiente da base de código de destino** (React, Vue, Swift, etc.), usando os padrões e bibliotecas já estabelecidos ali — ou, se ainda não existir uma base, escolher o framework mais adequado e implementar os designs nele.

## Fidelity
**Alta fidelidade (hifi).** Cores, tipografia, espaçamento e interações estão praticamente finais. O desenvolvedor deve recriar a UI com fidelidade pixel a pixel, usando as bibliotecas/padrões já existentes na base de código.

O protótipo também contém **lógica funcional real** (não é só visual): filtro de produtos por coleção, carrinho de compras, upload de imagens para o Supabase Storage, checkout que monta uma mensagem de WhatsApp, e um painel admin com CRUD completo de produtos/coleções. Essa lógica deve ser entendida como especificação de comportamento, a ser reimplementada na stack de destino (ex.: chamadas ao Supabase via SDK oficial, roteamento real em vez de estado de tela em memória, etc.).

## Screens / Views

### 1. Cardápio (Cardapio Vai Nessa.dc.html) — vitrine pública
- **Propósito**: cliente navega produtos, monta carrinho, finaliza pedido via WhatsApp.
- **Layout**: coluna única, `max-width: 440px`, centralizada, fundo externo `#e7e4dc` (>480px) simulando um "frame" de celular com sombra e cantos arredondados (`border-radius: 26px`).
- **Componentes** (topo → baixo):
  - **Capa da loja**: imagem full-width, `height: 128px`, `object-fit: cover`, com gradiente escuro na base (`linear-gradient(180deg, transparent 55%, rgba(23,23,27,.30))`).
  - **Cabeçalho**: logo circular 92×92px sobreposta à capa (margin-top negativo -34px), borda gradiente dourado→rosa (`linear-gradient(160deg, #f5c517 a 65% opacity, #e6208c a 45% opacity)`), nome da loja em duas cores (primeira palavra dourada `--gold-ink #9c7400`, resto rosa `--brand-2-text #c11570`), eyebrow "ADEGA" acima do nome (11px, letter-spacing .18em, uppercase), frase/tagline abaixo (12.5px, cor `--color-neutral-500`).
  - **Busca**: input de texto simples, placeholder "Buscar bebida".
  - **Barra de coleções (chips)**: `position: sticky; top: 0`, carrossel horizontal com `scroll-snap-type: x proximity`, gradiente de fade na borda direita indicando mais itens. Chip ativo: fundo `--color-accent` (#d81b84), texto branco, sombra rosa. Chip inativo: borda `--line`, fundo branco, texto cinza.
  - **Carrossel de promoções**: aparece **apenas na coleção "Todos"**. Cards de 132px de largura, scroll horizontal com snap, foto 96px de altura, selo "Leve 2 pague 1" (ou tag customizada) no canto superior esquerdo em rosa (`--brand-2`). Dots de paginação abaixo do carrossel.
  - **Lista de produtos por coleção**: título de seção (uppercase, 11.5px, letter-spacing .16em), linhas com foto 92×92px arredondada (radius 11px), nome (15.5px semibold), preço (tabular nums, cor accent), botão de adicionar. Ao trocar de coleção, a lista inteira anima com slide-in (da direita ao avançar, da esquerda ao voltar) — `translateX(28px)` a `0`, `.28s cubic-bezier(.2,.8,.2,1)`.
  - **Ficha do produto (modal/sheet)**: abre por baixo (`animation: sheetUp .2s`), foto grande 280px de altura, botão fechar circular flutuante, stepper de quantidade e botão "Adicionar" fixos no rodapé.
  - **Toast de item adicionado**: aparece no rodapé com foto do produto (48×48px) + selo de check rosa sobreposto, nome do item e total do carrinho.
  - **Carrinho flutuante**: botão fixo no rodapé, bolha com contagem de itens à esquerda, valor total à direita, fundo `--color-accent`, sombra rosa pronunciada.
  - **Drawer do carrinho**: lista de itens com foto (52×52px), nome, controles de quantidade; resumo de subtotal/entrega/total; botão de finalizar que monta a mensagem do pedido para o WhatsApp.
  - **Tela de pedido concluído**: logo circular (88px), título "Pedido pronto", texto de confirmação.

### 2. Painel administrativo (Painel Vai Nessa.dc.html)
- **Propósito**: dono da loja gerencia produtos, coleções, promoções, configurações e visualiza a vitrine ao vivo.
- **Layout**: login por PIN na entrada; depois, navegação em abas (Produtos, Coleções, Configurações, Vitrine, etc.), responsivo — colunas colapsam para 1fr em telas estreitas (mobile-first, ajustado nesta rodada de design).
- **Componentes**:
  - Tabela/lista de produtos por coleção, com edição inline e "ficha completa" (modal) por produto — inclui toggle "Destaque" (marca o produto para aparecer no carrossel de promoções da vitrine).
  - Upload de foto (arquivo do computador ou link) para: logo da loja, capa da loja, foto de cada produto — via Supabase Storage (`uploadPhoto`), com fallback para Data URL local se o Supabase não estiver configurado.
  - Aba "Vitrine": prévia ao vivo do cardápio público, refletindo mudanças imediatamente (mesmo estado/dados).
  - Configurações: nome da loja, WhatsApp, taxa de entrega, valor mínimo grátis, PIN de acesso, cor de destaque (accent) customizável.

## Interactions & Behavior
- **Filtro por coleção**: clicar em um chip de coleção mostra somente os produtos daquela coleção; "Todos" mostra tudo. O carrossel de promoções só aparece na aba "Todos".
- **Transição entre coleções**: slide-in horizontal (ver acima), direção calculada pela posição relativa das coleções na lista de abas.
- **Adicionar ao carrinho**: incrementa quantidade se o item (com a mesma variação) já existe; senão cria uma nova linha. Mostra toast de confirmação com foto do produto.
- **Toggle "Destaque" no painel**: atualiza em tempo real o carrossel de promoções da vitrine (o campo `featured` no produto).
- **Checkout**: monta uma mensagem de texto formatada (itens, quantidades, subtotal, taxa de entrega, total) e abre o WhatsApp da loja (`https://wa.me/<numero>?text=<mensagem>`) via link.
- **Responsivo**: abaixo de 480px, o app ocupa a tela cheia (sem frame/sombra); acima disso, é mostrado dentro de um "frame" de celular centralizado.
- **Estados vazios**: coleção sem produtos mostra mensagem central "nada encontrado" (evitar tela em branco).

## State Management
- `cat` (string): coleção selecionada — "Todos" por padrão.
- `catDir` ('l' | 'r'): direção da última troca de coleção, usada para escolher a animação de entrada.
- `cart` (array de linhas `{ name, unit, qty, photo, pid, ... }`): itens no carrinho, persistidos em memória (recomenda-se persistir em localStorage/sessionStorage na reimplementação).
- `added` (string | null): nome do último item adicionado, controla a exibição do toast.
- `q` (string): termo de busca.
- Configuração da loja (`settings`): nome, logo, capa, tagline, WhatsApp, taxa de entrega, PIN, cor de destaque — carregada do Supabase (tabela de config) ou localStorage.
- Catálogo (`categories`, `products`): carregado do Supabase (tabelas `vn_catalog`/equivalentes — ver `Guia Supabase.dc.html` para o esquema SQL) ou seed local.
- **Dados de origem**: ver `vn-data.js` — módulo com `load`, `save`, `normalize`, `seed`, `uploadPhoto`, `sql` (schema Supabase completo) e helpers de formatação de moeda.

## Design Tokens

### Cores
- `--color-bg: #ffffff` · `--color-surface: #f7f5f1` · `--color-text: #17171b`
- Accent (rosa, cor de marca principal, customizável pelo lojista): `--color-accent: #d81b84` (escala 100–900 de `#fbd0e6` a `#33061d`)
- Dourado (detalhe): `--gold: #f5c517` · `--gold-ink: #9c7400`
- Marca secundária (selos de promoção): `--brand-2: #e6208c` · `--brand-2-text: #c11570`
- Neutros: `--color-neutral-400: #7c7c86` · `--color-neutral-500/600: #63636c`
- Linhas/divisores: `--line: rgba(23,23,27,.10)`
- Sombras: `--shadow-sm: 0 0 0 1px rgba(23,23,27,.08)`; `--shadow-md` adiciona `0 6px 18px rgba(23,23,27,.10)`; `--shadow-lg` adiciona `0 16px 40px rgba(23,23,27,.16)`

### Tipografia
- Família única: `Inter` (heading e body), `ui-sans-serif, system-ui` como fallback.
- Eyebrow/labels: 10–11.5px, weight 600–700, letter-spacing .16–.18em, uppercase.
- Nome de produto (`.itemname`): 15.5px, weight 600, letter-spacing -.012em.
- Preço (`.money`): tabular-nums, letter-spacing -.01em.
- Descrição (`.desc`): 12.5px, cor `--color-neutral-500`.
- Título da loja: ~25px, weight 700, letter-spacing -.03em.

### Espaçamento e formas
- Raio de cartões de produto: 11px · fichas grandes: 12–18px · pills/chips: 999px (full).
- Gap padrão entre elementos de lista: 8–14px.

### Animações
- `slideInRight` / `slideInLeft`: `translateX(±28px)` → `0`, opacity .35→1, `.28s cubic-bezier(.2,.8,.2,1)` — troca de coleção.
- `sheetUp`: `translateY(26px)` → `0`, opacity .4→1, `.2s` — abertura de modais/sheets.
- `toastIn`: `translateY(10px)` → `0` — toast de confirmação.

## Assets
- Logo, capa da loja e fotos de produtos são enviados pelo lojista (upload de arquivo ou link) e hospedados no Supabase Storage; não há assets de imagem fixos no design — todos são placeholders (`<image-slot>`) até o upload real.
- Nenhum ícone de terceiros; ações usam glifos de texto simples (✓, ×) por enquanto — recomenda-se um icon set real na reimplementação.

## Files
- `Cardapio Vai Nessa.dc.html` — vitrine pública (cardápio do cliente).
- `Painel Vai Nessa.dc.html` — painel administrativo do lojista.
- `vn-data.js` — camada de dados: schema Supabase (SQL), load/save, seed de exemplo, upload de imagens, formatação.
- `image-slot.js` — componente de placeholder de imagem com drag-and-drop (usado apenas no protótipo; substituir por componente de imagem nativo da stack de destino).
- `Guia Supabase.dc.html` — guia de configuração do backend Supabase (tabelas, políticas RLS, chaves).
