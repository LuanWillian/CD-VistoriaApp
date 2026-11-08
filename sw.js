// Service Worker do CD Vistoria: guarda o app inteiro para abrir sem
// internet. Troque CACHE_VERSION a cada deploy (o scripts/gerar-env.js faz isso
// sozinho quando usado como comando de build no Netlify).
const CACHE_VERSION = "v3";
const CACHE = `vistoria-${CACHE_VERSION}`;
const LIMITE_ENV_MS = 3000;

const ARQUIVOS = [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "env.js",
  "app.js",
  "config.js",
  "formatos.js",
  "validacao.js",
  "rascunho.js",
  "storage.js",
  "supabase.js",
  "sync.js",
  "auth.js",
  "ui.js",
  "photos.js",
  "signature.js",
  "pdf.js",
  "views/login.js",
  "views/nova.js",
  "views/etapa-veiculo.js",
  "views/etapa-checklist.js",
  "views/etapa-avarias.js",
  "views/etapa-assinaturas.js",
  "views/vistorias.js",
  "views/detalhe.js",
  "vendor/supabase-2.118.0.umd.js",
  "vendor/jspdf-4.2.1.umd.min.js",
  "vendor/jspdf-autotable-5.0.9.min.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (e) => {
  // cache: "reload" ignora o cache HTTP do navegador e garante os arquivos desta versão
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const nome of await caches.keys()) {
      if (nome.startsWith("vistoria-") && nome !== CACHE) await caches.delete(nome);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data?.tipo === "SKIP_WAITING") self.skipWaiting();
});

// Background Sync (Chrome/Android): só acorda a aba aberta, que faz o envio.
self.addEventListener("sync", (e) => {
  if (e.tag !== "enviar-vistorias") return;
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((janelas) => {
    janelas.forEach((j) => j.postMessage({ tipo: "sincronizar" }));
  }));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase e outros domínios: sempre rede
  if (url.pathname.includes("/tests/")) return;

  if (req.mode === "navigate") {
    e.respondWith(caches.match("index.html").then((r) => r || fetch(req)));
    return;
  }
  if (url.pathname.endsWith("/env.js")) {
    // rede primeiro: trocar as chaves do Supabase não depende de nova versão do cache
    // (com limite: sinal fraco que não cai não pode travar a abertura do app)
    const daRede = fetch(req).then((r) => {
      if (r.ok) {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
      }
      return r;
    });
    const limite = new Promise((resolver) => setTimeout(() => resolver(null), LIMITE_ENV_MS));
    e.respondWith(Promise.race([daRede.catch(() => null), limite])
      .then((r) => r || caches.match(req))
      .then((r) => r || daRede));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
