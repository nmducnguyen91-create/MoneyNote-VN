// MoneyNote VN — service worker: mở tức thì từ bộ nhớ máy, cập nhật ngầm
const CACHE = 'moneynote-shell-v22';
const ASSETS = [
  './',
  'moneynote.html',
  'moneynote-desktop.html',
  'moneynote-desktop.js?v=274',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];

// Safari từ chối mọi phản hồi "đã chuyển hướng" mà service worker trả về → luôn bóc thành phản hồi sạch
async function clean(res) {
  if (!res || !res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c =>
    Promise.all(ASSETS.map(u =>
      fetch(new Request(u, { cache: 'reload' })).then(clean).then(r => { if (r.ok || r.type === 'opaque') return c.put(u, r); }).catch(() => {})
    ))
  ));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.disable(); } catch (_) {} }
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isHTML(req) {
  return req.mode === 'navigate' || req.destination === 'document' ||
    req.url.split('?')[0].endsWith('.html') || req.url.split('?')[0].endsWith('/');
}
function noCache(url) {
  return url.includes('firestore.googleapis') || url.includes('firebaseio') ||
    url.includes('identitytoolkit') || url.includes('securetoken') ||
    (url.includes('googleapis.com') && !url.includes('fonts.googleapis')) ||
    url.includes('google.com') || url.includes('anthropic') || url.includes('/api/');
}
async function notifyUpdate() {
  const cs = await self.clients.matchAll({ type: 'window' });
  cs.forEach(c => c.postMessage({ type: 'ft-update' }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (noCache(url)) return;

  // HTML: trả bản đã lưu NGAY (mở tức thì như app thật), đồng thời tải bản mới ngầm.
  // Nếu bản mới khác bản cũ → báo trang hiện nút "Cập nhật".
  if (isHTML(req)) {
    const key = url.split('?')[0].split('#')[0];
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await clean((await cache.match(key)) || (key.endsWith('/') ? await cache.match('moneynote.html') : null));
      const cachedCopy = cached ? cached.clone() : null;
      const net = fetch(req, { cache: 'no-store' }).then(clean).then(async res => {
        if (!res || !res.ok) return res;
        const fresh = await res.clone().text();
        const old = cachedCopy ? await cachedCopy.text() : null;
        await cache.put(key, res.clone());
        if (old !== null && old !== fresh) await notifyUpdate();
        return res;
      });
      if (cached) { e.waitUntil(net.catch(() => {})); return cached; }
      try { return await net; }
      catch (_) {
        return (await clean(await cache.match('moneynote.html'))) ||
          new Response('<h1>Không có mạng</h1>', { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
      }
    })());
    return;
  }

  // Tài nguyên tĩnh (icon, splash, thư viện, Firebase SDK): ưu tiên bộ nhớ đệm
  e.respondWith(
    caches.match(req).then(clean).then(cached => cached || fetch(req).then(clean).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => cached))
  );
});
