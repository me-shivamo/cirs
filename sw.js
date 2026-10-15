/* Service worker: keeps the hosted kiosk working with no internet.
   - App files are cached at install (versioned; bump VERSION on every deploy).
   - Videos saved by the setup screen live in the 'kiosk-videos' cache and are served with
     byte ranges (206), which the browser's video player needs to start and seek.
   - A video that is not saved streams from the network instead. */
var VERSION = '20261015-0740';
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
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) {
      return k.indexOf('kiosk-shell-') === 0 && k !== SHELL_CACHE;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

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
  return caches.open(SHELL_CACHE).then(function (cache) {
    var nav = req.mode === 'navigate';
    return cache.match(nav ? 'index.html' : req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).catch(function () {
        return nav ? cache.match('index.html') : Response.error();
      });
    });
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
