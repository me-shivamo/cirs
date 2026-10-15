// Minimal Chrome DevTools Protocol driver for the kiosk end-to-end tests (no dependencies).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9333, width = 1920, height = 1080, chrome = process.env.CHROME || 'google-chrome', autoplay = true } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'kiosk-test-'));
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox',
    ...(autoplay ? ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] : ['--autoplay-policy=user-gesture-required']), '--hide-scrollbars',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await sleep(200);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch {}
  }
  if (!wsUrl) throw new Error('Chrome did not start');

  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      listeners.forEach((fn) => fn(msg));
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  await send('Target.activateTarget', { targetId });
  await s('Page.enable');
  await s('Page.bringToFront');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const consoleLines = [];
  listeners.push((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') consoleLines.push(msg.params.type + ': ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
    if (msg.method === 'Runtime.exceptionThrown') consoleLines.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  });

  const page = {
    send: s,
    console: consoleLines,
    async goto(url) {
      await s('Page.navigate', { url });
      await sleep(400);
      await page.waitFor('document.readyState === "complete"', 15000);
    },
    async eval(expr) {
      const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(expr, timeout = 10000, every = 200) {
      const end = Date.now() + timeout;
      let last;
      while (Date.now() < end) {
        try { last = await page.eval(expr); if (last) return last; } catch (e) { last = e.message; }
        await sleep(every);
      }
      throw new Error(`timeout waiting for: ${expr} (last: ${JSON.stringify(last)})`);
    },
    async click(x, y) {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await s('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      }
    },
    async tap(x, y) {
      await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    async key(key, modifiers = 0, code) {
      const text = key.length === 1 ? key : undefined;
      await s('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, text, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined });
      await s('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
    },
    async center(selector) {
      return page.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    },
    async clickSel(selector) { const c = await page.center(selector); await page.click(c.x, c.y); },
    async screenshot(path) {
      const { data } = await s('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(data, 'base64'));
    },
    async viewport(w, h, mobile = false, scale = 1) {
      await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile });
      if (mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    },
  };

  const close = async () => {
    // google-chrome is a wrapper script: ask the browser itself to quit, then kill the wrapper.
    try { await Promise.race([send('Browser.close'), sleep(2000)]); } catch {}
    try { ws.close(); } catch {}
    proc.kill('SIGKILL');
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  return { page, close, sleep };
}
