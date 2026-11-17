import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { app } from '../server.js';

const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const server = await new Promise(r => {
  const s = app.listen(0, '127.0.0.1', () => r(s));
});
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-qr-'));
const proc = spawn(browserPath, [
  '--headless=new',
  '--remote-debugging-port=0',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  `--user-data-dir=${tmpDir}`,
  'about:blank',
]);

const wsUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Timeout')), 10000);
  proc.stderr.on('data', (d) => {
    const m = d.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (m) { clearTimeout(timer); resolve(m[1]); }
  });
});

const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);

let id = 1;
const callbacks = new Map();
const exceptions = [];

ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  if (data.id && callbacks.has(data.id)) {
    const cb = callbacks.get(data.id);
    callbacks.delete(data.id);
    cb(data);
  } else if (data.method === 'Runtime.exceptionThrown') {
    exceptions.push(data.params);
  }
};

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const reqId = id++;
    callbacks.set(reqId, res => res.error ? reject(res.error) : resolve(res.result));
    ws.send(JSON.stringify({ id: reqId, method, params }));
  });
}

const target = await send('Target.createTarget', { url: 'about:blank' });
const attach = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
const sessionId = attach.sessionId;

function sendSession(method, params = {}) {
  return new Promise((resolve, reject) => {
    const reqId = id++;
    callbacks.set(reqId, res => res.error ? reject(res.error) : resolve(res.result));
    ws.send(JSON.stringify({ id: reqId, method, params, sessionId }));
  });
}

await sendSession('Page.enable');
await sendSession('Runtime.enable');

await sendSession('Page.navigate', { url: baseUrl });
await new Promise(r => setTimeout(r, 1000));

const debugResult = await sendSession('Runtime.evaluate', {
  expression: `(async () => {
    try {
      document.querySelector('.nav-tab[data-module="qr-studio"]').click();
      await new Promise(r => setTimeout(r, 400));

      const size800 = document.querySelector('#qrSizePresets button[data-size="800"]');
      console.log('size800 element:', size800);
      if (!size800) return { error: 'size800 not found' };
      size800.click();

      const ecH = document.querySelector('#qrEcPresets button[data-ec="H"]');
      console.log('ecH element:', ecH);
      if (!ecH) return { error: 'ecH not found' };
      ecH.click();

      return {
        sizeClass: size800.className,
        ecClass: ecH.className
      };
    } catch (e) {
      return { error: e.stack || e.message };
    }
  })()`,
  returnByValue: true,
  awaitPromise: true
});

console.log('Debug Result:', debugResult);
console.log('Exceptions:', exceptions);

proc.kill();
server.close();
process.exit(0);
