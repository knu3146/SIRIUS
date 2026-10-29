import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function viewer() {
  const pending = [], names = [], images = [];
  let renders = 0;
  const elements = new Map();
  const state = { src: null, img: null };
  const context = vm.createContext({
    S: state,
    $: id => {
      if (!elements.has(id)) elements.set(id, { hidden: false, getContext: () => ({}) });
      return elements.get(id);
    },
    document: { body: { style: {} } },
    Image: class { constructor() { images.push(this); } },
    ENGINE: { analyze: () => new Promise(resolve => pending.push(resolve)) },
    MODEL_META: { name: 'model' }, DEMO_META: { name: 'demo' },
    setEngine: meta => names.push(meta.name),
    compareWithPrev: () => false,
    renderAll: () => { renders++; },
    alert: () => assert.fail('Unexpected analysis error'),
  });
  vm.runInContext(readFileSync(new URL('../js/viewer.js', import.meta.url), 'utf8'), context);
  context.draw = () => {};
  return { context, state, pending, names, images, elements, renders: () => renders };
}

test('늦게 끝난 이전 분석이 최신 영상과 모델 배지를 덮어쓰지 않는다', async () => {
  const v = viewer();
  v.state.src = { id: 1 };
  const first = v.context.runAnalysis();
  v.state.src = { id: 2 };
  const second = v.context.runAnalysis();
  v.pending[1]({ kind: 'model', model: 'new-model', regions: [] });
  await second;
  v.pending[0]({ kind: 'model', model: 'old-model', regions: [] });
  await first;
  assert.equal(v.state.analysis.model, 'new-model');
  assert.deepEqual(v.names, ['new-model']);
  assert.equal(v.renders(), 1);
});

test('새 영상 분석 중에는 이전 분석 결과를 저장할 수 없다', async () => {
  const v = viewer();
  v.state.src = { id: 'new-image' };
  v.state.analysis = { model: 'old-result' };
  const work = v.context.runAnalysis();
  assert.equal(v.state.analysis, null);
  assert.equal(v.elements.get('saveScan').disabled, true);
  v.pending[0]({ kind: 'model', model: 'new-model', regions: [] });
  await work;
  assert.equal(v.state.analysis.model, 'new-model');
});

test('로그아웃 때 취소한 이미지 로드는 화면에 다시 나타나지 않는다', () => {
  const v = viewer();
  v.context.loadCanvas({ toDataURL: () => 'data:image/png;base64,example' }, 'example');
  v.context.cancelPendingImages();
  v.images[0].onload();
  assert.equal(v.state.img, null);
  assert.equal(v.pending.length, 0);
});
