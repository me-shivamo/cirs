/* Staff screen: PIN, status at a glance, self-test, quality/mode/volume, repairs.
   A photo of this screen tells the developer what is wrong, from anywhere. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var screen = $('staff');
  var modal = $('modal');
  var box = $('modalBox');
  var testResults = {}; // n -> 'pass' | 'fail' | 'run'

  function K() { return window.Kiosk; }
  function mb(bytes) { return bytes >= 1e9 ? (bytes / 1e9).toFixed(1) + ' GB' : Math.round(bytes / 1e6) + ' MB'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- Modal helpers ----------
  function closeModal() { modal.hidden = true; box.innerHTML = ''; }
  function confirmBox(title, text, okLabel) {
    return new Promise(function (resolve) {
      box.innerHTML = '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>' +
        '<div class="btn-row" style="justify-content:center"><button class="btn btn-outline" data-a="no">Cancel</button>' +
        '<button class="btn btn-danger" data-a="yes">' + esc(okLabel) + '</button></div>';
      modal.hidden = false;
      box.onclick = function (e) {
        var a = e.target.closest('button') && e.target.closest('button').dataset.a;
        if (!a) return;
        closeModal();
        resolve(a === 'yes');
      };
    });
  }

  function requestOpen() {
    if (!screen.hidden || !modal.hidden) return;
    var pin = K().cfg.staffPin;
    if (!pin) { open(); return; }
    var entered = '';
    box.innerHTML = '<h2>Staff PIN</h2><div class="pin-dots" id="pinDots"></div><div class="pin-pad" id="pinPad"></div>' +
      '<div class="btn-row" style="justify-content:center"><button class="btn btn-ghost" data-k="cancel">Cancel</button></div>';
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
    $('pinPad').innerHTML = keys.map(function (k) { return '<button data-k="' + k + '">' + k + '</button>'; }).join('');
    function dots() {
      $('pinDots').innerHTML = pin.split('').map(function (_, i) { return '<i class="' + (i < entered.length ? 'on' : '') + '"></i>'; }).join('');
    }
    dots();
    modal.hidden = false;
    var cancelTimer = setTimeout(closeModal, 30000);
    box.onclick = function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var k = b.dataset.k;
      if (k === 'cancel') { clearTimeout(cancelTimer); closeModal(); return; }
      if (k === '⌫') entered = entered.slice(0, -1);
      else if (k !== 'OK' && entered.length < pin.length) entered += k;
      dots();
      if (entered.length === pin.length) {
        if (entered === pin) { clearTimeout(cancelTimer); closeModal(); open(); }
        else {
          box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
          entered = '';
          setTimeout(dots, 250);
        }
      }
    };
  }

  // ---------- Staff screen ----------
  function open() {
    K().showScreen(screen);
    refresh();
  }

  function message(text) { $('staffMsg').textContent = text || ''; }

  function stat(label, value, cls) {
    return '<div class="stat ' + (cls || '') + '"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>';
  }

  function deviceSummary() {
    var ua = navigator.userAgent;
    var os = (ua.match(/Android [\d.]+/) || ua.match(/Windows NT [\d.]+/) || ua.match(/Mac OS X [\d_]+/) || ua.match(/Linux/) || ['?'])[0];
    var br = (ua.match(/(Edg|Chrome|Firefox|Version)\/[\d]+/) || ['?'])[0].replace('Version', 'Safari');
    return os.replace('Windows NT 10.0', 'Windows 10/11') + ' · ' + br;
  }

  function refresh(msg) {
    if (screen.hidden) return Promise.resolve();
    if (msg) message(msg);
    var k = K(), topics = k.topics, n = topics.length, off = window.Offline;
    var modeText = k.isFile ? 'USB / laptop files' : k.isVisitor ? 'Visitor link' : off && off.enabled ? 'Online link' : 'Web page';
    var refreshIndex = off && off.enabled ? off.refreshIndex() : Promise.resolve();
    return refreshIndex.then(function () {
      return off && off.enabled ? off.storageInfo() : null;
    }).then(function (info) {
      var html = '';
      if (k.isFile) {
        html += stat('Videos', 'Played from files', 'ok');
      } else if (off && off.enabled) {
        var hd = off.countFresh('hd'), lite = off.countFresh('lite');
        var best = Math.max(hd, lite);
        html += stat('Videos saved on this screen', best + ' / ' + n + (hd >= lite ? ' HD' : ' Lite'), best === n ? 'ok' : 'bad');
        if (info) html += stat('Storage used / available', mb(info.usage) + ' / ' + mb(info.quota) + (info.persisted ? ' · kept' : ''));
      }
      var passed = Object.keys(testResults).filter(function (x) { return testResults[x] === 'pass'; }).length;
      var failed = Object.keys(testResults).filter(function (x) { return testResults[x] === 'fail'; }).length;
      if (passed || failed) html += stat('Self-test', passed + ' passed' + (failed ? ', ' + failed + ' failed' : ''), failed ? 'bad' : 'ok');
      html += stat('Running as', modeText + (window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ? ' · installed' : ''));
      html += stat('Internet', navigator.onLine ? 'Connected' : 'Offline');
      html += stat('Screen', document.documentElement.clientWidth + '×' + document.documentElement.clientHeight + ' @' + (window.devicePixelRatio || 1) + 'x');
      html += stat('Device', deviceSummary());
      html += stat('Version', 'videos ' + (off ? off.version() : '-'));
      $('staffStats').innerHTML = html;
      renderTable();
      renderSettings();
      $('staffDownload').hidden = $('staffUsb').hidden = $('staffClear').hidden = !(off && off.enabled);
      $('staffUpdate').hidden = !(off && off.enabled);
    });
  }

  function renderTable() {
    var k = K(), off = window.Offline, online = off && off.enabled;
    var rows = '<tr><th>#</th><th>Topic</th>' + (online ? '<th class="c">HD</th><th class="c">Lite</th>' : '') + '<th class="c">Test</th></tr>';
    k.topics.forEach(function (t) {
      var r = testResults[t.n];
      var test = r === 'pass' ? '<span class="yes">✓</span>' : r === 'fail' ? '<span class="fail">✗</span>' : r === 'run' ? '…' : '<span class="no">–</span>';
      rows += '<tr><td>' + Number(t.n) + '</td><td>' + esc(t.title) + '</td>' +
        (online ? '<td class="c">' + mark(off.fresh(t, 'hd'), off.has(t, 'hd')) + '</td><td class="c">' + mark(off.fresh(t, 'lite'), off.has(t, 'lite')) + '</td>' : '') +
        '<td class="c">' + test + '</td></tr>';
    });
    $('topicTable').innerHTML = rows;
  }
  function mark(isFresh, isSaved) {
    if (isFresh) return '<span class="yes">✓</span>';
    if (isSaved) return '<span class="fail" title="older version">old</span>';
    return '<span class="no">–</span>';
  }

  function renderSettings() {
    var s = K().settings;
    [['segQuality', s.quality], ['segMode', s.mode]].forEach(function (pair) {
      Array.prototype.forEach.call($(pair[0]).children, function (b) { b.classList.toggle('on', b.dataset.v === pair[1]); });
    });
    $('volume').value = Math.round(s.volume * 100);
  }

  // ---------- Self-test: play 1 second of every video ----------
  function testOne(t) {
    return new Promise(function (resolve) {
      var v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        v.pause();
        v.removeAttribute('src');
        v.load();
        resolve(ok);
      }
      var timer = setTimeout(function () { finish(v.currentTime > 0.3); }, 10000);
      v.addEventListener('error', function () { finish(false); });
      v.addEventListener('timeupdate', function () { if (v.currentTime > 1) finish(true); });
      v.src = K().srcFor(t, K().pickQuality(t));
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    });
  }

  function runSelfTest() {
    var btn = $('staffTest');
    btn.disabled = true;
    testResults = {};
    var topics = K().topics, i = 0;
    function next() {
      if (i >= topics.length) {
        btn.disabled = false;
        var failed = topics.filter(function (t) { return testResults[t.n] !== 'pass'; });
        return refresh(failed.length ? '✗ ' + failed.length + ' video(s) failed: ' + failed.map(function (t) { return Number(t.n); }).join(', ') : '✓ All ' + topics.length + ' videos play correctly.');
      }
      var t = topics[i++];
      testResults[t.n] = 'run';
      message('Testing ' + i + ' of ' + topics.length + ': ' + t.title);
      renderTable();
      return testOne(t).then(function (ok) { testResults[t.n] = ok ? 'pass' : 'fail'; return next(); });
    }
    next();
  }

  // ---------- Wiring ----------
  $('staffClose').addEventListener('click', function () { K().hideScreen(screen); });
  $('staffTest').addEventListener('click', runSelfTest);
  $('staffDownload').addEventListener('click', function () { K().hideScreen(screen); window.Setup.open(); });
  $('staffUsb').addEventListener('click', function () { window.Setup.pickUsb('staff'); });
  $('staffReload').addEventListener('click', function () { location.reload(); });
  $('staffUpdate').addEventListener('click', function () {
    message('Checking for updates…');
    window.Offline.checkForUpdates().then(function (r) {
      message(r === 'updating' ? 'Update found. The app will restart in a moment.' : r === 'latest' ? 'This is the latest version.' : 'Could not check (no internet?).');
    });
  });
  $('staffClear').addEventListener('click', function () {
    confirmBox('Delete saved videos?', 'The videos will need to be downloaded or loaded from USB again.', 'Delete').then(function (yes) {
      if (yes) window.Offline.clearVideos().then(function () { refresh('Saved videos deleted.'); });
    });
  });
  $('segQuality').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    K().setSetting('quality', b.dataset.v);
    if (b.dataset.v !== 'lite') K().setSetting('preferLite', false);
    renderSettings();
  });
  $('segMode').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    K().setSetting('mode', b.dataset.v);
    renderSettings();
    message(b.dataset.v === 'loop' ? 'Loop only: the videos play one after another and touches are ignored. Close this screen to start.' : '');
  });
  $('volume').addEventListener('input', function () { K().setSetting('volume', Number(this.value) / 100); });

  window.Staff = { requestOpen: requestOpen, open: open, refresh: refresh, message: message };
})();
