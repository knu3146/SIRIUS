import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8'), context);
const validate = vm.runInContext('validateModelResponse', context);

test('모델 응답은 네 클래스의 유효한 확률 분포여야 한다', () => {
  for (const probs of [[0, 0, 0, 0], [-.1, .3, .4, .4], [2, 0, 0, 0], [.2, .2, .2, .2], [NaN, .2, .3, .5], [.5, .5]]) {
    assert.throws(() => validate({ probs, regions: [] }));
  }
  const result = validate({ probs: [.1, .2, .3, .399], regions: [], model: '새 후보 v3' });
  assert.ok(Math.abs(result.probs.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.equal(result.model, '새 후보 v3');
});

test('잘못된 관심 영역 항목과 빈 모델 이름을 안전하게 처리한다', () => {
  const result = validate({ probs: [.1, .2, .3, .4], regions: [null, 1, { nx: .5 }], model: '   ' });
  assert.equal(result.regions.length, 1);
  assert.match(result.model, /학습 모델/);
  assert.throws(() => validate({ probs: [.1, .2, .3, .4], regions: null }));
});
