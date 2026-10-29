import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBody } from '../api/_lib.js';

test('API 본문은 JSON 객체만 허용하고 null·배열·잘못된 JSON을 빈 객체로 처리한다', () => {
  for (const body of [null, undefined, [], 'null', '[]', '{', '3', '"hello"']) {
    assert.deepEqual(readBody({ body }), {});
  }
  assert.deepEqual(readBody({ body: '{"purpose":"signup"}' }), { purpose: 'signup' });
  assert.deepEqual(readBody({ body: { id: 'demo' } }), { id: 'demo' });
});
