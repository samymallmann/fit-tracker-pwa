'use strict';

/* ============================================================
   Nuvem (Firebase): login com Google, sincronização e painel de admin.
   O app continua "local primeiro": tudo é salvo no aparelho na hora e
   enviado pra nuvem alguns segundos depois. Sem FIREBASE_CONFIG, nada
   daqui roda e o app funciona só no aparelho.

   Firestore:
     users/{uid}               nome, email, foto, ultimoAcesso, atualizadoEm, resumo, estadoJson
     users/{uid}/meses/{AAAA-MM}  json (refeições do mês; separado por causa do limite de 1 MB por documento)
   A chave do Gemini NÃO vai pra nuvem: fica só no aparelho de cada pessoa.
   ============================================================ */

const FB_VERSAO = '10.12.2';
const NUVEM = { pronto: false, user: null, admin: false, enviando: false, ultimoEnvio: null, erro: null, usuarios: null, vendo: null };
let fb = null;

const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) | 0; return `${h}:${s.length}`; };
const META_KEY = 'fitlog:nuvem';
const nuvemMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } };
const salvarMeta = m => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { } };

async function nuvemIniciar() {
  if (!window.FIREBASE_CONFIG) return;
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSAO}/`;
    const [appM, authM, fsM] = await Promise.all([
      import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    const app = appM.initializeApp(window.FIREBASE_CONFIG);
    fb = { ...authM, ...fsM, auth: authM.getAuth(app), db: fsM.getFirestore(app) };
    NUVEM.pronto = true;
    fb.getRedirectResult(fb.auth).catch(() => { });
    fb.onAuthStateChanged(fb.auth, async user => {
      NUVEM.user = user;
      NUVEM.admin = !!user && (window.ADMINS || []).includes(user.email);
      atualizaContaUI();
      if (user) await nuvemAoEntrar();
      render();
    });
  } catch (e) {
    NUVEM.erro = 'Sem conexão com a nuvem agora (o app continua funcionando no aparelho).';
    console.warn(e);
    atualizaContaUI();
  }
}

async function nuvemEntrar() {
  if (!NUVEM.pronto) { toast('Conectando à nuvem… tente de novo em instantes.'); return; }
  const prov = new fb.GoogleAuthProvider();
  try { await fb.signInWithPopup(fb.auth, prov); closeModal(); }
  catch (e) {
    if (/popup-blocked|operation-not-supported/.test(e.code || '')) await fb.signInWithRedirect(fb.auth, prov);
    else if (!/popup-closed|cancelled-popup/.test(e.code || '')) toast('Não deu pra entrar: ' + (e.code || e.message));
  }
}

/* ---- o que vai pra nuvem ---- */

function nuvemPartes() {
  const { refeicoes, settings, demo, ...resto } = S;
  const estado = { ...resto, settings: { metas: settings.metas } };
  const meses = {};
  for (const r of refeicoes) (meses[r.data.slice(0, 7)] ||= []).push(r);
  return { estado, meses }; // settings.apiKey/model ficam só no aparelho
}

function hashesDe(p) {
  const meses = {};
  for (const [m, lista] of Object.entries(p.meses)) meses[m] = hashStr(JSON.stringify(lista));
  return { estado: hashStr(JSON.stringify(p.estado)), meses };
}

function localSujo(h) {
  if (!h) return true;
  const a = hashesDe(nuvemPartes());
  return a.estado !== h.estado || JSON.stringify(a.meses) !== JSON.stringify(h.meses || {});
}

function resumoMeta() {
  const pc = perfilCalc(), hoje = hojeISO();
  return {
    peso: pc.peso || null, tmb: pc.tmb ? baixo(pc.tmb) : null, imc: pc.imc ? Math.floor(pc.imc * 10) / 10 : null,
    treinos30: S.logs.filter(l => l.data > addDias(hoje, -30)).length,
    ultimoTreino: S.logs.at(-1)?.data || null,
    refeicoes7: S.refeicoes.filter(r => r.data > addDias(hoje, -7)).length,
  };
}

function nuvemAgendar() {
  if (!NUVEM.user || S.demo) return;
  clearTimeout(NUVEM.timer);
  NUVEM.timer = setTimeout(() => nuvemEnviar(), 2500);
}

async function nuvemEnviar(forcar = false) {
  if (!NUVEM.user || S.demo) return;
  if (NUVEM.enviando) { NUVEM.denovo = true; return; }
  NUVEM.enviando = true; atualizaContaUI();
  try {
    const u = NUVEM.user, uid = u.uid, meta = nuvemMeta();
    const antes = meta.uid === uid && !forcar ? meta.hashes || {} : {};
    const p = nuvemPartes(), novo = hashesDe(p);
    const batch = fb.writeBatch(fb.db);
    let mudou = novo.estado !== antes.estado;
    for (const [mes, lista] of Object.entries(p.meses)) {
      if (novo.meses[mes] !== antes.meses?.[mes]) { batch.set(fb.doc(fb.db, 'users', uid, 'meses', mes), { json: JSON.stringify(lista) }); mudou = true; }
    }
    for (const mes of Object.keys(antes.meses || {})) {
      if (!p.meses[mes]) { batch.delete(fb.doc(fb.db, 'users', uid, 'meses', mes)); mudou = true; }
    }
    if (mudou) {
      const agora = Date.now();
      batch.set(fb.doc(fb.db, 'users', uid), {
        nome: u.displayName || '', email: u.email || '', foto: u.photoURL || '',
        estadoJson: JSON.stringify(p.estado), atualizadoEm: agora, ultimoAcesso: agora, resumo: resumoMeta(),
      }, { merge: true });
      await batch.commit();
      salvarMeta({ uid, remotoEm: agora, hashes: novo });
    }
    NUVEM.ultimoEnvio = Date.now(); NUVEM.erro = null;
  } catch (e) {
    NUVEM.erro = 'Falha ao salvar na nuvem (' + (e.code || e.message) + '). Tento de novo na próxima mudança.';
  }
  NUVEM.enviando = false; atualizaContaUI();
  if (NUVEM.denovo) { NUVEM.denovo = false; nuvemAgendar(); }
}

// ao entrar (e ao voltar pro app): decide se baixa da nuvem ou envia daqui
async function nuvemAoEntrar() {
  const u = NUVEM.user;
  if (!u) return;
  try {
    const ref = fb.doc(fb.db, 'users', u.uid);
    const snap = await fb.getDoc(ref);
    fb.setDoc(ref, { nome: u.displayName || '', email: u.email || '', foto: u.photoURL || '', ultimoAcesso: Date.now() }, { merge: true }).catch(() => { });
    const rem = snap.exists() ? snap.data() : null;
    if (!rem?.estadoJson) { if (!S.demo) await nuvemEnviar(true); return; }
    const meta = nuvemMeta();
    const mesmo = meta.uid === u.uid;
    const remotoMudou = !mesmo || num(rem.atualizadoEm) > num(meta.remotoEm);
    const temReal = !S.demo && (S.logs.length + S.refeicoes.length + S.pesos.length) > 0;
    const localMudou = mesmo ? !S.demo && localSujo(meta.hashes) : temReal;
    if (!remotoMudou) { if (localMudou) await nuvemEnviar(); return; }
    if (localMudou && !confirm('Os dados da nuvem e os deste aparelho estão diferentes.\n\nOK = usar os da NUVEM (os deste aparelho serão substituídos)\nCancelar = enviar os DESTE aparelho pra nuvem')) {
      await nuvemEnviar(true); return;
    }
    await nuvemBaixar(u.uid, rem);
  } catch (e) {
    NUVEM.erro = 'Não consegui ler a nuvem (' + (e.code || e.message) + ').';
    atualizaContaUI();
  }
}

async function lerMeses(uid) {
  const snap = await fb.getDocs(fb.collection(fb.db, 'users', uid, 'meses'));
  const refeicoes = [];
  snap.forEach(d => refeicoes.push(...JSON.parse(d.data().json || '[]')));
  return refeicoes;
}

function estadoDe(estado, refeicoes, extra = {}) {
  const base = seed();
  return {
    ...base, ...estado, refeicoes, demo: false,
    settings: { ...base.settings, ...extra, metas: { ...base.settings.metas, ...estado.settings?.metas } },
    perfil: { ...base.perfil, ...estado.perfil },
  };
}

async function nuvemBaixar(uid, rem) {
  const refeicoes = await lerMeses(uid);
  // a chave do Gemini e o modelo continuam os deste aparelho
  S = estadoDe(JSON.parse(rem.estadoJson), refeicoes, { apiKey: S.settings.apiKey, model: S.settings.model });
  try { localStorage.removeItem('fitlog:antesDemo'); } catch (e) { }
  salvarMeta({ uid, remotoEm: num(rem.atualizadoEm), hashes: hashesDe(nuvemPartes()) });
  UI.pending = null; UI.chatModelo = null; UI.diaryDate = hojeISO();
  save(); // se o histórico de hoje mudar, isso volta pra nuvem sozinho
  toast('Dados da nuvem carregados ☁️');
  render();
}

/* ---- cartão "Conta" na aba Perfil ---- */

function contaHTML() {
  if (!window.FIREBASE_CONFIG) return '<p class="muted small">Nuvem não configurada: seus dados ficam só neste aparelho.</p>';
  if (!NUVEM.pronto) return `<p class="muted small">${esc(NUVEM.erro || 'Conectando à nuvem…')}</p>`;
  if (!NUVEM.user) return `<p class="small">Entre com sua conta Google pra salvar na nuvem e usar em qualquer celular.</p>
    <button class="btn primary" data-act="nuvemEntrar">Entrar com Google</button>`;
  const u = NUVEM.user;
  const status = S.demo ? '🧪 Dados simulados não vão pra nuvem. Saia da simulação pra começar a salvar.'
    : NUVEM.enviando ? '☁️ Salvando…'
    : NUVEM.erro ? '⚠️ ' + esc(NUVEM.erro)
    : NUVEM.ultimoEnvio ? `☁️ Salvo na nuvem às ${new Date(NUVEM.ultimoEnvio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : '☁️ Conectado';
  return `<div class="row" style="flex-wrap:nowrap">
      ${u.photoURL ? `<img class="thumb" src="${esc(u.photoURL)}" referrerpolicy="no-referrer" alt="">` : '<div class="thumb">👤</div>'}
      <div class="grow"><b>${esc(u.displayName || 'Sem nome')}</b><div class="muted small">${esc(u.email || '')}</div></div>
      <button class="btn sm ghost" data-act="nuvemSair">Sair</button></div>
    <div class="muted small" style="margin-top:8px">${status}</div>
    ${NUVEM.admin ? `<button class="btn sm" data-act="${UI.adminAberto ? 'adminFechar' : 'adminAbrir'}" style="margin-top:10px">🛡️ ${UI.adminAberto ? 'Fechar painel do admin' : 'Painel do admin'}</button>` : ''}`;
}

function atualizaContaUI() {
  const el = document.getElementById('contaCard');
  if (el) el.innerHTML = contaHTML();
}

/* ---- painel do admin ---- */

const quando = ms => {
  if (!ms) return '—';
  const min = (Date.now() - ms) / 6e4;
  return min < 60 ? `há ${Math.max(1, Math.floor(min))} min` : min < 1440 ? `há ${Math.floor(min / 60)} h` : `há ${Math.floor(min / 1440)} dia(s)`;
};

function adminHTML() {
  if (!NUVEM.usuarios) return '<h3>🛡️ Usuários</h3><div class="spinner"></div>';
  return `<div class="row between"><h3 style="margin:0">🛡️ Usuários (${NUVEM.usuarios.length})</h3>
      <button class="btn sm ghost" data-act="adminAbrir">↻ Atualizar</button></div>
    <ul class="list">${NUVEM.usuarios.map(u => {
      const r = u.resumo || {};
      return `<li class="pick" data-act="adminVer" data-uid="${esc(u.uid)}">
        ${u.foto ? `<img class="thumb" src="${esc(u.foto)}" referrerpolicy="no-referrer" alt="">` : '<div class="thumb">👤</div>'}
        <div class="grow"><b>${esc(u.nome || u.email || u.uid)}</b>
          <div class="muted small">${esc(u.email || '')} · visto ${quando(u.ultimoAcesso)}</div>
          <div class="muted small">${r.peso ? `${kg1(r.peso)} kg · ` : ''}${r.treinos30 ?? 0} treinos/30d · ${r.refeicoes7 ?? 0} refeições/7d</div></div>
        <span class="muted">›</span></li>`;
    }).join('')}</ul>`;
}

async function adminCarregar() {
  NUVEM.usuarios = null;
  if (UI.tab === 'perfil') renderPerfil();
  try {
    const snap = await fb.getDocs(fb.collection(fb.db, 'users'));
    NUVEM.usuarios = snap.docs.map(d => ({ uid: d.id, ...d.data() })).sort((a, b) => num(b.ultimoAcesso) - num(a.ultimoAcesso));
  } catch (e) {
    NUVEM.usuarios = [];
    toast('Não consegui listar os usuários: ' + (e.code || e.message));
  }
  if (UI.tab === 'perfil') renderPerfil();
}

// roda uma função "como se" o app estivesse com os dados de outra pessoa
function comoUsuario(estadoAlheio, fn) {
  const real = S;
  S = estadoAlheio;
  try { return fn(); } finally { S = real; }
}

async function adminVer(uid) {
  const u = NUVEM.usuarios?.find(x => x.uid === uid);
  if (!u) return;
  openModal('<div class="spinner"></div>');
  try {
    const estado = u.estadoJson ? JSON.parse(u.estadoJson) : {};
    const alheio = estadoDe(estado, await lerMeses(uid));
    NUVEM.vendo = { uid, nome: u.nome || u.email, estado: alheio };
    const html = comoUsuario(alheio, () => {
      const pc = perfilCalc(), hoje = hojeISO();
      const semana = [];
      for (let i = 0; i <= 6; i++) semana.push(diaResumo(addDias(hoje, -i)));
      const logs30 = S.logs.filter(l => l.data > addDias(hoje, -30));
      const sp = activeSplit();
      return `<div class="row" style="margin-bottom:10px">${u.foto ? `<img class="thumb" src="${esc(u.foto)}" referrerpolicy="no-referrer" alt="">` : ''}
          <div class="grow"><h3 style="margin:0">${esc(u.nome || 'Sem nome')}</h3><div class="muted small">${esc(u.email || '')} · visto ${quando(u.ultimoAcesso)}</div></div></div>
        <div class="stats" style="grid-template-columns:repeat(3,1fr)">
          <div class="stat"><b>${pc.peso ? kg1(pc.peso) : '—'}</b><span>peso (kg)</span></div>
          <div class="stat"><b>${pc.tmb ? fmt(baixo(pc.tmb)) : '—'}</b><span>TMB</span></div>
          <div class="stat"><b>${logs30.length}</b><span>treinos/30d</span></div>
        </div>
        <div class="muted small">Modelo vigente: ${esc(sp?.nome || '—')}${pc.imc ? ` · IMC ${kg1(pc.imc)}` : ''}${S.perfil.objetivo ? ` · objetivo: ${esc(S.perfil.objetivo)}` : ''}</div>
        ${S.pesos.length > 1 ? graficoPeso([...S.pesos].sort((a, b) => a.data.localeCompare(b.data))) : ''}
        <h3 style="margin:12px 0 4px;font-size:.95rem">Última semana</h3>
        <ul class="list">${semana.map(d => `<li><div class="grow">${d.data === hoje ? 'Hoje' : parseISO(d.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
            <div class="muted small">${d.temComida ? `comeu ${fmt(d.cons)}` : 'sem refeições'}${d.gasto != null ? ` · gastou ${fmt(d.gasto)}` : ''}${d.treinos.length ? ' · ' + esc(d.treinos.map(t => t.l.nome).join(', ')) : ''}</div></div>
            ${d.temComida && d.saldo != null ? `<b class="${d.saldo <= 0 ? 'txt-ok' : 'txt-warn'}">${saldoCurto(d.saldo)}</b>` : ''}</li>`).join('')}</ul>`;
    });
    openModal(html + `<div class="row end" style="margin-top:12px">
      <button class="btn sm" data-act="adminRel">📄 Relatório (90 dias)</button>
      <button class="btn sm ghost" data-act="modalClose">Fechar</button></div>`);
  } catch (e) {
    openModal(`<div class="alert">⚠️ ${esc(e.message)}</div><div class="row end"><button class="btn ghost" data-act="modalClose">Fechar</button></div>`);
  }
}

/* ---- ações e inicialização ---- */

Object.assign(ACTIONS, {
  nuvemEntrar,
  nuvemSair: async () => {
    if (!confirm('Sair da conta? Os dados continuam neste aparelho, mas param de ir pra nuvem.')) return;
    UI.adminAberto = false; NUVEM.usuarios = null;
    await fb.signOut(fb.auth);
    toast('Você saiu da conta');
  },
  adminAbrir: () => { UI.adminAberto = true; adminCarregar(); },
  adminFechar: () => { UI.adminAberto = false; renderPerfil(); },
  adminVer: el => adminVer(el.dataset.uid),
  adminRel: () => {
    const v = NUVEM.vendo; if (!v) return;
    const html = comoUsuario(v.estado, () => relatorioHTML(90));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `fittracker-${(v.nome || 'usuario').replace(/[^\w-]+/g, '_')}-${hojeISO()}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
});

// voltou pro app: confere se outro aparelho mudou alguma coisa
document.addEventListener('visibilitychange', () => { if (!document.hidden && NUVEM.user) nuvemAoEntrar(); });

nuvemIniciar();
