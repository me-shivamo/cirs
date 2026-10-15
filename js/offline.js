/* Offline storage for the hosted link: service worker, saving videos on the device,
   loading them from a USB stick, and storage checks. Not used from file:// (USB/laptop),
   where the videos are plain files next to the page. */
(function () {
  'use strict';

  var VIDEO_CACHE = 'kiosk-videos';
  var params = new URLSearchParams(location.search);
  var enabled = 'serviceWorker' in navigator && 'caches' in window && window.isSecureContext &&
    location.protocol !== 'file:' && !params.has('visitor');

  var reg = null;
  var index = {};        // 'hd/01-x.mp4' -> { bytes, usb }
  var reloadOnSwitch = false;
  var downloading = false;
  var abortCtl = null;

  function cfg() { return self.KIOSK_CONFIG; }
  function topics() { return window.Kiosk.topics; }
  function key(q, file) { return q + '/' + file; }
  function localURL(q, file) { return new URL('videos/' + q + '/' + file, location.href).href; }
  function remoteURL(q, file) { return cfg().remoteBase ? cfg().remoteBase + q + '/' + file : localURL(q, file); }
  // Downloads skip the service worker (it would only pass the stream through).
  function downloadURL(q, file) { return remoteURL(q, file) + (cfg().remoteBase ? '' : '?kiosk-download=1'); }
  function expected(t, q) { return t.media ? t.media[q] : 0; }

  // Saved in any version: good enough to play.
  function has(t, q) { var e = index[key(q, t.file)]; return !!(e && e.bytes > 0); }
  // Saved and matching the current version (sizes from js/media.js).
  function fresh(t, q) {
    var e = index[key(q, t.file)];
    if (!e || !e.bytes) return false;
    return e.usb || !expected(t, q) || e.bytes === expected(t, q);
  }
  function controlled() { return enabled && !!navigator.serviceWorker.controller; }

  function init() {
    if (!enabled) return Promise.resolve();
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloadOnSwitch) location.reload();
    });
    return navigator.serviceWorker.register('sw.js')
      .then(function (r) { reg = r; })
      .catch(function (e) { console.warn('Service worker not available:', e); })
      .then(refreshIndex);
  }

  function refreshIndex() {
    index = {};
    if (!enabled) return Promise.resolve(index);
    return caches.open(VIDEO_CACHE).then(function (cache) {
      return cache.keys().then(function (reqs) {
        return Promise.all(reqs.map(function (req) {
          var m = req.url.match(/\/videos\/(hd|lite)\/([^/?#]+)$/);
          if (!m) return null;
          return cache.match(req).then(function (res) {
            if (!res) return;
            index[key(m[1], decodeURIComponent(m[2]))] = {
              bytes: Number(res.headers.get('Content-Length')) || 0,
              usb: res.headers.get('X-Kiosk-Source') === 'usb',
            };
          });
        }));
      });
    }).then(function () { return index; }).catch(function () { return index; });
  }

  function storageInfo() {
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return navigator.storage.estimate().then(function (e) {
      var persisted = navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false);
      return persisted.then(function (p) { return { usage: e.usage || 0, quota: e.quota || 0, persisted: p }; });
    }).catch(function () { return null; });
  }

  function totals() {
    var sum = { hd: 0, lite: 0 };
    topics().forEach(function (t) { sum.hd += expected(t, 'hd') || 0; sum.lite += expected(t, 'lite') || 0; });
    return sum;
  }

  function countFresh(q) { return topics().filter(function (t) { return fresh(t, q); }).length; }
  function readyQuality() {
    var n = topics().length;
    if (countFresh('hd') === n) return 'hd';
    if (countFresh('lite') === n) return 'lite';
    return null;
  }

  // Auto quality: HD when there is room for it, otherwise the Lite copies.
  function chooseQuality() {
    if (cfg().liteOnly) return Promise.resolve('lite');
    var s = window.Kiosk.settings.quality;
    if (s === 'hd' || s === 'lite') return Promise.resolve(s);
    return storageInfo().then(function (info) {
      if (!info || !info.quota) return 'hd';
      var need = totals(), stored = 0;
      Object.keys(index).forEach(function (k) { stored += index[k].bytes; });
      var free = info.quota - info.usage + stored;
      return free > need.hd * 1.1 ? 'hd' : 'lite';
    });
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function waitOnline() {
    if (navigator.onLine) return Promise.resolve();
    return new Promise(function (r) { window.addEventListener('online', function on() { window.removeEventListener('online', on); r(); }); });
  }

  // Save one video into the cache, streaming to disk (never held in memory).
  function fetchIntoCache(cache, t, q, onBytes) {
    return fetch(downloadURL(q, t.file), { mode: 'cors', cache: 'no-store', signal: abortCtl.signal instanceof Object && 'onabort' in abortCtl.signal ? abortCtl.signal : undefined }).then(function (res) {
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      var total = Number(res.headers.get('Content-Length')) || expected(t, q);
      var n = 0;
      var body = res.body;
      if (typeof TransformStream === 'function' && body.pipeThrough) {
        body = body.pipeThrough(new TransformStream({
          transform: function (chunk, ctl) { n += chunk.byteLength; onBytes(n); ctl.enqueue(chunk); },
        }));
      } else {
        n = total; // older browsers: no live progress, size is checked on the next index refresh
      }
      var stored = new Response(body, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(total) } });
      return cache.put(localURL(q, t.file), stored).then(function () {
        if (total && n !== total) {
          return cache.delete(localURL(q, t.file)).then(function () { throw new Error('incomplete download'); });
        }
        index[key(q, t.file)] = { bytes: total || n, usb: false };
      });
    });
  }

  // Download every video that is missing or out of date. Survives Wi-Fi drops:
  // it waits for the connection and continues with the file it was on.
  function downloadAll(q, onProgress) {
    if (downloading) return Promise.resolve();
    downloading = true;
    abortCtl = typeof AbortController === 'function' ? new AbortController()
      : { signal: { aborted: false }, abort: function () { this.signal.aborted = true; } };
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    var list = topics().filter(function (t) { return !fresh(t, q); });
    var totalBytes = list.reduce(function (s, t) { return s + (expected(t, q) || 0); }, 0);
    var doneBytes = 0, failed = [];

    return caches.open(VIDEO_CACHE).then(function (cache) {
      var i = 0;
      function next() {
        if (i >= list.length || abortCtl.signal.aborted) return Promise.resolve();
        var t = list[i];
        var attempt = 0;
        function tryOnce() {
          attempt++;
          onProgress({ phase: 'file', topic: t, index: i, files: list.length, doneBytes: doneBytes, totalBytes: totalBytes, attempt: attempt });
          return fetchIntoCache(cache, t, q, function (n) {
            onProgress({ phase: 'bytes', topic: t, index: i, files: list.length, doneBytes: doneBytes + n, totalBytes: totalBytes });
          }).then(function () {
            doneBytes += expected(t, q) || 0;
          }).catch(function (err) {
            if (abortCtl.signal.aborted) return;
            console.warn('Download of ' + t.file + ' failed (attempt ' + attempt + '):', err);
            if (attempt >= 6) { failed.push(t); return; }
            onProgress({ phase: 'retry', topic: t, index: i, files: list.length, doneBytes: doneBytes, totalBytes: totalBytes, offline: !navigator.onLine, error: String(err) });
            return waitOnline().then(function () { return wait(3000 * attempt); }).then(tryOnce);
          });
        }
        return tryOnce().then(function () { i++; return next(); });
      }
      return next();
    }).then(refreshIndex).then(function () {
      downloading = false;
      onProgress({ phase: 'done', failed: failed, aborted: abortCtl.signal.aborted });
    }, function (err) {
      downloading = false;
      onProgress({ phase: 'done', failed: list, error: String(err) });
    });
  }
  function stopDownload() { if (abortCtl) abortCtl.abort(); }

  // Load videos picked from a USB stick (file names like 01-journey-of-cvs.mp4).
  function importFiles(fileList, onProgress) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) { return /\.mp4$/i.test(f.name); });
    var ok = [], skipped = [];
    return caches.open(VIDEO_CACHE).then(function (cache) {
      return files.reduce(function (p, f, i) {
        return p.then(function () {
          var m = f.name.match(/^(\d{2})[-_. ]/);
          var t = m && window.Kiosk.byN[m[1]];
          if (!t) { skipped.push(f.name); return; }
          var q = t.media && f.size === t.media.lite ? 'lite' : 'hd';
          onProgress({ name: f.name, index: i, files: files.length });
          var res = new Response(f, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(f.size), 'X-Kiosk-Source': 'usb' } });
          return cache.put(localURL(q, t.file), res).then(function () { ok.push(f.name); });
        });
      }, Promise.resolve());
    }).then(refreshIndex).then(function () { return { ok: ok, skipped: skipped }; });
  }

  function clearVideos() {
    return caches.delete(VIDEO_CACHE).then(refreshIndex);
  }

  // Ask the server for a newer version of the app. Resolves 'updating' (page reloads
  // when ready), 'latest' or 'unavailable'.
  function checkForUpdates() {
    if (!reg) return Promise.resolve('unavailable');
    return reg.update().then(function () {
      var w = reg.waiting || reg.installing;
      if (!w) return 'latest';
      reloadOnSwitch = true;
      var activate = function () { if (reg.waiting) reg.waiting.postMessage('skipWaiting'); };
      if (reg.waiting) activate();
      else w.addEventListener('statechange', function () { if (w.state === 'installed') activate(); });
      return 'updating';
    }).catch(function () { return 'unavailable'; });
  }
  // Called just before an idle refresh: switch to a downloaded update, if one is waiting.
  function applyUpdateOnReload() {
    if (reg && reg.waiting) reg.waiting.postMessage('skipWaiting');
  }

  window.Offline = {
    enabled: enabled,
    init: init, has: has, fresh: fresh, controlled: controlled,
    refreshIndex: refreshIndex, storageInfo: storageInfo, totals: totals,
    countFresh: countFresh, readyQuality: readyQuality, chooseQuality: chooseQuality,
    downloadAll: downloadAll, stopDownload: stopDownload, isDownloading: function () { return downloading; },
    importFiles: importFiles, clearVideos: clearVideos,
    checkForUpdates: checkForUpdates, applyUpdateOnReload: applyUpdateOnReload,
    version: function () { return (self.KIOSK_MEDIA && self.KIOSK_MEDIA.version) || '-'; },
  };
})();
