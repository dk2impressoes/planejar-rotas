// © 2026 Grupo DK² — Planejar Rotas com Checklist. DK² forjada para programar o futuro.
// Service Worker (Seção 13). Cache versionado; ativa na próxima abertura; o antigo só sai depois.
// A linha abaixo é reescrita por scripts/gerar_manifesto: o nome muda sempre que um arquivo do app muda,
// o que faz o navegador instalar a nova versão.
const CACHE = 'app-v13.0.0-fe0d67d7c5ed';

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const r = await fetch('dados/manifesto.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('Manifesto indisponível');
    const manifesto = await r.json();
    const arquivos = manifesto.arquivos.filter((a) => a.tipo === 'app').map((a) => a.caminho);
    const cache = await caches.open(CACHE);
    // Instalação em segundo plano: se faltar rede ou espaço, falha e a versão anterior continua.
    await cache.addAll(['./', ...arquivos]);
  })());
  // Sem skipWaiting: a nova versão só assume quando todas as abas fecharem (nunca durante o preenchimento).
});

// A nova versão só assume sozinha quando todas as abas fecham. Se a pessoa tocar em "Atualizar agora",
// o app pede para assumir já (os dados ficam salvos a cada alteração, então nada se perde).
self.addEventListener('message', (evento) => {
  if (evento.data === 'atualizar-agora') self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('app-v') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // serviços externos: direto à rede
  if (url.pathname.includes('/dados/') || url.pathname.includes('/esquemas/')) return; // bases: guardadas no IndexedDB
  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      return (await cache.match('./')) || fetch(req);
    }
    const achado = await cache.match(req, { ignoreSearch: true });
    return achado || fetch(req);
  })());
});
