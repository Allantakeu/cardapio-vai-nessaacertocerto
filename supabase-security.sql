-- =============================================================================
-- Vai Nessa — correção de segurança (RLS + Storage)
-- Rode este script inteiro no Supabase: Dashboard > SQL Editor > New query > Run
--
-- Idempotente: pode rodar de novo sem erro se travar no meio ou se quiser
-- confirmar que está tudo aplicado — cada policy é derrubada (se existir) e
-- recriada, então rodar duas vezes dá no mesmo resultado que rodar uma vez.
--
-- MODELO DE AMEAÇA: qualquer pessoa na internet, sem login, que descubra a
-- URL do projeto e a chave anon (que é pública por definição — ela vai no
-- código de qualquer app Supabase que roda no navegador). O que protege os
-- dados nunca é a chave: é a policy de RLS de cada tabela/bucket.
--
-- MODELO DE NEGÓCIO que este script assume (não mude sem revisar as policies):
--   - vitrine pública: qualquer cliente lê o cardápio sem login.
--   - tracking anônimo: cliques/vendas/pedidos são gravados sem login
--     (senão o rastreamento de quem NUNCA logou no painel não funciona).
--   - um único dono administrador — não é multi-tenant, então as policies de
--     escrita não verificam QUEM é o usuário autenticado, só QUE ele está
--     autenticado (auth.role() = 'authenticated'). Se um dia existir mais de
--     um admin, ainda funciona: todo usuário do Supabase Auth deste projeto
--     é automaticamente "o dono".
--
-- ORDEM DE EXECUÇÃO IMPORTANTE:
--   1. Rode este SQL primeiro.
--   2. DEPOIS crie o usuário do dono em Authentication > Users > Add user
--      (marque "Auto Confirm User"). Sem isso, ninguém consegue logar no
--      painel e as gravações authenticated vão falhar com 401/403 pra você
--      também, não só pra um atacante.
--   3. Só depois disso publique o vn-data.js e o painel.html atualizados.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) vn_catalog — o cardápio (1 linha, id='main', json em `data`)
--
-- ANTES: policy `vn_write ... for all using (true) with check (true)` deixava
-- qualquer requisição anônima fazer INSERT/UPDATE/DELETE — dava pra reescrever
-- o cardápio inteiro, zerar preços ou trocar o settings.whatsapp pra desviar
-- pedidos pro WhatsApp de outra pessoa.
--
-- DEPOIS: SELECT continua público (só a linha 'main' — é a única que a
-- vitrine lê mesmo), e toda escrita passa a exigir um usuário autenticado.
-- -----------------------------------------------------------------------------

alter table vn_catalog enable row level security;

drop policy if exists vn_read on vn_catalog;
drop policy if exists vn_write on vn_catalog;
drop policy if exists vn_catalog_public_read on vn_catalog;
drop policy if exists vn_catalog_owner_write on vn_catalog;
drop policy if exists vn_catalog_owner_update on vn_catalog;
drop policy if exists vn_catalog_owner_delete on vn_catalog;

-- Leitura pública, mas travada na linha 'main' — mesmo que um dia apareça
-- outra linha na tabela por engano, ela não fica exposta.
create policy vn_catalog_public_read
  on vn_catalog for select
  to anon, authenticated
  using (id = 'main');

-- Escrita só pra quem logou (o dono, via Supabase Auth). `to authenticated`
-- já barra qualquer requisição usando só a chave anon — nem precisa checar
-- o valor de auth.uid() porque não existe conceito de "dono de qual linha"
-- aqui, é sempre a mesma linha 'main'.
create policy vn_catalog_owner_write
  on vn_catalog for insert
  to authenticated
  with check (true);

create policy vn_catalog_owner_update
  on vn_catalog for update
  to authenticated
  using (true)
  with check (true);

create policy vn_catalog_owner_delete
  on vn_catalog for delete
  to authenticated
  using (true);


-- -----------------------------------------------------------------------------
-- 2) vn_events — cliques, vendas e pedidos (analytics do painel)
--
-- ANTES: `ev_read ... using (true)` deixava QUALQUER PESSOA ler nome,
-- telefone e endereço de todo pedido já feito (LGPD) via
-- GET /rest/v1/vn_events?select=detail. Confirmado que isso vaza dados reais
-- de clientes hoje.
--
-- DEPOIS: INSERT continua anônimo (é assim que o rastreamento funciona pra
-- visitantes que nunca logaram — o cliente do cardápio nunca tem sessão),
-- mas SELECT passa a exigir login. Sem isso o dashboard do painel para de
-- funcionar, então ele também precisa estar autenticado (já é, com o resto
-- desta correção).
-- -----------------------------------------------------------------------------

alter table vn_events enable row level security;

drop policy if exists ev_read on vn_events;
drop policy if exists ev_write on vn_events;
drop policy if exists vn_events_public_insert on vn_events;
drop policy if exists vn_events_owner_read on vn_events;

-- Mantém o insert anônimo, mas trava o campo `type` num conjunto conhecido —
-- não impede spam de eventos (é público por natureza), mas impede gravar
-- lixo arbitrário em colunas que não deveriam aceitar qualquer texto.
create policy vn_events_public_insert
  on vn_events for insert
  to anon, authenticated
  with check (type in ('click', 'sale', 'order'));

create policy vn_events_owner_read
  on vn_events for select
  to authenticated
  using (true);

-- Sem policy de update/delete em vn_events — de propósito. Eventos são um
-- log de auditoria; ninguém (nem o dono, pela API) deveria conseguir editar
-- ou apagar um evento já gravado por essa rota. Correções de dados, se
-- precisar, são feitas direto no SQL Editor com a service_role key.


-- -----------------------------------------------------------------------------
-- 3) Storage — bucket vn-photos (fotos de produto, logo, capa da loja)
--
-- ANTES: `vn_photos_write ... for insert with check (bucket_id = 'vn-photos')`
-- deixava qualquer pessoa enviar QUALQUER arquivo (não só imagem, sem limite
-- de tamanho) pro bucket público, de graça, sem estar logada — e não existia
-- policy de delete nenhuma (nem o dono conseguia apagar foto pela API).
--
-- DEPOIS: leitura pública continua (as fotos precisam aparecer pra qualquer
-- cliente na vitrine), upload/troca/remoção exigem login, e o bucket em si
-- passa a rejeitar arquivos que não sejam imagem ou que passem de 5MB —
-- essa checagem acontece ANTES da policy de RLS, então é a primeira linha
-- de defesa contra upload de lixo/arquivo malicioso.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('vn-photos', 'vn-photos', true)
on conflict (id) do nothing;

update storage.buckets
set file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'vn-photos';

drop policy if exists vn_photos_read on storage.objects;
drop policy if exists vn_photos_write on storage.objects;
drop policy if exists vn_photos_public_read on storage.objects;
drop policy if exists vn_photos_owner_insert on storage.objects;
drop policy if exists vn_photos_owner_update on storage.objects;
drop policy if exists vn_photos_owner_delete on storage.objects;

create policy vn_photos_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'vn-photos');

create policy vn_photos_owner_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'vn-photos');

-- Cobre o caso de re-upload no mesmo caminho (upsert), que o Storage trata
-- como um update na linha existente de storage.objects.
create policy vn_photos_owner_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'vn-photos')
  with check (bucket_id = 'vn-photos');

create policy vn_photos_owner_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'vn-photos');


-- =============================================================================
-- Fim. Próximo passo: crie o usuário do dono (Authentication > Users > Add
-- user, com "Auto Confirm User" marcado) e siga o checklist de verificação
-- em SEGURANCA.md antes de considerar isso concluído.
-- =============================================================================
