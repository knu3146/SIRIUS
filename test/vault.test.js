import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function vault(put = () => true) {
  const pending = [], written = [];
  const account = { id: 'first', data: 'old-data' };
  const state = { acc: account, masterKey: {}, guest: false, scans: [] };
  const context = vm.createContext({ S: state, seal: () => new Promise((resolve, reject) => pending.push({ resolve, reject })), accounts: { put: acc => { written.push(acc.data); return put(acc); } } });
  vm.runInContext(readFileSync(new URL('../js/vault.js', import.meta.url), 'utf8'), context);
  return { context, state, account, pending, written };
}

test('계정을 바꾼 뒤 끝난 암호화는 계정 데이터를 저장하지 않는다', async () => {
  const v = vault();
  const work = v.context.saveVault();
  v.state.acc = { id: 'other-user' };
  v.pending[0].resolve('stale-private-data');
  assert.equal((await work).cancelled, true);
  assert.equal(v.account.data, 'old-data');
  assert.equal(v.written.length, 0);
});

test('저장 완료 순서가 뒤바뀌어도 가장 최근 요청만 저장한다', async () => {
  const v = vault();
  const first = v.context.saveVault();
  const second = v.context.saveVault();
  v.pending[1].resolve('new-data');
  assert.equal((await second).ok, true);
  v.pending[0].resolve('old-late-data');
  assert.equal((await first).cancelled, true);
  assert.deepEqual(v.written, ['new-data']);
  assert.equal(v.account.data, 'new-data');
});

test('저장 공간 부족 시 메모리의 계정 암호문도 이전 상태로 복원한다', async () => {
  const v = vault(() => false);
  const work = v.context.saveVault();
  v.pending[0].resolve('unsaved-data');
  assert.equal((await work).ok, false);
  assert.equal(v.account.data, 'old-data');
});

test('로그아웃 취소 후 끝난 암호화는 기록을 복구하지 않는다', async () => {
  const v = vault();
  const work = v.context.saveVault();
  v.context.cancelVaultWrites();
  v.pending[0].resolve('cancelled-data');
  assert.equal((await work).cancelled, true);
  assert.equal(v.written.length, 0);
});
