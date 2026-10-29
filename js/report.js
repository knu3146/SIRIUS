'use strict';

/* ═══════════════════════════════════════════════════════════
   H. 회차 비교 · 설명문 · 질문
   ═══════════════════════════════════════════════════════════ */
function compareWithPrev(regions){
  const prev = S.scans[S.scans.length-1];
  // 모델의 '주목 영역' 크기는 병변이 커졌는지 작아졌는지와 무관하므로 호전·악화 비교에 쓰지 않습니다
  if(S.analysis?.kind === 'model' || regions.some(r => r.kind === 'model') || (prev && prev.kind === 'model')){
    regions.forEach(r => { r.status='neutral'; r.change='모델 주목 영역 — 회차 간 호전·악화 비교 안 함'; });
    return false;
  }
  if(!regions.length) return false;
  const previousRegions = prev && Array.isArray(prev.regions)
    ? prev.regions.filter(p => Number.isFinite(p.nx) && Number.isFinite(p.ny)) : [];
  if(!previousRegions.length){
    regions.forEach(r => { r.status='neutral'; r.change='첫 기록 — 비교 대상 없음'; });
    return false;
  }
  let compared = false;
  regions.forEach(r=>{
    let best=null, bd=1;
    previousRegions.forEach(p=>{ const d = Math.hypot(p.nx-r.nx, p.ny-r.ny); if(d < bd){ bd=d; best=p; } });
    if(!best || bd > .20){ r.status='spread'; r.change='데모 표시 위치가 이전과 달라짐'; compared=true; return; }
    if(!Number.isFinite(r.area) || !Number.isFinite(best.area) || best.area <= 0){
      r.status='neutral'; r.change='표시 면적 정보가 없어 비교하지 않음'; return;
    }
    compared = true;
    const ratio = r.area / Math.max(1, best.area);
    if(bd > .08 && ratio > .9){ r.status='spread'; r.change='데모 표시 위치가 이전과 달라짐'; }
    else if(ratio < .85)      { r.status='good';   r.change=`이전보다 약 ${Math.round((1-ratio)*100)}% 작아짐`; }
    else if(ratio > 1.15)     { r.status='bad';    r.change=`이전보다 약 ${Math.round((ratio-1)*100)}% 커짐`; }
    else                      { r.status='neutral';r.change='이전과 비슷한 크기'; }
  });
  return compared;
}
const STATUS_KO = {good:'표시 축소', bad:'표시 확대', spread:'위치 변화', neutral:'비교 없음·유사'};
/* 학습 모델 결과용 설명문 — 좌우 비대칭을 보지 않고, 모델이 고른 유형과 주목한 영역만 말합니다 */
function buildModelReport(a, regions, simple, nth){
  const n = regions.length;
  const top = CLASSES.map((c,i)=>({c, p:a.probs[i]})).sort((x,y)=>y.p-x.p)[0];
  const pct = Math.round(top.p*100);
  if(simple){
    return [
      `컴퓨터 모델이 이 사진과 가장 비슷하다고 본 것은 <b>${top.c.ko}</b>입니다(${pct}%). 임상적으로 검증되지 않은 시연용 모델이라 참고로만 보세요.`,
      n ? `화면에 표시한 ${n}곳은 모델이 그렇게 판단하며 눈여겨본 자리입니다. 병이 있는 자리라는 뜻은 아닙니다.`
        : '모델이 특별히 눈여겨본 자리는 표시할 만큼 뚜렷하지 않았습니다.',
      '이 결과는 <b>진단이 아닙니다.</b> 질문 목록을 챙겨 담당 의사에게 그대로 물어보세요.'
    ];
  }
  return [
    `이번 ${nth}차 영상에서 학습 모델이 가장 가깝다고 본 유형은 <b>${top.c.ko}</b>(${pct}%)입니다. 이 모델은 4가지 유형을 나누도록만 학습한 시연용이라, 그 밖의 질환이나 작은 변화는 구분하지 못합니다.`,
    n ? `${regions.map(r=>`<b>${r.name}</b>`).join(', ')}은(는) 모델이 이 판단에 크게 반영한 영역입니다. 병변의 경계나 정확한 위치가 아니며, 영상이 어느 방향 단면인지도 따지지 않고 계산한 값입니다.`
      : '모델이 이 판단에 특별히 크게 반영한 영역은 표시할 만큼 뚜렷하지 않았습니다.',
    '이 모델로는 회차 간 호전·악화를 가릴 수 없어, 표시 영역은 모두 보라색으로 둡니다.',
    '이 결과는 진단이 아니라 <b>질문을 준비하기 위한 정리</b>입니다. 확진에는 여러 단면과 촬영 기법, 필요하면 조영증강 영상과 임상 진찰이 함께 필요합니다.'
  ];
}
function buildReport(a, regions, compared, simple){
  const n = regions.length, nth = S.scans.length + 1;
  if(a.kind === 'model') return buildModelReport(a, regions, simple, nth);
  if(!n){
    return simple
      ? ['이번 사진에서는 한쪽에만 유난히 하얗게 보이는 곳이 없었습니다.',
         '그래도 이 도구는 사진 한 장만 보고 판단합니다. 증상이 있다면 꼭 병원에서 확인하세요.']
      : [`이번 ${nth}차 영상의 데모 분석에서는 좌우 비대칭 표시가 뚜렷하게 나타나지 않았습니다.`,
         '다만 이 도구는 축상면 한 장의 좌우 비대칭만 봅니다. 작은 변화, 다른 단면에서만 보이는 변화, 조영증강이 필요한 변화는 놓칠 수 있습니다.'];
  }
  const t = regions[0], rest = regions.slice(1), lines = [];
  if(simple){
    lines.push(`사진에서 눈에 띄는 곳은 ${n}군데입니다. 가장 뚜렷한 곳은 <b>${t.name}</b>이고, 반대쪽 같은 자리보다 하얗게 보입니다.`);
    lines.push('뇌는 원래 왼쪽과 오른쪽 모양이 거의 같습니다. 한쪽만 다르게 보이면 그 자리를 먼저 확인합니다.');
    if(compared) lines.push(`지난번 사진과 견준 데모 표시 변화: ${regions.map(r=>`${r.name}은(는) ${STATUS_KO[r.status]}`).join(', ')}. 색은 표시 영역의 차이이며 병이 좋아지거나 나빠졌다는 뜻은 아닙니다.`);
    lines.push('이 결과는 <b>진단이 아닙니다.</b> 질문 목록을 챙겨 담당 의사에게 그대로 물어보세요.');
    return lines;
  }
  lines.push(`이번 ${nth}차 영상의 데모 분석에서 좌우 밝기 차이가 큰 지점 ${n}곳을 표시했습니다. 가장 두드러진 곳은 <b>${t.name}</b>입니다. (비대칭 점수 ${(t.conf*100).toFixed(0)}% — 진단 신뢰도가 아님)`);
  if(rest.length) lines.push(`그 밖에 ${rest.map(r=>`<b>${r.name}</b>`).join(', ')}에서도 같은 방향의 신호 차이가 관찰됩니다. 크기가 작을수록 촬영 각도나 잡음일 가능성도 함께 고려해야 합니다.`);
  lines.push('부위 이름은 축상면 기준이며, 영상의 왼쪽이 환자의 오른쪽입니다(방사선과 표기 관례). 병변 주변이 넓게 밝다면 부종이 함께 있을 수 있습니다.');
  if(compared) lines.push(`직전 회차와 맞대어 본 결과: ${regions.map(r=>`<b>${r.name}</b> — ${STATUS_KO[r.status]}(${r.change})`).join(' · ')}.`);
  else lines.push('비교 가능한 이전 표시 정보가 없어 보라색으로 표시했습니다. 데모 표시의 크기와 위치 변화는 촬영 조건에 영향을 받으며 의학적 호전·악화를 뜻하지 않습니다.');
  lines.push('이 결과는 진단이 아니라 <b>질문을 준비하기 위한 정리</b>입니다. 확진에는 여러 단면과 촬영 기법, 필요하면 조영증강 영상과 임상 진찰이 함께 필요합니다.');
  return lines;
}
function buildQuestions(a, regions, compared){
  const q = [];
  if(regions.length){
    q.push(a.kind === 'model'
      ? `제 영상에서 표시된 '${regions[0].name}'은(는) 무엇을 보여 주나요? 병변인가요, 정상 구조인가요?`
      : `제 영상에서 ${regions[0].name}에 보이는 부분이 무엇인가요? 병변인가요, 정상 변이인가요?`);
    q.push('그 부분의 크기는 얼마나 되고, 위치가 기능(말하기·움직임·시야)에 영향을 주는 자리인가요?');
    if(regions.length>1) q.push(`다른 ${regions.length-1}곳도 같은 성격인가요, 서로 관련이 없는 것인가요?`);
    q.push('지금 증상과 이 영상 소견이 서로 맞아떨어지나요?');
  } else {
    q.push('이 영상과 제 증상을 함께 보면 어떤 점을 확인해야 하나요?');
    q.push('다른 단면이나 조영증강 촬영이 추가로 필요할까요?');
  }
  if(compared) q.push('지난 검사와 비교해 좋아진 건가요, 나빠진 건가요? 판단 기준이 무엇인가요?');
  q.push('다음 MRI는 언제 찍어야 하나요? 그 사이에 바로 병원에 와야 하는 증상은 무엇인가요?');
  q.push('지금 단계에서 치료를 시작해야 하나요, 경과를 지켜봐도 되나요? 각각의 장단점이 궁금합니다.');
  q.push('판독 결과지 사본과 영상 파일(CD·DVD)을 받을 수 있을까요?');
  return q;
}
