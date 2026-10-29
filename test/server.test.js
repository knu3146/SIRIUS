import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';

test('로컬 서버: 화면, 상태, 비공개 경로, 잘못된 URL, 분석 요청 검증', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = await mkdtemp(path.join(tmpdir(), 'sirius-test-'));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  let child;
  try {
    for (const file of ['server.js', 'package.json', 'index.html', 'css', 'js', 'api']) {
      await cp(path.join(root, file), path.join(dir, file), { recursive: true });
    }
    await writeFile(path.join(dir, '.env.local'), 'GMAIL_USER=\nGMAIL_APP_PASSWORD=\nRESEND_API_KEY=\nAUTH_SECRET=test-only-secret-at-least-32-characters\n');
    child = spawn(process.execPath, ['server.js'], {
      cwd: dir, env: { ...process.env, PORT: String(port), NO_OPEN: '1', ML_PORT: String(port), GMAIL_USER: '', GMAIL_APP_PASSWORD: '', RESEND_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let logs = '';
    child.stdout.on('data', data => { logs += data; });
    child.stderr.on('data', data => { logs += data; });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, logs);
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true, mail: false });
    assert.equal((await fetch(base)).status, 200);
    for (const route of ['/.env.local', '/ml/model_rf.joblib', '/data/registry.json', '/train/neuria_train.ipynb', '/.venv/pyvenv.cfg', '/.cache-models/weights.pth', '/datasets/example.jpg']) {
      assert.equal((await fetch(base + route)).status, 403, route);
    }
    assert.equal((await fetch(`${base}/%ZZ`)).status, 400);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/check-id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(20 * 1024) })).status, 413);
    assert.equal((await fetch(`${base}/api/analyze`)).status, 405);
    assert.equal((await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' })).status, 415);
    assert.equal((await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'image/png', Origin: 'https://example.com' }, body: 'x' })).status, 403);
  } finally {
    if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
    await rm(dir, { recursive: true, force: true });
  }
});
