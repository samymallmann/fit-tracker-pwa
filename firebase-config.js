// Configuração do Firebase (opcional: login com Google e sincronização na nuvem).
// Com FIREBASE_CONFIG = null o app funciona 100% no aparelho, sem nuvem.
//
// Pra ativar a nuvem, crie um projeto no Firebase, registre um app Web e cole
// a configuração aqui. Esses valores NÃO são secretos: o Firebase foi feito pra
// eles ficarem no código do site. Quem protege os dados são as regras em firestore.rules.
//
// window.FIREBASE_CONFIG = {
//   apiKey: '...',
//   authDomain: 'SEU-PROJETO.web.app', // o domínio do site evita bloqueio de login por cookies de terceiros
//   projectId: 'SEU-PROJETO',
//   storageBucket: 'SEU-PROJETO.firebasestorage.app',
//   messagingSenderId: '...',
//   appId: '...',
// };
window.FIREBASE_CONFIG = null;

// E-mails que veem o painel de admin (precisa bater com firestore.rules).
window.ADMINS = ['admin@exemplo.com'];
