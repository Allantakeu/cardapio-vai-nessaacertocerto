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
        whatsapp: '5511999347715', deliveryFee: 8, freeAbove: 0, pin: '1234',
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
    return fetch(base + '/rest/v1/' + path, {
      method: o.method || 'GET',
      /* no-store: o cardápio precisa mostrar preço/estoque do momento. Sem isso o
         navegador (ou um proxy no meio) pode devolver uma cópia velha do cardápio. */
      cache: 'no-store',
      headers: {
        apikey: c.key, Authorization: 'Bearer ' + c.key,
        'Content-Type': 'application/json', Prefer: 'return=representation',
        'Cache-Control': 'no-cache'
      },
      body: o.body ? JSON.stringify(o.body) : undefined
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 140)); });
      return r.status === 204 ? null : r.json();
    });
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

  function save(doc) {
    var storedLocally = setLocalDoc(doc);
    if (!connected()) {
      return Promise.resolve(storedLocally
        ? { source: 'local' }
        : { source: 'local', error: 'Memória do navegador cheia — conecte o Supabase para não perder as alterações.' });
    }
    return api('vn_catalog?id=eq.main', { method: 'PATCH', body: { data: doc, updated_at: new Date().toISOString() } })
      .then(function (rows) {
        if (rows && rows.length) return { source: 'supabase' };
        return api('vn_catalog', { method: 'POST', body: { id: 'main', data: doc } }).then(function () { return { source: 'supabase' }; });
      })
      .catch(function (e) { return { source: 'local', error: e.message }; });
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

  function events() {
    if (!connected()) return Promise.resolve(localEvents());
    /* Pedidos nunca podem sumir: buscados à parte, sem disputar espaço com o
       volume bem maior de cliques/vendas que alimenta só os gráficos. */
    var orders = api('vn_events?select=id,ts,type,product,qty,total,detail&type=eq.order&order=ts.desc&limit=5000');
    var rest = api('vn_events?select=id,ts,type,product,qty,total,detail&type=neq.order&order=ts.desc&limit=5000');
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
    var base = String(c.url || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
    var path = 'p' + Date.now() + Math.random().toString(36).slice(2, 8) + '.jpg';
    return fetch(base + '/storage/v1/object/' + BUCKET + '/' + path, {
      method: 'POST',
      headers: {
        apikey: c.key, Authorization: 'Bearer ' + c.key,
        'Content-Type': file.type || 'application/octet-stream'
      },
      body: file
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 200)); });
      return base + '/storage/v1/object/public/' + BUCKET + '/' + path;
    });
    });
  }

  window.VN = {
    cfg: cfg, setCfg: setCfg, connected: connected, load: load, save: save,
    seed: seed, uid: uid, fmt: fmt, normalize: normalize, track: track, events: events,
    uploadPhoto: uploadPhoto,
    sql: [
      'create table vn_catalog (',
      '  id text primary key,',
      '  data jsonb not null,',
      '  updated_at timestamptz default now()',
      ');',
      'alter table vn_catalog enable row level security;',
      'create policy vn_read on vn_catalog for select using (true);',
      'create policy vn_write on vn_catalog for all using (true) with check (true);',
      '',
      'create table vn_events (',
      '  id bigserial primary key,',
      '  ts timestamptz default now(),',
      '  type text,',
      '  product text,',
      '  qty int,',
      '  total numeric',
      ');',
      'alter table vn_events enable row level security;',
      'create policy ev_read on vn_events for select using (true);',
      'create policy ev_write on vn_events for insert with check (true);',
      '',
      'alter table vn_events add column if not exists detail jsonb;',
      '',
      '-- bucket para fotos de produto e logo (rode uma vez)',
      'insert into storage.buckets (id, name, public)',
      "values ('vn-photos', 'vn-photos', true)",
      'on conflict (id) do nothing;',
      '',
      'create policy vn_photos_read on storage.objects for select',
      "using (bucket_id = 'vn-photos');",
      'create policy vn_photos_write on storage.objects for insert',
      "with check (bucket_id = 'vn-photos');"
    ].join('\n')
  };
})();
