'use strict';

/* Dados simulados (~2 meses) pra explorar o app antes de usar de verdade.
   Usa as funções do app.js, então só pode ser chamado depois que ele carregar.
   Gerador com semente fixa: a simulação sai sempre igual. */

function gerarDemo() {
  let semente = 12345;
  const rnd = () => {
    semente = semente + 0x6D2B79F5 | 0;
    let t = Math.imul(semente ^ semente >>> 15, 1 | semente);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const entre = (a, b) => a + rnd() * (b - a);
  const escolhe = arr => arr[Math.floor(rnd() * arr.length)];

  const D = seed();
  D.demo = true;
  D.perfil = { ...D.perfil, sexo: 'f', nascimento: '1995-06-15', altura: '168', cintura: '74', pescoco: '32', quadril: '98',
    atividade: '1.3', objetivo: 'perder', ritmo: '0.5' };
  D.settings.metas = { kcal: 2100, prot: 150, carb: 230, gord: 60 };
  const hoje = hojeISO(), N = 60;
  const sp = D.splits[0];

  // pesagens a cada 3 dias, caindo ~0,35 kg/semana com oscilação normal
  for (let i = N; i >= 0; i--) {
    if (i % 3 && i !== 0) continue;
    D.pesos.push({ data: addDias(hoje, -i), kg: Math.round((68 - (N - i) * 0.04 + entre(-0.35, 0.35)) * 10) / 10 });
  }

  // treinos: seg, ter, qui e sex (às vezes falta), seguindo a rotação do modelo
  let rot = 0;
  for (let i = N; i >= 1; i--) {
    const data = addDias(hoje, -i), dow = parseISO(data).getDay();
    if ([1, 2, 4, 5].includes(dow) && rnd() < 0.85) {
      const dia = sp.dias[rot++ % sp.dias.length];
      const exercicios = dia.exercicios.map(e => exDeModelo(e, rnd() > 0.1));
      if (rnd() < 0.2) { const e = escolhe(exercicios); e.feito = true; e.nota = 'aumentei a carga'; }
      D.logs.push({ id: uid(), data, splitId: sp.id, diaId: dia.id, nome: dia.nome, cor: dia.cor, exercicios, chat: [] });
    }
    if (dow === 6 && rnd() < 0.8) {
      D.logs.push({ id: uid(), data, splitId: null, diaId: null, nome: 'Futevôlei', cor: '#14b8a6', exercicios: [],
        minutos: escolhe([60, 90, 120]), met: Math.round(entre(4.5, 6.5) * 10) / 10, precisao: Math.round(entre(40, 60)) });
    }
    if (dow === 3 && rnd() < 0.35) {
      D.logs.push({ id: uid(), data, splitId: null, diaId: null, nome: 'Corrida', cor: '#ec4899', exercicios: [],
        minutos: 30, met: 7, precisao: 55 });
    }
  }
  // um treino com conversa com a IA, pra mostrar como fica
  const comChat = [...D.logs].reverse().find(l => l.diaId && l.exercicios.length > 3);
  if (comChat) {
    comChat.exercicios[3].feito = false;
    comChat.chat = [{ role: 'user', text: `não fiz o ${comChat.exercicios[3].nome.toLowerCase()}, tava lotado` },
      { role: 'model', text: `Anotado, desmarquei o ${comChat.exercicios[3].nome.toLowerCase()}. Da próxima vez dá pra trocar por um exercício parecido.` }];
  }

  // refeições: [título, kcal, prot, carb, gord, tipo]
  const CAFE = [['Pão com ovo e café', 380, 18, 40, 15], ['Tapioca com queijo', 320, 14, 45, 9],
    ['Iogurte proteico com granola', 290, 20, 38, 6, 'rotulo'], ['Cuscuz com ovo', 410, 17, 55, 13]];
  const ALMOCO = [['Arroz, feijão e frango', 650, 45, 80, 14], ['Macarrão à bolonhesa', 720, 35, 95, 20],
    ['Arroz, feijão e carne moída', 700, 38, 78, 24], ['Salada com atum e arroz', 480, 35, 50, 14], ['Peixe com purê', 560, 40, 55, 18]];
  const LANCHE = [['Whey com banana', 250, 27, 30, 3, 'manual'], ['Barra de proteína', 190, 15, 20, 7, 'rotulo'],
    ['Açaí 300 ml', 420, 4, 70, 14, 'rotulo'], ['Sanduíche natural', 330, 18, 38, 11]];
  const JANTAR = [['Omelete com legumes', 380, 26, 10, 26], ['Arroz, ovo e salada', 450, 18, 60, 14],
    ['Sopa de legumes com frango', 340, 26, 35, 9]];
  const JANTAR_FDS = [['Pizza (3 fatias)', 850, 34, 90, 38], ['Hambúrguer artesanal', 780, 38, 55, 42]];

  const refeicao = (data, hora, [titulo, kcal, prot, carb, gord, tipo = 'prato']) => {
    const k = entre(0.85, 1.15);
    const m = { kcal: Math.round(kcal * k), prot: Math.round(prot * k), carb: Math.round(carb * k), gord: Math.round(gord * k) };
    let detalhes = null;
    if (tipo === 'prato') {
      const p = Math.round(rnd() < 0.15 ? entre(35, 50) : entre(55, 85));
      detalhes = { titulo, itens: [{ nome: titulo, porcao: '1 prato', kcal: m.kcal, proteina_g: m.prot, carboidrato_g: m.carb, gordura_g: m.gord }],
        total: { kcal: m.kcal, proteina_g: m.prot, carboidrato_g: m.carb, gordura_g: m.gord },
        confianca: p >= 75 ? 'alta' : p >= 55 ? 'media' : 'baixa', precisao: p,
        comentario: p < 55 ? 'Foto escura, difícil ver as porções.' : 'Refeição equilibrada, boa fonte de proteína.' };
    } else if (tipo === 'rotulo') {
      detalhes = { produto: titulo, porcao_g: 100, por_100g: { kcal: m.kcal, proteina_g: m.prot, carboidrato_g: m.carb, gordura_g: m.gord },
        alertas: /açaí/i.test(titulo) ? ['Alto em açúcar adicionado'] : [], precisao: Math.round(entre(82, 93)),
        nota_saude: /açaí/i.test(titulo) ? 4 : 7, resumo: 'Simulação.' };
    }
    D.refeicoes.push({ id: uid(), data, hora, tipo, titulo: tipo === 'rotulo' ? `${titulo} (100 g)` : titulo, ...m, thumb: '', detalhes, chat: [],
      gramas: tipo === 'rotulo' ? 100 : undefined });
  };

  for (let i = N; i >= 0; i--) {
    const data = addDias(hoje, -i), dow = parseISO(data).getDay(), fds = dow === 0 || dow === 6;
    if (i > 0 && rnd() < 0.15) continue; // dias sem registro (acontece)
    refeicao(data, '07:30', escolhe(CAFE));
    refeicao(data, '12:30', escolhe(ALMOCO));
    if (i === 0) break; // hoje: só café e almoço até agora
    if (rnd() < 0.75) refeicao(data, '16:00', escolhe(LANCHE));
    refeicao(data, '20:00', escolhe(fds && rnd() < 0.7 ? JANTAR_FDS : JANTAR));
  }
  // uma refeição com "não comi tudo" e conversa, pra mostrar como fica
  const parcial = D.refeicoes.find(r => r.data === addDias(hoje, -3) && r.tipo === 'prato' && r.hora === '12:30');
  if (parcial) {
    const antes = JSON.parse(JSON.stringify(parcial.detalhes));
    const f = 0.7;
    Object.assign(parcial, { kcal: Math.round(parcial.kcal * f), prot: Math.round(parcial.prot * f), carb: Math.round(parcial.carb * f), gord: Math.round(parcial.gord * f) });
    parcial.titulo += ' (parcial)';
    parcial.detalhes = { ...antes, total: { kcal: parcial.kcal, proteina_g: parcial.prot, carboidrato_g: parcial.carb, gordura_g: parcial.gord },
      sobrou: [{ nome: 'Arroz', porcao: '~80 g' }], antes, precisao: 78, comentario: 'Pesagem antes/depois: sobrou parte do arroz.' };
    parcial.chat = [{ role: 'user', text: '🍽️ Não comi tudo: prato com 520 g antes e 160 g depois' },
      { role: 'model', text: `Descontei a sobra: ${antes.total.kcal} → ${parcial.kcal} kcal. Sobrou parte do arroz.` }];
  }

  D.logs.sort((a, b) => a.data.localeCompare(b.data));

  // treino de hoje em andamento (3 exercícios marcados)
  const prox = sp.dias[rot % sp.dias.length];
  D.rascunho = novaSessao(prox, sp.id);
  D.rascunho.exercicios.slice(0, 3).forEach(e => { e.feito = true; });

  // histórico diário do perfil (peso/TMB de cada dia)
  const Sreal = S, todos = D.pesos;
  S = D;
  try {
    for (let i = N; i >= 1; i--) {
      const data = addDias(hoje, -i);
      D.pesos = todos.filter(p => p.data <= data);
      const pc = perfilCalc();
      D.historico.push({ data, peso: pc.peso, tmb: pc.tmb, base: pc.base, precBase: pc.precBase, gordura: pc.gordura || null,
        imc: pc.imc || null, magra: pc.magra || null, cal: null });
    }
  } finally {
    D.pesos = todos;
    S = Sreal;
  }
  return D;
}
