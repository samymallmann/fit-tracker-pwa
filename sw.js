// Service worker: deixa o app abrir offline.
// Estratégia "rede primeiro": com internet sempre pega a versão mais nova
// (atualizações aparecem na hora); sem internet, usa a cópia guardada.
// A CADA publicação, aumente a versão abaixo: é isso que mostra o aviso "Nova versão" no app.
const CACHE = 'fittracker-v5';
const ARQUIVOS = ['./', 'index.html', 'style.css', 'firebase-config.js', 'demo.js', 'app.js', 'nuvem.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
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
