/* CIRS video kiosk: home grid, player, idle showreel and kiosk behaviour. */
(function () {
  'use strict';

  var cfg = self.KIOSK_CONFIG;
  var mediaInfo = (self.KIOSK_MEDIA && self.KIOSK_MEDIA.topics) || {};
  var params = new URLSearchParams(location.search);
  var isFile = location.protocol === 'file:';
  var isVisitor = params.has('visitor');
  var isSoak = params.has('soak');
  var isDemo = params.has('demo'); // team preview: kiosk look, no setup screen, no forced full screen
  var bootTime = Date.now();
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Per-device settings (survive restarts; page still works if storage is blocked) ----------
  function load(key, fallback) {
    try { var v = localStorage.getItem('kiosk.' + key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem('kiosk.' + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }
  var settings = {
    quality: load('quality', 'auto'),       // auto | hd | lite
    mode: load('mode', 'interactive'),      // interactive | loop
    volume: load('volume', 1),
    preferLite: load('preferLite', false),  // set when HD stutters on this device
  };
  function setSetting(key, value) { settings[key] = value; save(key, value); }

  var topics = cfg.topics.map(function (t) {
    return { n: t.n, slug: t.slug, title: t.title, file: t.n + '-' + t.slug + '.mp4', media: mediaInfo[t.n] || null };
  });
  var byN = {};
  topics.forEach(function (t) { byN[t.n] = t; });

  // ---------- State ----------
  // home | opening | playing | closing | attract | screen
  var state = 'home';
  var player = $('player');
  var video = $('video');
  var grid = $('grid');
  var current = null;
  var currentQuality = null;
  var triedLite = false;
  var idleSince = Date.now();
  var openedAt = 0;
  var attractIdx = 0;
  var attractFails = 0;
  var attractPausedUntil = 0;
  var timers = {};
  var updatePending = false;    // a new version is ready: reload at the next quiet moment

  function clearTimer(name) { if (timers[name]) { clearTimeout(timers[name]); timers[name] = null; } }
  function setTimer(name, ms, fn) {
    clearTimer(name);
    timers[name] = setTimeout(function () { timers[name] = null; fn(); }, ms);
  }

  // ---------- Where each video comes from ----------
  function offlineHas(t, q) { return !!(window.Offline && Offline.has(t, q)); }
  function srcFor(t, q) {
    var rel = 'videos/' + q + '/' + t.file;
    if (isFile) return rel;                                                // USB stick / laptop
    if (!isVisitor && window.Offline && Offline.controlled()) return rel; // service worker: cache, else stream
    return (cfg.remoteBase || 'videos/') + q + '/' + t.file;              // direct streaming
  }
  function pickQuality(t) {
    // Lite-only host: still use HD copies if they were loaded from the USB stick.
    if (cfg.liteOnly) return offlineHas(t, 'hd') ? 'hd' : 'lite';
    if (settings.quality === 'hd' || settings.quality === 'lite') return settings.quality;
    if (settings.preferLite && offlineHas(t, 'lite')) return 'lite';
    if (offlineHas(t, 'hd')) return 'hd';
    if (offlineHas(t, 'lite')) return 'lite';
    return settings.preferLite || isVisitor ? 'lite' : 'hd';
  }
  function playableNow(t) {
    if (isFile || isVisitor || !window.Offline || !Offline.enabled) return true;
    return offlineHas(t, 'hd') || offlineHas(t, 'lite') || navigator.onLine;
  }

  // ---------- Home grid ----------
  function renderHome() {
    $('eyebrow').textContent = cfg.eyebrow;
    $('headline').textContent = cfg.headline;
    $('tagline').textContent = cfg.tagline;
    grid.innerHTML = '';
    topics.forEach(function (t) {
      var tile = document.createElement('div');
      tile.className = 'tile';
      tile.tabIndex = 0;
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', t.title);
      tile.dataset.n = t.n;
      tile.innerHTML = '<div class="disc"><img alt="" draggable="false" decoding="async"></div><div class="label"></div>';
      var img = tile.querySelector('img');
      img.onerror = function () { img.parentNode.innerHTML = '<span class="disc-num">' + Number(t.n) + '</span>'; };
      img.src = 'assets/icons/' + t.n + '.webp';
      tile.querySelector('.label').textContent = t.title;
      grid.appendChild(tile);
    });
  }

  // A tile opens only on a clean tap: one finger, little movement, released on the same tile.
  var press = null;
  function cancelPress() {
    if (press) press.tile.classList.remove('pressed');
    press = null;
  }
  grid.addEventListener('pointerdown', function (e) {
    var tile = e.target.closest('.tile');
    if (!tile || state !== 'home') return;
    if (press) { cancelPress(); return; } // second finger: ignore both
    press = { id: e.pointerId, tile: tile, x: e.clientX, y: e.clientY, t: Date.now() };
    tile.classList.add('pressed');
  });
  grid.addEventListener('pointermove', function (e) {
    if (press && e.pointerId === press.id && Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 16) cancelPress();
  });
  grid.addEventListener('pointerup', function (e) {
    if (!press || e.pointerId !== press.id) return;
    var tile = press.tile, held = Date.now() - press.t;
    cancelPress();
    if (held > 1500) return;
    var under = document.elementFromPoint(e.clientX, e.clientY);
    if (under && under.closest('.tile') === tile) openTopic(tile.dataset.n);
  });
  grid.addEventListener('pointercancel', cancelPress);

  // ---------- Player ----------
  function openTopic(n) {
    if (state !== 'home') return;
    var t = byN[n];
    if (!t) return;
    if (!playableNow(t)) { toast('This video is not saved on this screen yet'); return; }
    current = t;
    triedLite = false;
    state = 'opening';
    openedAt = Date.now();
    player.classList.remove('attract', 'paused', 'muted-hint');
    player.classList.add('open', 'show-ui');
    player.setAttribute('aria-hidden', 'false');
    $('titleChip').textContent = t.title;
    setTimer('ui', 4000, function () { player.classList.remove('show-ui'); });
    startVideo(t, pickQuality(t), false);
  }

  function startVideo(t, q, muted) {
    currentQuality = q;
    video.poster = 'posters/' + t.n + '.jpg';
    video.muted = !!muted;
    video.volume = Math.max(0, Math.min(1, settings.volume));
    video.src = srcFor(t, q);
    setProgress(0);
    setTimer('stall', cfg.stallTimeoutSec * 1000 + 4000, function () { failVideo('This video is taking too long to load'); });
    var p = video.play();
    if (p && p.catch) {
      p.catch(function (err) {
        // Browsers may block sound without a tap (e.g. after a restart): play muted and offer sound.
        if (err && err.name === 'NotAllowedError' && !video.muted) {
          video.muted = true;
          if (state !== 'attract') player.classList.add('muted-hint');
          video.play().catch(function () {});
        }
      });
    }
  }

  function setProgress(f) { $('progressFill').style.transform = 'scaleX(' + f + ')'; }

  video.addEventListener('playing', function () {
    clearTimer('stall');
    clearTimer('pause');
    if (state === 'opening') state = 'playing';
    player.classList.remove('paused');
    if (state === 'attract') attractFails = 0;
  });
  video.addEventListener('pause', function () {
    if (state !== 'playing' || video.ended) return;
    player.classList.add('paused', 'show-ui');
    clearTimer('ui');
    setTimer('pause', cfg.pauseTimeoutSec * 1000, function () { closePlayer(); });
  });
  function armStall() {
    if ((state === 'playing' || state === 'attract') && !video.paused) {
      setTimer('stall', cfg.stallTimeoutSec * 1000, function () { failVideo('This video is taking too long to load'); });
    }
  }
  video.addEventListener('waiting', armStall);
  video.addEventListener('stalled', armStall);
  video.addEventListener('timeupdate', function () {
    if (!video.paused) clearTimer('stall');
    if (video.duration) setProgress(video.currentTime / video.duration);
  });
  video.addEventListener('ended', function () {
    if (state === 'attract') nextAttract();
    else closePlayer();
  });
  video.addEventListener('error', function () {
    if (!video.getAttribute('src') || state === 'closing' || state === 'home') return; // cleared on purpose
    if (state === 'attract') { attractFails++; nextAttract(); return; }
    // HD failed (missing file, decoder trouble): try the Lite copy once before giving up.
    if (current && currentQuality === 'hd' && !triedLite) {
      triedLite = true;
      startVideo(current, 'lite', video.muted);
      return;
    }
    failVideo('Sorry, this video could not be played');
  });

  function failVideo(msg) {
    if (state === 'attract') { attractFails++; nextAttract(); return; }
    if (state !== 'opening' && state !== 'playing') return;
    toast(msg);
    closePlayer();
  }

  // Remember if HD stutters on this device, so later videos use the Lite copy (auto mode).
  function checkDroppedFrames() {
    if (currentQuality !== 'hd' || !video.getVideoPlaybackQuality) return;
    var q = video.getVideoPlaybackQuality();
    if (q.totalVideoFrames > 300 && q.droppedVideoFrames / q.totalVideoFrames > 0.2) setSetting('preferLite', true);
  }

  function closePlayer(immediate) {
    if (state === 'home' || state === 'closing' || state === 'screen') return;
    if (state !== 'attract') checkDroppedFrames();
    state = 'closing';
    ['ui', 'pause', 'stall', 'attract'].forEach(clearTimer);
    player.classList.remove('open');
    player.setAttribute('aria-hidden', 'true');
    setTimeout(function () {
      // Release the decoder and file between videos so memory stays flat all day.
      video.pause();
      video.removeAttribute('src');
      video.removeAttribute('poster');
      video.load();
      player.classList.remove('attract', 'paused', 'muted-hint', 'show-ui');
      setProgress(0);
      current = null;
      if (state === 'closing') state = 'home';
      idleSince = Date.now();
    }, immediate ? 0 : 260);
  }

  $('homeBtn').addEventListener('click', function () { if (state === 'opening' || state === 'playing') closePlayer(); });
  $('soundChip').addEventListener('click', unmute);
  function unmute() {
    video.muted = false;
    player.classList.remove('muted-hint');
  }
  $('tapLayer').addEventListener('click', function () {
    // Ignore the tail of a double tap on the tile: the video starts within a fraction of a second.
    if (state !== 'playing' || Date.now() - openedAt < 1000) return;
    if (video.muted) { unmute(); return; }
    if (video.paused) {
      video.play().catch(function () {});
      setTimer('ui', 2500, function () { player.classList.remove('show-ui'); });
    } else {
      video.pause();
    }
  });

  // ---------- Idle showreel (attract loop) ----------
  function attractList() {
    return topics.filter(function (t) { return isFile || offlineHas(t, 'hd') || offlineHas(t, 'lite'); });
  }
  function startAttract() {
    if (state !== 'home' || isVisitor || Date.now() < attractPausedUntil) return false;
    if (!attractList().length) return false;
    state = 'attract';
    attractFails = 0;
    player.classList.remove('show-ui', 'paused', 'muted-hint');
    player.classList.add('open', 'attract');
    player.setAttribute('aria-hidden', 'false');
    playAttract();
    return true;
  }
  function playAttract() {
    var list = attractList();
    if (!list.length || attractFails >= list.length) {
      // Nothing plays: stop trying for a while rather than flicker.
      attractPausedUntil = Date.now() + 10 * 60 * 1000;
      closePlayer(true);
      return;
    }
    var t = list[attractIdx++ % list.length];
    current = t;
    $('attractNow').textContent = t.title;
    startVideo(t, pickQuality(t), true);
    setTimer('attract', cfg.attractClipSec * 1000, nextAttract);
  }
  function nextAttract() { if (state === 'attract') playAttract(); }
  function stopAttract() { if (state === 'attract') closePlayer(); }

  // ---------- Screens (setup / staff) ----------
  function showScreen(el) {
    if (state !== 'home' && state !== 'screen') closePlayer(true);
    state = 'screen';
    el.hidden = false;
    el.scrollTop = 0;
  }
  function hideScreen(el) {
    el.hidden = true;
    if (!document.querySelector('.screen:not([hidden])')) { state = 'home'; idleSince = Date.now(); }
  }

  // ---------- Toast ----------
  function toast(msg, ms) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimer('toast', ms || 3500, function () { el.classList.remove('show'); });
  }

  // ---------- Kiosk behaviour ----------
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    var fluid = isVisitor || w < 700 || (w < 1000 && h > w);
    document.documentElement.classList.toggle('fluid', fluid);
    var s = fluid ? 1 : Math.min(w / 1920, h / 1080);
    document.documentElement.style.setProperty('--scale', String(s));
  }

  function enterFullscreen() {
    if (isVisitor || isDemo || params.has('nofs')) return;
    var d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) return;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return;
    try {
      var p = fn.call(el, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* not allowed here */ }
  }

  var wakeLock = null;
  function keepAwake() {
    if (isVisitor || !('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () {});
  }
  document.addEventListener('visibilitychange', keepAwake);

  if (!isVisitor) {
    ['contextmenu', 'selectstart', 'dragstart', 'gesturestart'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { e.preventDefault(); });
    });
    // Block pinch-zoom and page bounce, but let setup/staff screens scroll.
    document.addEventListener('touchmove', function (e) {
      var scrollable = e.target.closest('.scroll') || document.documentElement.classList.contains('fluid');
      if (e.touches.length > 1 || !scrollable) e.preventDefault();
    }, { passive: false });
    document.addEventListener('wheel', function (e) { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  }

  // Any touch: reset idle timer, leave the showreel, re-enter full screen, keep the screen awake.
  document.addEventListener('pointerdown', function (e) {
    idleSince = Date.now();
    if (state === 'attract' && settings.mode !== 'loop') { e.preventDefault(); stopAttract(); }
    staffPressStart(e);
  }, true);
  document.addEventListener('pointerup', function () {
    staffPressEnd();
    if (state !== 'screen') enterFullscreen();
    keepAwake();
  }, true);
  document.addEventListener('pointercancel', staffPressEnd, true);

  // Staff screen: hold the top-right corner ("Keep Smiling") for 5 seconds.
  var staffTimer = null;
  function staffPressStart(e) {
    var zone = Math.max(160, 300 * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale') || 1));
    if (e.clientX < window.innerWidth - zone * 1.6 || e.clientY > zone) return;
    clearTimeout(staffTimer);
    staffTimer = setTimeout(function () { if (window.Staff) Staff.requestOpen(); }, 5000);
  }
  function staffPressEnd() { clearTimeout(staffTimer); }

  // Keyboard / remote / mouse support (if touch fails, a wireless mouse or keyboard still works).
  document.addEventListener('keydown', function (e) {
    idleSince = Date.now();
    if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) { e.preventDefault(); if (window.Staff) Staff.requestOpen(); return; }
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].indexOf(e.key) >= 0) { e.preventDefault(); return; }
    if (state === 'attract') { if (settings.mode !== 'loop') stopAttract(); return; }
    if (state === 'opening' || state === 'playing') {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack') { e.preventDefault(); closePlayer(); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); $('tapLayer').click(); }
      return;
    }
    if (state !== 'home') return;
    var tiles = Array.prototype.slice.call(grid.children);
    var i = tiles.indexOf(document.activeElement);
    if (/^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
      e.preventDefault();
      var next = i < 0 ? tiles[0] : neighbour(tiles, tiles[i], e.key);
      if (next) next.focus();
    } else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) {
      e.preventDefault();
      openTopic(tiles[i].dataset.n);
    }
  });

  // The tile in the arrow's direction, by position on screen (rows are staggered 7-6-6).
  // Left/right past the end of a row continue in reading order.
  function neighbour(tiles, from, key) {
    var r = from.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    var best = null, bestScore = Infinity;
    tiles.forEach(function (t) {
      var q = t.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      var sameRow = Math.abs(dy) < r.height / 2;
      var ahead = key === 'ArrowRight' ? sameRow && dx > 1 : key === 'ArrowLeft' ? sameRow && dx < -1 :
        key === 'ArrowDown' ? dy > r.height / 2 : dy < -r.height / 2;
      var score = horizontal ? Math.abs(dx) : Math.abs(dy) * 4 + Math.abs(dx);
      if (ahead && score < bestScore) { best = t; bestScore = score; }
    });
    if (!best && horizontal) best = tiles[tiles.indexOf(from) + (key === 'ArrowRight' ? 1 : -1)] || null;
    return best;
  }

  // Every few seconds: start the showreel when idle, and refresh the page now and then
  // (only when nobody is using it) to keep long days fresh.
  setInterval(function () {
    var idleMs = Date.now() - idleSince;
    // New version published (online): reload once the screen has been idle on home for 20 s (or during
    // the idle showreel), so nobody's video is cut off.
    if (updatePending && ((state === 'home' && idleMs > 20000) || state === 'attract')) { location.reload(); return; }
    if (state === 'home' && !isVisitor && !isSoak) {
      if (settings.mode === 'loop' || (cfg.attractAfterSec > 0 && idleMs > cfg.attractAfterSec * 1000)) startAttract();
    }
    var uptimeH = (Date.now() - bootTime) / 3600000;
    if (!isVisitor && cfg.idleReloadHours > 0 && uptimeH > cfg.idleReloadHours && idleMs > 5 * 60 * 1000 &&
        (state === 'home' || state === 'attract')) {
      if (window.Offline) Offline.applyUpdateOnReload();
      location.reload();
    }
  }, 5000);

  // ---------- Soak test: ?soak=1 plays random topics for hours ----------
  function startSoak() {
    var info = $('soakInfo'), plays = 0, start = Date.now();
    info.hidden = false;
    setInterval(function () {
      if (state === 'home') {
        openTopic(topics[Math.floor(Math.random() * topics.length)].n);
        plays++;
      } else if (state === 'playing' && video.duration > 10 && Date.now() - openedAt > 6000 && video.currentTime < video.duration - 5) {
        video.currentTime = video.duration - 3;
      }
      var mem = performance.memory ? ' · ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB JS heap' : '';
      info.textContent = 'SOAK · ' + plays + ' plays · ' + Math.round((Date.now() - start) / 60000) + ' min' + mem;
    }, 2500);
  }

  // ---------- Boot ----------
  layout();
  window.addEventListener('resize', layout);
  renderHome();
  keepAwake();

  window.Kiosk = {
    cfg: cfg, topics: topics, byN: byN, settings: settings, setSetting: setSetting,
    isFile: isFile, isVisitor: isVisitor, isDemo: isDemo,
    state: function () { return state; },
    openTopic: openTopic, closePlayer: closePlayer, startAttract: startAttract, stopAttract: stopAttract,
    showScreen: showScreen, hideScreen: hideScreen, toast: toast, enterFullscreen: enterFullscreen,
    srcFor: srcFor, pickQuality: pickQuality,
    updateReady: function () { updatePending = true; },
  };

  document.addEventListener('DOMContentLoaded', function () {
    var ready = window.Offline ? Offline.init() : Promise.resolve();
    ready.then(function () {
      if (window.Setup) Setup.maybeShow();
      if (isSoak) startSoak();
    });
  });
})();
