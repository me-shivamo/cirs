#!/usr/bin/env node
// End-to-end tests for the kiosk in headless Chrome.
//   node tools/test/e2e.mjs file      USB/laptop mode (file://)
//   node tools/test/e2e.mjs hosted    hosted link: download, then play with the server switched off
//   node tools/test/e2e.mjs visitor   phone layout for the QR link
//   node tools/test/e2e.mjs soak 10   random plays for N minutes, watching memory
// Screenshots go to tools/test/out/.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { launch } from './cdp.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const out = join(root, 'tools/test/out');
mkdirSync(out, { recursive: true });
const suite = process.argv[2] || 'file';
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
};
const step = async (name, fn) => {
  try { await fn(); } catch (e) { check(name, false, e.message); }
};

const { page, close, sleep } = await launch({ port: suite === 'soak' ? 9334 : 9333, autoplay: suite !== 'extras' });
await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const state = () => page.eval('Kiosk.state()');
const tile = (n) => page.center(`.tile[data-n="${n}"] .disc`);
const tapTile = async (n) => { const c = await tile(n); await page.tap(c.x, c.y); };
const waitPlaying = (n, t = 15000) => page.waitFor(`Kiosk.state() === 'playing' && document.getElementById('video').currentTime > 1 && document.getElementById('video').src.includes('/${n}-')`, t);
const waitHome = (t = 8000) => page.waitFor(`Kiosk.state() === 'home' && !document.getElementById('video').getAttribute('src')`, t);

async function commonPlayerTests(n) {
  await step('tap a tile plays the video', async () => {
    await tapTile(n);
    await waitPlaying(n);
    check('tap a tile plays the video', true, await page.eval('document.getElementById("video").src.split("/").slice(-2).join("/")'));
    await page.screenshot(join(out, `${suite}-player.png`));
  });
  await step('tap video pauses, tap again resumes', async () => {
    await page.tap(960, 540);
    await page.waitFor('document.getElementById("player").classList.contains("paused")', 3000);
    await page.screenshot(join(out, `${suite}-paused.png`));
    await page.tap(960, 540);
    await page.waitFor('!document.getElementById("video").paused', 3000);
    check('tap video pauses, tap again resumes', true);
  });
  await step('returns home when the video ends', async () => {
    await page.eval('(v => { v.currentTime = v.duration - 1.5; })(document.getElementById("video"))');
    await waitHome(8000);
    check('returns home when the video ends', true);
  });
  await step('double tap opens only one video', async () => {
    const c = await tile('02');
    await page.tap(c.x, c.y);
    await page.tap(c.x, c.y);
    const c2 = await tile('03');
    await page.tap(c2.x, c2.y);
    await waitPlaying('02');
    check('double tap opens only one video', (await page.eval('document.getElementById("video").src')).includes('/02-'));
  });
  await step('Home button returns home', async () => {
    const c = await page.center('#homeBtn');
    await page.tap(c.x, c.y);
    await waitHome();
    check('Home button returns home', true);
  });
  await step('keyboard: arrows + Enter play, Escape returns', async () => {
    const focused = () => page.eval('document.activeElement.dataset.n');
    await page.eval('document.querySelector(".tile").focus()');
    await page.key('ArrowRight', 0, 'ArrowRight');
    const right = await focused();
    await page.key('ArrowDown', 0, 'ArrowDown');
    const down = await focused();
    await page.key('ArrowUp', 0, 'ArrowUp');
    await page.key('ArrowDown', 0, 'ArrowDown');
    await page.key('Enter', 0, 'Enter');
    await waitPlaying(down);
    await page.key('Escape', 0, 'Escape');
    await waitHome();
    check('keyboard: arrows + Enter play, Escape returns', right === '01' && ['07', '08'].includes(down), `right→${right}, down→${down}`);
  });
  await step('drag across a tile does not open it', async () => {
    const c = await tile('05');
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + 60, y: c.y + 10 }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(800);
    check('drag across a tile does not open it', (await state()) === 'home');
  });
}

async function attractTest() {
  await step('idle showreel starts, touch returns home', async () => {
    await page.eval('Kiosk.cfg.attractAfterSec = 2');
    await page.waitFor(`Kiosk.state() === 'attract' && document.getElementById('video').currentTime > 0.5`, 20000);
    await page.screenshot(join(out, `${suite}-attract.png`));
    await page.tap(400, 400);
    await waitHome();
    await page.eval('Kiosk.cfg.attractAfterSec = 0');
    check('idle showreel starts, touch returns home', true);
  });
}

async function staffTest(expectAll) {
  await step('staff PIN + self-test', async () => {
    await page.key('S', 10, 'KeyS'); // Ctrl+Shift+S
    await page.waitFor('!document.getElementById("modal").hidden', 3000);
    for (const d of '2026') await page.clickSel(`#pinPad button[data-k="${d}"]`);
    await page.waitFor('!document.getElementById("staff").hidden && document.getElementById("staffStats").children.length > 0', 5000);
    await sleep(300); // let the status tiles settle before tapping
    await page.clickSel('#staffTest');
    await page.waitFor('document.getElementById("staffTest").disabled', 3000);
    await page.waitFor('!document.getElementById("staffTest").disabled', 240000, 1000);
    const msg = await page.eval('document.getElementById("staffMsg").textContent');
    await page.screenshot(join(out, `${suite}-staff.png`));
    check('staff PIN + self-test', expectAll ? msg.startsWith('✓') : true, msg);
    await page.clickSel('#staffClose');
    await waitHome();
  });
}

if (suite === 'file') {
  await page.goto(`file://${root}/index.html?nofs`);
  check('19 tiles rendered, CIRS first', (await page.eval('[...document.querySelectorAll(".tile")].map(t => t.dataset.n).join()')) === '19,' + Array.from({ length: 18 }, (_, i) => String(i + 1).padStart(2, '0')).join());
  check('all 19 icons loaded', (await page.eval('[...document.querySelectorAll(".disc img")].filter(i => i.naturalWidth === 400).length')) === 19);
  check('rows of 7, 6, 6', (await page.eval(`(() => { const rows = {}; document.querySelectorAll('.tile').forEach(t => { const k = Math.round(t.getBoundingClientRect().top); rows[k] = (rows[k] || 0) + 1; }); return Object.values(rows).join('-'); })()`)) === '7-6-6');
  check('Baloo 2 font loaded', await page.eval('document.fonts.check("800 64px \'Baloo 2\'")'));
  await page.screenshot(join(out, 'file-home.png'));
  await commonPlayerTests('08');
  await attractTest();
  await staffTest(true);
}

if (suite === 'hosted') {
  const port = 8090;
  let server = spawn('node', [join(root, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
  await sleep(500);
  await page.goto(`http://localhost:${port}/?nofs`);
  await step('setup screen shown on first visit', async () => {
    await page.waitFor('!document.getElementById("setup").hidden', 5000);
    await page.screenshot(join(out, 'hosted-setup.png'));
    check('setup screen shown on first visit', true);
  });
  await step('service worker takes control', async () => {
    await page.waitFor('!!navigator.serviceWorker.controller', 20000);
    check('service worker takes control', true);
  });
  await step('download saves all videos', async () => {
    await page.clickSel('#setupDownload');
    await sleep(4000);
    await page.screenshot(join(out, 'hosted-downloading.png'));
    const t0 = Date.now();
    await page.waitFor('Offline.readyQuality() !== null && !Offline.isDownloading()', 15 * 60 * 1000, 2000);
    await page.screenshot(join(out, 'hosted-saved.png'));
    check('download saves all videos', true, `${await page.eval('Offline.readyQuality()')} in ${Math.round((Date.now() - t0) / 1000)} s`);
  });
  await page.clickSel('#setupStart');
  await waitHome();

  // From here on there is no server at all: everything must come from the device.
  server.kill('SIGKILL');
  await sleep(500);
  const off = await fetch(`http://localhost:${port}/`).then(() => false, () => true);
  check('server is switched off', off);
  await commonPlayerTests('19');
  await step('seeking inside a saved video works offline', async () => {
    await tapTile('04');
    await waitPlaying('04');
    await page.eval('(v => { v.currentTime = v.duration / 2; })(document.getElementById("video"))');
    await page.waitFor('(v => v.currentTime > v.duration / 2 + 1)(document.getElementById("video"))', 10000);
    check('seeking inside a saved video works offline', true);
    await page.clickSel('#homeBtn');
    await waitHome();
  });
  await step('page reload works with no server', async () => {
    await page.goto(`http://localhost:${port}/?nofs`);
    await page.waitFor('document.querySelectorAll(".tile").length === Kiosk.topics.length && document.getElementById("setup").hidden', 10000);
    check('page reload works with no server', true);
  });
  await attractTest();
  await staffTest(true);
  await step('USB import stores files', async () => {
    const files = readdirSync(join(root, 'videos/lite')).filter((f) => /^0[1-3]-.*\.mp4$/.test(f)).map((f) => join(root, 'videos/lite', f));
    const { result } = await page.send('Runtime.evaluate', { expression: 'document.getElementById("fileInput")' });
    await page.send('DOM.enable');
    await page.send('DOM.setFileInputFiles', { files, objectId: result.objectId });
    await page.waitFor('["01","02","03"].every(n => Offline.has(Kiosk.byN[n], "lite"))', 60000, 1000);
    check('USB import stores files', true, files.length + ' files');
  });
}

if (suite === 'visitor') {
  await page.viewport(390, 844, true, 2);
  const port = 8091;
  const server = spawn('node', [join(root, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
  await sleep(500);
  await page.goto(`http://localhost:${port}/?visitor`);
  check('phone layout used', await page.eval('document.documentElement.classList.contains("fluid")'));
  check('no setup screen for visitors', await page.eval('document.getElementById("setup").hidden'));
  await page.screenshot(join(out, 'visitor-home.png'));
  await step('visitor plays the Lite copy', async () => {
    await tapTile('06');
    await waitPlaying('06');
    check('visitor plays the Lite copy', (await page.eval('document.getElementById("video").src')).includes('/lite/'));
    await page.screenshot(join(out, 'visitor-player.png'));
  });
  server.kill('SIGKILL');
}

if (suite === 'extras') {
  // Launched WITHOUT the autoplay flag, like a fresh browser: sound needs a real tap.
  await page.goto(`file://${root}/index.html?nofs`);
  await step('sound blocked without a tap: plays muted and offers sound', async () => {
    await page.eval('Kiosk.openTopic("14")'); // programmatic open = no user gesture
    await page.waitFor(`Kiosk.state() === 'playing'`, 15000);
    const r = await page.eval('({ muted: document.getElementById("video").muted, hint: document.getElementById("player").classList.contains("muted-hint") })');
    await page.screenshot(join(out, 'extras-muted-hint.png'));
    check('sound blocked without a tap: plays muted and offers sound', r.muted && r.hint, JSON.stringify(r));
    const c = await page.center('#soundChip');
    await page.tap(c.x, c.y);
    await page.waitFor('!document.getElementById("video").muted', 3000);
    check('tapping "Tap for sound" unmutes', true);
    await page.clickSel('#homeBtn');
    await waitHome();
  });
  await step('broken video: tries Lite, then returns home with a message', async () => {
    await page.eval('Kiosk.byN["01"].file = "missing-file.mp4"');
    await tapTile('01');
    await waitHome(15000);
    const toast = await page.eval('document.getElementById("toast").textContent');
    check('broken video: tries Lite, then returns home with a message', /could not be played/.test(toast), toast);
    await page.eval('Kiosk.byN["01"].file = "01-journey-of-cvs.mp4"');
  });
  await step('paused video returns home after the timeout', async () => {
    await page.eval('Kiosk.cfg.pauseTimeoutSec = 3');
    await tapTile('16');
    await waitPlaying('16');
    await page.tap(960, 540);
    await page.waitFor('document.getElementById("player").classList.contains("paused")', 3000);
    await waitHome(8000);
    check('paused video returns home after the timeout', true);
  });
  await step('loop-only mode ignores touches', async () => {
    await page.eval('Kiosk.setSetting("mode", "loop")');
    await page.waitFor(`Kiosk.state() === 'attract'`, 12000);
    await page.tap(500, 500);
    await sleep(1500);
    check('loop-only mode ignores touches', (await state()) === 'attract');
    await page.eval('Kiosk.setSetting("mode", "interactive"); Kiosk.stopAttract()');
    await waitHome();
  });
  await step('4K screen: stage scales to fill', async () => {
    await page.viewport(3840, 2160);
    await sleep(500);
    const scale = await page.eval('getComputedStyle(document.documentElement).getPropertyValue("--scale")');
    check('4K screen: stage scales to fill', Number(scale) === 2, 'scale ' + scale);
    await page.viewport(1366, 768);
    await sleep(500);
    await page.screenshot(join(out, 'extras-1366x768.png'));
    const s2 = await page.eval('getComputedStyle(document.documentElement).getPropertyValue("--scale")');
    check('1366x768 screen: stage scales down', Math.abs(Number(s2) - 0.7111) < 0.01, 'scale ' + s2);
  });
}

if (suite === 'update') {
  // Publishing a new version must reach people who opened the link before, without them
  // refreshing. "Old" = the live preview (dist/gh-pages); "new" = a fresh build (dist/site).
  const { execSync } = await import('node:child_process');
  const sh = (cmd) => execSync(cmd, { cwd: root, stdio: 'pipe' }).toString();
  const port = 8099, base = `http://localhost:${port}/dist/updtest/`;
  const label19 = 'document.querySelector(\'.tile[data-n="19"] .label\').textContent';
  sh('rm -rf dist/updtest && mkdir -p dist/updtest && rsync -a --exclude .git --exclude videos dist/gh-pages/ dist/updtest/');
  sh('tools/build-site.sh --lite-only >/dev/null');
  const server = spawn('node', [join(root, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
  await sleep(500);

  await page.goto(base + '?demo');
  await page.waitFor(`!!navigator.serviceWorker.controller && ${label19} === 'CIRS'`, 20000);
  check('old version open (tile 19 = CIRS)', true);

  sh('rsync -a --exclude .git --exclude videos dist/site/ dist/updtest/'); // publish the new version
  await page.goto(base + '?demo'); // the visitor simply opens the link again
  await step('reopening shows the new version without a manual refresh', async () => {
    await page.waitFor(`${label19} === 'CCMTEC'`, 30000);
    check('reopening shows the new version without a manual refresh', true);
  });

  // Later updates: the page itself is now fetched fresh whenever online.
  sh(`sed -i "s/title: 'CCMTEC'/title: 'TEST-2'/" dist/updtest/js/config.js && sed -i "s/^var VERSION = '.*';/var VERSION = 'test-2';/" dist/updtest/sw.js`);
  await page.goto(base + '?demo');
  await step('next update shows on the first open', async () => {
    await page.waitFor(`${label19} === 'TEST-2'`, 15000);
    check('next update shows on the first open', true);
  });

  // Kiosk screen: never reloads mid-video; reloads itself once idle on home.
  await page.goto(base);
  await page.waitFor('!!window.Kiosk && !document.getElementById("setup").hidden', 15000);
  await page.clickSel('#setupStart');
  await page.waitFor(`Kiosk.state() === 'home'`, 5000);
  sh(`sed -i "s/title: 'TEST-2'/title: 'TEST-3'/" dist/updtest/js/config.js && sed -i "s/^var VERSION = '.*';/var VERSION = 'test-3';/" dist/updtest/sw.js`);
  await page.eval('navigator.serviceWorker.getRegistration().then(r => r.update())');
  await step('kiosk screen picks up the update when idle', async () => {
    await page.waitFor(`${label19} === 'TEST-3'`, 60000, 1000);
    check('kiosk screen picks up the update when idle', true);
  });
  server.kill('SIGKILL');
  sh('rm -rf dist/updtest');
}

if (suite === 'soak') {
  const minutes = Number(process.argv[3] || 10);
  await page.goto(`file://${root}/index.html?nofs&soak=1`);
  check('soak page is visible (no timer throttling)', (await page.eval('document.visibilityState')) === 'visible');
  const heap = [];
  for (let m = 0; m < minutes; m++) {
    await sleep(60000);
    const h = await page.eval('performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1');
    heap.push(h);
    console.log(`  minute ${m + 1}: ${await page.eval('document.getElementById("soakInfo").textContent')}`);
  }
  const plays = Number((await page.eval('document.getElementById("soakInfo").textContent')).match(/(\d+) plays/)[1]);
  check('soak: many plays without getting stuck', plays >= minutes * 3, plays + ' plays');
  check('soak: memory stays flat', heap[heap.length - 1] - heap[0] < 30, heap.join(' → ') + ' MB');
}

const errors = page.console.filter((l) => /EXCEPTION|error/i.test(l));
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
