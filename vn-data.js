/* Camada de dados do cardápio Vai Nessa.
   Fonte: Supabase (tabela vn_catalog, 1 linha com um JSON) quando configurado.
   Sem configuração, cai para localStorage — o painel continua funcionando. */
(function () {
  var LS_CFG = 'vn.cfg', LS_DOC = 'vn.doc';

  var beers = [
    ['Skol fina 269ml', 'Garrafa 269ml', 3.5, [[15, 42]]],
    ['Skol 350ml', 'Lata 350ml', 5, [[12, 45], [15, 56.5]]],
    ['Itaipava fina 269ml', 'Garrafa 269ml', 3.5, [[12, 30], [15, 37.5]]],
    ['Itaipava 350ml', 'Lata 350ml', 5, [[12, 35], [15, 43.75]]],
    ['Petra fina 269ml', 'Garrafa 269ml', 3.5, [[12, 32], [15, 40]]],
    ['Brahma fina 269ml', 'Garrafa 269ml', 4, [[15, 44]]],
    ['Brahma latão 350ml', 'Latão 350ml', 6, [[12, 45], [15, 56.25]]],
    ['Império fina 269ml', 'Garrafa 269ml', 3.5, [[12, 35], [15, 43.25]]],
    ['Amstel fina 269ml', 'Garrafa 269ml', 4, [[12, 38], [15, 47.5]]],
    ['Budweiser 269ml', 'Garrafa 269ml', 4, [[8, 30], [15, 55]]],
    ['Original 269ml', 'Garrafa 269ml', 4, [[8, 30], [15, 55]]],
    ['Spaten 269ml', 'Garrafa 269ml', 5, [[8, 30], [15, 55]]],
    ['Heineken fina 269ml', 'Garrafa 269ml', 5, [[8, 37], [15, 69.5]]],
    ['Heineken fina zero 269ml', 'Garrafa 269ml · sem álcool', 5, [[8, 37.5], [15, 70]]],
    ['Heineken 350ml', 'Lata 350ml', 7.5, [[12, 67], [15, 83.75]]],
    ['Michelob 350ml', 'Lata 350ml', 6.5, [[12, 63], [15, 78.75]]]
  ];

  function uid(p) { return (p || 'p') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }

  function seed() {
    return {
      version: 1,
      settings: {
        whatsapp: '5511999347715', deliveryFee: 8, freeAbove: 0,
        hours: 'Aberto até 23:00', minutes: 'Entrega em 25–40 min',
        address: 'Rua Moacir Dantas Itapicuru, 911 — Cidade Nova São Miguel',
        instagram: '@vai.nessa1.0__',
        upsellTitle: 'Quer junto?'
      },
      categories: [{ id: 'cervejas', name: 'Cervejas' }],
      products: beers.map(function (b, i) {
        return {
          id: 'cv' + (i + 1), catId: 'cervejas', name: b[0], vol: b[1], price: b[2],
          fardos: b[3], photo: '', out: false, featured: [1, 6, 12].includes(i + 1), tag: i + 1 === 12 ? 'Leve 2 pague 1' : '', upsell: []
        };
      })
    };
  }

  /* Conexão padrão do projeto. Fica no código (e não só no localStorage de um aparelho)
     porque a vitrine precisa ler o cardápio no celular de QUALQUER cliente — sem isso,
     quem abre o link vê a lista de exemplo em vez dos produtos reais.
     A chave "publishable"/anon é pública por definição (vai no código de qualquer app
     Supabase no navegador); quem protege os dados são as policies de RLS no banco. */
  var DEFAULT_CFG = {
    url: 'https://tpcpclnrxzpsvrmgvozu.supabase.co',
    key: 'sb_publishable_eH1zUPVQqqMMAA_46W9uWQ_71VuZ0OV'
  };

  function cfg() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(LS_CFG)) || {}; } catch (e) { saved = {}; }
    if (saved.disconnected) return {};
    return { url: saved.url || DEFAULT_CFG.url, key: saved.key || DEFAULT_CFG.key };
  }
  function setCfg(c) { localStorage.setItem(LS_CFG, JSON.stringify(c || {})); }
  function connected() { var c = cfg(); return !!(c.url && c.key); }

  /* ------------------------------------------------------------------------
     Autenticação (Supabase Auth / GoTrue via REST — sem adicionar a lib
     supabase-js, pra não mudar o jeito que o projeto carrega scripts).

     Por quê isso existe: a chave anon só pode ler/gravar o que as policies de
     RLS deixarem para o papel "anon". Depois da correção de RLS, gravar em
     vn_catalog e no Storage passa a exigir o papel "authenticated" — ou seja,
     um token de sessão de um usuário real logado. O PIN comparado no
     navegador (como era antes) nunca protegia nada de verdade, porque quem
     ataca a API REST direto nem carrega essa tela.

     O dono da loja é criado uma única vez pelo painel do Supabase
     (Authentication → Users → Add user) — não existe cadastro público aqui,
     de propósito: é um único administrador, não multi-tenant. */
  var LS_SESSION = 'vn.session';

  function getSession() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_SESSION));
      return (s && s.access_token && s.refresh_token && s.expires_at) ? s : null;
    } catch (e) { return null; }
  }
  function setSession(s) {
    try { s ? localStorage.setItem(LS_SESSION, JSON.stringify(s)) : localStorage.removeItem(LS_SESSION); } catch (e) {}
  }
  /* "Logado" = tem sessão salva com um token ainda válido (ou renovável).
     authToken() é quem realmente decide se dá pra renovar; isto aqui é só
     pra UI decidir se mostra a tela de login sem esperar uma chamada de rede. */
  function authed() { return !!getSession(); }

  function authBase() {
    var c = cfg();
    return String(c.url || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  }
  function toSession(tok) {
    /* expires_in vem em segundos; guardamos o instante absoluto de expiração
       com uma folga de 30s pra nunca usar um token que vence no meio de uma
       requisição em voo. */
    return {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: Date.now() + (Number.isFinite(Number(tok.expires_in)) ? Number(tok.expires_in) : 3600) * 1000 - 30000
    };
  }

  function signIn(email, password) {
    var c = cfg();
    if (!connected()) return Promise.reject(new Error('Conecte o Supabase antes de entrar.'));
    return fetch(authBase() + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: c.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) throw new Error(b.error_description || b.msg || 'E-mail ou senha incorretos.');
        setSession(toSession(b));
        return b.user;
      });
    });
  }

  function signOut() {
    var s = getSession();
    setSession(null);
    if (!s) return Promise.resolve();
    var c = cfg();
    /* Revoga o refresh token no servidor — best effort: se a rede cair aqui,
       a sessão local já foi apagada de qualquer forma, então o painel volta
       a pedir login mesmo que a revogação remota não confirme. */
    return fetch(authBase() + '/auth/v1/logout', {
      method: 'POST',
      headers: { apikey: c.key, Authorization: 'Bearer ' + s.access_token }
    }).catch(function () {});
  }

  function refreshSession() {
    var s = getSession();
    if (!s) return Promise.resolve(null);
    var c = cfg();
    return fetch(authBase() + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: c.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) { setSession(null); return null; }
        var ns = toSession(b);
        setSession(ns);
        return ns;
      });
    }).catch(function () { return null; });
  }

  /* Devolve um access_token pronto pra usar, renovando sozinho se estiver
     vencido — assim o dono não precisa logar de novo a cada hora (o access
     token do Supabase dura só 1h por padrão). Sem sessão, devolve null e
     quem chamou cai pra chave anon (que agora só serve pra leitura pública). */
  function authToken() {
    var s = getSession();
    if (!s) return Promise.resolve(null);
    if (s.expires_at > Date.now()) return Promise.resolve(s.access_token);
    return refreshSession().then(function (ns) { return ns ? ns.access_token : null; });
  }

  function localDoc() { try { return JSON.parse(localStorage.getItem(LS_DOC)); } catch (e) { return null; } }
  /* Devolve true/false: quando o localStorage estoura (cota cheia), quem chama precisa
     saber que a gravação NÃO aconteceu, senão o painel mostra "salvo" e o dono perde o trabalho. */
  function setLocalDoc(d) {
    try { localStorage.setItem(LS_DOC, JSON.stringify(d)); return true; } catch (e) { return false; }
  }

  function normalize(d) {
    var s = seed();
    if (!d || !d.products) return s;
    d.settings = Object.assign({}, s.settings, d.settings || {});
    d.categories = (d.categories || s.categories).map(function (c) { return { id: c.id || uid('c'), name: c.name || 'Sem nome' }; });
    d.products = (d.products || []).map(function (p) {
      return Object.assign({ catId: d.categories[0] && d.categories[0].id, vol: '', price: 0, fardos: [], photo: '', out: false, featured: false, tag: '', upsell: [] }, p, { id: p.id || uid() });
    });
    return d;
  }

  function api(path, opts) {
    var c = cfg();
    var o = opts || {};
    var base = String(c.url || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
    /* Usa o token de sessão (papel "authenticated") quando o dono está logado;
       sem sessão, cai pra chave anon — que depois da correção de RLS só
       consegue mais ler o cardápio público, nunca gravar. Isso é o que faz
       load()/track() continuarem funcionando pra qualquer visitante enquanto
       save()/uploadPhoto() passam a exigir login de verdade. */
    return authToken().then(function (tok) {
      return fetch(base + '/rest/v1/' + path, {
        method: o.method || 'GET',
        /* no-store: o cardápio precisa mostrar preço/estoque do momento. Sem isso o
           navegador (ou um proxy no meio) pode devolver uma cópia velha do cardápio. */
        cache: 'no-store',
        headers: {
          apikey: c.key, Authorization: 'Bearer ' + (tok || c.key),
          'Content-Type': 'application/json', Prefer: 'return=representation',
          'Cache-Control': 'no-cache'
        },
        body: o.body ? JSON.stringify(o.body) : undefined
      });
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        var err = new Error(r.status + ' ' + t.slice(0, 140));
        err.status = r.status;
        throw err;
      });
      return r.status === 204 ? null : r.json();
    });
  }

  /* Pergunta pro banco se esse telefone já usou esse cupom antes — roda numa
     function do Postgres (security definer) que só devolve true/false, então
     o cardápio nunca vê pedido/nome/endereço de outro cliente. Se a function
     ainda não existir (dono não rodou o SQL novo), o Supabase não estiver
     conectado, ou a rede do cliente estiver ruim/lenta, assume que não foi
     usado — a checagem nunca pode travar o checkout de um cliente de verdade. */
  function couponUsed(phone, code) {
    if (!connected() || !code || !phone) return Promise.resolve(false);
    var timeout = new Promise(function (res) { setTimeout(function () { res(false); }, 6000); });
    var request = api('rpc/check_coupon_used', { method: 'POST', body: { p_phone: phone, p_code: code } })
      .then(function (used) { return !!used; })
      .catch(function () { return false; });
    return Promise.race([request, timeout]);
  }

  /* Conta quantos amigos diferentes esse telefone já indicou (pra mostrar o
     progresso "1/5/10/25 indicações" em tempo real no cardápio) sem o
     cliente conseguir ler pedido/nome/endereço de ninguém — roda numa
     function do Postgres que só devolve um número. Se a function ainda não
     existir, o Supabase não estiver conectado, ou a rede estiver ruim,
     assume 0 — nunca pode travar a tela do cliente. */
  function countReferrals(phone) {
    if (!connected() || !phone) return Promise.resolve(0);
    var timeout = new Promise(function (res) { setTimeout(function () { res(0); }, 6000); });
    var request = api('rpc/count_referrals', { method: 'POST', body: { p_phone: phone } })
      .then(function (n) { return Number(n) || 0; })
      .catch(function () { return 0; });
    return Promise.race([request, timeout]);
  }

  /* Só pra descobrir se o catálogo mudou desde a última vez, sem baixar nem
     serializar o documento inteiro (que já passa fácil de 50-100KB com fotos
     de 130+ produtos) — usado pelo polling da vitrine, que rodava esse custo
     inteiro a cada 6 segundos só pra comparar igualdade. */
  function checkUpdated() {
    if (!connected()) return Promise.resolve(null);
    return api('vn_catalog?id=eq.main&select=updated_at')
      .then(function (rows) { return (rows && rows[0] && rows[0].updated_at) || null; })
      .catch(function () { return null; });
  }

  function load() {
    if (!connected()) return Promise.resolve({ doc: normalize(localDoc() || seed()), source: 'local' });
    return api('vn_catalog?id=eq.main&select=data')
      .then(function (rows) {
        if (!rows || !rows.length || !rows[0].data || !rows[0].data.products) {
          var d = normalize(localDoc() || seed());
          return save(d).then(function () { return { doc: d, source: 'supabase' }; });
        }
        var doc = normalize(rows[0].data);
        setLocalDoc(doc);
        return { doc: doc, source: 'supabase' };
      })
      .catch(function (e) { return { doc: normalize(localDoc() || seed()), source: 'local', error: e.message }; });
  }

  /* Encadeia os saves um atrás do outro em vez de deixar rodar em paralelo —
     dois PATCHs pro mesmo registro em voo ao mesmo tempo podem, numa rede
     instável, terminar no servidor fora da ordem em que foram chamados, e o
     mais antigo (com menos alterações) fica valendo por cima do mais novo.
     Encadear garante que cada save só sai pra rede depois que o anterior
     terminou, preservando a ordem real das chamadas. */
  var _saveChain = Promise.resolve();

  function save(doc) {
    var storedLocally = setLocalDoc(doc);
    if (!connected()) {
      return Promise.resolve(storedLocally
        ? { source: 'local' }
        : { source: 'local', error: 'Memória do navegador cheia — conecte o Supabase para não perder as alterações.' });
    }
    var run = function () {
      return api('vn_catalog?id=eq.main', { method: 'PATCH', body: { data: doc, updated_at: new Date().toISOString() } })
        .then(function (rows) {
          if (rows && rows.length) return { source: 'supabase' };
          return api('vn_catalog', { method: 'POST', body: { id: 'main', data: doc } }).then(function () { return { source: 'supabase' }; });
        })
        .catch(function (e) {
          /* 401/403 aqui significa que a sessão do dono expirou (ou nunca
             existiu) — a policy de RLS agora exige o papel "authenticated"
             pra gravar. Derruba a sessão local pra o painel voltar pra tela
             de login em vez de ficar tentando salvar em loop. O rascunho não
             se perde: já está em localStorage (setLocalDoc, acima) e em
             this.state.doc no painel. */
          var expired = e.status === 401 || e.status === 403;
          if (expired) setSession(null);
          return { source: 'local', error: e.message, authExpired: expired };
        });
    };
    var result = _saveChain.then(run);
    _saveChain = result.catch(function () {});
    return result;
  }

  var LS_EV = 'vn.ev';

  function localEvents() { try { return JSON.parse(localStorage.getItem(LS_EV)) || []; } catch (e) { return []; } }

  function pushLocal(row) {
    try {
      var list = localEvents();
      list.push(row);
      if (list.length > 3000) list = list.slice(-3000);
      localStorage.setItem(LS_EV, JSON.stringify(list));
    } catch (e) {}
  }

  /* type: 'click' (abriu o produto) | 'sale' (linha do pedido) | 'order' (pedido enviado) */
  function track(type, payload) {
    var row = Object.assign({ type: type, ts: new Date().toISOString() }, payload || {});
    pushLocal(row);
    if (!connected()) return Promise.resolve();
    return api('vn_events', { method: 'POST', body: row }).catch(function () {});
  }

  /* Busca todas as páginas de um filtro em vez de cortar num limite fixo —
     antes, um "limit=5000" fazia pedidos/eventos mais antigos simplesmente
     sumirem dos relatórios (sem aviso nenhum) assim que a loja passasse
     dessa marca. Agora pagina de 1000 em 1000 até a página vir incompleta. */
  function fetchAllEvents(filter) {
    var PAGE = 1000;
    function loop(offset, acc) {
      return api('vn_events?select=id,ts,type,product,qty,total,detail&' + filter + '&order=ts.desc&limit=' + PAGE + '&offset=' + offset)
        .then(function (rows) {
          rows = rows || [];
          acc = acc.concat(rows);
          if (rows.length < PAGE) return acc;
          return loop(offset + PAGE, acc);
        });
    }
    return loop(0, []);
  }

  function events() {
    if (!connected()) return Promise.resolve(localEvents());
    /* Pedidos nunca podem sumir: buscados à parte, sem disputar espaço com o
       volume bem maior de cliques/vendas que alimenta só os gráficos. */
    var orders = fetchAllEvents('type=eq.order');
    var rest = fetchAllEvents('type=neq.order');
    return Promise.all([orders, rest])
      .then(function (r) { return (r[0] || []).concat(r[1] || []); })
      .catch(function () { return localEvents(); });
  }

  function fmt(v) { return 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ','); }

  var BUCKET = 'vn-photos';

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* Reduz a foto antes de enviar: a vitrine mostra no máximo ~280px de largura, então
     guardar o arquivo original de 4000px só deixa o cardápio lento e enche o storage.
     900px de lado maior em JPEG ~82% dá uma imagem nítida com poucas dezenas de KB. */
  function compressImage(file, maxSide, quality) {
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type) || /svg/.test(file.type)) return resolve(file);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (blob) {
          resolve(blob && blob.size < file.size ? blob : file);
        }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /* Envia o arquivo para o Supabase Storage e devolve a URL pública.
     Sem Supabase conectado, cai para uma imagem embutida (base64) — ok para testar,
     mas não escala para muitos produtos com foto. */
  function uploadPhoto(rawFile) {
    return compressImage(rawFile, 900, 0.82).then(function (file) {
    var c = cfg();
    if (!connected()) return fileToDataUrl(file);
    /* Upload no Storage agora exige o papel "authenticated" (ver policy
       vn_photos_write no SQL) — sem sessão, nem tenta a chamada de rede,
       só avisa que precisa logar. */
    return authToken().then(function (tok) {
      if (!tok) throw new Error('Faça login no painel para enviar fotos.');
      var base = String(c.url || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
      var path = 'p' + Date.now() + Math.random().toString(36).slice(2, 8) + '.jpg';
      return fetch(base + '/storage/v1/object/' + BUCKET + '/' + path, {
        method: 'POST',
        headers: {
          apikey: c.key, Authorization: 'Bearer ' + tok,
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 200)); });
        return base + '/storage/v1/object/public/' + BUCKET + '/' + path;
      });
    });
    });
  }

  window.VN = {
    cfg: cfg, setCfg: setCfg, connected: connected, load: load, save: save, checkUpdated: checkUpdated,
    seed: seed, uid: uid, fmt: fmt, normalize: normalize, track: track, events: events,
    uploadPhoto: uploadPhoto, couponUsed: couponUsed, countReferrals: countReferrals,
    signIn: signIn, signOut: signOut, authed: authed, getSession: getSession,
    sql: [
      '-- Cardápio: leitura pública (só a linha \'main\'), escrita só autenticada.',
      '-- Depois de rodar isto, crie o usuário do dono em Authentication > Users',
      '-- > Add user (marque "Auto Confirm User") — é o login do painel.',
      'create table vn_catalog (',
      '  id text primary key,',
      '  data jsonb not null,',
      '  updated_at timestamptz default now()',
      ');',
      'alter table vn_catalog enable row level security;',
      "create policy vn_catalog_public_read on vn_catalog for select to anon, authenticated using (id = 'main');",
      'create policy vn_catalog_owner_write on vn_catalog for insert to authenticated with check (true);',
      'create policy vn_catalog_owner_update on vn_catalog for update to authenticated using (true) with check (true);',
      'create policy vn_catalog_owner_delete on vn_catalog for delete to authenticated using (true);',
      '',
      '-- Eventos (cliques/vendas/pedidos): gravar é público (é o próprio',
      '-- rastreamento de visitantes sem login), ler exige o dono logado —',
      '-- senão nome/telefone/endereço de cliente ficam expostos pra qualquer um.',
      'create table vn_events (',
      '  id bigserial primary key,',
      '  ts timestamptz default now(),',
      '  type text,',
      '  product text,',
      '  qty int,',
      '  total numeric,',
      '  detail jsonb',
      ');',
      'alter table vn_events enable row level security;',
      '-- "order" tem uma trava a mais que click/sale: indicadoPor nunca pode',
      '-- ser o mesmo telefone de quem comprou (autoindicação) — fecha no',
      '-- banco a mesma checagem que o cardápio já faz no navegador, que',
      '-- sozinha dá pra burlar chamando a API direto. Não exige telefone',
      '-- preenchido aqui porque retirada na loja não pede telefone. Compara',
      '-- só os últimos 11 dígitos (right(...,11)) igual o navegador faz com',
      "-- .slice(-11) — sem isso, \"5511999999999\" (com 55) e \"11999999999\"",
      '-- (sem 55) contam como telefones diferentes e a trava não pega a',
      '-- autoindicação de quem chama a API direto com DDI inconsistente.',
      'drop policy if exists vn_events_public_insert on vn_events;',
      'create policy vn_events_public_insert on vn_events for insert to anon, authenticated with check (',
      "  type in ('click', 'sale')",
      '  or (',
      "    type = 'order'",
      "    and (",
      "      coalesce(detail->>'indicadoPor', '') = ''",
      "      or right(regexp_replace(detail->>'indicadoPor', '\\D', '', 'g'), 11) <> right(regexp_replace(coalesce(detail->>'telefone', ''), '\\D', '', 'g'), 11)",
      '    )',
      '  )',
      ');',
      'create policy vn_events_owner_read on vn_events for select to authenticated using (true);',
      '',
      '-- Bucket para fotos de produto, logo e capa da loja (rode uma vez).',
      '-- Leitura pública (a vitrine mostra as fotos pra qualquer cliente);',
      '-- upload/troca/remoção exigem login; só imagem, até 5MB.',
      'insert into storage.buckets (id, name, public)',
      "values ('vn-photos', 'vn-photos', true)",
      'on conflict (id) do nothing;',
      'update storage.buckets set file_size_limit = 5242880,',
      "  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']",
      "where id = 'vn-photos';",
      "create policy vn_photos_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'vn-photos');",
      "create policy vn_photos_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'vn-photos');",
      "create policy vn_photos_owner_update on storage.objects for update to authenticated using (bucket_id = 'vn-photos') with check (bucket_id = 'vn-photos');",
      "create policy vn_photos_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'vn-photos');",
      '',
      '-- Cupom de desconto: limita a 1 uso por número de WhatsApp. A checagem',
      '-- roda no servidor (não dá pra confiar no navegador do cliente) e só',
      '-- devolve verdadeiro/falso — nunca expõe pedido, nome ou endereço de',
      '-- ninguém pra quem chama a função. Compara só os últimos 11 dígitos',
      '-- (right(...,11)) igual o navegador (.slice(-11)) — sem isso, o mesmo',
      '-- telefone com/sem DDI (55) contava como duas pessoas diferentes e',
      '-- deixava usar o mesmo cupom 2x chamando a função com formatos',
      '-- diferentes do mesmo número.',
      'create or replace function public.check_coupon_used(p_phone text, p_code text)',
      'returns boolean',
      'language sql',
      'security definer',
      'set search_path = public',
      'as $$',
      '  select exists (',
      '    select 1 from vn_events',
      "    where type = 'order'",
      "      and right(regexp_replace(coalesce(detail->>'telefone', ''), '\\D', '', 'g'), 11) = right(regexp_replace(coalesce(p_phone, ''), '\\D', '', 'g'), 11)",
      "      and upper(coalesce(detail->>'cupom', '')) = upper(coalesce(p_code, ''))",
      "      and coalesce(detail->>'telefone', '') <> ''",
      "      and coalesce(p_code, '') <> ''",
      '  );',
      '$$;',
      'grant execute on function public.check_coupon_used(text, text) to anon, authenticated;',
      '',
      '-- Indicação de amigos: conta quantos amigos DIFERENTES esse WhatsApp já',
      '-- indicou (pra mostrar "1/5/10/25 indicações" em tempo real pro próprio',
      '-- cliente). Mesma lógica do cupom acima — roda no servidor e só devolve',
      '-- um número, nunca pedido/nome/endereço de quem foi indicado.',
      '-- Compara só os últimos 11 dígitos (right(...,11)) igual o navegador',
      '-- (.slice(-11)) — sem isso, indicadoPor com/sem DDI escapava da',
      "-- exclusão de autoindicação. Também exige o telefone do amigo ter",
      '-- pelo menos 10 dígitos depois de limpo — sem essa trava, um POST',
      '-- direto na API com telefone "1", "2", "3"... (nunca visível na tela',
      '-- do dono, que já filtra números curtos assim da lista) inflava esse',
      '-- contador público de graça, um "amigo" fake por chamada. Também',
      '-- exige o pedido bater o mínimo configurado em Vitrine (padrão R$20)',
      '-- — evita "ativar" o link com um pedido de R$1 só pra contar.',
      'create or replace function public.count_referrals(p_phone text)',
      'returns integer',
      'language sql',
      'security definer',
      'set search_path = public',
      'as $$',
      '  select count(distinct right(regexp_replace(coalesce(ve.detail->>\'telefone\', \'\'), \'\\D\', \'\', \'g\'), 11))::int',
      '  from vn_events ve',
      '  left join lateral (',
      '    select data->\'orderStatus\' as os,',
      '      coalesce(nullif(data->\'settings\'->>\'referralMinOrder\', \'\')::numeric, 20) as min_order',
      '    from vn_catalog where id = \'main\'',
      '  ) c on true',
      '  where ve.type = \'order\'',
      '    and right(regexp_replace(coalesce(ve.detail->>\'indicadoPor\', \'\'), \'\\D\', \'\', \'g\'), 11) = right(regexp_replace(coalesce(p_phone, \'\'), \'\\D\', \'\', \'g\'), 11)',
      '    and coalesce(ve.detail->>\'indicadoPor\', \'\') <> \'\'',
      '    and coalesce(p_phone, \'\') <> \'\'',
      '    and length(regexp_replace(coalesce(ve.detail->>\'telefone\', \'\'), \'\\D\', \'\', \'g\')) >= 10',
      '    and coalesce(c.os->>coalesce(ve.id::text, \'\'), \'\') <> \'cancelado\'',
      '    and coalesce(ve.total, 0) >= c.min_order',
      '    and right(regexp_replace(coalesce(ve.detail->>\'telefone\', \'\'), \'\\D\', \'\', \'g\'), 11) <> right(regexp_replace(coalesce(p_phone, \'\'), \'\\D\', \'\', \'g\'), 11);',
      '$$;',
      'grant execute on function public.count_referrals(text) to anon, authenticated;'
    ].join('\n')
  };
})();
