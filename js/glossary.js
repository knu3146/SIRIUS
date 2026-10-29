'use strict';

/* ═══════════════════════════════════════════════════════════
   G. 용어 사전
   ═══════════════════════════════════════════════════════════ */
const GLOSSARY = [
  ['병변','lesion','정상 조직과 달라 보이는 부분을 통틀어 부르는 말입니다. 병 이름이 아니라 "여기가 다르게 보인다"는 표시에 가깝습니다.'],
  ['고신호','high signal / hyperintense','MRI에서 주변보다 하얗게 보이는 것. 물기(부종)나 조직 변화가 있을 때 흔히 이렇게 보입니다.'],
  ['저신호','low signal / hypointense','주변보다 어둡게 보이는 것. 촬영 방식에 따라 같은 조직도 밝게 또는 어둡게 나옵니다.'],
  ['좌우 비대칭','asymmetry','뇌는 좌우가 거의 대칭입니다. 한쪽에만 보이는 변화는 우연이 아닐 가능성이 커서 먼저 살펴봅니다.'],
  ['부종','edema','조직에 물이 차서 부은 상태. 병변 주위가 넓게 하얗게 보이는 원인이 됩니다.'],
  ['백질','white matter','뇌 속 신경 다발이 지나는 안쪽 부분. 나이가 들면 작은 점 모양 변화가 흔히 생깁니다.'],
  ['뇌실','ventricle','뇌 가운데의 물(뇌척수액)이 들어 있는 빈 공간. 영상에서 나비 모양으로 어둡게 보입니다.'],
  ['축상면','axial','머리를 수평으로 자른 단면. 이 사이트의 부위 이름은 축상면 기준입니다.'],
  ['정중선 이동','midline shift','좌우 가운데 선이 한쪽으로 밀린 상태. 압력이 높아졌다는 신호일 수 있어 중요하게 봅니다.'],
  ['신경교종','glioma','뇌 조직 자체의 세포에서 생기는 종양입니다.'],
  ['수막종','meningioma','뇌를 감싸는 막에서 생기는 종양으로, 대개 뇌 바깥쪽 가장자리에 붙어 있습니다.'],
  ['뇌하수체 종양','pituitary tumor','뇌 아래 가운데 호르몬을 만드는 작은 기관에 생기는 종양입니다.'],
  ['경색','infarction','혈관이 막혀 뇌 조직이 손상된 상태. 뇌졸중의 한 종류입니다.'],
  ['조영증강','contrast enhancement','조영제를 맞고 찍었을 때 밝아지는 현상. 혈관이 많은 조직에서 잘 나타납니다.']
];
function renderGlossary(hit){
  $('glossary').innerHTML = GLOSSARY.map(([ko,en,ds])=>
    `<div class="gitem${hit===ko?' hit':''}" id="g-${esc(ko)}"><dt>${esc(ko)}<span class="en">${esc(en)}</span></dt><dd>${esc(ds)}</dd></div>`
  ).join('');
}
function linkTerms(text){
  let out = text;
  GLOSSARY.forEach(([ko]) => {
    out = out.replace(new RegExp(ko+'(?![^<]*>)','g'), `<button class="term" data-term="${ko}">${ko}</button>`);
  });
  return out;
}
