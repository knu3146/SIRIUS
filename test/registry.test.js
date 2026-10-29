import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

async function registry(run) {
  const work = await mkdtemp(path.join(tmpdir(), 'sirius-registry-'));
  try {
    await mkdir(path.join(work, 'api'));
    await mkdir(path.join(work, 'data'));
    await writeFile(path.join(work, 'package.json'), '{"type":"module"}');
    const module = path.join(work, 'api', '_store.js');
    await copyFile(new URL('../api/_store.js', import.meta.url), module);
    await run(await import(pathToFileURL(module).href), path.join(work, 'data', 'registry.json'));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

test('없는 등록부는 만들고 아이디·이메일 중복을 막는다', async () => {
  await registry(async store => {
    assert.equal(store.idTaken('Demo'), false);
    assert.deepEqual(store.reserve('Demo', 'abc'), { ok: true });
    assert.equal(store.idTaken('DEMO'), true);
    assert.equal(store.reserve('demo', 'different').reason, 'ID_TAKEN');
    assert.equal(store.reserve('Other', 'abc').reason, 'EMAIL_TAKEN');
  });
});

test('손상된 등록부를 빈 목록으로 오인해 덮어쓰지 않는다', async () => {
  await registry(async (store, file) => {
    for (const raw of ['{broken', 'null', '{"users":[null]}', '{"users":{}}']) {
      await writeFile(file, raw);
      assert.throws(() => store.reserve('NewUser', 'new-email'));
      assert.equal(await readFile(file, 'utf8'), raw);
    }
  });
});
