'use strict';

/* ============================================================
   FitTracker: frequência na academia, modelos de treino e
   análise de comida/rótulos com a API do Gemini.
   Tudo fica salvo no próprio aparelho (localStorage).
   ============================================================ */

const $ = (s, el = document) => el.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const r0 = v => Math.round(num(v));
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const hojeISO = () => isoDate(new Date());
const addDias = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const CORES = ['#e5534b', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#94a3b8'];
const fmtData = iso => parseISO(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

/* ---------------- estado ---------------- */

const KEY = 'fitlog:v1';
const MODELO_PADRAO = 'gemini-3.8-flash'; // o app troca sozinho se o Google aposentar este

function ex(nome, series, reps, carga = '', obs = '') { return { id: uid(), nome, series, reps, carga, obs }; }

/* Biblioteca de modelos prontos. Escolher um cria uma cópia editável. */
const T = (nome, cor, exs) => ({ nome, cor, exs });
const MODELOS = [
  { nome: 'Costas/Bíceps · Peito/Tríceps · Ombro/Bíceps · Pernas', desc: '4 dias, combinando grupos', dias: [
    T('Costas + Bíceps', '#3b82f6', [['Puxada frontal', 4, '10'], ['Remada curvada', 4, '8-10'], ['Remada baixa', 3, '10'], ['Pulldown', 3, '12'], ['Rosca direta', 3, '10'], ['Rosca martelo', 3, '12']]),
    T('Peito + Tríceps', '#e5534b', [['Supino reto', 4, '8-10'], ['Supino inclinado c/ halteres', 3, '10'], ['Crucifixo', 3, '12'], ['Crossover', 3, '12'], ['Tríceps corda', 3, '12'], ['Tríceps francês', 3, '10']]),
    T('Ombro + Bíceps', '#a855f7', [['Desenvolvimento', 4, '10'], ['Elevação lateral', 4, '12'], ['Elevação frontal', 3, '12'], ['Crucifixo inverso', 3, '12'], ['Rosca alternada', 3, '10'], ['Rosca concentrada', 3, '12']]),
    T('Pernas', '#22c55e', [['Agachamento livre', 4, '8'], ['Leg press', 4, '10'], ['Cadeira extensora', 3, '12'], ['Mesa flexora', 3, '12'], ['Stiff', 3, '10'], ['Panturrilha em pé', 4, '15']]),
  ] },
  { nome: 'ABC clássico', desc: '3 dias: Costas/Bíceps, Peito/Tríceps, Pernas/Ombro', dias: [
    T('Costas + Bíceps', '#3b82f6', [['Puxada frontal', 4, '10'], ['Remada curvada', 4, '8-10'], ['Remada unilateral', 3, '10'], ['Rosca direta', 3, '10'], ['Rosca martelo', 3, '12']]),
    T('Peito + Tríceps', '#e5534b', [['Supino reto', 4, '8-10'], ['Supino inclinado', 3, '10'], ['Crucifixo', 3, '12'], ['Tríceps corda', 3, '12'], ['Tríceps francês', 3, '10']]),
    T('Pernas + Ombro', '#22c55e', [['Agachamento livre', 4, '8'], ['Leg press', 4, '10'], ['Mesa flexora', 3, '12'], ['Desenvolvimento', 4, '10'], ['Elevação lateral', 3, '12']]),
  ] },
  { nome: 'Grupos musculares (4 dias)', desc: 'Peito, Costas, Pernas, Braços', dias: [
    T('Peito', '#e5534b', [['Supino reto', 4, '8-10'], ['Supino inclinado c/ halteres', 3, '10'], ['Crucifixo', 3, '12'], ['Crossover', 3, '12']]),
    T('Costas', '#3b82f6', [['Puxada frontal', 4, '10'], ['Remada curvada', 4, '8-10'], ['Remada baixa', 3, '10'], ['Pulldown', 3, '12']]),
    T('Pernas', '#22c55e', [['Agachamento livre', 4, '8'], ['Leg press', 4, '10'], ['Cadeira extensora', 3, '12'], ['Mesa flexora', 3, '12'], ['Panturrilha em pé', 4, '15']]),
    T('Braços', '#f59e0b', [['Rosca direta', 3, '10'], ['Rosca martelo', 3, '12'], ['Tríceps corda', 3, '12'], ['Tríceps testa', 3, '10']]),
  ] },
  { nome: 'ABCDE (5 dias)', desc: 'Um grupo por dia', dias: [
    T('Peito', '#e5534b', [['Supino reto', 4, '8-10'], ['Supino inclinado', 4, '10'], ['Crucifixo', 3, '12'], ['Crossover', 3, '12']]),
    T('Costas', '#3b82f6', [['Puxada frontal', 4, '10'], ['Remada curvada', 4, '8-10'], ['Remada baixa', 3, '10'], ['Pulldown', 3, '12']]),
    T('Ombro', '#a855f7', [['Desenvolvimento', 4, '10'], ['Elevação lateral', 4, '12'], ['Elevação frontal', 3, '12'], ['Encolhimento', 4, '12']]),
    T('Pernas', '#22c55e', [['Agachamento livre', 4, '8'], ['Leg press', 4, '10'], ['Cadeira extensora', 3, '12'], ['Mesa flexora', 3, '12'], ['Panturrilha', 4, '15']]),
    T('Braços', '#f59e0b', [['Rosca direta', 4, '10'], ['Rosca martelo', 3, '12'], ['Tríceps corda', 4, '12'], ['Tríceps testa', 3, '10']]),
  ] },
  { nome: 'Push / Pull / Legs', desc: 'Empurrar, puxar e pernas', dias: [
    T('Push (peito, ombro, tríceps)', '#e5534b', [['Supino reto', 4, '8'], ['Desenvolvimento', 3, '10'], ['Supino inclinado', 3, '10'], ['Elevação lateral', 3, '12'], ['Tríceps corda', 3, '12']]),
    T('Pull (costas, bíceps)', '#3b82f6', [['Barra fixa', 4, 'máx'], ['Remada curvada', 4, '8'], ['Puxada frontal', 3, '10'], ['Face pull', 3, '15'], ['Rosca direta', 3, '10']]),
    T('Legs (pernas)', '#22c55e', [['Agachamento livre', 4, '8'], ['Stiff', 3, '10'], ['Leg press', 3, '12'], ['Mesa flexora', 3, '12'], ['Panturrilha', 4, '15']]),
  ] },
  { nome: 'Superiores / Inferiores', desc: '4 dias alternando parte de cima e de baixo', dias: [
    T('Superiores A', '#3b82f6', [['Supino reto', 4, '8'], ['Remada curvada', 4, '8'], ['Desenvolvimento', 3, '10'], ['Rosca direta', 3, '10'], ['Tríceps corda', 3, '12']]),
    T('Inferiores A', '#22c55e', [['Agachamento livre', 4, '8'], ['Mesa flexora', 3, '12'], ['Cadeira extensora', 3, '12'], ['Panturrilha', 4, '15']]),
    T('Superiores B', '#a855f7', [['Supino inclinado', 4, '10'], ['Puxada frontal', 4, '10'], ['Elevação lateral', 3, '12'], ['Rosca martelo', 3, '12'], ['Tríceps francês', 3, '10']]),
    T('Inferiores B', '#14b8a6', [['Levantamento terra', 4, '6'], ['Leg press', 4, '10'], ['Afundo', 3, '10'], ['Panturrilha sentado', 4, '15']]),
  ] },
  { nome: 'Corpo todo (A/B)', desc: '2-3x por semana, bom pra começar', dias: [
    T('Corpo todo A', '#22c55e', [['Agachamento livre', 3, '10'], ['Supino reto', 3, '10'], ['Remada curvada', 3, '10'], ['Desenvolvimento', 3, '10'], ['Prancha', 3, '30s']]),
    T('Corpo todo B', '#3b82f6', [['Levantamento terra', 3, '8'], ['Supino inclinado', 3, '10'], ['Puxada frontal', 3, '10'], ['Afundo', 3, '10'], ['Abdominal', 3, '15']]),
  ] },
];

function criarDeModelo(m, nome) {
  return {
    id: uid(), nome: nome || m.nome,
    dias: m.dias.map(d => ({ id: uid(), nome: d.nome, cor: d.cor, exercicios: d.exs.map(e => ex(...e)) })),
  };
}

function seed() {
  const atual = criarDeModelo(MODELOS[0], 'Meu treino atual');
  return {
    settings: { apiKey: '', model: MODELO_PADRAO, metas: { kcal: 2200, prot: 140, carb: 250, gord: 70 } },
    splits: [atual],   // modelos de treino do usuário
    activeSplitId: atual.id,
    perfil: { sexo: '', nascimento: '', altura: '', gordura: '', cintura: '', pescoco: '', quadril: '',
      atividade: '1.2', passos: '', objetivo: 'manter', ritmo: '0.5', fatorCal: null },
    pesos: [],      // { data, kg } — uma pesagem por dia
    historico: [],  // foto diária do perfil { data, peso, tmb, base, precBase, gordura, imc, magra, cal }
    rascunho: null, // treino em andamento (checklist), vira log ao concluir
    logs: [],       // { id, data, splitId, diaId, nome, cor, exercicios: [{ exId, nome, series, reps, carga, feito, nota }], minutos?, chat? }
    refeicoes: [],  // { id, data, hora, tipo, titulo, kcal, prot, carb, gord, thumb, detalhes }
  };
}

let PRIMEIRA_VEZ = false; // sem nada salvo: abre com dados simulados

function load() {
  const base = seed();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) {
      return {
        ...base, ...saved,
        settings: { ...base.settings, ...saved.settings, metas: { ...base.settings.metas, ...saved.settings?.metas } },
        perfil: { ...base.perfil, ...saved.perfil },
      };
    }
  } catch (e) { /* começa do zero */ }
  PRIMEIRA_VEZ = true;
  return base;
}

let S = load();

function save() {
  registrarHistorico();
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Sem espaço para salvar. Exporte um backup e apague refeições antigas.'); }
  if (typeof nuvemAgendar === 'function') nuvemAgendar(); // nuvem.js carrega depois deste arquivo
}

// estado só da interface
const UI = { tab: 'freq', viewSplitId: null, diaryDate: hojeISO(), pending: null, periodo: 7, esperaSessao: false, chatModelo: null,
  chatAtiv: { msgs: [], lote: null }, calMes: null, relDias: 90 };

/* ---------------- helpers de domínio ---------------- */

const getSplit = id => S.splits.find(s => s.id === id);
const activeSplit = () => getSplit(S.activeSplitId) || S.splits[0];

function proximoDia() {
  const sp = activeSplit();
  if (!sp || !sp.dias.length) return null;
  const ultimo = [...S.logs].reverse().find(l => l.splitId === sp.id && sp.dias.some(d => d.id === l.diaId));
  if (!ultimo) return sp.dias[0];
  const i = sp.dias.findIndex(d => d.id === ultimo.diaId);
  return sp.dias[(i + 1) % sp.dias.length];
}

function logsPorData() {
  const m = {};
  for (const l of S.logs) (m[l.data] ||= []).push(l);
  return m;
}

function inicioSemana(iso) { const d = parseISO(iso); d.setDate(d.getDate() - d.getDay()); return isoDate(d); }

function stats() {
  const hoje = hojeISO();
  const dias = new Set(S.logs.map(l => l.data));
  const ano = [...dias].filter(d => d > addDias(hoje, -365)).length;
  const mes = [...dias].filter(d => d > addDias(hoje, -30)).length;
  const semanas = new Set([...dias].map(inicioSemana));
  let w = inicioSemana(hoje), seq = 0;
  if (!semanas.has(w)) w = addDias(w, -7); // semana atual ainda em andamento não quebra a sequência
  while (semanas.has(w)) { seq++; w = addDias(w, -7); }
  const semana = [...dias].filter(d => d >= inicioSemana(hoje)).length;
  return { ano, mes, seq, semana };
}

const exDeModelo = (e, feito) => ({ exId: e.id, nome: e.nome, series: e.series, reps: e.reps, carga: e.carga, feito, nota: '' });

function addLog(data, splitId, dia, avulso) {
  S.logs.push(dia
    ? { id: uid(), data, splitId, diaId: dia.id, nome: dia.nome, cor: dia.cor, exercicios: dia.exercicios.map(e => exDeModelo(e, true)) }
    : { id: uid(), data, splitId: null, diaId: null, nome: avulso?.nome || 'Treino avulso', cor: '#39d353', minutos: num(avulso?.minutos), exercicios: [] });
  S.logs.sort((a, b) => a.data.localeCompare(b.data));
  save();
}

// registros antigos sem checklist: considera o treino do modelo inteiro
function exerciciosDoModelo(log) {
  for (const sp of S.splits) {
    const d = sp.dias.find(x => x.id === log.diaId);
    if (d) return d.exercicios.map(e => exDeModelo(e, true));
  }
  return [];
}

/* ---------------- perfil e gasto calórico ----------------
   As contas são feitas com todas as casas decimais; só o
   resultado mostrado é arredondado PARA BAIXO (conservador). */

const ATIVIDADES = [
  ['1.2', 'Sedentário (estuda/trabalha sentado, anda pouco)'],
  ['1.3', 'Levemente ativo (anda bastante no dia a dia)'],
  ['1.45', 'Ativo (trabalha em pé ou se movimentando)'],
  ['1.6', 'Muito ativo (trabalho físico pesado)'],
];
const baixo = v => Math.floor(num(v));
const fmt = v => Math.trunc(num(v)).toLocaleString('pt-BR');

function pesoAtual() {
  const ult = [...S.pesos].sort((a, b) => a.data.localeCompare(b.data)).at(-1);
  return ult ? num(ult.kg) : num(S.perfil.peso); // perfil.peso: versões antigas
}

function idadeAtual(p) {
  if (!p.nascimento) return num(p.idade);
  const n = parseISO(p.nascimento), h = new Date();
  return h.getFullYear() - n.getFullYear() - (h < new Date(h.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0);
}

// % de gordura pelas medidas (fórmula da Marinha dos EUA, medidas em cm)
function gorduraMedidas(p, alt) {
  const c = num(p.cintura), n = num(p.pescoco), q = num(p.quadril);
  if (!alt || !c || !n) return null;
  if (p.sexo === 'm' && c > n) return 495 / (1.0324 - 0.19077 * Math.log10(c - n) + 0.15456 * Math.log10(alt)) - 450;
  if (p.sexo === 'f' && q && c + q > n) return 495 / (1.29579 - 0.35004 * Math.log10(c + q - n) + 0.221 * Math.log10(alt)) - 450;
  return null;
}

function perfilCalc({ semCal = false } = {}) {
  const p = S.perfil || {};
  const peso = pesoAtual(), idade = idadeAtual(p);
  let alt = num(p.altura);
  if (alt && alt < 3) alt *= 100; // aceita 1,75 ou 175
  const r = { peso, alt, idade, fator: num(p.atividade) || 1.2, passos: num(p.passos) };
  if (peso && alt) r.imc = peso / (alt / 100) ** 2;
  const informado = num(p.gordura);
  const estimado = gorduraMedidas(p, alt);
  if (informado > 2 && informado < 70) { r.gordura = informado; r.gordFonte = 'informado'; }
  else if (estimado > 2 && estimado < 70) { r.gordura = estimado; r.gordFonte = 'estimado pelas medidas'; }
  if (peso && r.gordura) r.magra = peso * (1 - r.gordura / 100);
  if (r.magra) {
    r.tmb = 370 + 21.6 * r.magra;
    r.formula = `Katch-McArdle (% de gordura ${r.gordFonte})`;
  } else if (peso && alt && idade) {
    r.tmb = 10 * peso + 6.25 * alt - 5 * idade + (p.sexo === 'm' ? 5 : p.sexo === 'f' ? -161 : -78);
    r.formula = 'Mifflin-St Jeor' + (p.sexo ? '' : ' (sem sexo informado, usa a média)');
  }
  if (r.tmb) {
    // dia normal sem treino: pelos passos (mais preciso) ou pelo nível de rotina
    if (r.passos) { r.base = r.tmb * 1.1 + r.passos * 0.0005 * peso; r.baseFonte = `TMB × 1,1 + ${fmt(r.passos)} passos`; }
    else { r.base = r.tmb * r.fator; r.baseFonte = `TMB × ${String(r.fator).replace('.', ',')} (rotina)`; }
    const cal = num(p.fatorCal);
    if (!semCal && cal) { r.base *= cal; r.cal = cal; }
    // precisão estimada do "dia normal" conforme os dados disponíveis
    r.precBase = r.cal ? 90 : r.gordFonte === 'informado' ? 80 : r.gordFonte ? 75 : p.sexo ? 70 : 60;
    if (r.passos && !r.cal) r.precBase += 5;
  }
  r.falta = [];
  if (!peso) r.falta.push('peso');
  if (!r.tmb) { if (!alt) r.falta.push('altura'); if (!idade && !r.magra) r.falta.push('data de nascimento'); }
  return r;
}

// compara o peso que realmente mudou com o saldo registrado (últimos 28 dias)
function calibracao() {
  const hoje = hojeISO(), ini = addDias(hoje, -28);
  const ps = S.pesos.filter(p => p.data >= ini).sort((a, b) => a.data.localeCompare(b.data));
  const pc0 = perfilCalc({ semCal: true });
  const dias = [];
  for (let i = 28; i >= 1; i--) { const d = diaResumo(addDias(hoje, -i), pc0); if (d.temComida && d.gasto != null) dias.push(d); }
  const span = ps.length > 1 ? (parseISO(ps.at(-1).data) - parseISO(ps[0].data)) / 864e5 : 0;
  const falta = [];
  if (!pc0.base) falta.push('completar o perfil');
  if (ps.length < 4) falta.push(`${4 - ps.length} pesagem(ns) a mais nos últimos 28 dias`);
  if (span < 14) falta.push('pesagens cobrindo pelo menos 14 dias');
  if (dias.length < 10) falta.push(`${10 - dias.length} dia(s) a mais com refeições registradas`);
  if (falta.length) return { ok: false, falta };
  // regressão linear: kg por dia
  const t0 = parseISO(ps[0].data);
  const xs = ps.map(p => (parseISO(p.data) - t0) / 864e5), ys = ps.map(p => num(p.kg));
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  const inc = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const cons = dias.reduce((a, d) => a + d.cons, 0) / dias.length;
  const est = dias.reduce((a, d) => a + d.gasto, 0) / dias.length;
  const medido = cons - inc * 7700;
  return { ok: true, inc, cons, est, medido, fator: Math.min(1.2, Math.max(0.8, medido / est)), dias: dias.length, pesagens: ps.length };
}

function sugestaoMetas(pc) {
  if (!pc.base || !pc.peso) return null;
  const p = S.perfil, hoje = hojeISO();
  const treinoDia = S.logs.filter(l => l.data > addDias(hoje, -28)).reduce((a, l) => a + (kcalTreino(l, pc.peso) || 0), 0) / 28;
  const manut = pc.base + treinoDia;
  const delta = num(p.ritmo) * 7700 / 7;
  const kcal = p.objetivo === 'perder' ? manut - delta : p.objetivo === 'ganhar' ? manut + delta : manut;
  const prot = pc.peso * (p.objetivo === 'perder' ? 2 : 1.8);
  const gord = pc.peso * 0.8;
  const carb = Math.max(0, (kcal - prot * 4 - gord * 9) / 4);
  return { manut: baixo(manut), kcal: baixo(kcal), prot: baixo(prot), gord: baixo(gord), carb: baixo(carb), abaixoTmb: kcal < pc.tmb };
}

const imcCat = v => v < 18.5 ? 'abaixo do peso' : v < 25 ? 'peso normal' : v < 30 ? 'sobrepeso' : 'obesidade';

// exercícios que movem muita massa muscular gastam mais
const COMPOSTOS = /agach|leg ?press|terra|stiff|afundo|avan[cç]o|b[uú]lgaro|hack|supino|remada|barra|desenvolvimento|puxada|pulldown|levantamento|mergulho|paralela|flex[aã]o|burpee|p[eé]lvica/i;

function repsMedia(r) {
  const n = String(r ?? '').match(/\d+(?:[.,]\d+)?/g);
  return n ? n.reduce((a, x) => a + num(x), 0) / n.length : 10;
}

// gasto LÍQUIDO de um exercício (só o que passa do repouso, que já está na TMB)
function kcalExercicio(e, peso) {
  const series = num(e.series) || 3;
  const rs = String(e.reps ?? '');
  const segTrabalho = /\d\s*s\b/i.test(rs) ? repsMedia(rs) : repsMedia(rs) * 3; // ~3 s por repetição
  const minutos = series * (segTrabalho + 75) / 60; // + ~75 s de descanso por série
  const met = COMPOSTOS.test(e.nome) ? 5 : 3.5;
  return (met - 1) * peso * minutos / 60;
}

function kcalTreino(log, peso = perfilCalc().peso) {
  if (!peso) return null;
  if (log.minutos) return ((num(log.met) || 5) - 1) * peso * num(log.minutos) / 60; // avulso / esporte
  const exs = log.exercicios || exerciciosDoModelo(log);
  return exs.filter(e => e.feito).reduce((a, e) => a + kcalExercicio(e, peso), 0);
}

/* precisão estimada (0–100). É uma heurística: fotos claras, rótulos e
   pesagens sobem; coisas descritas de memória descem. */
function precRefeicao(r) {
  const p = num(r.detalhes?.precisao);
  if (p > 0 && p <= 100) return p;
  if (r.tipo === 'rotulo') return 85;
  if (r.tipo === 'manual') return 75;
  return { alta: 80, media: 65, baixa: 45 }[r.detalhes?.confianca] || 60;
}
const precTreino = l => num(l.precisao) || (l.minutos ? 50 : l.exercicios ? 70 : 55);

// guarda uma foto do perfil por dia, pra dias passados usarem o peso/TMB da época
function registrarHistorico() {
  const pc = perfilCalc();
  if (!pc.peso && !pc.tmb) return;
  const snap = { data: hojeISO(), peso: pc.peso || null, tmb: pc.tmb || null, base: pc.base || null, precBase: pc.precBase || null,
    gordura: pc.gordura || null, imc: pc.imc || null, magra: pc.magra || null, cal: pc.cal || null };
  S.historico = (S.historico || []).filter(h => h.data !== snap.data);
  S.historico.push(snap);
  S.historico.sort((a, b) => a.data.localeCompare(b.data));
}

function pcDoDia(data) {
  if (data >= hojeISO() || !S.historico?.length) return perfilCalc();
  return [...S.historico].reverse().find(h => h.data <= data) || S.historico[0];
}

function diaResumo(data, pc = pcDoDia(data)) {
  const refs = S.refeicoes.filter(r => r.data === data);
  const cons = refs.reduce((a, r) => a + num(r.kcal), 0);
  const doDia = S.logs.filter(l => l.data === data);
  const r = S.rascunho;
  if (r && !r.editId && r.data === data && r.exercicios.some(e => e.feito)) doDia.push(r); // checklist em andamento já conta
  const treinos = doDia.map(l => ({ l, k: kcalTreino(l, pc.peso) || 0 }));
  const treino = treinos.reduce((a, x) => a + x.k, 0);
  const gasto = pc.base ? baixo(pc.base + treino) : null;
  const precCons = !refs.length ? null : cons
    ? refs.reduce((a, r) => a + precRefeicao(r) * num(r.kcal), 0) / cons
    : refs.reduce((a, r) => a + precRefeicao(r), 0) / refs.length;
  const precGasto = pc.base ? (pc.precBase * pc.base + treinos.reduce((a, x) => a + precTreino(x.l) * x.k, 0)) / (pc.base + treino) : null;
  const prec = precCons != null && precGasto != null ? (precCons * cons + precGasto * (pc.base + treino)) / (cons + pc.base + treino) : null;
  return {
    data, refs, temComida: refs.length > 0, cons, treinos, treino, base: pc.base || null, gasto,
    saldo: gasto == null ? null : cons - gasto,
    precCons: precCons == null ? null : baixo(precCons), precGasto: precGasto == null ? null : baixo(precGasto), prec: prec == null ? null : baixo(prec),
  };
}

const saldoTxt = v => v < 0 ? `déficit de ${fmt(-v)} kcal` : v > 0 ? `superávit de ${fmt(v)} kcal` : 'empatado';
const faltaPerfilHTML = pc => `<p class="muted small">Pra calcular o gasto, preencha em
  <a href="#" data-act="tab" data-tab="perfil" style="color:var(--accent)">Perfil</a>: ${pc.falta.join(', ')}.</p>`;
const pesoTxt = kg => kg < 1 ? `${Math.trunc(kg * 1000)} g` : `${(Math.trunc(kg * 100) / 100).toLocaleString('pt-BR')} kg`;
const dataCurta = iso => parseISO(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/* ---------------- treino em andamento (checklist) ---------------- */

function novaSessao(dia, splitId, data = hojeISO()) {
  return { data, splitId, diaId: dia.id, nome: dia.nome, cor: dia.cor, chat: [], exercicios: dia.exercicios.map(e => exDeModelo(e, false)) };
}

// o que aparece no topo da aba Frequência: rascunho salvo ou o próximo treino da fila
function sessaoVisivel() {
  if (S.rascunho) return S.rascunho;
  if (S.logs.some(l => l.data === hojeISO() && l.diaId)) return null; // atividades avulsas não contam como o treino do dia
  const d = proximoDia();
  return d ? novaSessao(d, activeSplit().id) : null;
}
function garantirRascunho() {
  if (!S.rascunho) S.rascunho = sessaoVisivel();
  return S.rascunho;
}

// exercícios feitos com séries/reps/carga diferentes do modelo
function difsModelo(r) {
  const dia = getSplit(r.splitId)?.dias.find(d => d.id === r.diaId);
  if (!dia) return [];
  return r.exercicios.filter(e => e.feito && e.exId)
    .map(e => ({ e, m: dia.exercicios.find(m => m.id === e.exId) }))
    .filter(({ e, m }) => m && ['series', 'reps', 'carga'].some(k => String(e[k] ?? '') !== String(m[k] ?? '')));
}

// caixa de conversa com a IA (usada na comida, no treino do dia e no modelo)
function chatBox({ id, msgs, esperando, placeholder, titulo = '💬 Falar com a IA' }) {
  return `<div class="chat">
    <div class="muted small" style="margin:14px 0 4px">${titulo}</div>
    ${(msgs || []).map(m => `<div class="msg ${m.role}">${esc(m.text)}</div>`).join('')}
    ${esperando ? '<div class="msg model muted">pensando…</div>' : ''}
    <form class="row" data-chat="${id}" style="flex-wrap:nowrap;margin-top:6px">
      <input type="text" placeholder="${esc(placeholder)}" autocomplete="off" ${esperando ? 'disabled' : ''}>
      <button class="btn sm primary" ${esperando ? 'disabled' : ''}>Enviar</button>
    </form></div>`;
}
const histGemini = msgs => msgs.slice(-20).map(m => ({
  role: m.role, parts: [{ text: m.role === 'model' ? JSON.stringify({ resposta: m.text }) : m.text }],
}));

async function chatSessao(texto) {
  const r = garantirRascunho();
  if (!r || UI.esperaSessao || !temChave()) return;
  r.chat = r.chat || [];
  r.chat.push({ role: 'user', text: texto });
  UI.esperaSessao = true; save(); renderFreq();
  const pc = perfilCalc();
  const antes = pc.peso ? kcalTreino(r, pc.peso) : null;
  try {
    const contexto = `Você é um personal trainer. Este é o treino de hoje da pessoa. "feito" indica se ela marcou o exercício como feito:
${JSON.stringify({ treino: r.nome, exercicios: r.exercicios.map((e, i) => ({ i, nome: e.nome, series: e.series, reps: e.reps, carga: e.carga, feito: e.feito, nota: e.nota })) })}
${pc.peso ? `Peso corporal: ${pc.peso} kg.` : ''}
Responda SEMPRE com JSON: {"resposta": "curta, em português", "alteracoes": [], "novos": []}
"alteracoes": quando a pessoa disser o que fez ou deixou de fazer, liste objetos {"i": índice, e só os campos que mudam entre "feito", "series", "reps", "carga", "nota"}.
Exemplos: "não fiz leg press" → feito false; "fiz tudo menos X" → todos feito true, menos X; "no supino fiz 3x6 com 50kg" → series 3, reps "6", carga "50kg", feito true.
"novos": exercícios que ela fez e não estavam na lista: {"nome", "series", "reps", "carga", "feito": true}.
Se for só uma pergunta, devolva as listas vazias.`;
    const resp = await gemini([
      { role: 'user', parts: [{ text: contexto }] },
      { role: 'model', parts: [{ text: '{"resposta":"Certo, me conta.","alteracoes":[],"novos":[]}' }] },
      ...histGemini(r.chat),
    ]);
    for (const a of resp.alteracoes || []) {
      const e = r.exercicios[a.i];
      if (!e) continue;
      for (const k of ['feito', 'series', 'reps', 'carga', 'nota']) if (a[k] !== undefined && a[k] !== null) e[k] = k === 'feito' ? !!a[k] : a[k];
    }
    for (const n of resp.novos || []) {
      if (n?.nome) r.exercicios.push({ exId: null, nome: String(n.nome), series: n.series ?? '', reps: n.reps ?? '', carga: n.carga ?? '', feito: n.feito !== false, nota: '' });
    }
    let txt = resp.resposta || '(sem resposta)';
    const depois = pc.peso ? kcalTreino(r, pc.peso) : null;
    if (antes != null && baixo(antes) !== baixo(depois)) txt += `\n(gasto do treino: ${baixo(antes)} → ${baixo(depois)} kcal)`;
    r.chat.push({ role: 'model', text: txt });
  } catch (e) {
    r.chat.push({ role: 'model', text: '⚠️ ' + e.message });
  }
  UI.esperaSessao = false; save();
  if (UI.tab === 'freq') renderFreq();
}

async function chatAtividades(texto) {
  const c = UI.chatAtiv;
  if (c.esperando || !temChave()) return;
  c.msgs.push({ role: 'user', text: texto });
  c.esperando = true; renderFreq();
  const pc = perfilCalc(), hoje = hojeISO();
  try {
    const contexto = `Hoje é ${fmtData(hoje)} (${hoje}). A pessoa vai contar atividades físicas que fez fora da musculação (esportes, cardio etc.), às vezes em dias passados ("segunda", "ontem", "dia 3").
${pc.peso ? `Peso: ${pc.peso} kg.` : ''}
Responda SEMPRE com JSON: {"resposta": "curta, em português", "atividades": []}
Cada atividade: {"data": "AAAA-MM-DD", "nome": "Futevôlei", "minutos": 90, "met": 5.5, "precisao": 50}
- "met": MET médio realista considerando a intensidade descrita e as pausas (ex.: futevôlei recreativo ~4-5, intenso ~6-7). Na dúvida, escolha o valor mais conservador.
- "precisao" (0 a 100): quão confiável é a estimativa com o que foi dito (duração ou intensidade vaga → mais baixa).
- Se não disser o dia, use hoje. Nunca use datas no futuro.
- Se faltar a duração, pergunte em "resposta" e devolva "atividades": [].
- Inclua só as atividades novas desta última mensagem (as anteriores já foram registradas).`;
    const r = await gemini([
      { role: 'user', parts: [{ text: contexto }] },
      { role: 'model', parts: [{ text: '{"resposta":"Certo, me conta o que você fez.","atividades":[]}' }] },
      ...histGemini(c.msgs),
    ]);
    const novos = [];
    for (const a of r.atividades || []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a?.data || '') || a.data > hoje || !(num(a.minutos) > 0)) continue;
      const nome = String(a.nome || 'Atividade');
      const cor = S.logs.find(l => l.nome.toLowerCase() === nome.toLowerCase())?.cor || '#14b8a6';
      const log = { id: uid(), data: a.data, splitId: null, diaId: null, nome, cor, exercicios: [],
        minutos: num(a.minutos), met: Math.min(12, Math.max(1.5, num(a.met) || 5)), precisao: Math.min(100, Math.max(5, num(a.precisao) || 50)) };
      S.logs.push(log); novos.push(log);
    }
    S.logs.sort((a, b) => a.data.localeCompare(b.data));
    c.lote = novos.length ? novos.map(l => l.id) : c.lote;
    let txt = r.resposta || '(sem resposta)';
    if (novos.length) {
      txt += '\nRegistrado: ' + novos.map(l => `${l.nome} ${dataCurta(l.data)} · ${l.minutos} min${pc.peso ? ` · ~${baixo(kcalTreino(l, pc.peso))} kcal` : ''} (precisão ${l.precisao}%)`).join('; ');
      save();
    }
    c.msgs.push({ role: 'model', text: txt });
  } catch (e) {
    c.msgs.push({ role: 'model', text: '⚠️ ' + e.message });
  }
  c.esperando = false;
  if (UI.tab === 'freq') renderFreq();
}

function sessaoHTML(r, pc) {
  const sp = getSplit(r.splitId);
  const feitos = r.exercicios.filter(e => e.feito).length;
  const kcal = pc.peso ? baixo(kcalTreino(r, pc.peso)) : null;
  const rotulo = r.editId ? `Editando treino de ${dataCurta(r.data)}` : r.data === hojeISO() ? 'Treino de hoje' : `Treino aberto de ${dataCurta(r.data)}`;
  const difs = difsModelo(r);
  return `
    <div class="muted small">Modelo vigente: <b>${esc(activeSplit()?.nome || '')}</b></div>
    <div class="next"><span class="dot" style="--cor:${r.cor}"></span>
      <div class="grow"><div class="muted small">${rotulo}</div><h2>${esc(r.nome)}</h2></div>
      <span class="badge">${feitos}/${r.exercicios.length}${kcal != null ? ` · ${kcal} kcal` : ''}</span></div>
    ${sp && sp.dias.length > 1 && !r.editId ? `<label class="small">Hoje vou fazer
      <select data-sx-trocar>${sp.dias.map(d => `<option value="${d.id}" ${d.id === r.diaId ? 'selected' : ''}>${esc(d.nome)}</option>`).join('')}</select></label>` : ''}
    <ul class="checklist">${r.exercicios.map((e, i) => `
      <li class="${e.feito ? 'done' : ''}">
        <button class="check" data-act="sxToggle" data-i="${i}" aria-label="Marcar ${esc(e.nome)}">${e.feito ? '✓' : ''}</button>
        <div class="ex-main" data-act="sxToggle" data-i="${i}"><b>${esc(e.nome)}</b>
          <small>${esc(serieTxt(e)) || '&nbsp;'}${e.nota ? ' — ' + esc(e.nota) : ''}</small></div>
        <button class="icon" data-act="sxEdit" data-i="${i}" aria-label="Ajustar">✎</button></li>`).join('')}
    </ul>
    <div class="row">
      <button class="btn sm" data-act="sxAll">${feitos === r.exercicios.length && feitos ? 'Desmarcar todos' : 'Marcar todos'}</button>
      <button class="btn sm ghost" data-act="sxExtra">+ Exercício extra</button>
    </div>
    ${kcal == null ? `<p class="muted small">Preencha seu peso em <a href="#" data-act="tab" data-tab="perfil" style="color:var(--accent)">Perfil</a> pra ver as calorias gastas.</p>` : ''}
    ${chatBox({ id: 'sessao', msgs: r.chat, esperando: UI.esperaSessao, placeholder: 'ex: não fiz leg press; supino 3×6 com 50 kg', titulo: '💬 Conte pra IA como foi' })}
    ${difs.length ? `<div class="row small" style="margin-top:10px;flex-wrap:nowrap">
      <input type="checkbox" id="sxAtualiza" ${r.atualizarModelo ? 'checked' : ''} style="width:auto;flex:none">
      <label for="sxAtualiza" style="margin:0;color:var(--txt)">Atualizar no modelo: ${esc(difs.map(d => d.e.nome).join(', '))}</label></div>` : ''}
    <div class="row end" style="margin-top:12px">
      ${S.rascunho ? `<button class="btn ghost" data-act="sxDiscard">${r.editId ? 'Cancelar' : 'Descartar'}</button>` : ''}
      <button class="btn primary" data-act="sxDone">${r.editId ? 'Salvar' : 'Concluir treino'}</button></div>`;
}

/* ---------------- UI genérica ---------------- */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

function openModal(html) { $('#modalBox').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modalBox').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function fieldHTML(f) {
  if (f.type === 'cores') {
    return `<div class="muted small" style="margin-bottom:10px">${esc(f.label)}<div class="swatches">${CORES.map(c =>
      `<label style="margin:0"><input type="radio" name="${f.name}" value="${c}" ${c === f.value ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>`;
  }
  if (f.type === 'textarea') return `<label>${esc(f.label)}<textarea name="${f.name}" rows="2" placeholder="${esc(f.placeholder || '')}">${esc(f.value)}</textarea></label>`;
  // campos numéricos usam texto + teclado numérico: aceita vírgula (75,5)
  return `<label>${esc(f.label)}<input type="${f.type === 'number' ? 'text' : f.type || 'text'}" name="${f.name}" value="${esc(f.value ?? '')}"
    placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''} ${f.type === 'number' ? 'inputmode="decimal"' : ''}></label>`;
}

function formModal({ title, fields, onSave, saveLabel = 'Salvar' }) {
  openModal(`<h3>${esc(title)}</h3><form id="mform">${fields.map(fieldHTML).join('')}
    <div class="row end"><button type="button" class="btn ghost" data-act="modalClose">Cancelar</button>
    <button class="btn primary">${saveLabel}</button></div></form>`);
  const form = $('#mform');
  setTimeout(() => form.querySelector('input[type=text]')?.focus(), 50);
  form.onsubmit = e => {
    e.preventDefault();
    if (onSave(Object.fromEntries(new FormData(form))) !== false) closeModal();
  };
}

function setTab(tab) {
  UI.tab = tab;
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== 'tab-' + tab;
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('active', b.dataset.tab === tab);
  try { localStorage.setItem('fitlog:tab', tab); } catch (e) { }
  render();
  window.scrollTo(0, 0);
}

function render() {
  const bar = $('#demoBar');
  bar.hidden = !S.demo;
  if (S.demo) bar.innerHTML = `🧪 <span class="grow">Dados simulados pra você explorar</span>
    <button class="btn sm" data-act="demoSair">${localStorage.getItem('fitlog:antesDemo') ? 'Voltar aos meus dados' : 'Apagar e começar do zero'}</button>`;
  $('#topDate').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  ({ freq: renderFreq, treinos: renderTreinos, comida: renderComida, resumo: renderResumo, perfil: renderPerfil })[UI.tab]();
}

/* ================= ABA 1: FREQUÊNCIA ================= */

function renderFreq() {
  const sp = activeSplit();
  const hoje = hojeISO();
  const feitosHoje = S.logs.filter(l => l.data === hoje && l.diaId);
  const st = stats();
  const pc = perfilCalc();
  const recentes = [...S.logs].reverse().slice(0, 8);
  const ses = sessaoVisivel();
  const kcalTxt = l => pc.peso ? `<span class="muted small">~${baixo(kcalTreino(l, pc.peso))} kcal</span>` : '';

  let topo;
  if (ses) topo = sessaoHTML(ses, pc);
  else if (!sp?.dias.length) topo = '<p class="muted">Escolha um modelo na aba <b>Treinos</b>.</p>';
  else {
    const prox = proximoDia();
    topo = `<div class="muted small">Modelo vigente: <b>${esc(sp.nome)}</b></div>
      ${feitosHoje.map(l => `<div class="next"><span class="dot" style="--cor:${l.cor}"></span>
        <div class="grow"><div class="muted small">✅ Treinou hoje</div><h2>${esc(l.nome)}</h2>${kcalTxt(l)}</div>
        <button class="btn sm" data-act="logEdit" data-id="${l.id}">✎ Editar</button></div>`).join('')}
      <div class="row" style="margin-top:10px"><span class="muted small grow">Próximo da fila: <b>${esc(prox.nome)}</b></span>
        <button class="btn sm" data-act="sxStart">Fazer outro treino hoje</button></div>`;
  }

  $('#tab-freq').innerHTML = `
    <div class="card">${topo}</div>

    <div class="card">
      ${chatBox({ id: 'atividades', msgs: UI.chatAtiv.msgs, esperando: UI.chatAtiv.esperando, titulo: '🏐 Outras atividades (futevôlei, corrida, bike…)',
        placeholder: 'ex: futevôlei segunda e quarta, 1h30, bem puxado' })}
      ${UI.chatAtiv.lote?.length ? '<button class="btn sm ghost" data-act="ativUndo" style="margin-top:8px">↶ Desfazer último registro</button>' : ''}
    </div>

    <div class="stats">
      <div class="stat"><b>${st.semana}</b><span>esta semana</span></div>
      <div class="stat"><b>${st.mes}</b><span>últimos 30 dias</span></div>
      <div class="stat"><b>${st.seq}</b><span>semanas seguidas</span></div>
      <div class="stat"><b>${st.ano}</b><span>no último ano</span></div>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:8px"><h3>Frequência</h3><span class="muted small">toque num dia pra editar</span></div>
      ${heatmapHTML()}
      <div class="legend">${legendaHTML()}</div>
    </div>

    <div class="card">
      <h3>Últimos treinos</h3>
      ${recentes.length ? `<ul class="list">${recentes.map(l => `
        <li><span class="dot" style="--cor:${l.cor}"></span><div class="grow">${esc(l.nome)} ${kcalTxt(l)}</div>
        <span class="muted small">${parseISO(l.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short' })}</span></li>`).join('')}</ul>`
      : '<p class="muted small">Nenhum treino registrado ainda.</p>'}
    </div>`;

  const sc = $('.hm-scroll');
  if (sc) sc.scrollLeft = sc.scrollWidth;
}

function serieTxt(e) {
  return [e.series && e.reps ? `${e.series}×${e.reps}` : (e.series || e.reps || ''), e.carga ? `${e.carga}` : ''].filter(Boolean).join(' · ');
}

function fundoCelula(logs) {
  if (!logs?.length) return '';
  const cores = [...new Set(logs.map(l => l.cor))];
  if (cores.length === 1) return `background:${cores[0]}`;
  return `background:linear-gradient(135deg, ${cores[0]} 50%, ${cores[1]} 50%)`;
}

function heatmapHTML() {
  const por = logsPorData();
  const hoje = hojeISO();
  const fim = parseISO(hoje);
  const ini = new Date(fim); ini.setDate(fim.getDate() - fim.getDay() - 52 * 7); // começa num domingo
  const ultimoSabado = new Date(fim); ultimoSabado.setDate(fim.getDate() + (6 - fim.getDay()));
  let cells = '', months = '', col = 0, lastMonth = -1;
  for (const d = new Date(ini); d <= ultimoSabado; d.setDate(d.getDate() + 1)) {
    const iso = isoDate(d);
    if (d.getDay() === 0) {
      col++;
      const m = d.getMonth();
      if (m !== lastMonth) {
        if (!(col === 1 && d.getDate() > 20)) months += `<span style="grid-column:${col}">${MESES[m]}</span>`;
        lastMonth = m;
      }
    }
    const logs = por[iso];
    const fut = iso > hoje;
    const tip = `${parseISO(iso).toLocaleDateString('pt-BR')}${logs ? ': ' + logs.map(l => l.nome).join(', ') : ''}`;
    cells += `<button class="cell${iso === hoje ? ' hoje' : ''}${fut ? ' fut' : ''}" ${fut ? 'disabled' : `data-act="cell" data-date="${iso}"`}
      style="${fundoCelula(logs)}" title="${esc(tip)}" aria-label="${esc(tip)}"></button>`;
  }
  return `<div class="hm-scroll"><div class="hm" style="--cols:${col}">
    <div class="hm-months">${months}</div>
    <div class="hm-days"><span></span><span>seg</span><span></span><span>qua</span><span></span><span>sex</span><span></span></div>
    <div class="hm-grid">${cells}</div></div></div>`;
}

function legendaHTML() {
  const sp = activeSplit();
  const itens = (sp?.dias || []).map(d => [d.cor, d.nome]);
  const extras = new Map();
  for (const l of S.logs) if (!itens.some(([c, n]) => c === l.cor && n === l.nome)) extras.set(l.nome, l.cor);
  return [...itens, ...[...extras].map(([n, c]) => [c, n])].slice(0, 12)
    .map(([c, n]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join('')
    + `<span><i style="background:var(--empty)"></i>descanso</span>`;
}

function openDaySheet(data) {
  const sp = activeSplit();
  const pc = perfilCalc();
  const logs = S.logs.filter(l => l.data === data);
  openModal(`
    <h3 style="text-transform:capitalize">${esc(fmtData(data))}</h3>
    ${logs.length ? `<ul class="list" style="margin-bottom:14px">${logs.map(l => `
      <li><span class="dot" style="--cor:${l.cor}"></span>
        <div class="grow">${esc(l.nome)}${pc.peso ? `<div class="muted small">~${baixo(kcalTreino(l, pc.peso))} kcal${l.exercicios?.length ? ` · ${l.exercicios.filter(e => e.feito).length}/${l.exercicios.length} exercícios` : ''}</div>` : ''}</div>
        <button class="icon" data-act="logEdit" data-id="${l.id}" aria-label="Editar">✎</button>
        <button class="icon danger" data-act="logDel" data-id="${l.id}" aria-label="Remover">✕</button></li>`).join('')}</ul>`
      : '<p class="muted small">Nenhum treino neste dia.</p>'}
    <div class="muted small" style="margin-bottom:8px">Registrar treino completo (${esc(sp?.nome || '')}):</div>
    <div class="row">${(sp?.dias || []).map(d =>
      `<button class="btn sm" data-act="logAdd" data-date="${data}" data-dia="${d.id}"><span class="dot" style="--cor:${d.cor};width:10px;height:10px"></span>${esc(d.nome)}</button>`).join('')}
      <button class="btn sm ghost" data-act="logAdd" data-date="${data}" data-dia="">+ Outro (avulso)</button>
    </div>
    <p class="muted small">Depois toque em ✎ pra desmarcar o que não fez.</p>
    <div class="row end" style="margin-top:10px"><button class="btn ghost" data-act="modalClose">Fechar</button></div>`);
}

/* ================= ABA 2: TREINOS ================= */

function renderTreinos() {
  if (!getSplit(UI.viewSplitId)) UI.viewSplitId = S.activeSplitId;
  const sp = getSplit(UI.viewSplitId);
  const ativa = sp && sp.id === S.activeSplitId;

  $('#tab-treinos').innerHTML = `
    <div class="muted small" style="margin-bottom:6px">Seus modelos de treino (● = vigente)</div>
    <div class="chips">
      ${S.splits.map(s => `<button class="chip ${s.id === UI.viewSplitId ? 'sel' : ''}" data-act="splitView" data-id="${s.id}">
        ${s.id === S.activeSplitId ? '<span class="star">●</span> ' : ''}${esc(s.nome)}</button>`).join('')}
      <button class="chip" data-act="splitNew">+ Adicionar modelo</button>
    </div>
    ${sp ? `
      <div class="card">
        <div class="row between">
          <div class="grow"><h2>${esc(sp.nome)}</h2>
            <div class="muted small">${sp.dias.length} treino(s) na rotação</div></div>
          ${ativa ? '<span class="badge">vigente</span>' : `<button class="btn primary sm" data-act="splitUse">Tornar vigente</button>`}
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn sm" data-act="splitRename">✎ Renomear</button>
          <button class="btn sm" data-act="splitDup">⧉ Duplicar</button>
          <button class="btn sm danger" data-act="splitDel">Excluir</button>
        </div>
      </div>
      ${modeloIAHTML(sp)}
      ${sp.dias.map((d, i) => `
        <div class="card day" style="--cor:${d.cor}">
          <div class="day-head">
            <span class="dot" style="--cor:${d.cor}"></span>
            <h3>${String.fromCharCode(65 + i)} · ${esc(d.nome)}</h3>
            <div class="icons">
              <button class="icon" data-act="dayMove" data-dia="${d.id}" data-dir="-1" aria-label="Subir">▲</button>
              <button class="icon" data-act="dayMove" data-dia="${d.id}" data-dir="1" aria-label="Descer">▼</button>
              <button class="icon" data-act="dayEdit" data-dia="${d.id}" aria-label="Editar">✎</button>
              <button class="icon danger" data-act="dayDel" data-dia="${d.id}" aria-label="Excluir">✕</button>
            </div>
          </div>
          <ol class="ex-list">${d.exercicios.map(e => `
            <li><div class="ex-main"><b>${esc(e.nome)}</b>
              <small>${esc(serieTxt(e)) || '&nbsp;'}${e.obs ? ' — ' + esc(e.obs) : ''}</small></div>
              <div class="icons">
                <button class="icon" data-act="exMove" data-dia="${d.id}" data-ex="${e.id}" data-dir="-1" aria-label="Subir">▲</button>
                <button class="icon" data-act="exMove" data-dia="${d.id}" data-ex="${e.id}" data-dir="1" aria-label="Descer">▼</button>
                <button class="icon" data-act="exEdit" data-dia="${d.id}" data-ex="${e.id}" aria-label="Editar">✎</button>
                <button class="icon danger" data-act="exDel" data-dia="${d.id}" data-ex="${e.id}" aria-label="Excluir">✕</button>
              </div></li>`).join('')}
          </ol>
          <button class="btn sm ghost" data-act="exAdd" data-dia="${d.id}">+ Exercício</button>
        </div>`).join('')}
      <button class="btn" style="width:100%" data-act="dayAdd">+ Adicionar treino (dia) neste modelo</button>
    ` : '<p class="muted">Adicione um modelo para começar.</p>'}`;
}

const viewSplit = () => getSplit(UI.viewSplitId);
const getDia = id => viewSplit()?.dias.find(d => d.id === id);

function mover(arr, i, dir) {
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

function exModal(dia, e) {
  formModal({
    title: e ? 'Editar exercício' : `Novo exercício em ${dia.nome}`,
    fields: [
      { name: 'nome', label: 'Exercício', value: e?.nome, required: true, placeholder: 'ex: Supino reto' },
      { name: 'series', label: 'Séries', value: e?.series, placeholder: '4' },
      { name: 'reps', label: 'Repetições', value: e?.reps, placeholder: '8-12' },
      { name: 'carga', label: 'Carga', value: e?.carga, placeholder: 'ex: 30kg' },
      { name: 'obs', label: 'Observação', value: e?.obs, placeholder: 'ex: drop-set na última' },
    ],
    onSave: v => {
      if (e) Object.assign(e, v); else dia.exercicios.push({ id: uid(), ...v });
      save(); renderTreinos();
    }
  });
}

function dayModal(dia) {
  const sp = viewSplit();
  formModal({
    title: dia ? 'Editar treino' : 'Novo treino no modelo',
    fields: [
      { name: 'nome', label: 'Nome do treino', value: dia?.nome, required: true, placeholder: 'ex: Costas + Bíceps' },
      { name: 'cor', label: 'Cor nos quadradinhos', type: 'cores', value: dia?.cor || CORES[sp.dias.length % CORES.length] },
    ],
    onSave: v => {
      const cor = v.cor || CORES[0];
      if (dia) {
        // renomear/recolorir também atualiza o histórico desse treino
        for (const l of S.logs) if (l.diaId === dia.id) { l.nome = v.nome; l.cor = cor; }
        Object.assign(dia, { nome: v.nome, cor });
      } else sp.dias.push({ id: uid(), nome: v.nome, cor, exercicios: [] });
      save(); renderTreinos();
    }
  });
}

function modeloIAHTML(sp) {
  const c = UI.chatModelo?.splitId === sp.id ? UI.chatModelo : { msgs: [] };
  return `<div class="card">
    ${chatBox({ id: 'modelo', msgs: c.msgs, esperando: c.esperando, titulo: '💬 Pedir pra IA mudar este modelo',
      placeholder: 'ex: coloca elevação pélvica depois do stiff' })}
    ${c.undo ? '<button class="btn sm ghost" data-act="modeloUndo" style="margin-top:8px">↶ Desfazer última mudança da IA</button>' : ''}
  </div>`;
}

async function chatModelo(texto) {
  const sp = viewSplit();
  if (!sp || !temChave()) return;
  if (UI.chatModelo?.splitId !== sp.id) UI.chatModelo = { splitId: sp.id, msgs: [] };
  const c = UI.chatModelo;
  if (c.esperando) return;
  c.msgs.push({ role: 'user', text: texto });
  c.esperando = true; renderTreinos();
  try {
    const modelo = { nome: sp.nome, dias: sp.dias.map(d => ({ id: d.id, nome: d.nome, cor: d.cor,
      exercicios: d.exercicios.map(({ id, nome, series, reps, carga, obs }) => ({ id, nome, series, reps, carga, obs })) })) };
    const contexto = `Você é um personal trainer ajudando a montar um modelo de treino (os dias se repetem em rotação). Modelo atual (JSON):
${JSON.stringify(modelo)}
Responda SEMPRE com JSON: {"resposta": "curta, em português", "modelo": null}
Se a pessoa pedir uma mudança (adicionar, trocar, remover ou reordenar exercícios ou dias, mudar séries, reps ou carga), devolva em "modelo" o modelo COMPLETO já alterado, no mesmo formato.
Mantenha o "id" dos dias e exercícios que continuam; itens novos vão sem "id". Cores em hexadecimal (#rrggbb). Se for só uma pergunta, "modelo": null.`;
    const r = await gemini([
      { role: 'user', parts: [{ text: contexto }] },
      { role: 'model', parts: [{ text: '{"resposta":"Certo, o que você quer mudar?","modelo":null}' }] },
      ...histGemini(c.msgs),
    ]);
    let txt = r.resposta || '(sem resposta)';
    if (Array.isArray(r.modelo?.dias)) {
      c.undo = JSON.parse(JSON.stringify(sp));
      const vistos = new Set();
      const idOk = id => { const ok = id && !vistos.has(id); if (ok) vistos.add(id); return ok ? id : uid(); };
      sp.nome = String(r.modelo.nome || sp.nome);
      sp.dias = r.modelo.dias.map((d, i) => ({
        id: idOk(d.id), nome: String(d.nome || 'Treino'),
        cor: /^#[0-9a-f]{6}$/i.test(d.cor || '') ? d.cor : CORES[i % CORES.length],
        exercicios: (d.exercicios || []).filter(e => e?.nome).map(e => ({
          id: idOk(e.id), nome: String(e.nome), series: e.series ?? '', reps: e.reps ?? '', carga: e.carga ?? '', obs: e.obs ?? '' })),
      }));
      for (const d of sp.dias) for (const l of S.logs) if (l.diaId === d.id) { l.nome = d.nome; l.cor = d.cor; }
      save();
      txt += '\n(modelo atualizado)';
    }
    c.msgs.push({ role: 'model', text: txt });
  } catch (e) {
    c.msgs.push({ role: 'model', text: '⚠️ ' + e.message });
  }
  c.esperando = false;
  if (UI.tab === 'treinos') renderTreinos();
}

/* ================= ABA 3: COMIDA (Gemini) ================= */

const PROMPT_PRATO = `Você é um nutricionista. Analise a foto de um prato/refeição.
Identifique cada alimento visível, estime a porção (em gramas e/ou medida caseira) e os macronutrientes.
Use como referência a tabela TACO e a culinária brasileira quando fizer sentido.
Responda SOMENTE com JSON válido neste formato:
{"titulo": "nome curto da refeição",
 "itens": [{"nome": "", "porcao": "ex: 150 g (4 col. sopa)", "kcal": 0, "proteina_g": 0, "carboidrato_g": 0, "gordura_g": 0}],
 "total": {"kcal": 0, "proteina_g": 0, "carboidrato_g": 0, "gordura_g": 0},
 "confianca": "baixa|media|alta",
 "precisao": 70,
 "comentario": "1-2 frases: equilíbrio da refeição e dica prática"}
"precisao" (0 a 100): quão confiável é a estimativa de calorias. Foto nítida, porções visíveis e peso informado → alta; foto escura, molhos, itens escondidos ou porção difícil de ver → baixa.
Se a imagem não for comida, devolva "itens": [] e explique no "comentario".`;

const PROMPT_ROTULO = `Você é um nutricionista. Leia o rótulo deste alimento: tabela nutricional, lista de ingredientes e selos frontais (padrão ANVISA, se houver).
Responda SOMENTE com JSON válido neste formato (use null se um valor não estiver visível):
{"produto": "nome do produto",
 "porcao_g": 0,
 "porcao_desc": "ex: 30 g (1 xícara)",
 "por_porcao": {"kcal": 0, "proteina_g": 0, "carboidrato_g": 0, "acucares_g": 0, "gordura_g": 0, "gordura_sat_g": 0, "fibras_g": 0, "sodio_mg": 0},
 "por_100g": {"kcal": 0, "proteina_g": 0, "carboidrato_g": 0, "acucares_g": 0, "gordura_g": 0, "gordura_sat_g": 0, "fibras_g": 0, "sodio_mg": 0},
 "alertas": ["selos 'alto em', aditivos relevantes, alergênicos, adoçantes etc."],
 "ultraprocessado": true,
 "nota_saude": 0,
 "precisao": 85,
 "resumo": "2-3 frases: vale a pena? para quem? alternativa melhor?"}
"nota_saude" vai de 0 (evitar) a 10 (ótimo). "precisao" (0 a 100): quão bem deu pra ler a tabela. Se a imagem não for um rótulo, explique no "resumo".`;

// lista os modelos do Gemini que esta chave pode usar pra gerar texto
async function listarModelos() {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': S.settings.apiKey } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return (j.models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/tts|image|embedding|live|audio/.test(m.name))
    .map(m => m.name.replace(/^models\//, ''));
}

// o "flash" de versão mais alta (estável, se houver): rápido, barato e com cota grátis
function melhorModelo(nomes) {
  const versao = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const flash = nomes.filter(n => /flash/.test(n) && !/lite/.test(n));
  const estaveis = flash.filter(n => !/preview|exp|thinking/.test(n));
  const pool = estaveis.length ? estaveis : flash.length ? flash : nomes;
  return [...pool].sort((a, b) => versao(b) - versao(a) || a.length - b.length)[0];
}

// aceita uma pergunta (lista de parts) ou uma conversa inteira ([{ role, parts }])
// se o modelo foi aposentado, troca sozinho pelo mais novo disponível e tenta de novo
async function gemini(entrada, jaTrocou = false) {
  const { apiKey, model } = S.settings;
  const nome = (model || MODELO_PADRAO).replace(/^models\//, '');
  const contents = entrada[0]?.role ? entrada : [{ role: 'user', parts: entrada }];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(nome)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents, generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || `HTTP ${r.status}`;
    if (r.status === 429) throw new Error('Limite gratuito do Gemini atingido por agora. Espere um pouco e tente de novo.');
    if (/API key/i.test(msg)) throw new Error('Chave do Gemini inválida. Confira em Perfil → Configurações.');
    if (!jaTrocou && (r.status === 404 || /no longer available|not found|not supported|deprecated|retired/i.test(msg))) {
      const sugerido = (msg.match(/use (?:models\/)?(gemini-[\w.-]+?)(?=[\s,.]*(?:for|$|\s))/i) || [])[1];
      let novo = sugerido;
      if (!novo) { try { novo = melhorModelo((await listarModelos()).filter(n => n !== nome)); } catch (e) { /* segue com o erro original */ } }
      if (novo && novo !== nome) {
        S.settings.model = novo; save();
        toast(`Modelo do Gemini atualizado para ${novo}`);
        return gemini(entrada, true);
      }
    }
    throw new Error(msg);
  }
  const txt = (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  if (!txt) throw new Error('O Gemini não retornou resposta (talvez a imagem tenha sido bloqueada).');
  return JSON.parse(txt);
}

function lerImagem(file, max) {
  return new Promise((ok, fail) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('Não consegui abrir essa imagem.')); };
    img.src = url;
  });
}

const fotoPart = b64 => ({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
const temChave = () => {
  if (S.settings.apiKey) return true;
  toast('Primeiro cole sua chave do Gemini em Perfil → Configurações.'); UI.abrirConfig = true; setTab('perfil'); return false;
};

async function analisar(file, modo) {
  if (!temChave()) return;
  const box = $('#foodResult');
  box.innerHTML = `<div class="card" style="text-align:center"><div class="spinner"></div>
    <div class="muted">Analisando ${modo === 'prato' ? 'o prato' : 'o rótulo'}…</div></div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const grande = await lerImagem(file, modo === 'rotulo' ? 1600 : 1024);
    const thumb = (await lerImagem(file, 120)).toDataURL('image/jpeg', 0.7);
    const b64 = grande.toDataURL('image/jpeg', 0.85).split(',')[1];
    const dica = $('#foodHint')?.value.trim();
    const prompt = (modo === 'prato' ? PROMPT_PRATO : PROMPT_ROTULO) + (dica ? `\nInformação extra do usuário: "${dica}"` : '');
    const data = await gemini([{ text: prompt }, fotoPart(b64)]);
    // img (foto grande) fica só na memória, para a conversa; no diário vai só a miniatura
    UI.pending = { modo, data, thumb, img: b64, chat: [] };
    renderResultado();
  } catch (e) {
    box.innerHTML = `<div class="card"><div class="alert">⚠️ ${esc(e.message)}</div></div>`;
  }
}

/* ---- conversa com a IA sobre a análise ---- */

function chatHTML(p) {
  return chatBox({ id: 'comida', msgs: p.chat, esperando: p.esperando, titulo: '💬 Corrigir ou perguntar pra IA',
    placeholder: p.modo === 'prato' ? 'ex: era arroz integral, pesei 320 g' : 'ex: isso serve de pré-treino?' });
}

async function enviarChat(texto) {
  const p = UI.pending;
  if (!p || !texto || p.esperando || !temChave()) return;
  p.chat.push({ role: 'user', text: texto });
  p.esperando = true; renderResultado();
  try {
    const contexto = `Você analisou ${p.modo === 'prato' ? 'esta refeição' : 'este rótulo'} e chegou neste JSON:
${JSON.stringify(p.data)}
A pessoa vai conversar com você sobre isso. Responda SEMPRE com JSON: {"resposta": "texto curto e direto, em português", "atualizacao": null}
Se a pessoa trouxer informação que muda os valores (peso real, ingrediente diferente, quanto comeu etc.), coloque em "atualizacao" o JSON COMPLETO corrigido, no MESMO formato do JSON acima, e explique a mudança em "resposta". Caso contrário, deixe "atualizacao": null.`;
    const historico = p.chat.slice(-20).map(m => ({
      role: m.role,
      parts: [{ text: m.role === 'model' ? JSON.stringify({ resposta: m.text, atualizacao: null }) : m.text }],
    }));
    const r = await gemini([
      { role: 'user', parts: [fotoPart(p.img || p.thumb.split(',')[1]), { text: contexto }] },
      { role: 'model', parts: [{ text: '{"resposta":"Certo, pode falar.","atualizacao":null}' }] },
      ...historico,
    ]);
    p.chat.push({ role: 'model', text: r.resposta || '(sem resposta)' });
    if (r.atualizacao && typeof r.atualizacao === 'object') {
      p.data = { ...p.data, ...r.atualizacao };
      delete p.macros;
      toast('Valores atualizados pela IA ✔');
    }
  } catch (e) {
    p.chat.push({ role: 'model', text: '⚠️ ' + e.message });
  }
  p.esperando = false;
  if (UI.pending === p) renderResultado();
}

/* ---- "não comi tudo": desconta a sobra ---- */

function sobraModal() {
  openModal(`<h3>Não comi tudo</h3>
    <p class="muted small">Mande uma foto do que sobrou e/ou o peso do prato antes e depois de comer. A IA recalcula só o que você comeu.</p>
    <label class="btn" style="margin-bottom:10px;color:var(--txt);text-align:center">📷 <span id="sobraFotoTxt">Foto do que sobrou</span>
      <input type="file" accept="image/*" id="sobraFoto" hidden></label>
    <div class="macro-grid" style="grid-template-columns:1fr 1fr">
      <label>Peso antes (g)<input type="text" inputmode="decimal" id="pesoAntes" placeholder="opcional"></label>
      <label>Peso depois (g)<input type="text" inputmode="decimal" id="pesoDepois" placeholder="opcional"></label>
    </div>
    <p class="muted small">Pode pesar com o prato junto: o peso da louça se cancela na conta.</p>
    <div class="row end"><button class="btn ghost" data-act="modalClose">Cancelar</button>
      <button class="btn primary" data-act="sobraCalc">Calcular</button></div>`);
  $('#sobraFoto').addEventListener('change', e => {
    $('#sobraFotoTxt').textContent = e.target.files[0] ? '✔ Foto da sobra escolhida' : 'Foto do que sobrou';
  });
}

function promptSobra(original, antes, depois, temFoto) {
  return `Você analisou antes esta refeição completa (JSON):
${JSON.stringify(original)}
A pessoa NÃO comeu tudo.${temFoto ? ' A foto anexa mostra o que SOBROU no prato.' : ''}${antes && depois ? `
Ela pesou o prato: ${antes} g antes de comer e ${depois} g depois, ou seja, comeu ${antes - depois} g de comida (o peso da louça se cancela na diferença). Use esse peso como referência principal${temFoto ? ' e a foto para saber de quais alimentos sobrou mais' : ''}.` : ''}
Calcule o que foi REALMENTE consumido. Responda SOMENTE com JSON:
{"sobrou": [{"nome": "", "porcao": ""}],
 "itens": [{"nome": "", "porcao": "quanto foi comido", "kcal": 0, "proteina_g": 0, "carboidrato_g": 0, "gordura_g": 0}],
 "total": {"kcal": 0, "proteina_g": 0, "carboidrato_g": 0, "gordura_g": 0},
 "comentario": "1 frase explicando o desconto",
 "precisao": 70}
"precisao" (0 a 100): confiabilidade do valor consumido (pesagem antes/depois deixa mais alta).`;
}

async function calcularSobra() {
  const file = $('#sobraFoto').files[0];
  const antes = num($('#pesoAntes').value), depois = num($('#pesoDepois').value);
  if (!file && !(antes && depois)) { toast('Mande a foto da sobra ou os dois pesos.'); return; }
  if (antes && depois && depois >= antes) { toast('O peso depois precisa ser menor que o de antes.'); return; }
  if (!temChave()) return;
  closeModal();
  const p = UI.pending;
  const original = p.data.antes || p.data; // refazer a conta sempre parte do prato inteiro
  p.chat.push({ role: 'user', text: `🍽️ Não comi tudo${file ? ' (mandei foto da sobra)' : ''}${antes && depois ? `: prato com ${antes} g antes e ${depois} g depois` : ''}` });
  p.esperando = true; renderResultado();
  try {
    const parts = [];
    if (file) parts.push(fotoPart((await lerImagem(file, 1024)).toDataURL('image/jpeg', 0.85).split(',')[1]));
    parts.push({ text: promptSobra(original, antes, depois, !!file) });
    const r = await gemini(parts);
    p.data = { ...original, itens: r.itens || [], total: r.total || {}, sobrou: r.sobrou || [], comentario: r.comentario || original.comentario,
      precisao: r.precisao ?? original.precisao, antes: original };
    delete p.macros;
    p.chat.push({ role: 'model', text: `Descontei a sobra: ${r0(original.total?.kcal)} → ${r0(r.total?.kcal)} kcal. ${r.comentario || ''}`.trim() });
  } catch (e) {
    p.chat.push({ role: 'model', text: '⚠️ ' + e.message });
  }
  p.esperando = false;
  if (UI.pending === p) renderResultado();
}

/* ---- cartão de resultado (análise nova ou refeição reaberta) ---- */

function renderResultado() {
  const p = UI.pending, box = $('#foodResult');
  if (!box) return;
  if (!p) { box.innerHTML = ''; return; }
  const d = p.data;
  const botoes = `<div class="row end" style="margin-top:12px">
      <button class="btn ghost" data-act="foodDiscard">${p.editId ? 'Fechar' : p.modo === 'prato' ? 'Descartar' : 'Só consultei'}</button>
      <button class="btn primary" data-act="foodSave" ${p.esperando ? 'disabled' : ''}>${p.editId ? 'Salvar alterações' : 'Salvar no diário'}</button>
    </div>`;
  if (p.modo === 'prato') {
    const t = d.total || {};
    const m = p.macros || { kcal: t.kcal, prot: t.proteina_g, carb: t.carboidrato_g, gord: t.gordura_g };
    box.innerHTML = `<div class="card">
      <div class="row" style="margin-bottom:8px"><img class="thumb" src="${p.thumb}" alt="">
        <div class="grow"><h3>${esc(d.titulo || 'Refeição')}</h3><span class="muted small">precisão estimada: ${precRefeicao({ tipo: 'prato', detalhes: d })}%</span></div></div>
      ${d.antes ? `<div class="alert ok">🍽️ Prato inteiro: ${r0(d.antes.total?.kcal)} kcal → você comeu <b>${r0(t.kcal)} kcal</b>
        ${d.sobrou?.length ? `<br><span class="muted small">Sobrou: ${d.sobrou.map(x => `${esc(x.nome)}${x.porcao ? ` (${esc(x.porcao)})` : ''}`).join(', ')}</span>` : ''}
        <button class="icon" data-act="sobraDesfazer" style="float:right;padding:0 4px">desfazer</button></div>` : ''}
      ${d.itens?.length ? `<table><tr><th>${d.antes ? 'Comido' : 'Alimento'}</th><th class="n">kcal</th><th class="n">P</th><th class="n">C</th><th class="n">G</th></tr>
        ${d.itens.map(i => `<tr><td>${esc(i.nome)}<br><span class="muted small">${esc(i.porcao)}</span></td>
          <td class="n">${r0(i.kcal)}</td><td class="n">${r0(i.proteina_g)}</td><td class="n">${r0(i.carboidrato_g)}</td><td class="n">${r0(i.gordura_g)}</td></tr>`).join('')}
      </table>` : ''}
      ${d.comentario ? `<p class="small">${esc(d.comentario)}</p>` : ''}
      <button class="btn sm" data-act="sobra" ${p.esperando ? 'disabled' : ''}>🍽️ Não comi tudo</button>
      ${chatHTML(p)}
      <div class="muted small" style="margin:14px 0 6px">Valores que vão pro diário (dá pra ajustar na mão):</div>
      <div class="macro-grid">
        ${macroInput('kcal', 'kcal', m.kcal)}${macroInput('prot', 'Prot (g)', m.prot)}
        ${macroInput('carb', 'Carb (g)', m.carb)}${macroInput('gord', 'Gord (g)', m.gord)}
      </div>
      ${botoes}</div>`;
    for (const inp of box.querySelectorAll('.macro-grid input')) {
      inp.addEventListener('input', () => {
        p.macros = { kcal: num($('#f_kcal').value), prot: num($('#f_prot').value), carb: num($('#f_carb').value), gord: num($('#f_gord').value) };
      });
    }
  } else {
    const pp = d.por_porcao || {}, p100 = d.por_100g || {};
    const linhas = [['Energia (kcal)', 'kcal'], ['Proteínas (g)', 'proteina_g'], ['Carboidratos (g)', 'carboidrato_g'], ['Açúcares (g)', 'acucares_g'],
      ['Gorduras (g)', 'gordura_g'], ['Gord. saturada (g)', 'gordura_sat_g'], ['Fibras (g)', 'fibras_g'], ['Sódio (mg)', 'sodio_mg']];
    const v = x => x == null ? '—' : (Math.round(num(x) * 10) / 10).toLocaleString('pt-BR');
    const nota = d.nota_saude;
    if (p.gramas == null) p.gramas = r0(d.porcao_g) || 100;
    box.innerHTML = `<div class="card">
      <div class="row" style="margin-bottom:8px"><img class="thumb" src="${p.thumb}" alt="">
        <div class="grow"><h3>${esc(d.produto || 'Produto')}</h3>
          <span class="muted small">porção: ${esc(d.porcao_desc || (d.porcao_g ? d.porcao_g + ' g' : '?'))}${d.ultraprocessado ? ' · ultraprocessado' : ''}</span></div>
        ${nota != null ? `<div style="text-align:center"><div class="score" style="color:${nota >= 7 ? 'var(--accent)' : nota >= 4 ? '#f0b43e' : 'var(--danger)'}">${r0(nota)}</div><div class="muted small">/10</div></div>` : ''}
      </div>
      <table><tr><th></th><th class="n">porção</th><th class="n">100 g</th></tr>
        ${linhas.map(([n, k]) => `<tr><td>${n}</td><td class="n">${v(pp[k])}</td><td class="n">${v(p100[k])}</td></tr>`).join('')}</table>
      ${(d.alertas || []).map(a => `<div class="alert">⚠️ ${esc(a)}</div>`).join('')}
      ${d.resumo ? `<p class="small">${esc(d.resumo)}</p>` : ''}
      ${chatHTML(p)}
      <label style="margin-top:14px">Quanto você comeu? (gramas)
        <input type="text" inputmode="decimal" id="rotGramas" value="${esc(p.gramas)}"></label>
      <div id="rotCalc" class="muted small"></div>
      ${botoes}</div>`;
    $('#rotGramas').addEventListener('input', e => { p.gramas = num(e.target.value); atualizaRotulo(); });
    atualizaRotulo();
  }
}

function macroInput(id, label, val) {
  return `<label>${label}<input type="text" inputmode="decimal" id="f_${id}" value="${r0(val)}"></label>`;
}

function macrosRotulo() {
  const d = UI.pending.data, g = num(UI.pending.gramas);
  const p100 = d.por_100g || {}, pp = d.por_porcao || {};
  const usa100 = p100.kcal != null;
  const k = usa100 ? g / 100 : (num(d.porcao_g) ? g / num(d.porcao_g) : 0);
  const base = usa100 ? p100 : pp;
  return { kcal: num(base.kcal) * k, prot: num(base.proteina_g) * k, carb: num(base.carboidrato_g) * k, gord: num(base.gordura_g) * k };
}

function atualizaRotulo() {
  const m = macrosRotulo();
  $('#rotCalc').textContent = `= ${r0(m.kcal)} kcal · P ${r0(m.prot)} g · C ${r0(m.carb)} g · G ${r0(m.gord)} g`;
}

function salvarComida() {
  const p = UI.pending;
  let m, titulo;
  if (p.modo === 'prato') {
    m = { kcal: num($('#f_kcal').value), prot: num($('#f_prot').value), carb: num($('#f_carb').value), gord: num($('#f_gord').value) };
    titulo = (p.data.titulo || 'Refeição') + (p.data.antes ? ' (parcial)' : '');
  } else {
    m = macrosRotulo();
    titulo = `${p.data.produto || 'Produto'} (${r0(p.gramas)} g)`;
  }
  const reg = {
    tipo: p.modo, titulo, ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)])),
    thumb: p.thumb, detalhes: p.data, chat: p.chat, gramas: p.gramas,
  };
  const existente = p.editId && S.refeicoes.find(r => r.id === p.editId);
  if (existente) Object.assign(existente, reg);
  else {
    const agora = new Date();
    S.refeicoes.push({ id: uid(), data: UI.diaryDate, hora: `${pad(agora.getHours())}:${pad(agora.getMinutes())}`, ...reg });
  }
  save();
  UI.pending = null;
  toast(existente ? 'Refeição atualizada ✔' : 'Salvo no diário ✔');
  renderComida();
}

function renderComida() {
  const dia = UI.diaryDate;
  const refs = S.refeicoes.filter(r => r.data === dia).sort((a, b) => a.hora.localeCompare(b.hora));
  const tot = refs.reduce((a, r) => ({ kcal: a.kcal + num(r.kcal), prot: a.prot + num(r.prot), carb: a.carb + num(r.carb), gord: a.gord + num(r.gord) }),
    { kcal: 0, prot: 0, carb: 0, gord: 0 });
  const metas = S.settings.metas;
  const barra = (lab, k, un) => {
    const meta = num(metas[k]), v = tot[k], pct = meta ? Math.min(100, (v / meta) * 100) : 0;
    return `<div><div class="row between small"><span>${lab}</span><span class="muted">${r0(v)}${meta ? ' / ' + r0(meta) : ''} ${un}</span></div>
      <div class="bar ${meta && v > meta ? 'over' : ''}"><i style="width:${pct}%"></i></div></div>`;
  };
  const ehHoje = dia === hojeISO();
  const pc = perfilCalc();
  const rs = diaResumo(dia);
  const saldoHTML = pc.base ? `<div class="saldo">
      <div class="row between small"><span>Gasto estimado ${ehHoje ? 'hoje' : 'no dia'}</span><b>${fmt(rs.gasto)} kcal</b></div>
      <div class="muted small">dia normal ${fmt(baixo(pc.base))} + treino ${fmt(baixo(rs.treino))}</div>
      <div class="row between" style="margin-top:6px"><span>Saldo${ehHoje ? ' até agora' : ''}</span>
        <b class="${rs.saldo <= 0 ? 'txt-ok' : 'txt-warn'}">${saldoTxt(rs.saldo)}</b></div>
      ${rs.prec != null ? `<div class="muted small">precisão estimada do dia: ${rs.prec}%</div>` : ''}</div>`
    : faltaPerfilHTML(pc);

  $('#tab-comida').innerHTML = `
    <div class="card">
      <h3>Analisar com IA</h3>
      <div class="seg">
        <label class="btn big" style="margin:0"><span>📷</span>Foto do prato<input type="file" accept="image/*" data-modo="prato" hidden></label>
        <label class="btn big" style="margin:0"><span>🏷️</span>Foto do rótulo<input type="file" accept="image/*" data-modo="rotulo" hidden></label>
      </div>
      <textarea id="foodHint" rows="1" style="margin-top:10px" placeholder="Detalhes opcionais (ex: arroz integral, 380 g de comida)"></textarea>
    </div>
    <div id="foodResult"></div>

    <div class="card">
      <div class="row between" style="margin-bottom:10px">
        <button class="icon" data-act="diary" data-dir="-1" aria-label="Dia anterior">◀</button>
        <h3 style="margin:0;text-transform:capitalize">${ehHoje ? 'Hoje' : esc(parseISO(dia).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }))}</h3>
        <button class="icon" data-act="diary" data-dir="1" aria-label="Próximo dia" ${ehHoje ? 'disabled style="opacity:.3"' : ''}>▶</button>
      </div>
      <div class="totals">${barra('Calorias', 'kcal', 'kcal')}${barra('Proteína', 'prot', 'g')}${barra('Carboidrato', 'carb', 'g')}${barra('Gordura', 'gord', 'g')}</div>
      ${saldoHTML}
      <ul class="list" style="margin-top:12px">${refs.map(r => `
        <li>${r.thumb ? `<img class="thumb" src="${r.thumb}" alt="">` : '<div class="thumb">🍴</div>'}
          <div class="grow" data-act="mealView" data-id="${r.id}" style="cursor:pointer">
            <div>${esc(r.titulo)}</div>
            <div class="muted small">${r.hora} · ${r0(r.kcal)} kcal · P${r0(r.prot)} C${r0(r.carb)} G${r0(r.gord)}</div></div>
          <button class="icon danger" data-act="mealDel" data-id="${r.id}" aria-label="Excluir">✕</button></li>`).join('')}
      </ul>
      ${refs.length ? '' : '<p class="muted small">Nada registrado neste dia.</p>'}
      <button class="btn sm ghost" data-act="mealManual">+ Adicionar manualmente</button>
    </div>`;

  for (const inp of document.querySelectorAll('#tab-comida input[type=file]')) {
    inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f) analisar(f, inp.dataset.modo); });
  }
  renderResultado();
}

// reabre uma refeição salva no cartão de resultado (pra conversar ou descontar sobra)
function editarRefeicao(r) {
  UI.pending = {
    modo: r.tipo, data: JSON.parse(JSON.stringify(r.detalhes)), thumb: r.thumb, chat: [...(r.chat || [])],
    editId: r.id, gramas: r.gramas,
    macros: r.tipo === 'prato' ? { kcal: r.kcal, prot: r.prot, carb: r.carb, gord: r.gord } : undefined,
  };
  closeModal();
  renderResultado();
  $('#foodResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function verRefeicao(r) {
  const d = r.detalhes;
  const editavel = d && (r.tipo === 'prato' || r.tipo === 'rotulo') && r.thumb;
  let corpo = '';
  if (r.tipo === 'prato' && d?.itens) {
    corpo = `<ul class="list">${d.itens.map(i => `<li><div class="grow">${esc(i.nome)}<div class="muted small">${esc(i.porcao)}</div></div><span class="small">${r0(i.kcal)} kcal</span></li>`).join('')}</ul>
      ${d.comentario ? `<p class="small">${esc(d.comentario)}</p>` : ''}`;
  } else if (r.tipo === 'rotulo' && d) {
    corpo = `${(d.alertas || []).map(a => `<div class="alert">⚠️ ${esc(a)}</div>`).join('')}${d.resumo ? `<p class="small">${esc(d.resumo)}</p>` : ''}`;
  }
  openModal(`<div class="row" style="margin-bottom:10px">${r.thumb ? `<img class="thumb" src="${r.thumb}" alt="">` : ''}<h3 class="grow" style="margin:0">${esc(r.titulo)}</h3></div>
    <p class="small">${r0(r.kcal)} kcal · Proteína ${r0(r.prot)} g · Carbo ${r0(r.carb)} g · Gordura ${r0(r.gord)} g</p>
    ${corpo}
    <div class="row end" style="margin-top:12px">
      ${editavel && r.tipo === 'prato' ? `<button class="btn sm" data-act="mealSobra" data-id="${r.id}">🍽️ Não comi tudo</button>` : ''}
      ${editavel ? `<button class="btn sm" data-act="mealEdit" data-id="${r.id}">💬 Abrir e conversar</button>` : ''}
      <button class="btn sm ghost" data-act="modalClose">Fechar</button></div>`);
}

/* ================= ABA 4: RESUMO ================= */

const precTxt = p => p == null ? '' : `precisão ${p}%`;
const saldoCurto = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;

function calendarioHTML() {
  const hoje = hojeISO(), mesAtual = hoje.slice(0, 7);
  const mes = UI.calMes || mesAtual;
  const [y, m] = mes.split('-').map(Number);
  const primeiro = new Date(y, m - 1, 1), nDias = new Date(y, m, 0).getDate();
  let cells = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => `<div class="cal-h">${d}</div>`).join('');
  for (let i = 0; i < primeiro.getDay(); i++) cells += '<div></div>';
  for (let d = 1; d <= nDias; d++) {
    const iso = `${mes}-${pad(d)}`;
    if (iso > hoje) { cells += `<div class="cal-d fut"><b>${d}</b></div>`; continue; }
    const r = diaResumo(iso);
    const tem = r.temComida && r.saldo != null;
    const alfa = tem ? (0.18 + Math.min(1, Math.abs(r.saldo) / 800) * 0.55).toFixed(2) : 0;
    cells += `<button class="cal-d${iso === hoje ? ' hoje' : ''}" data-act="diaDet" data-date="${iso}"
      style="${tem ? `background:rgba(${r.saldo <= 0 ? '57,211,83' : '240,136,62'},${alfa})` : ''}">
      <b>${d}</b>${tem ? `<small>${saldoCurto(r.saldo)}</small>` : ''}${r.treinos.length ? '<i class="cal-t"></i>' : ''}</button>`;
  }
  const nome = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return `<div class="row between" style="margin-bottom:8px">
      <button class="icon" data-act="calNav" data-dir="-1" aria-label="Mês anterior">◀</button>
      <h3 style="margin:0;text-transform:capitalize">${nome}</h3>
      <button class="icon" data-act="calNav" data-dir="1" aria-label="Próximo mês" ${mes >= mesAtual ? 'disabled style="opacity:.3"' : ''}>▶</button></div>
    <div class="cal">${cells}</div>
    <div class="legend"><span><i style="background:rgba(57,211,83,.6)"></i>déficit</span><span><i style="background:rgba(240,136,62,.6)"></i>superávit</span>
      <span><i class="cal-t" style="position:static;display:inline-block"></i> treinou</span></div>`;
}

function diaDetalhe(data) {
  const r = diaResumo(data);
  openModal(`<h3 style="text-transform:capitalize">${esc(fmtData(data))}</h3>
    ${r.saldo != null && r.temComida ? `<div class="big ${r.saldo <= 0 ? 'txt-ok' : 'txt-warn'}" style="margin-top:0">${saldoTxt(r.saldo)}</div>` : ''}
    ${r.prec != null ? `<p class="small">Precisão estimada do dia: <b>${r.prec}%</b></p>` : ''}
    <h3 style="margin:12px 0 4px;font-size:.95rem">Consumido: ${fmt(r.cons)} kcal ${r.precCons != null ? `<span class="muted small">(${precTxt(r.precCons)})</span>` : ''}</h3>
    ${r.refs.length ? `<ul class="list">${r.refs.map(x => `<li><div class="grow">${esc(x.titulo)}<div class="muted small">${x.hora} · ${precTxt(precRefeicao(x))}</div></div><span class="small">${r0(x.kcal)} kcal</span></li>`).join('')}</ul>`
      : '<p class="muted small">Nenhuma refeição registrada.</p>'}
    <h3 style="margin:12px 0 4px;font-size:.95rem">Gasto: ${r.gasto != null ? fmt(r.gasto) + ' kcal' : '—'} ${r.precGasto != null ? `<span class="muted small">(${precTxt(r.precGasto)})</span>` : ''}</h3>
    <ul class="list">
      ${r.base ? `<li><div class="grow">Dia normal (TMB + rotina)</div><span class="small">${fmt(baixo(r.base))} kcal</span></li>` : ''}
      ${r.treinos.map(t => `<li><span class="dot" style="--cor:${t.l.cor}"></span><div class="grow">${esc(t.l.nome)}<div class="muted small">${precTxt(precTreino(t.l))}</div></div><span class="small">~${fmt(baixo(t.k))} kcal</span></li>`).join('')}
    </ul>
    <p class="muted small">A precisão é uma estimativa: fotos claras, rótulos e pesagem aumentam; atividades descritas de memória diminuem.</p>
    <div class="row end"><button class="btn ghost" data-act="modalClose">Fechar</button></div>`);
}

function renderResumo() {
  const pc = perfilCalc();
  const hoje = hojeISO();
  const h = diaResumo(hoje);
  const n = UI.periodo;
  const dias = [];
  for (let i = n; i >= 1; i--) dias.push(diaResumo(addDias(hoje, -i))); // hoje fica de fora: o dia ainda não acabou
  const ok = dias.filter(d => d.temComida && d.saldo != null);
  const media = k => ok.length ? ok.reduce((a, d) => a + d[k], 0) / ok.length : 0;
  const soma = ok.reduce((a, d) => a + d.saldo, 0);
  const deficit = ok.filter(d => d.saldo < 0).length;
  const semana = [];
  for (let i = 0; i <= 6; i++) semana.push(diaResumo(addDias(hoje, -i)));

  const logs30 = S.logs.filter(l => l.data > addDias(hoje, -30));
  const kc = pc.peso ? logs30.map(l => ({ l, k: kcalTreino(l, pc.peso) })) : [];
  const porTipo = {};
  for (const { l, k } of kc) (porTipo[l.nome] ||= { cor: l.cor, ks: [] }).ks.push(k);

  $('#tab-resumo').innerHTML = `
    <div class="card">
      <div class="row between"><span class="muted small">Hoje (até agora)</span><span class="muted small">${precTxt(h.prec)}</span></div>
      ${pc.base ? `
        ${h.temComida ? `<div class="big ${h.saldo <= 0 ? 'txt-ok' : 'txt-warn'}">${saldoTxt(h.saldo)}</div>`
          : '<p class="muted small">Nenhuma refeição registrada hoje ainda.</p>'}
        <div class="row between small"><span>Consumido</span><b>${fmt(h.cons)} kcal</b></div>
        <div class="row between small"><span>Gasto estimado do dia</span><b>${fmt(h.gasto)} kcal</b></div>
        <div class="muted small">= dia normal ${fmt(baixo(pc.base))} + treinos ${fmt(baixo(h.treino))}</div>`
      : faltaPerfilHTML(pc)}
    </div>

    <div class="card">
      <h3>Última semana</h3>
      <ul class="list">${semana.map(d => `
        <li class="pick" data-act="diaDet" data-date="${d.data}">
          <div class="grow"><b style="text-transform:capitalize">${d.data === hoje ? 'Hoje' : parseISO(d.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</b>
            <div class="muted small">${d.temComida ? `comeu ${fmt(d.cons)}` : 'sem refeições'}${d.gasto != null ? ` · gastou ${fmt(d.gasto)}` : ''}${d.treinos.length ? ' · 🏋️' : ''}</div></div>
          <div style="text-align:right">${d.temComida && d.saldo != null ? `<b class="${d.saldo <= 0 ? 'txt-ok' : 'txt-warn'}">${saldoCurto(d.saldo)}</b>` : '<span class="muted">—</span>'}
            <div class="muted small">${precTxt(d.prec)}</div></div></li>`).join('')}</ul>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:10px"><h3 style="margin:0">Balanço</h3>
        <div class="row">${[7, 14, 30].map(p => `<button class="chip ${p === n ? 'sel' : ''}" data-act="periodo" data-n="${p}">${p} dias</button>`).join('')}</div></div>
      ${!pc.base ? faltaPerfilHTML(pc) : !ok.length ? '<p class="muted small">Registre suas refeições na aba Comida pra ver o balanço. Dias sem nenhuma refeição registrada não entram na conta.</p>' : `
        <div class="stats" style="margin-bottom:10px">
          <div class="stat"><b>${fmt(media('cons'))}</b><span>consumo médio</span></div>
          <div class="stat"><b>${fmt(media('gasto'))}</b><span>gasto médio</span></div>
          <div class="stat"><b class="${soma <= 0 ? 'txt-ok' : 'txt-warn'}">${media('saldo') > 0 ? '+' : ''}${fmt(media('saldo'))}</b><span>saldo médio/dia</span></div>
          <div class="stat"><b>${deficit}/${ok.length}</b><span>dias em déficit</span></div>
        </div>
        <p class="small" style="margin-bottom:0">No período: <b>${saldoTxt(soma)}</b>, ≈ ${pesoTxt(Math.abs(soma) / 7700)} de gordura ${soma <= 0 ? 'a menos' : 'a mais'}.
          ${ok.some(d => d.prec != null) ? `Precisão média: ${baixo(ok.reduce((a, d) => a + (d.prec || 0), 0) / ok.length)}%.` : ''}</p>
        <p class="muted small">Não conta hoje (o dia ainda não acabou). Estimativas arredondadas pra baixo.</p>`}
    </div>

    <div class="card">${calendarioHTML()}</div>

    <div class="card">
      <h3>Treinos e atividades (últimos 30 dias)</h3>
      ${!pc.peso ? faltaPerfilHTML(pc) : !kc.length ? '<p class="muted small">Nenhum treino nos últimos 30 dias.</p>' : `
        <div class="stats" style="grid-template-columns:repeat(3,1fr)">
          <div class="stat"><b>${kc.length}</b><span>registros</span></div>
          <div class="stat"><b>${fmt(baixo(kc.reduce((a, x) => a + x.k, 0) / kc.length))}</b><span>kcal por registro</span></div>
          <div class="stat"><b>${fmt(baixo(kc.reduce((a, x) => a + x.k, 0)))}</b><span>kcal no total</span></div>
        </div>
        <ul class="list">${Object.entries(porTipo).map(([nome, t]) => `
          <li><span class="dot" style="--cor:${t.cor}"></span><div class="grow">${esc(nome)} <span class="muted small">(${t.ks.length}×)</span></div>
          <span class="small">~${fmt(baixo(t.ks.reduce((a, b) => a + b, 0) / t.ks.length))} kcal</span></li>`).join('')}</ul>
        <p class="muted small">Só conta o que passa do gasto em repouso (que já está no "dia normal") e só os exercícios marcados como feitos.</p>`}
    </div>

    <div class="card">
      <div class="row between"><h3 style="margin:0">Meu corpo</h3><button class="btn sm ghost" data-act="tab" data-tab="perfil">Perfil ›</button></div>
      ${pc.imc ? `<div class="row between small"><span>IMC</span><b>${(Math.floor(pc.imc * 10) / 10).toLocaleString('pt-BR')} (${imcCat(pc.imc)})</b></div>` : ''}
      ${pc.tmb ? `<div class="row between small"><span>TMB (gasto em repouso)</span><b>${fmt(baixo(pc.tmb))} kcal</b></div>
        <div class="row between small"><span>Dia normal, sem treino</span><b>${fmt(baixo(pc.base))} kcal</b></div>
        <div class="muted small">Fórmula: ${pc.formula}</div>` : faltaPerfilHTML(pc)}
    </div>

    <div class="card">
      <h3>📄 Relatório com gráficos</h3>
      <p class="muted small">Junta peso, TMB, consumo, gasto, saldo, treinos e precisão num arquivo. Pra PDF: toque em "Abrir pra PDF" e escolha <b>Salvar como PDF</b> na tela de impressão.</p>
      <div class="row" style="margin-bottom:10px">${[30, 90, 365].map(p => `<button class="chip ${p === UI.relDias ? 'sel' : ''}" data-act="relDias" data-n="${p}">${p === 365 ? '1 ano' : p + ' dias'}</button>`).join('')}</div>
      <div class="row"><button class="btn sm primary" data-act="relPDF">🖨️ Abrir pra PDF</button><button class="btn sm" data-act="relBaixar">⬇ Baixar HTML</button></div>
    </div>`;
}

/* ---------------- relatório (HTML autocontido, imprimível) ---------------- */

function relatorioHTML(nDias) {
  const hoje = hojeISO(), ini = addDias(hoje, -nDias);
  const pc = perfilCalc();
  const dias = [];
  for (let i = nDias; i >= 0; i--) dias.push(diaResumo(addDias(hoje, -i)));
  const ok = dias.filter(d => d.temComida && d.saldo != null && d.data < hoje);
  const med = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : 0;
  const soma = ok.reduce((a, d) => a + d.saldo, 0);
  const pesos = S.pesos.filter(p => p.data >= ini).sort((a, b) => a.data.localeCompare(b.data));
  const hist = (S.historico || []).filter(h => h.data >= ini);
  const logs = S.logs.filter(l => l.data >= ini);
  const porTipo = {};
  for (const l of logs) (porTipo[l.nome] ||= []).push(kcalTreino(l, pcDoDia(l.data).peso) || 0);
  const diasComida = dias.filter(d => d.temComida);
  const macro = k => med(diasComida, d => d.refs.reduce((a, r) => a + num(r[k]), 0));
  const linhas = [...dias].reverse().filter(d => d.temComida || d.treinos.length);
  const sec = (t, c) => c ? `<section><h2>${t}</h2>${c}</section>` : '';
  const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FitTracker: relatório ${dataCurta(ini)} a ${dataCurta(hoje)}</title>
<style>
  body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2328;background:#fff;max-width:820px;margin:0 auto;padding:24px 16px}
  h1{font-size:1.5rem;margin:0}h2{font-size:1.1rem;margin:0 0 8px;border-bottom:2px solid #2da44e;padding-bottom:4px}
  section{margin:22px 0;break-inside:avoid}.muted{color:#656d76}.small{font-size:.85rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
  .kv{display:flex;justify-content:space-between;gap:8px;padding:6px 10px;background:#f6f8fa;border-radius:8px}
  .graf{width:100%;height:auto;display:block}.graf-leg{display:flex;flex-wrap:wrap;gap:12px;font-size:.8rem;color:#656d76;margin-top:4px}
  .graf-leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px}
  table{width:100%;border-collapse:collapse;font-size:.82rem}th,td{padding:5px 6px;border-bottom:1px solid #d0d7de;text-align:right}
  th:first-child,td:first-child{text-align:left}th{color:#656d76;font-weight:600}.ok{color:#1a7f37}.warn{color:#bc4c00}
  .bar{position:sticky;top:0;background:#fff;padding:8px 0;display:flex;gap:8px;justify-content:flex-end}
  button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #d0d7de;background:#2da44e;color:#fff;cursor:pointer}
  @media print{.bar{display:none}body{padding:0}}
</style></head><body>
<div class="bar"><button onclick="print()">🖨️ Salvar como PDF</button></div>
<h1>FitTracker: relatório</h1>
<p class="muted">${parseISO(ini).toLocaleDateString('pt-BR')} a ${parseISO(hoje).toLocaleDateString('pt-BR')} · gerado em ${new Date().toLocaleString('pt-BR')}</p>

${sec('Resumo do período', `<div class="grid">
  ${kv('Dias com refeições', `${ok.length}`)}
  ${kv('Consumo médio', `${fmt(med(ok, d => d.cons))} kcal`)}
  ${kv('Gasto médio', `${fmt(med(ok, d => d.gasto))} kcal`)}
  ${kv('Saldo total', `<span class="${soma <= 0 ? 'ok' : 'warn'}">${saldoTxt(soma)}</span>`)}
  ${kv('Gordura estimada', `${soma <= 0 ? '−' : '+'}${pesoTxt(Math.abs(soma) / 7700)}`)}
  ${kv('Dias em déficit', `${ok.filter(d => d.saldo < 0).length} de ${ok.length}`)}
  ${kv('Treinos/atividades', `${logs.length}`)}
  ${kv('Precisão média', ok.length ? `${baixo(med(ok, d => d.prec || 0))}%` : '—')}
  ${kv('Proteína média', `${fmt(macro('prot'))} g/dia`)}
  ${kv('Carboidrato médio', `${fmt(macro('carb'))} g/dia`)}
  ${kv('Gordura média', `${fmt(macro('gord'))} g/dia`)}
</div>`)}

${sec('Perfil atual', `<div class="grid">
  ${pc.peso ? kv('Peso', `${kg1(pc.peso)} kg`) : ''}${pc.imc ? kv('IMC', `${kg1(pc.imc)} (${imcCat(pc.imc)})`) : ''}
  ${pc.gordura ? kv('% gordura', `${kg1(pc.gordura)}%`) : ''}${pc.magra ? kv('Massa magra', `${kg1(pc.magra)} kg`) : ''}
  ${pc.tmb ? kv('TMB', `${fmt(baixo(pc.tmb))} kcal`) : ''}${pc.base ? kv('Dia normal', `${fmt(baixo(pc.base))} kcal`) : ''}
</div>${pc.formula ? `<p class="muted small">TMB: ${pc.formula}. Dia normal: ${pc.baseFonte}${pc.cal ? ', calibrado pelo histórico' : ''}.</p>` : ''}`)}

${sec('Peso', svgLinhas([{ nome: 'peso (kg)', cor: '#2da44e', pts: pesos.map(p => [p.data, p.kg]) }], { w: 640, h: 180, un: ' kg' }))}
${sec('TMB e gasto de um dia normal', svgLinhas([
    { nome: 'TMB', cor: '#3b82f6', pts: hist.filter(h => h.tmb).map(h => [h.data, h.tmb]) },
    { nome: 'dia normal', cor: '#2da44e', pts: hist.filter(h => h.base).map(h => [h.data, h.base]) }], { w: 640, h: 180, un: ' kcal' }))}
${sec('Consumo × gasto', svgLinhas([
    { nome: 'consumido', cor: '#f0883e', pts: ok.map(d => [d.data, d.cons]) },
    { nome: 'gasto', cor: '#3b82f6', pts: ok.map(d => [d.data, d.gasto]) }], { w: 640, h: 180, un: ' kcal' }))}
${sec('Saldo diário', ok.length ? svgBarras(ok.map(d => [d.data, d.saldo])) + '<div class="graf-leg"><span><i style="background:#2da44e"></i>déficit</span><span><i style="background:#f0883e"></i>superávit</span></div>' : '')}
${sec('Treinos e atividades', Object.keys(porTipo).length ? `<table><tr><th>Tipo</th><th>Vezes</th><th>kcal média</th><th>kcal total</th></tr>
  ${Object.entries(porTipo).map(([n, ks]) => `<tr><td>${esc(n)}</td><td>${ks.length}</td><td>${fmt(baixo(ks.reduce((a, b) => a + b, 0) / ks.length))}</td><td>${fmt(baixo(ks.reduce((a, b) => a + b, 0)))}</td></tr>`).join('')}</table>` : '')}
${sec('Dia a dia', linhas.length ? `<table><tr><th>Data</th><th>Consumido</th><th>Gasto</th><th>Saldo</th><th>Treinos</th><th>Precisão</th></tr>
  ${linhas.map(d => `<tr><td>${parseISO(d.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
    <td>${d.temComida ? fmt(d.cons) : '—'}</td><td>${d.gasto != null ? fmt(d.gasto) : '—'}</td>
    <td class="${d.saldo <= 0 ? 'ok' : 'warn'}">${d.temComida && d.saldo != null ? saldoCurto(d.saldo) : '—'}</td>
    <td>${esc(d.treinos.map(t => t.l.nome).join(', ')) || '—'}</td><td>${d.prec != null ? d.prec + '%' : '—'}</td></tr>`).join('')}</table>` : '')}

<section class="muted small"><h2>Como os números são calculados</h2>
<p>Gasto do dia = TMB × rotina (ou passos) + treinos marcados como feitos + atividades. Os treinos contam só o que passa do repouso. Dias passados usam o peso e a TMB daquela época.
As contas usam todas as casas decimais; só os resultados são arredondados pra baixo. A precisão é uma estimativa: fotos claras, rótulos e pesagem aumentam; atividades descritas de memória diminuem.
Dias sem refeições registradas não entram nas médias.</p></section>
<script>if (location.hash === '#print') setTimeout(() => print(), 500);</script>
</body></html>`;
}

function relatorioBlob() {
  return URL.createObjectURL(new Blob([relatorioHTML(UI.relDias)], { type: 'text/html' }));
}

/* ================= ABA 5: PERFIL ================= */

function svgLinhas(series, { w = 320, h = 120, un = '' } = {}) {
  const todos = series.flatMap(s => s.pts);
  if (todos.length < 2) return '';
  const ts = todos.map(p => parseISO(p[0]).getTime()), ys = todos.map(p => num(p[1]));
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  let mn = Math.min(...ys), mx = Math.max(...ys);
  if (mx - mn < 1e-6) { mn -= 1; mx += 1; }
  const folga = (mx - mn) * 0.08; mn -= folga; mx += folga;
  const P = 4;
  const x = d => (P + (parseISO(d).getTime() - t0) / ((t1 - t0) || 1) * (w - 2 * P)).toFixed(1);
  const y = v => (P + (mx - num(v)) / (mx - mn) * (h - 2 * P)).toFixed(1);
  return `<svg viewBox="0 0 ${w} ${h}" class="graf" role="img">${series.map(s => !s.pts.length ? '' :
    `<polyline fill="none" stroke="${s.cor}" stroke-width="2" stroke-linejoin="round" points="${s.pts.map(p => `${x(p[0])},${y(p[1])}`).join(' ')}"/>` +
    (s.pts.length <= 40 ? s.pts.map(p => `<circle cx="${x(p[0])}" cy="${y(p[1])}" r="2.5" fill="${s.cor}"/>`).join('') : '')).join('')}</svg>
    <div class="graf-leg">${series.map(s => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join('')}
      <span>${fmt(Math.min(...ys))}–${fmt(Math.max(...ys))}${un}</span></div>`;
}

function svgBarras(pts, { w = 640, h = 140 } = {}) {
  if (!pts.length) return '';
  const max = Math.max(1, ...pts.map(p => Math.abs(p[1])));
  const bw = w / pts.length, meio = h / 2;
  return `<svg viewBox="0 0 ${w} ${h}" class="graf" role="img"><line x1="0" x2="${w}" y1="${meio}" y2="${meio}" stroke="#bbb"/>
    ${pts.map((p, i) => { const a = Math.abs(p[1]) / max * (meio - 2);
      return `<rect x="${(i * bw + bw * 0.15).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" y="${(p[1] > 0 ? meio - a : meio).toFixed(1)}" height="${a.toFixed(1)}" fill="${p[1] > 0 ? '#f0883e' : '#2da44e'}"><title>${dataCurta(p[0])}: ${saldoTxt(p[1])}</title></rect>`; }).join('')}</svg>`;
}

const kg1 = v => (Math.floor(num(v) * 10) / 10).toLocaleString('pt-BR');

function graficoPeso(ps) {
  if (ps.length < 2) return '<p class="muted small">Registre pelo menos 2 pesagens pra ver o gráfico.</p>';
  const u = ps.slice(-60);
  const t0 = parseISO(u[0].data).getTime(), t1 = parseISO(u.at(-1).data).getTime();
  const ks = u.map(p => num(p.kg));
  let mn = Math.min(...ks), mx = Math.max(...ks);
  if (mx - mn < 1) { mn -= 0.5; mx += 0.5; }
  const W = 320, H = 110, P = 6;
  const x = d => P + (parseISO(d).getTime() - t0) / ((t1 - t0) || 1) * (W - 2 * P);
  const y = k => P + (mx - k) / (mx - mn) * (H - 2 * P);
  const pts = u.map(p => `${x(p.data).toFixed(1)},${y(num(p.kg)).toFixed(1)}`);
  const dif = ks.at(-1) - ks[0];
  return `<svg viewBox="0 0 ${W} ${H}" class="peso-graf" role="img" aria-label="Gráfico de peso">
      <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
      ${pts.map(pt => `<circle cx="${pt.split(',')[0]}" cy="${pt.split(',')[1]}" r="3" fill="var(--accent)"/>`).join('')}</svg>
    <div class="row between muted small"><span>${dataCurta(u[0].data)}</span>
      <span>${dif <= 0 ? '−' : '+'}${kg1(Math.abs(dif))} kg no período</span><span>${dataCurta(u.at(-1).data)}</span></div>`;
}

function perfilTopoHTML() {
  const pc = perfilCalc();
  const st = (v, lab) => `<div class="stat"><b>${v}</b><span>${lab}</span></div>`;
  return `<div class="stats" style="grid-template-columns:repeat(3,1fr)">
      ${st(pc.peso ? kg1(pc.peso) : '—', 'peso (kg)')}
      ${st(pc.imc ? kg1(pc.imc) : '—', pc.imc ? 'IMC · ' + imcCat(pc.imc) : 'IMC')}
      ${st(pc.gordura ? kg1(pc.gordura) + '%' : '—', pc.gordura ? 'gordura (' + (pc.gordFonte === 'informado' ? 'informada' : 'medidas') + ')' : 'gordura')}
      ${st(pc.tmb ? fmt(baixo(pc.tmb)) : '—', 'TMB (kcal)')}
      ${st(pc.base ? fmt(baixo(pc.base)) : '—', 'dia normal (kcal)')}
      ${st(pc.magra ? kg1(pc.magra) : '—', 'massa magra (kg)')}
    </div>
    ${pc.tmb ? `<div class="muted small">TMB: ${pc.formula}. Dia normal: ${pc.baseFonte}${pc.cal ? `, calibrado ×${String(Math.round(pc.cal * 1000) / 1000).replace('.', ',')}` : ''}.</div>` : ''}
    ${pc.falta.length ? `<div class="muted small">Falta pra calcular: ${pc.falta.join(', ')}.</div>` : ''}`;
}

function medidasHTML() {
  const pc = perfilCalc(), est = gorduraMedidas(S.perfil, pc.alt);
  if (est > 2 && est < 70) return `Pelas medidas: <b>${kg1(est)}% de gordura</b>${num(S.perfil.gordura) ? ' (está usando o valor informado acima)' : ' (já está sendo usado nas contas)'}`;
  return '<span class="muted">Preencha sexo, altura, cintura e pescoço (e quadril, se mulher) pra estimar.</span>';
}

function calibracaoHTML() {
  const c = calibracao(), cal = num(S.perfil.fatorCal);
  if (!c.ok) return `<p class="muted small">Pra calibrar falta: ${c.falta.join('; ')}.</p>
    ${cal ? `<p class="small">Calibração atual: ×${String(cal).replace('.', ',')} <button class="btn sm ghost" data-act="calRemover">Remover</button></p>` : ''}`;
  return `<div class="row between small"><span>Gasto estimado pelas fórmulas</span><b>${fmt(baixo(c.est))} kcal/dia</b></div>
    <div class="row between small"><span>Gasto medido (comida × peso real)</span><b>${fmt(baixo(c.medido))} kcal/dia</b></div>
    <div class="muted small">${c.dias} dias com refeições e ${c.pesagens} pesagens; peso ${c.inc <= 0 ? 'caindo' : 'subindo'} ${kg1(Math.abs(c.inc * 7))} kg/semana.</div>
    <div class="row" style="margin-top:8px">
      <button class="btn sm primary" data-act="calAplicar" data-f="${c.fator}">Usar gasto medido (×${String(Math.round(c.fator * 1000) / 1000).replace('.', ',')})</button>
      ${cal ? '<button class="btn sm ghost" data-act="calRemover">Remover calibração</button>' : ''}</div>
    <p class="muted small">Só funciona bem se você registrar tudo que come nesses dias. O ajuste fica limitado a ±20%.</p>`;
}

function objetivoHTML() {
  const pc = perfilCalc(), m = sugestaoMetas(pc);
  if (!m) return faltaPerfilHTML(pc);
  return `<div class="row between small"><span>Manutenção (dia normal + média de treino)</span><b>${fmt(m.manut)} kcal</b></div>
    <div class="row between small"><span>Meta sugerida</span><b>${fmt(m.kcal)} kcal</b></div>
    <div class="muted small">Proteína ${m.prot} g · Carbo ${m.carb} g · Gordura ${m.gord} g</div>
    ${m.abaixoTmb ? '<div class="alert">⚠️ A meta ficou abaixo da sua TMB. Considere um ritmo mais lento.</div>' : ''}
    <button class="btn sm" data-act="metasAplicar" style="margin-top:8px">Usar como metas da aba Comida</button>`;
}

function atualizaPerfilDinamico() {
  for (const [id, fn] of [['perfilTopo', perfilTopoHTML], ['medidasRes', medidasHTML], ['calRes', calibracaoHTML], ['objRes', objetivoHTML]]) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = fn();
  }
}

function renderPerfil() {
  const pf = S.perfil, s = S.settings;
  const ps = [...S.pesos].sort((a, b) => a.data.localeCompare(b.data));
  const sel = (k, v) => String(pf[k]) === v ? 'selected' : '';
  $('#tab-perfil').innerHTML = `
    ${window.FIREBASE_CONFIG ? `<div class="card"><h3>Conta</h3><div id="contaCard">${typeof contaHTML === 'function' ? contaHTML() : ''}</div></div>` : ''}
    ${UI.adminAberto && typeof adminHTML === 'function' ? `<div class="card">${adminHTML()}</div>` : ''}
    <div class="card"><h3>Meu corpo hoje</h3><div id="perfilTopo"></div></div>

    <div class="card">
      <h3>Peso</h3>
      <div class="row" style="flex-wrap:nowrap">
        <input type="text" inputmode="decimal" id="pesoKg" placeholder="kg" style="flex:1">
        <input type="date" id="pesoData" value="${hojeISO()}" max="${hojeISO()}" style="flex:1.3">
        <button class="btn primary" data-act="pesoAdd">Registrar</button>
      </div>
      <p class="muted small">Dica: pese sempre no mesmo horário (ao acordar, depois do banheiro).</p>
      ${graficoPeso(ps)}
      ${ps.length ? `<details style="margin-top:8px"><summary>Pesagens (${ps.length})</summary><ul class="list">${[...ps].reverse().map(p => `
        <li><div class="grow">${dataCurta(p.data)}</div><b>${kg1(p.kg)} kg</b>
        <button class="icon danger" data-act="pesoDel" data-d="${p.data}" aria-label="Remover">✕</button></li>`).join('')}</ul></details>` : ''}
    </div>

    <div class="card">
      <h3>Evolução do perfil</h3>
      <p class="muted small">Todo dia que você abre o app ele guarda seu peso, TMB e gasto do dia. Dias passados usam os valores daquela época.</p>
      ${(S.historico || []).length >= 2 ? svgLinhas([
        { nome: 'TMB', cor: '#3b82f6', pts: S.historico.filter(h => h.tmb).map(h => [h.data, h.tmb]) },
        { nome: 'dia normal', cor: '#39d353', pts: S.historico.filter(h => h.base).map(h => [h.data, h.base]) },
      ], { un: ' kcal' }) + (S.historico.some(h => h.gordura) ? svgLinhas([{ nome: '% gordura', cor: '#f59e0b', pts: S.historico.filter(h => h.gordura).map(h => [h.data, h.gordura]) }], { h: 80, un: '%' }) : '')
      : '<p class="muted small">O gráfico aparece a partir do segundo dia com perfil preenchido.</p>'}
    </div>

    <div class="card">
      <h3>Dados pessoais</h3>
      <div class="perfil-grid">
        <label>Sexo<select data-perfil="sexo">
          <option value="">Prefiro não dizer</option>
          <option value="m" ${sel('sexo', 'm')}>Masculino</option>
          <option value="f" ${sel('sexo', 'f')}>Feminino</option></select></label>
        <label>Nascimento<input type="date" data-perfil="nascimento" value="${esc(pf.nascimento)}"></label>
        <label>Altura (cm)<input type="text" inputmode="decimal" data-perfil="altura" value="${esc(pf.altura)}" placeholder="175"></label>
        <label>Passos/dia (média)<input type="text" inputmode="decimal" data-perfil="passos" value="${esc(pf.passos)}" placeholder="opcional"></label>
      </div>
      <label>Rotina fora da academia <span class="muted">(usada se não informar passos)</span><select data-perfil="atividade">
        ${ATIVIDADES.map(([v, t]) => `<option value="${v}" ${sel('atividade', v)}>${t}</option>`).join('')}</select></label>
      <p class="muted small">Passos você vê no app de saúde do celular (média da semana). É mais preciso que escolher a rotina.</p>
    </div>

    <div class="card">
      <h3>Composição corporal</h3>
      <label>% de gordura <span class="muted">(se souber, de bioimpedância ou avaliação)</span>
        <input type="text" inputmode="decimal" data-perfil="gordura" value="${esc(pf.gordura)}" placeholder="opcional"></label>
      <div class="muted small" style="margin-bottom:6px">Ou estime pelas medidas, com fita métrica, em cm:</div>
      <div class="perfil-grid" style="grid-template-columns:repeat(3,1fr)">
        <label>Cintura<input type="text" inputmode="decimal" data-perfil="cintura" value="${esc(pf.cintura)}" placeholder="no umbigo"></label>
        <label>Pescoço<input type="text" inputmode="decimal" data-perfil="pescoco" value="${esc(pf.pescoco)}"></label>
        <label>Quadril<input type="text" inputmode="decimal" data-perfil="quadril" value="${esc(pf.quadril)}" placeholder="mulheres"></label>
      </div>
      <div id="medidasRes" class="small"></div>
    </div>

    <div class="card">
      <h3>Calibração pelo seu histórico</h3>
      <p class="muted small">As fórmulas são médias populacionais. Com seu peso real e o que você comeu, dá pra medir o <b>seu</b> gasto.</p>
      <div id="calRes"></div>
    </div>

    <div class="card">
      <h3>Objetivo</h3>
      <div class="perfil-grid">
        <label>Quero<select data-perfil="objetivo">
          <option value="perder" ${sel('objetivo', 'perder')}>Perder gordura</option>
          <option value="manter" ${sel('objetivo', 'manter')}>Manter</option>
          <option value="ganhar" ${sel('objetivo', 'ganhar')}>Ganhar massa</option></select></label>
        <label>Ritmo<select data-perfil="ritmo">
          ${['0.25', '0.5', '0.75', '1'].map(v => `<option value="${v}" ${sel('ritmo', v)}>${v.replace('.', ',')} kg/semana</option>`).join('')}</select></label>
      </div>
      <div id="objRes"></div>
    </div>

    <div class="card">
      <h3>Metas diárias</h3>
      <div class="macro-grid">
        <label>kcal<input type="text" inputmode="decimal" data-meta="kcal" value="${esc(s.metas.kcal)}"></label>
        <label>Prot (g)<input type="text" inputmode="decimal" data-meta="prot" value="${esc(s.metas.prot)}"></label>
        <label>Carb (g)<input type="text" inputmode="decimal" data-meta="carb" value="${esc(s.metas.carb)}"></label>
        <label>Gord (g)<input type="text" inputmode="decimal" data-meta="gord" value="${esc(s.metas.gord)}"></label>
      </div>
    </div>

    <details class="card" id="cfgDetails" ${!s.apiKey || UI.abrirConfig ? 'open' : ''}>
      <summary><b>⚙️ Configurações</b> <span class="muted small">(chave do Gemini, backup)</span></summary>
      <h3 style="margin-top:14px">Gemini (IA)</h3>
      <p class="muted small">Cada pessoa usa a própria chave (grátis). Ela fica salva <b>só neste aparelho</b> (não vai pra nuvem) e o uso conta na cota de quem criou. Em outro celular, cole de novo.</p>
      <details style="margin-bottom:12px"><summary>Como pegar minha chave (1 minuto)</summary>
        <ol class="small">
          <li>Abra <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color:var(--accent)">aistudio.google.com/apikey</a> e entre com sua conta Google.</li>
          <li>Toque em <b>Criar chave de API</b> (se pedir, crie um projeto novo, por exemplo "FitTracker").</li>
          <li>Copie a chave (começa com <code>AIza</code>) e cole no campo abaixo.</li>
          <li>Toque em <b>Testar chave</b>. Pronto.</li>
        </ol>
        <p class="muted small">Não precisa cadastrar cartão. Sem cartão, o uso é sempre grátis: se passar do limite do dia, o app só avisa e volta a funcionar depois.</p>
      </details>
      <label>Chave da API
        <div class="row" style="margin-top:4px;flex-wrap:nowrap">
          <input type="password" id="cfgKey" value="${esc(s.apiKey)}" placeholder="AIza..." autocomplete="off">
          <button class="btn sm" data-act="toggleKey" type="button">👁</button></div></label>
      <label>Modelo
        <input type="text" id="cfgModel" list="modelos" value="${esc(s.model)}"></label>
      <datalist id="modelos"><option value="${MODELO_PADRAO}"></datalist>
      <button class="btn sm" data-act="testKey">Testar chave e listar modelos</button>
      <div id="keyStatus" class="muted small" style="margin-top:8px"></div>

      <h3 style="margin-top:18px">Backup</h3>
      <p class="muted small">Os dados ficam só neste navegador. Exporte de vez em quando para não perder nada (ou para passar para outro celular).</p>
      <div class="row">
        <button class="btn sm" data-act="exportData">⬇ Exportar backup</button>
        <label class="btn sm" style="margin:0;color:var(--txt)">⬆ Importar backup<input type="file" id="importFile" accept="application/json,.json" hidden></label>
        <button class="btn sm danger" data-act="wipe">Apagar tudo</button>
      </div>
      <h3 style="margin-top:18px">Simulação</h3>
      <p class="muted small">Carrega ~2 meses de dados de exemplo pra ver todas as telas funcionando. Seus dados reais ficam guardados e voltam quando você sair da simulação.</p>
      <button class="btn sm" data-act="demoCarregar" ${S.demo ? 'disabled' : ''}>🧪 Carregar dados simulados</button>
      <p class="muted small" style="text-align:center">${S.logs.length} treinos · ${S.refeicoes.length} refeições · ${S.pesos.length} pesagens · ${S.splits.length} modelos</p>
    </details>`;
  UI.abrirConfig = false;

  $('#cfgKey').addEventListener('change', e => { S.settings.apiKey = e.target.value.trim(); save(); toast('Chave salva'); });
  $('#cfgModel').addEventListener('change', e => { S.settings.model = e.target.value.trim().replace(/^models\//, '') || MODELO_PADRAO; save(); toast('Modelo salvo'); });
  for (const inp of document.querySelectorAll('[data-meta]')) {
    inp.addEventListener('change', () => { S.settings.metas[inp.dataset.meta] = num(inp.value); save(); });
  }
  for (const inp of document.querySelectorAll('[data-perfil]')) {
    const salvar = () => { S.perfil[inp.dataset.perfil] = inp.value; save(); atualizaPerfilDinamico(); };
    inp.addEventListener('input', salvar);
    inp.addEventListener('change', salvar);
  }
  $('#importFile').addEventListener('change', importar);
  atualizaPerfilDinamico();
}

async function testarChave() {
  S.settings.apiKey = $('#cfgKey').value.trim(); save();
  const st = $('#keyStatus');
  if (!S.settings.apiKey) { st.textContent = 'Cole a chave primeiro.'; return; }
  st.textContent = 'Testando…';
  try {
    const nomes = await listarModelos();
    $('#modelos').innerHTML = nomes.map(n => `<option value="${esc(n)}">`).join('');
    if (!nomes.includes(S.settings.model)) { S.settings.model = melhorModelo(nomes) || MODELO_PADRAO; save(); }
    await gemini([{ text: 'Responda só com o JSON {"ok": true}' }]); // chamada real: confirma que o modelo responde
    $('#cfgModel').value = S.settings.model;
    st.innerHTML = `✅ Chave funcionando com o modelo <b>${esc(S.settings.model)}</b>. ${nomes.length} modelos disponíveis.`;
  } catch (e) {
    st.innerHTML = `<span style="color:var(--danger)">❌ ${esc(e.message)}</span>`;
  }
}

function exportar() {
  const blob = new Blob([JSON.stringify({ ...S, settings: { ...S.settings, apiKey: '' } }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fittracker-backup-${hojeISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function importar(e) {
  const f = e.target.files[0];
  if (!f) return;
  f.text().then(txt => {
    const d = JSON.parse(txt);
    if (!Array.isArray(d.splits) || !Array.isArray(d.logs)) throw new Error('Arquivo não parece um backup do FitTracker.');
    if (!confirm(`Importar backup com ${d.logs.length} treinos e ${(d.refeicoes || []).length} refeições? Os dados atuais serão substituídos.`)) return;
    const key = S.settings.apiKey;
    S = { ...seed(), ...d, settings: { ...seed().settings, ...d.settings, apiKey: d.settings?.apiKey || key }, perfil: { ...seed().perfil, ...d.perfil },
      pesos: d.pesos || [], historico: d.historico || [] };
    save(); toast('Backup importado ✔'); render();
  }).catch(err => toast(err.message));
}

/* ================= ações (cliques) ================= */

const ACTIONS = {
  tab: el => setTab(el.dataset.tab),
  modalClose: closeModal,

  // frequência
  cell: el => openDaySheet(el.dataset.date),
  logAdd: el => {
    const data = el.dataset.date, sp = activeSplit();
    const dia = sp?.dias.find(d => d.id === el.dataset.dia);
    if (dia) { addLog(data, sp.id, dia); openDaySheet(data); render(); return; }
    formModal({
      title: 'Treino avulso', saveLabel: 'Registrar',
      fields: [{ name: 'nome', label: 'O que você fez?', required: true, placeholder: 'ex: Cardio, Futebol, Natação' },
        { name: 'minutos', label: 'Quantos minutos?', type: 'number', placeholder: '45' }],
      onSave: v => { addLog(data, null, null, v); setTimeout(() => { openDaySheet(data); render(); }); }
    });
  },
  logEdit: el => {
    const l = S.logs.find(x => x.id === el.dataset.id); if (!l) return;
    if (!l.diaId) {
      formModal({
        title: 'Editar treino avulso',
        fields: [{ name: 'nome', label: 'O que você fez?', value: l.nome, required: true }, { name: 'minutos', label: 'Minutos', type: 'number', value: l.minutos }],
        onSave: v => { l.nome = v.nome; l.minutos = num(v.minutos); save(); setTimeout(() => { openDaySheet(l.data); render(); }); }
      });
      return;
    }
    const copia = JSON.parse(JSON.stringify(l));
    S.rascunho = { ...copia, exercicios: copia.exercicios || exerciciosDoModelo(l), chat: copia.chat || [], editId: l.id };
    delete S.rascunho.id;
    save(); closeModal(); setTab('freq');
  },
  sxStart: () => { const d = proximoDia(); if (!d) return; S.rascunho = novaSessao(d, activeSplit().id); save(); renderFreq(); },
  sxToggle: el => { const r = garantirRascunho(); const e = r.exercicios[+el.dataset.i]; e.feito = !e.feito; save(); renderFreq(); },
  sxAll: () => {
    const r = garantirRascunho(); const todos = r.exercicios.every(e => e.feito);
    for (const e of r.exercicios) e.feito = !todos;
    save(); renderFreq();
  },
  sxEdit: el => {
    const r = garantirRascunho(); const e = r.exercicios[+el.dataset.i];
    formModal({
      title: `${e.nome}: o que você fez`,
      fields: [{ name: 'series', label: 'Séries', value: e.series }, { name: 'reps', label: 'Repetições', value: e.reps },
        { name: 'carga', label: 'Carga', value: e.carga }, { name: 'nota', label: 'Observação', value: e.nota, placeholder: 'ex: última série até a falha' }],
      onSave: v => { Object.assign(e, v, { feito: true }); save(); renderFreq(); }
    });
  },
  sxExtra: () => formModal({
    title: 'Exercício extra (feito hoje)', saveLabel: 'Adicionar',
    fields: [{ name: 'nome', label: 'Exercício', required: true }, { name: 'series', label: 'Séries' }, { name: 'reps', label: 'Repetições' }, { name: 'carga', label: 'Carga' }],
    onSave: v => { garantirRascunho().exercicios.push({ exId: null, ...v, feito: true, nota: '' }); save(); renderFreq(); }
  }),
  sxDiscard: () => {
    const r = S.rascunho; if (!r) return;
    if (!r.editId && (r.exercicios.some(e => e.feito) || r.chat?.length) && !confirm('Descartar este treino?')) return;
    S.rascunho = null; save(); renderFreq();
  },
  sxDone: () => {
    const r = garantirRascunho(); if (!r) return;
    if (!r.exercicios.some(e => e.feito) && !confirm('Nenhum exercício marcado. Salvar mesmo assim?')) return;
    if (r.atualizarModelo) for (const { e, m } of difsModelo(r)) Object.assign(m, { series: e.series, reps: e.reps, carga: e.carga });
    const log = { id: r.editId || uid(), data: r.data, splitId: r.splitId, diaId: r.diaId, nome: r.nome, cor: r.cor, exercicios: r.exercicios, chat: r.chat || [] };
    S.logs = S.logs.filter(l => l.id !== log.id);
    S.logs.push(log);
    S.logs.sort((a, b) => a.data.localeCompare(b.data));
    S.rascunho = null; UI.esperaSessao = false; save();
    const pc = perfilCalc();
    toast(`Treino salvo 💪${pc.peso ? ` · ~${baixo(kcalTreino(log, pc.peso))} kcal` : ''}`);
    renderFreq();
  },
  logDel: el => {
    const l = S.logs.find(x => x.id === el.dataset.id); if (!l) return;
    S.logs = S.logs.filter(x => x !== l); save(); openDaySheet(l.data); render();
  },

  // modelos de treino
  splitView: el => { UI.viewSplitId = el.dataset.id; renderTreinos(); },
  modeloUndo: () => {
    const c = UI.chatModelo, sp = c && getSplit(c.splitId); if (!sp || !c.undo) return;
    Object.assign(sp, c.undo); c.undo = null;
    for (const d of sp.dias) for (const l of S.logs) if (l.diaId === d.id) { l.nome = d.nome; l.cor = d.cor; }
    c.msgs.push({ role: 'model', text: '↶ Desfeito.' }); save(); renderTreinos();
  },
  periodo: el => { UI.periodo = +el.dataset.n; renderResumo(); },
  diaDet: el => diaDetalhe(el.dataset.date),
  calNav: el => {
    const [y, m] = (UI.calMes || hojeISO().slice(0, 7)).split('-').map(Number);
    const d = new Date(y, m - 1 + +el.dataset.dir, 1);
    UI.calMes = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    renderResumo();
  },
  relDias: el => { UI.relDias = +el.dataset.n; renderResumo(); },
  relBaixar: () => {
    const a = document.createElement('a');
    a.href = relatorioBlob(); a.download = `fittracker-relatorio-${hojeISO()}.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  relPDF: () => {
    const w = window.open(relatorioBlob() + '#print', '_blank');
    if (!w) toast('O navegador bloqueou a nova aba. Use "Baixar HTML" e imprima de lá.');
  },
  ativUndo: () => {
    const c = UI.chatAtiv; if (!c.lote?.length) return;
    S.logs = S.logs.filter(l => !c.lote.includes(l.id)); c.lote = null;
    c.msgs.push({ role: 'model', text: '↶ Último registro desfeito.' }); save(); renderFreq();
  },
  pesoAdd: () => {
    const kg = num($('#pesoKg').value), data = $('#pesoData').value || hojeISO();
    if (kg < 20 || kg > 400) { toast('Digite um peso válido em kg.'); return; }
    S.pesos = S.pesos.filter(p => p.data !== data);
    S.pesos.push({ data, kg });
    save(); toast(`Peso registrado: ${kg1(kg)} kg`); renderPerfil();
  },
  pesoDel: el => { if (!confirm('Remover esta pesagem?')) return; S.pesos = S.pesos.filter(p => p.data !== el.dataset.d); save(); renderPerfil(); },
  calAplicar: el => { S.perfil.fatorCal = Math.round(num(el.dataset.f) * 1000) / 1000; save(); toast('Calibração aplicada ✔'); renderPerfil(); },
  calRemover: () => { S.perfil.fatorCal = null; save(); toast('Calibração removida'); renderPerfil(); },
  metasAplicar: () => {
    const m = sugestaoMetas(perfilCalc()); if (!m) return;
    S.settings.metas = { kcal: m.kcal, prot: m.prot, carb: m.carb, gord: m.gord };
    save(); toast('Metas atualizadas ✔'); renderPerfil();
  },
  splitUse: () => { S.activeSplitId = UI.viewSplitId; save(); toast('Agora este é o modelo vigente ✔'); renderTreinos(); },
  splitNew: () => openModal(`
    <h3>Adicionar modelo</h3>
    <p class="muted small">Escolha um ponto de partida. Ele vira uma cópia sua, que você pode editar à vontade.</p>
    <ul class="list">${MODELOS.map((m, i) => `
      <li class="pick" data-act="modelPick" data-i="${i}">
        <div class="grow"><b>${esc(m.nome)}</b><div class="muted small">${esc(m.desc)}</div>
          <div class="legend" style="margin-top:4px">${m.dias.map(d => `<span><i style="background:${d.cor}"></i>${esc(d.nome)}</span>`).join('')}</div></div>
        <span class="muted">›</span></li>`).join('')}
      <li class="pick" data-act="modelPick" data-i="-1"><div class="grow"><b>Em branco</b><div class="muted small">Monte do zero</div></div><span class="muted">›</span></li>
    </ul>
    <div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="modalClose">Cancelar</button></div>`),
  modelPick: el => {
    const m = MODELOS[+el.dataset.i];
    formModal({
      title: 'Nome do modelo', saveLabel: 'Adicionar',
      fields: [{ name: 'nome', label: 'Nome', value: m ? m.nome : '', required: true, placeholder: 'ex: Férias, Cutting, Hipertrofia…' }],
      onSave: v => {
        const s = m ? criarDeModelo(m, v.nome) : { id: uid(), nome: v.nome, dias: [] };
        S.splits.push(s); UI.viewSplitId = s.id; save(); renderTreinos();
        toast('Modelo adicionado. Toque em "Tornar vigente" pra usar.');
      }
    });
  },
  splitRename: () => {
    const sp = viewSplit();
    formModal({ title: 'Renomear modelo', fields: [{ name: 'nome', label: 'Nome', value: sp.nome, required: true }], onSave: v => { sp.nome = v.nome; save(); renderTreinos(); } });
  },
  splitDup: () => {
    const sp = viewSplit();
    const copia = JSON.parse(JSON.stringify(sp));
    copia.id = uid(); copia.nome = sp.nome + ' (cópia)';
    for (const d of copia.dias) { d.id = uid(); for (const e of d.exercicios) e.id = uid(); }
    S.splits.push(copia); UI.viewSplitId = copia.id; save(); renderTreinos();
  },
  splitDel: () => {
    const sp = viewSplit();
    if (S.splits.length === 1) { toast('Você precisa ter pelo menos um modelo.'); return; }
    if (!confirm(`Excluir o modelo "${sp.nome}"? O histórico de frequência é mantido.`)) return;
    S.splits = S.splits.filter(s => s !== sp);
    if (S.activeSplitId === sp.id) S.activeSplitId = S.splits[0].id;
    UI.viewSplitId = S.activeSplitId; save(); renderTreinos();
  },

  // dias (treinos) do modelo
  dayAdd: () => dayModal(null),
  dayEdit: el => dayModal(getDia(el.dataset.dia)),
  dayDel: el => {
    const sp = viewSplit(), d = getDia(el.dataset.dia);
    if (!confirm(`Excluir o treino "${d.nome}" deste modelo?`)) return;
    sp.dias = sp.dias.filter(x => x !== d); save(); renderTreinos();
  },
  dayMove: el => { const sp = viewSplit(); mover(sp.dias, sp.dias.findIndex(d => d.id === el.dataset.dia), +el.dataset.dir); save(); renderTreinos(); },

  // exercícios
  exAdd: el => exModal(getDia(el.dataset.dia), null),
  exEdit: el => { const d = getDia(el.dataset.dia); exModal(d, d.exercicios.find(e => e.id === el.dataset.ex)); },
  exDel: el => { const d = getDia(el.dataset.dia); d.exercicios = d.exercicios.filter(e => e.id !== el.dataset.ex); save(); renderTreinos(); },
  exMove: el => { const d = getDia(el.dataset.dia); mover(d.exercicios, d.exercicios.findIndex(e => e.id === el.dataset.ex), +el.dataset.dir); save(); renderTreinos(); },

  // comida
  foodSave: salvarComida,
  foodDiscard: () => { UI.pending = null; renderResultado(); },
  diary: el => { UI.diaryDate = addDias(UI.diaryDate, +el.dataset.dir); if (UI.diaryDate > hojeISO()) UI.diaryDate = hojeISO(); renderComida(); },
  mealView: el => verRefeicao(S.refeicoes.find(r => r.id === el.dataset.id)),
  mealEdit: el => editarRefeicao(S.refeicoes.find(r => r.id === el.dataset.id)),
  mealSobra: el => { editarRefeicao(S.refeicoes.find(r => r.id === el.dataset.id)); sobraModal(); },
  sobra: sobraModal,
  sobraCalc: calcularSobra,
  sobraDesfazer: () => { const p = UI.pending; p.data = p.data.antes; delete p.macros; renderResultado(); },
  mealDel: el => { if (!confirm('Excluir esta refeição?')) return; S.refeicoes = S.refeicoes.filter(r => r.id !== el.dataset.id); save(); renderComida(); },
  mealManual: () => formModal({
    title: 'Adicionar refeição', saveLabel: 'Adicionar',
    fields: [{ name: 'titulo', label: 'Descrição', required: true, placeholder: 'ex: Whey + banana' },
      { name: 'kcal', label: 'kcal', type: 'number' }, { name: 'prot', label: 'Proteína (g)', type: 'number' },
      { name: 'carb', label: 'Carboidrato (g)', type: 'number' }, { name: 'gord', label: 'Gordura (g)', type: 'number' }],
    onSave: v => {
      const n = new Date();
      S.refeicoes.push({ id: uid(), data: UI.diaryDate, hora: `${pad(n.getHours())}:${pad(n.getMinutes())}`, tipo: 'manual',
        titulo: v.titulo, kcal: num(v.kcal), prot: num(v.prot), carb: num(v.carb), gord: num(v.gord), thumb: '', detalhes: null });
      save(); renderComida();
    }
  }),

  // simulação
  demoCarregar: () => {
    if (!confirm('Carregar dados simulados? Seus dados atuais ficam guardados e voltam quando você sair da simulação.')) return;
    try { localStorage.setItem('fitlog:antesDemo', JSON.stringify(S)); } catch (e) { toast('Sem espaço pra guardar seus dados. Exporte um backup antes.'); return; }
    const key = S.settings.apiKey;
    S = gerarDemo(); S.settings.apiKey = key;
    UI.pending = null; UI.chatModelo = null; UI.chatAtiv = { msgs: [], lote: null };
    save(); toast('Simulação carregada 🧪'); setTab('resumo');
  },
  demoSair: () => {
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem('fitlog:antesDemo')); } catch (e) { }
    if (!confirm(guardado ? 'Sair da simulação e voltar aos seus dados?' : 'Apagar os dados simulados e começar do zero? A chave do Gemini é mantida.')) return;
    const key = S.settings.apiKey;
    S = guardado ? { ...seed(), ...guardado } : seed();
    S.demo = false;
    if (!S.settings.apiKey) S.settings.apiKey = key;
    try { localStorage.removeItem('fitlog:antesDemo'); } catch (e) { }
    UI.pending = null; UI.chatModelo = null; UI.chatAtiv = { msgs: [], lote: null }; UI.diaryDate = hojeISO();
    save(); toast(guardado ? 'De volta aos seus dados ✔' : 'Tudo limpo. Bora começar! 💪'); setTab('freq');
  },

  // ajustes
  toggleKey: () => { const i = $('#cfgKey'); i.type = i.type === 'password' ? 'text' : 'password'; },
  testKey: testarChave,
  exportData: exportar,
  wipe: () => {
    if (!confirm('Apagar TODOS os dados (treinos, modelos, refeições)? Isso não tem volta.')) return;
    const key = S.settings.apiKey;
    S = seed(); S.settings.apiKey = key; save(); toast('Dados apagados'); render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

const CHATS = { comida: enviarChat, sessao: chatSessao, modelo: chatModelo, atividades: chatAtividades };
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-chat]');
  if (!f) return;
  e.preventDefault();
  const t = f.querySelector('input').value.trim();
  if (t) CHATS[f.dataset.chat](t);
});

document.addEventListener('change', e => {
  if (e.target.id === 'sxAtualiza') { garantirRascunho().atualizarModelo = e.target.checked; save(); return; }
  if (!e.target.matches('[data-sx-trocar]')) return;
  const atual = S.rascunho || sessaoVisivel();
  const sp = getSplit(atual.splitId) || activeSplit();
  const dia = sp.dias.find(d => d.id === e.target.value);
  if (atual.exercicios.some(x => x.feito) && !confirm('Trocar de treino e perder as marcações?')) { renderFreq(); return; }
  S.rascunho = novaSessao(dia, sp.id, atual.data); save(); renderFreq();
});

function boasVindas() {
  openModal(`<h3>Bem-vindo ao FitTracker 💪</h3>
    <p class="small">O app abriu com <b>dados simulados</b> pra você explorar as telas. Quando quiser começar de verdade, toque em
      <b>Apagar e começar do zero</b> na faixa roxa do topo.</p>
    ${window.FIREBASE_CONFIG ? `<p class="small">Já usa o FitTracker em outro celular? <button class="btn sm primary" data-act="nuvemEntrar">Entrar com Google</button></p>` : ''}
    <p class="small">Pra usar a IA (fotos de comida, conversa sobre treino), cole sua chave grátis do Gemini.
      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color:var(--accent)">Criar chave (1 minuto)</a></p>
    <form id="bvForm">
      <label>Chave do Gemini<input type="password" id="bvKey" placeholder="AIza..." autocomplete="off"></label>
      <div class="row end"><button type="button" class="btn ghost" data-act="modalClose">Agora não</button>
        <button class="btn primary">Salvar</button></div>
    </form>
    <p class="muted small">A chave fica só neste aparelho (não vai pra nuvem) e o uso conta na sua cota. Dá pra trocar depois em Perfil → Configurações.</p>`);
  $('#bvForm').onsubmit = e => {
    e.preventDefault();
    const k = $('#bvKey').value.trim();
    if (k) { S.settings.apiKey = k; save(); toast('Chave salva ✔'); }
    closeModal();
  };
}

/* ---------------- inicialização ---------------- */

try { let t = localStorage.getItem('fitlog:tab'); if (t === 'config') t = 'perfil'; if (t && document.getElementById('tab-' + t)) UI.tab = t; } catch (e) { }
if (PRIMEIRA_VEZ) S = gerarDemo();
save(); // registra o perfil de hoje no histórico
setTab(UI.tab);
if (PRIMEIRA_VEZ) boasVindas();
// virou o dia com o app aberto? atualiza ao voltar pra ele
// (só nesse caso: voltar da câmera não pode apagar a análise em andamento)
let diaRender = hojeISO();
document.addEventListener('visibilitychange', () => {
  if (document.hidden || hojeISO() === diaRender) return;
  diaRender = hojeISO(); UI.diaryDate = diaRender; render();
});

// modo offline + aviso de versão nova
// (o aviso aparece quando o sw.js muda: aumente CACHE em sw.js a cada publicação)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const tinhaVersao = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (tinhaVersao) avisoAtualizacao(); });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const checar = () => reg.update().catch(() => { });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checar(); });
    setInterval(checar, 30 * 60 * 1000);
  }).catch(() => { });
}

function avisoAtualizacao() {
  if ($('#atualizaBar')) return;
  const b = document.createElement('div');
  b.id = 'atualizaBar';
  b.className = 'demo-bar atualiza';
  b.innerHTML = '✨ <span class="grow">Nova versão do app disponível</span><button class="btn sm primary" data-act="recarregar">Atualizar</button>';
  $('.topbar').after(b);
}
ACTIONS.recarregar = () => location.reload();
