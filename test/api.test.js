import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBody } from '../api/_lib.js';
import sendCode from '../api/send-code.js';
import verifyCode from '../api/verify-code.js';
import register from '../api/register.js';
import checkId from '../api/check-id.js';

test('개인정보 보호 기본값에서는 계정 API가 본문을 읽기 전에 차단된다', async () => {
  const before = process.env.ENABLE_EMAIL_AUTH;
  delete process.env.ENABLE_EMAIL_AUTH;
  try {
    for(const handler of [sendCode, verifyCode, register, checkId]){
      const req = {method:'POST', get body(){throw new Error('must not read private input');}};
      const res = {status(code){assert.equal(code,403); return this;}, json(body){assert.ok(body.error);}};
      await handler(req,res);
    }
  } finally {
    if(before === undefined) delete process.env.ENABLE_EMAIL_AUTH;
    else process.env.ENABLE_EMAIL_AUTH = before;
  }
});

test('API 본문은 JSON 객체만 허용하고 null·배열·잘못된 JSON을 빈 객체로 처리한다', () => {
  for (const body of [null, undefined, [], 'null', '[]', '{', '3', '"hello"']) {
    assert.deepEqual(readBody({ body }), {});
  }
  assert.deepEqual(readBody({ body: '{"purpose":"signup"}' }), { purpose: 'signup' });
  assert.deepEqual(readBody({ body: { id: 'demo' } }), { id: 'demo' });
});
