/* Service worker mínimo para instalação como PWA (standalone).
 * Não faz cache agressivo — a app sempre busca conteúdo atualizado na rede. */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
