/* 우리 여행 서비스 워커: 인터넷이 없어도 앱이 열리게 */
const VER = 'v6';
const PAGES = 'pages-' + VER;
const STATIC = 'static-' + VER;
const PRECACHE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** 화면·데이터: 먼저 인터넷, 안 되면 저장해 둔 것 */
async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req, { ignoreVary: true })) || (fallbackUrl && (await cache.match(fallbackUrl, { ignoreVary: true })));
    if (hit) return hit;
    throw err;
  }
}

/** 빌드 파일(이름에 해시가 있어 바뀌지 않음): 저장한 것 먼저 */
async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 다른 사이트(Supabase, 구글 지도)와 서버 API는 건드리지 않음
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/bg/')) {
    e.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, '/'));
    return;
  }
  // 화면 전환 때 받는 데이터(RSC)
  if (req.headers.get('RSC') || url.searchParams.has('_rsc')) {
    e.respondWith(networkFirst(req));
  }
});
