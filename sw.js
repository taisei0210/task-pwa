/* タスク管理PWA － Service Worker
   方針：
     - アプリ本体(HTML)は「ネットワーク優先」。繋がっていれば必ず最新が出る。
       圏外のときだけキャッシュを使う。
     - アイコン等の変わらないファイルは「キャッシュ優先」で即表示。
     - API(script.google.com)には一切触らない。
   ※ 以前はHTMLもキャッシュ優先にしていたため、更新しても常に1つ古い版が表示されていた（2026-08-02に修正）。
      CACHE名を変えると古いキャッシュは activate 時に破棄される。 */

var CACHE = 'task-app-v2';
var ASSETS = ['icon-192.png', 'icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS.concat(['./', 'index.html'])); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // APIは素通し

  var isPage = req.mode === 'navigate' ||
               (req.headers.get('accept') || '').indexOf('text/html') > -1 ||
               url.pathname.endsWith('/') ||
               url.pathname.endsWith('index.html');

  if (isPage) {
    // ネットワーク優先：最新を取りに行き、取れたらキャッシュも更新する
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('index.html') || caches.match('./');
        });
      })
    );
    return;
  }

  // それ以外はキャッシュ優先＋裏で更新
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
