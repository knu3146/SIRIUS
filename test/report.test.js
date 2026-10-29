import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function report(state) {
  const context = vm.createContext({ S: state });
  vm.runInContext(readFileSync(new URL('../js/report.js', import.meta.url), 'utf8'), context);
  return context;
}

test('모델이 주목 영역을 반환하지 않아도 회차 간 상태 비교를 하지 않는다', () => {
  const context = report({ analysis: { kind: 'model' }, scans: [{ regions: [{ nx: .5, ny: .5, area: 100 }] }] });
  assert.equal(context.compareWithPrev([]), false);
});

test('면적이 없는 과거 기록은 확대·축소로 잘못 비교하지 않는다', () => {
  const context = report({ analysis: {}, scans: [{ regions: [{ nx: .5, ny: .5 }] }] });
  const regions = [{ nx: .5, ny: .5, area: 100 }];
  assert.equal(context.compareWithPrev(regions), false);
  assert.equal(regions[0].status, 'neutral');
});

test('주목 영역이 없다고 의사의 정상 판독을 들었다는 질문을 만들지 않는다', () => {
  const context = report({ analysis: {}, scans: [] });
  const questions = context.buildQuestions({ kind: 'model' }, [], false);
  assert.ok(questions.every(q => !q.includes('소견이 없다고 들었는데')));
  assert.ok(questions[0].includes('영상과 제 증상'));
});
