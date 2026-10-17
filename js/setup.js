/* Setup screen (hosted link only): save the videos on this screen, then Start.
   Shown automatically until all videos are saved. Big buttons, plain words. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var screen = $('setup');
  var installPrompt = null;
  var usbTarget = null; // which screen asked for the USB file picker

  function mb(bytes) { return bytes >= 1e9 ? (bytes / 1e9).toFixed(1) + ' GB' : Math.round(bytes / 1e6) + ' MB'; }
  function total() { return window.Kiosk.topics.length; }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installPrompt = e;
    $('setupInstall').hidden = false;
  });
  window.addEventListener('appinstalled', function () { $('setupInstall').hidden = true; });

  function render() {
    var q = Offline.readyQuality();
    var savedHd = Offline.countFresh('hd'), savedLite = Offline.countFresh('lite');
    var saved = Math.max(savedHd, savedLite);
    var status = $('setupStatus');
    $('setupTitle').textContent = 'Save the ' + total() + ' videos';
    if (q) {
      status.textContent = '✓ All ' + total() + ' videos are saved. This screen works without internet.';
      status.className = 'status ok';
      $('setupDownload').textContent = 'Check again';
    } else {
      status.textContent = saved + ' of ' + total() + ' videos saved';
      status.className = 'status';
      $('setupDownload').textContent = saved ? 'Continue download' : 'Download videos';
    }
    $('setupStart').textContent = q ? 'Start' : 'Start anyway';
    $('startNote').textContent = q
      ? 'Tap Start. The videos open full screen.'
      : 'Without saved videos, the screen needs internet to play them.';
    Offline.storageInfo().then(function (info) {
      var t = Offline.totals();
      var parts = [window.Kiosk.cfg.liteOnly ? 'Needs about ' + mb(t.lite) : 'Needs about ' + mb(t.hd) + ' (HD) or ' + mb(t.lite) + ' (Lite)'];
      if (info && info.quota) parts.push('free space about ' + mb(Math.max(0, info.quota - info.usage)));
      if (!$('setupDetail').dataset.busy) $('setupDetail').textContent = parts.join(' · ') + '.';
    });
    $('setupFoot').textContent = 'Version ' + Offline.version() +
      ' · Staff options: hold “Keep Smiling” (top right) for 5 seconds.';
  }

  function setBusy(on) {
    $('setupDownload').disabled = on;
    $('setupUsb').disabled = on;
    $('setupStop').hidden = !on;
    $('setupBar').hidden = !on;
    if (on) $('setupDetail').dataset.busy = '1';
    else delete $('setupDetail').dataset.busy;
  }

  function download() {
    setBusy(true);
    Offline.chooseQuality().then(function (q) {
      return Offline.downloadAll(q, function (p) {
        var detail = $('setupDetail');
        if (p.phase === 'file' || p.phase === 'bytes') {
          var frac = p.totalBytes ? p.doneBytes / p.totalBytes : p.index / p.files;
          $('setupBarFill').style.transform = 'scaleX(' + Math.min(1, frac) + ')';
          $('setupStatus').textContent = 'Saving video ' + (p.index + 1) + ' of ' + p.files + ': ' + p.topic.title;
          $('setupStatus').className = 'status';
          detail.textContent = mb(p.doneBytes) + ' of ' + mb(p.totalBytes) + ' · ' + (q === 'hd' ? 'HD' : 'Lite') + ' quality · keep this screen open';
        } else if (p.phase === 'retry') {
          detail.textContent = p.offline
            ? 'Internet connection lost. It will continue by itself when the connection is back.'
            : 'Connection problem. Trying again…';
        } else if (p.phase === 'done') {
          setBusy(false);
          render();
          if (p.failed && p.failed.length) {
            $('setupStatus').textContent = p.failed.length + ' video(s) could not be saved. Tap “Continue download” to try again.';
            $('setupStatus').className = 'status bad';
          } else if (Offline.readyQuality()) {
            window.Kiosk.toast('All videos saved');
          }
        }
      });
    });
  }

  function pickUsb(target) {
    usbTarget = target;
    var input = $('fileInput');
    input.value = '';
    input.click();
  }
  $('fileInput').addEventListener('change', function () {
    var files = this.files;
    if (!files || !files.length) return;
    var target = usbTarget;
    if (target === 'setup') setBusy(true);
    Offline.importFiles(files, function (p) {
      var msg = 'Loading ' + (p.index + 1) + ' of ' + p.files + ': ' + p.name;
      if (target === 'setup') {
        $('setupStatus').textContent = msg;
        $('setupBarFill').style.transform = 'scaleX(' + (p.index + 1) / p.files + ')';
      } else if (window.Staff) {
        Staff.message(msg);
      }
    }).then(function (r) {
      if (target === 'setup') { setBusy(false); render(); }
      var msg = r.ok.length + ' video(s) loaded' + (r.skipped.length ? ', ' + r.skipped.length + ' file(s) not recognised' : '');
      window.Kiosk.toast(msg, 5000);
      if (window.Staff) Staff.refresh(msg);
    }).catch(function (err) {
      if (target === 'setup') { setBusy(false); render(); }
      window.Kiosk.toast('Could not load the files: ' + err.message, 6000);
    });
  });

  $('setupDownload').addEventListener('click', download);
  $('setupUsb').addEventListener('click', function () { pickUsb('setup'); });
  $('setupStop').addEventListener('click', function () { Offline.stopDownload(); });
  $('setupStart').addEventListener('click', function () {
    if (Offline.isDownloading()) Offline.stopDownload();
    try { localStorage.setItem('kiosk.setupDone', '1'); } catch (e) { /* ignore */ }
    window.Kiosk.hideScreen(screen);
    window.Kiosk.enterFullscreen();
  });
  $('setupInstall').addEventListener('click', function () {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then(function () { installPrompt = null; $('setupInstall').hidden = true; });
  });

  function open() {
    if (!Offline.enabled) { window.Kiosk.toast('Videos are played from local files here'); return; }
    window.Kiosk.showScreen(screen);
    render();
  }

  // On load: show setup if this is the hosted link and the videos are not all saved yet,
  // unless staff already chose "Start anyway" (then idle refreshes go straight to home).
  function maybeShow() {
    if (!Offline.enabled || Offline.readyQuality() || window.Kiosk.isDemo) return;
    var started = false;
    try { started = localStorage.getItem('kiosk.setupDone') === '1'; } catch (e) { /* ignore */ }
    if (!started) open();
  }

  window.Setup = { open: open, maybeShow: maybeShow, pickUsb: pickUsb, download: download };
})();
