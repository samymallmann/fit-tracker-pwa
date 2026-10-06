# FitTracker

Projeto pessoal: um **PWA** (app que roda no navegador e instala no celular) pra acompanhar treino, alimentação e saldo calórico, com análise de fotos de comida por IA.

Feito em **HTML, CSS e JavaScript puro**, sem framework e sem etapa de build. Funciona offline e, opcionalmente, sincroniza na nuvem com Firebase.

## Funcionalidades

**Treinos**
- Frequência em quadradinhos estilo GitHub, coloridos pelo tipo de treino
- Vários **modelos de treino** (ABC, ABCDE, Push/Pull/Legs, Superiores/Inferiores…), com um vigente na rotação e exercícios ordenáveis
- **Checklist do treino do dia**: só os exercícios marcados contam no gasto calórico
- Campo de conversa com a IA: "não fiz leg press", "supino 3×6 com 50 kg" → a lista se ajusta sozinha
- Atividades avulsas contadas em texto livre ("futevôlei segunda, 1h30") → a IA registra nos dias certos

**Comida**
- Foto do **prato** (estima alimentos, porções e macros) ou do **rótulo** (lê a tabela nutricional e dá uma nota)
- **"Não comi tudo"**: foto da sobra e/ou peso do prato antes e depois → desconta o que sobrou
- Conversa pra corrigir a análise; os valores se atualizam

**Corpo e estatísticas**
- Perfil com IMC, TMB (Mifflin-St Jeor ou Katch-McArdle), % de gordura informado ou estimado por medidas (fórmula da Marinha dos EUA) e passos/dia
- **Calibração**: compara a mudança real de peso com o saldo registrado e mede o gasto real da pessoa
- Saldo do dia (déficit/superávit), última semana, calendário mensal e **precisão estimada** de cada dia
- Histórico diário do perfil: dias passados usam o peso e a TMB daquela época
- **Relatório** em HTML com gráficos SVG, que vira PDF pela impressão do navegador
- Todas as estimativas são calculadas com precisão total e só o resultado mostrado é arredondado pra baixo (conservador)

**Outros**
- Abre com ~2 meses de **dados simulados** pra explorar; um toque apaga e começa do zero
- Backup em JSON (exportar e importar)
- Aviso de versão nova, botão "Procurar atualização" e, pro admin, "Atualizar todos os aparelhos" (via Firestore em tempo real)
- Login com Google, sincronização local-primeiro e painel de admin (opcional, via Firebase)

## Como funciona a IA

Cada pessoa usa a **própria chave grátis do Gemini** ([Google AI Studio](https://aistudio.google.com/apikey)), colada no app e guardada **só no aparelho**. As chamadas vão direto do navegador pra API do Gemini. As fotos não são salvas em lugar nenhum, só uma miniatura de ~5 KB junto da refeição.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html`, `style.css` | estrutura e visual (tema escuro, mobile first) |
| `app.js` | lógica do app: dados, telas, cálculos, chamadas ao Gemini |
| `demo.js` | gerador de dados simulados (semente fixa) |
| `nuvem.js` | login com Google, sincronização com o Firestore e painel de admin |
| `firebase-config.js` | configuração pública do Firebase (vem desligada) e e-mails de admin |
| `firestore.rules`, `firebase.json` | regras de segurança e hospedagem no Firebase |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | modo offline e instalação como app |

## Rodar localmente

```bash
python -m http.server 8765
```

Abra http://localhost:8765. Sem Firebase configurado, tudo fica salvo no `localStorage` do navegador.

## Nuvem com Firebase (opcional)

1. Crie um projeto no [console do Firebase](https://console.firebase.google.com) (plano grátis Spark).
2. **Authentication** → ative o provedor **Google**.
3. **Firestore Database** → crie o banco.
4. Registre um **app Web** e cole a configuração em `firebase-config.js`.
5. Troque `admin@exemplo.com` pelo seu e-mail em `firebase-config.js` **e** em `firestore.rules`.
6. Publique (o script aumenta a versão do app e confere o que ficou público):

```bash
python tools/publicar.py SEU-PROJETO
```

7. No app, como admin: Perfil → Conta → Painel do admin → **Atualizar todos os aparelhos**. Quem estiver com o app aberto recarrega na hora; os outros ao abrir.

Estrutura no Firestore:
- `users/{uid}`: nome, e-mail, último acesso, resumo e o estado do app (JSON)
- `users/{uid}/meses/{AAAA-MM}`: refeições do mês (separadas por causa do limite de 1 MB por documento)

Cada usuário só lê e escreve os próprios dados; o admin pode ler os de todos. A chave do Gemini nunca vai pra nuvem.

## Como o gasto calórico é estimado

- **Dia normal** = TMB × nível de atividade (ou TMB × 1,1 + passos × 0,0005 × peso)
- **Treino**: para cada exercício feito, tempo ≈ séries × (reps × 3 s + 75 s de descanso), com MET 5 para compostos e 3,5 para isolados, contando só o que passa do repouso (MET − 1)
- **Atividades avulsas**: MET estimado pela IA × minutos
- **Calibração**: regressão linear do peso nos últimos 28 dias × 7700 kcal/kg, comparada com o consumo registrado (ajuste limitado a ±20%)

São estimativas, não medições.
