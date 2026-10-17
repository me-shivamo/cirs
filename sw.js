/* Service worker: keeps the hosted kiosk working with no internet, and up to date when online.
   - App code (page, JS, CSS) is fetched fresh whenever there is internet; the saved copy is
     used only offline. Icons and posters come from the saved copy (refreshed per version).
   - A new version takes over at once. Open previews (?demo, ?visitor) reload immediately;
     kiosk screens are told to reload themselves when idle on the home screen.
   - Videos saved by the setup screen live in the 'kiosk-videos' cache and are served with
     byte ranges (206), which the browser's video player needs to start and seek.
   - A video that is not saved streams from the network instead. */
var VERSION = '2026-10-15-1';
var SHELL_CACHE = 'kiosk-shell-' + VERSION;
var VIDEO_CACHE = 'kiosk-videos';

importScripts('js/config.js');
var NUMS = self.KIOSK_CONFIG.topics.map(function (t) { return t.n; });
var SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/font.css', 'css/style.css',
  'js/config.js', 'js/media.js', 'js/offline.js', 'js/app.js', 'js/setup.js', 'js/staff.js',
  'app-icons/icon-192.png', 'app-icons/icon-512.png',
].concat(NUMS.map(function (n) { return 'assets/icons/' + n + '.webp'; }))
 .concat(NUMS.map(function (n) { return 'posters/' + n + '.jpg'; }));

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL_CACHE).then(function (cache) {
    return cache.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    var old = keys.filter(function (k) { return k.indexOf('kiosk-shell-') === 0 && k !== SHELL_CACHE; });
    return Promise.all(old.map(function (k) { return caches.delete(k); })).then(function () {
      return self.clients.claim();
    }).then(function () {
      if (old.length) return refreshOpenPages(); // an update, not the first install
    });
  }));
});

// Show the new version on pages that are already open. The reload is started but NOT awaited:
// its request is handled by this worker only once activation finishes, so waiting would deadlock.
function refreshOpenPages() {
  return self.clients.matchAll({ type: 'window' }).then(function (list) {
    list.forEach(function (client) {
      var u = new URL(client.url);
      if (u.searchParams.has('demo') || u.searchParams.has('visitor')) {
        client.navigate(client.url).catch(function () {});
      } else {
        client.postMessage('kiosk-updated'); // kiosk: reloads itself when nobody is using it
      }
    });
  });
}

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.has('kiosk-download')) return; // setup screen saving a video: go straight to the network
  var m = url.pathname.match(/\/videos\/(hd|lite)\/([^/]+\.mp4)$/);
  if (m) { e.respondWith(serveVideo(req, url, m[1], m[2])); return; }
  e.respondWith(serveShell(req));
});

function serveShell(req) {
  var url = new URL(req.url);
  var nav = req.mode === 'navigate';
  var code = nav || /\.(html|js|css|webmanifest)$/.test(url.pathname);
  return caches.open(SHELL_CACHE).then(function (cache) {
    var key = nav ? 'index.html' : req;
    var saved = function () { return cache.match(key, { ignoreSearch: true }); };
    if (!code) {
      return saved().then(function (hit) { return hit || fetch(req); });
    }
    // App code: network first (bypassing the browser cache), saved copy if offline or slow.
    var fresh = fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      cache.put(key, res.clone());
      return res;
    });
    var slow = new Promise(function (_, reject) { setTimeout(reject, 4000); });
    return Promise.race([fresh, slow]).catch(function () {
      return saved().then(function (hit) { return hit || fresh; });
    }).catch(function () { return Response.error(); });
  });
}

function serveVideo(req, url, q, file) {
  return caches.open(VIDEO_CACHE).then(function (cache) {
    return cache.match(url.origin + url.pathname).then(function (hit) {
      if (hit) return rangeResponse(req, hit);
      var base = self.KIOSK_CONFIG.remoteBase;
      var remote = base ? base + q + '/' + file : url.origin + url.pathname;
      var headers = {};
      var range = req.headers.get('Range');
      if (range) headers.Range = range;
      return fetch(remote, { headers: headers, mode: base ? 'cors' : 'same-origin' }).catch(function () {
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    });
  });
}

function rangeResponse(req, res) {
  var type = res.headers.get('Content-Type') || 'video/mp4';
  return res.blob().then(function (blob) {
    var size = blob.size;
    var range = req.headers.get('Range');
    if (!range) {
      return new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
    }
    var m = /bytes=(\d*)-(\d*)/.exec(range);
    var start = 0, end = size - 1;
    if (m && m[1] === '' && m[2] !== '') {
      start = Math.max(0, size - Number(m[2]));
    } else if (m) {
      start = Number(m[1]) || 0;
      if (m[2] !== '') end = Math.min(Number(m[2]), size - 1);
    }
    if (start >= size || start > end) {
      return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    }
    return new Response(blob.slice(start, end + 1), {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': type,
        'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
      },
    });
  });
}
