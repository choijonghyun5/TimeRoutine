// 그린노트 서비스워커 - 1단계 스켈레톤
// 실제 호스팅 환경(https)에서 등록되면 오프라인 캐싱이 동작합니다.
// file:// 로 직접 열람 중에는 등록되지 않아도 앱 사용에는 지장이 없습니다.

const CACHE_NAME = "greennote-cache-v11";
const CORE_ASSETS = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./sound-engine.js",
  "./manifest.json",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/plants/monstera/step_1.png",
  "./assets/plants/monstera/step_2.png",
  "./assets/plants/monstera/step_3.png",
  "./assets/plants/monstera/step_4.png",
  "./assets/plants/monstera/step_5.png",
  "./assets/plants/monstera/step_6.png",
  "./assets/plants/rubbertree/step_1.png",
  "./assets/plants/rubbertree/step_2.png",
  "./assets/plants/rubbertree/step_3.png",
  "./assets/plants/rubbertree/step_4.png",
  "./assets/plants/rubbertree/step_5.png",
  "./assets/plants/rubbertree/step_6.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
  );
});
