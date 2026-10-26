// 앱 껍데기(화면, 아이콘, 표정)만 캐시. 대화(/api)는 절대 캐시하지 않는다.
const CACHE = "pogeuni-v1";
const SHELL = [
  "/", "/index.html", "/manifest.json",
  "/icons/icon-192.png", "/icons/icon-512.png",
  ...["neutral","happy","concern","surprised","thinking","cheer","calm"].map((e) => `/expressions/${e}.svg`),
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/") || url.origin !== location.origin) return;
  // 네트워크 우선, 실패하면 캐시 (배포한 수정이 바로 반영되도록)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html")))
  );
});
