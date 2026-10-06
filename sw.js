// Service worker: deixa o app abrir offline e analisa fotos em segundo plano.
// Estratégia "rede primeiro": com internet sempre pega a versão mais nova
// (atualizações aparecem na hora); sem internet, usa a cópia guardada.
// A CADA publicação, aumente a versão abaixo: é isso que mostra o aviso "Nova versão" no app.
const CACHE = 'fittracker-v6';
const ANALISES = 'analises-de-foto'; // resultados das análises feitas por aqui (não é apagado nas atualizações)
const ARQUIVOS = ['./', 'index.html', 'style.css', 'firebase-config.js', 'demo.js', 'app.js', 'nuvem.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== ANALISES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Gemini, Firebase e outros domínios passam direto
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // internet lenta: depois de 4 s desiste e usa a cópia guardada
      const r = await Promise.race([
        fetch(e.request, { cache: 'no-cache' }),
        new Promise((_, falha) => setTimeout(() => falha(new Error('lento')), 4000)),
      ]);
      if (r.ok) cache.put(e.request, r.clone());
      return r;
    } catch (err) {
      return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match('./')) || Response.error();
    }
  })());
});

/* ============================================================
   Análise de foto em segundo plano
   O app manda a foto pra cá e pode ser fechado: o service worker
   continua vivo enquanto a análise roda (alguns minutos, no máximo),
   guarda o resultado e avisa com uma notificação.
   A lógica de tentativas é a mesma do gemini() em app.js.
   ============================================================ */

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const espera = ms => new Promise(r => setTimeout(r, ms));
const sobrecarga = (status, msg) => status === 503 || status === 500 || /high demand|overloaded|unavailable|try again later/i.test(msg);
const aposentado = (status, msg) => status === 404 || /no longer available|not found|not supported|deprecated|retired/i.test(msg);
const versao = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);

// raciocínio "baixo" (não desligado): evita o modelo pensar demais e demorar,
// sem abrir mão de raciocinar sobre porções e ingredientes
function configGeracao(nome, pensarPouco) {
  const g = { responseMimeType: 'application/json', temperature: 0.2 };
  if (pensarPouco) {
    if (versao(nome) >= 3) g.thinkingConfig = { thinkingLevel: 'low' };
    else if (versao(nome) >= 2.5 && /flash/.test(nome)) g.thinkingConfig = { thinkingBudget: 1024 };
  }
  return g;
}

async function chamar(nome, contents, chave, tentativas) {
  let pensarPouco = true;
  for (let t = 0; ; t++) {
    const r = await fetch(`${API}/${encodeURIComponent(nome)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({ contents, generationConfig: configGeracao(nome, pensarPouco) }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { j };
    const msg = j.error?.message || `HTTP ${r.status}`;
    if (r.status === 400 && /thinking/i.test(msg) && pensarPouco) { pensarPouco = false; t--; continue; } // modelo não aceita: manda sem
    if (sobrecarga(r.status, msg) && t < tentativas - 1) { await espera([1500, 4000, 8000][t] || 8000); continue; }
    return { erro: { status: r.status, msg } };
  }
}

async function modelosDisponiveis(chave) {
  const r = await fetch(`${API}?pageSize=200`, { headers: { 'x-goog-api-key': chave } });
  const j = await r.json();
  return (j.models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/tts|image|embedding|live|audio/.test(m.name))
    .map(m => m.name.replace(/^models\//, ''));
}

// outros "flash" pra tentar: estáveis mais novos, depois prévias, depois os "lite" (mais leves, quase sempre livres)
function alternativas(nomes, atual) {
  const fl = nomes.filter(n => n !== atual && /flash/.test(n));
  const ord = (a, b) => versao(b) - versao(a);
  return [
    ...fl.filter(n => !/lite|preview|exp/.test(n)).sort(ord),
    ...fl.filter(n => /preview|exp/.test(n) && !/lite/.test(n)).sort(ord),
    ...fl.filter(n => /lite/.test(n)).sort(ord),
  ].slice(0, 3);
}

function mensagemErro({ status, msg }) {
  if (status === 429) return 'Limite gratuito do Gemini atingido por agora. Espere um pouco e tente de novo.';
  if (/API key/i.test(msg)) return 'Chave do Gemini inválida. Confira em Perfil → Configurações.';
  if (sobrecarga(status, msg)) return 'O Gemini está sobrecarregado agora (muita gente usando ao mesmo tempo). Tentei vários modelos; tente daqui a alguns minutos.';
  return msg;
}

async function geminiFundo(contents, modelo, chave) {
  let { j, erro } = await chamar(modelo, contents, chave, 3);
  let usado = modelo;
  const eraAposentado = erro && aposentado(erro.status, erro.msg);
  if (erro && (sobrecarga(erro.status, erro.msg) || eraAposentado)) {
    const sugerido = (erro.msg.match(/use (?:models\/)?(gemini-[\w.-]+?)(?=[\s,.]*(?:for|$|\s))/i) || [])[1];
    let lista = sugerido ? [sugerido] : [];
    try { lista = [...lista, ...alternativas(await modelosDisponiveis(chave), modelo)]; } catch (e) { /* sem lista */ }
    for (const alt of [...new Set(lista)]) {
      ({ j, erro } = await chamar(alt, contents, chave, 1));
      if (!erro) { usado = alt; break; }
    }
  }
  if (erro) throw new Error(mensagemErro(erro));
  const txt = (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  if (!txt) throw new Error('O Gemini não retornou resposta (talvez a imagem tenha sido bloqueada).');
  // trocarPadrao: o modelo salvo foi aposentado, então o app passa a usar o novo
  return { data: JSON.parse(txt), modelo: usado, trocarPadrao: eraAposentado && usado !== modelo };
}

function resumo(data) {
  if (data?.titulo) return `${data.titulo}${data.total?.kcal ? ` · ~${Math.round(data.total.kcal)} kcal` : ''}`;
  if (data?.produto) return `${data.produto}${data.nota_saude != null ? ` · nota ${Math.round(data.nota_saude)}/10` : ''}`;
  return 'Toque pra ver o resultado.';
}

async function analisarNoFundo({ id, contents, model, apiKey }) {
  let res;
  try { res = { ok: true, ...(await geminiFundo(contents, model, apiKey)) }; }
  catch (err) { res = { ok: false, erro: err.message }; }
  res = { ...res, id, em: Date.now() };
  await (await caches.open(ANALISES)).put(`./__analise/${id}`, new Response(JSON.stringify(res), { headers: { 'Content-Type': 'application/json' } }));
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of janelas) c.postMessage({ tipo: 'analise', ...res });
  if (!janelas.some(c => c.visibilityState === 'visible')) {
    try {
      await self.registration.showNotification(res.ok ? 'Análise pronta 🍽️' : 'Não deu pra analisar a foto', {
        body: res.ok ? resumo(res.data) : res.erro, icon: 'icon.svg', badge: 'icon.svg', tag: 'analise', data: { url: './?aba=comida' },
      });
    } catch (e) { /* sem permissão de notificação: o resultado aparece quando abrir o app */ }
  }
}

self.addEventListener('message', e => {
  if (e.data?.tipo !== 'analisar') return;
  e.source?.postMessage({ tipo: 'recebido', id: e.data.id }); // o app sabe que pode ser fechado
  e.waitUntil(analisarNoFundo(e.data));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const aberto = cs.find(c => 'focus' in c);
    return aberto ? aberto.focus() : self.clients.openWindow(e.notification.data?.url || './');
  }));
});
