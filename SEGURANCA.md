# Segurança — Vai Nessa

Correção das vulnerabilidades encontradas na avaliação de segurança (RLS aberto,
PIN client-side, upload público, PII exposta em `vn_events`). Este documento é o
checklist de verificação pós-implementação e as observações adicionais.

## O que mudou

- **`supabase-security.sql`** — SQL completo pra rodar no SQL Editor do projeto
  já existente (dropa as policies antigas e cria as novas).
- **`vn-data.js`** — camada de autenticação (Supabase Auth via REST, sem
  adicionar a lib supabase-js), `api()`/`save()`/`uploadPhoto()` passam a usar
  o token da sessão quando existir, e o SQL embutido (usado pelo Guia Supabase
  para instalações novas) já nasce com as policies corrigidas.
- **`painel.html`** — tela de PIN trocada por login (e-mail/senha), botão
  "Sair", link "Esqueci minha senha", tratamento de sessão expirada (uma
  gravação que falha por 401/403 devolve o dono pra tela de login sem perder
  o rascunho), e um jeito de trocar de projeto Supabase **antes** de logar
  (pra quem está configurando um projeto novo do zero).
- **`guia-supabase.html`** — novo passo 5 ("Criar o seu login"), passos 6-7
  atualizados, e o aviso de segurança do rodapé corrigido (não fala mais que
  "não há dado de cliente" — vn_events tem nome/telefone/endereço).

## Ordem de implantação (importante)

1. Rode `supabase-security.sql` inteiro no SQL Editor do Supabase.
2. **Antes de publicar o código novo**, crie o usuário do dono: Dashboard →
   Authentication → Users → Add user → preencha e-mail/senha → marque
   **Auto Confirm User**. Sem isso, o painel fica com a tela de login sem
   ninguém conseguir entrar.
3. Só depois disso, publique `vn-data.js`, `painel.html` e `guia-supabase.html`
   atualizados (git push / redeploy na Vercel).
4. Faça login no painel com o e-mail/senha do passo 2 e confirme que consegue
   salvar uma alteração qualquer.

Se pular o passo 2, o painel carrega normalmente (a vitrine pública não
depende de login), mas ninguém consegue gravar nada até o usuário existir.

## Checklist de verificação pós-implementação

Rode estes testes manuais depois de aplicar o SQL e publicar o código. Você
pode usar o navegador (aba anônima) ou `curl`/Postman com a chave anon (a
mesma que já está em `vn-data.js`).

- [ ] **GET anônimo do cardápio continua funcionando** — abra a vitrine
      (`index.html`) numa aba anônima, sem estar logado em lugar nenhum: os
      produtos devem aparecer normalmente.
      ```bash
      curl "https://SEU-PROJETO.supabase.co/rest/v1/vn_catalog?id=eq.main&select=data" \
        -H "apikey: SUA_CHAVE_ANON" -H "Authorization: Bearer SUA_CHAVE_ANON"
      # esperado: 200, com o JSON do cardápio
      ```

- [ ] **PATCH anônimo em `vn_catalog` retorna 401/403** — sem estar logado:
      ```bash
      curl -X PATCH "https://SEU-PROJETO.supabase.co/rest/v1/vn_catalog?id=eq.main" \
        -H "apikey: SUA_CHAVE_ANON" -H "Authorization: Bearer SUA_CHAVE_ANON" \
        -H "Content-Type: application/json" \
        -d '{"data":{"hackeado":true}}'
      # esperado: 401 ou 403 — NUNCA 200/204
      ```

- [ ] **SELECT anônimo em `vn_events` retorna 401/403**:
      ```bash
      curl "https://SEU-PROJETO.supabase.co/rest/v1/vn_events?select=detail&limit=1" \
        -H "apikey: SUA_CHAVE_ANON" -H "Authorization: Bearer SUA_CHAVE_ANON"
      # esperado: 401/403, ou um array vazio — nunca dados de pedido/telefone
      ```

- [ ] **INSERT anônimo em `vn_events` continua funcionando** (é assim que o
      tracking de visitantes sem login opera):
      ```bash
      curl -X POST "https://SEU-PROJETO.supabase.co/rest/v1/vn_events" \
        -H "apikey: SUA_CHAVE_ANON" -H "Authorization: Bearer SUA_CHAVE_ANON" \
        -H "Content-Type: application/json" \
        -d '{"type":"click","product":"teste"}'
      # esperado: 201
      ```

- [ ] **Upload anônimo no bucket `vn-photos` retorna 401/403**:
      ```bash
      curl -X POST "https://SEU-PROJETO.supabase.co/storage/v1/object/vn-photos/teste.jpg" \
        -H "apikey: SUA_CHAVE_ANON" -H "Authorization: Bearer SUA_CHAVE_ANON" \
        -H "Content-Type: image/jpeg" --data-binary "@qualquer-imagem.jpg"
      # esperado: 401/403
      ```

- [ ] **Login no painel com senha errada falha** — tela de login mostra erro,
      continua na tela de login, não crasha.
- [ ] **Login no painel com senha certa funciona** — abre o painel, e uma
      edição (ex.: mudar um preço) salva e reflete na vitrine em alguns
      segundos.
- [ ] **Upload de foto autenticado funciona** — envie uma foto de produto
      logado; deve aparecer normalmente e a URL pública deve abrir.
- [ ] **Upload de arquivo não-imagem ou maior que 5MB é rejeitado** pelo
      bucket, mesmo logado (limite configurado no SQL).
- [ ] **Sessão expirada** — para simular: no painel, abra o DevTools →
      Application → Local Storage → apague a chave `vn.session` manualmente
      e tente salvar algo. Deve voltar pra tela de login com a mensagem
      "Sua sessão expirou".

## Observações de segurança adicionais

### Headers HTTP (CSP, X-Frame-Options)

O `vercel.json` já define `X-Content-Type-Options` e `Referrer-Policy`. Vale
adicionar (com cuidado, teste antes de publicar — uma CSP errada quebra o
carregamento de fontes/imagens):

```json
{
  "key": "X-Frame-Options",
  "value": "DENY"
},
{
  "key": "Content-Security-Policy",
  "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co https://viacep.com.br https://nominatim.openstreetmap.org https://router.project-osrm.org"
}
```

`script-src 'unsafe-inline'` é necessário porque o app usa o padrão
`<script type="text/x-dc">` (o componente inteiro vai inline) — travar isso
exigiria mover a lógica pra um arquivo `.js` separado com nonce, uma mudança
maior de arquitetura. Não é uma vulnerabilidade por si só (não há injeção de
HTML de terceiros no app hoje), mas é a razão de não dar pra usar uma CSP mais
restrita sem refatorar.

### Limpeza de dados sensíveis já expostos

Os dados de `vn_events` (nome, telefone, endereço de pedidos) já foram lidos
publicamente enquanto a policy estava aberta — não tem como saber se alguém
mais coletou isso. Depois de aplicar a correção:

1. Considere avisar os clientes mais recentes se a loja tiver esse costume
   (não é obrigatório tecnicamente, mas é a prática mais transparente).
2. Não é necessário apagar os eventos — eles são o histórico de pedidos e
   dashboard; a correção de RLS já impede novos vazamentos.
3. Se quiser reduzir a superfície de dado sensível daqui pra frente, dá pra
   parar de gravar `telefone`/`endereco` no campo `detail` do evento e manter
   só no `vn_catalog`/mensagem do WhatsApp (que já vai direto pro dono) — isso
   é uma mudança de produto, não de segurança, então não fiz sem confirmar
   com você.

### Rotação de chave e do PIN antigo

- A **chave anon** não precisa ser rotacionada — ela é pública por definição
  e continua sendo depois desta correção; o que mudou é o que ela consegue
  fazer sozinha (só ler).
- O **PIN "1234"** não protege mais nada (não é mais comparado em lugar
  nenhum do código) — pode ficar esquecido, mas se quiser limpar o campo
  antigo do banco: `update vn_catalog set data = data - 'settings' || jsonb_build_object('settings', (data->'settings') - 'pin') where id = 'main';`
  (remove só a chave `pin` de dentro do `settings`, sem mexer no resto).
- Se em algum momento suspeitar que a **senha do login** vazou, troque em
  Supabase Dashboard → Authentication → Users → (usuário) → **Reset password**,
  ou use "Esqueci minha senha" na tela de login.
