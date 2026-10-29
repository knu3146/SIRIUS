'use strict';

/* ═══════════════════════════════════════════════════════════
   C. 판독 엔진 ─ 모델 연결 지점
   학습한 모델을 붙일 때는 ENGINE.analyze 만 교체하면 됩니다.
   ═══════════════════════════════════════════════════════════ */
const CLASSES = [
  {key:'glioma',     ko:'신경교종',        hint:'뇌 조직 자체에서 생기는 종양'},
  {key:'meningioma', ko:'수막종',          hint:'뇌를 감싼 막에서 생기는 종양'},
  {key:'pituitary',  ko:'뇌하수체 종양',   hint:'뇌 아래쪽 호르몬 기관의 종양'},
  {key:'no_tumor',   ko:'뚜렷한 종양 없음', hint:'이 영상에서는 종양 소견이 두드러지지 않음'}
];
const DEMO_META = {
  name:'데모 휴리스틱 v0.1',
  probsTitle:'참고용 유형 추정 (데모 엔진)',
  confNote:'학습 모델 결과가 아닌 데모입니다. 좌우 대칭 비교로 계산한 값이며 진단 확률이 아닙니다.'
};
const MODEL_META = {
  name:'학습 모델 (시연용)',
  probsTitle:'참고용 유형 추정 (학습 모델 · 시연용)',
  confNote:'모델이 고른 유형의 확률로 계산한 값입니다. 진단 확률이 아니며, 표시된 원은 병변 경계가 아니라 모델이 주목한 영역입니다.'
};
const ENGINE = { ...DEMO_META, analyze: analyzeImage };

const N = 128;
function toGray(canvas){
  const off = document.createElement('canvas'); off.width = off.height = N;
  const c = off.getContext('2d', {willReadFrequently:true});
  c.fillStyle = '#000'; c.fillRect(0,0,N,N);
  c.drawImage(canvas, 0,0, N,N);
  const d = c.getImageData(0,0,N,N).data, g = new Float32Array(N*N);
  for(let i=0;i<N*N;i++) g[i] = 0.299*d[i*4] + 0.587*d[i*4+1] + 0.114*d[i*4+2];
  return g;
}
function blur(src){
  const out = new Float32Array(N*N);
  for(let y=1;y<N-1;y++) for(let x=1;x<N-1;x++){
    let s=0; for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++) s += src[(y+j)*N + x+i];
    out[y*N+x] = s/9;
  }
  return out;
}
function lobeName(nx, ny){
  const side = nx < .5 ? '우측' : '좌측';
  const dx = Math.abs(nx-.5);
  let part;
  if(dx < .13 && ny > .34 && ny < .68)       part = '뇌실 주변 백질';
  else if(dx < .22 && ny >= .40 && ny < .60) part = '기저핵 부근';
  else if(ny < .34)                          part = '전두엽';
  else if(ny > .72)                          part = '후두엽';
  else if(dx > .30)                          part = '측두엽';
  else                                       part = '두정엽';
  return {side, part, full:`${side} ${part}`};
}
function heuristicRegions(canvas){
  const g = blur(blur(toGray(canvas)));
  let mean = 0; for(let i=0;i<g.length;i++) mean += g[i]; mean /= g.length;
  const thr = Math.max(18, mean*0.62);
  const diff = new Float32Array(N*N);
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const a = g[y*N+x], b = g[y*N + (N-1-x)];
    diff[y*N+x] = (a>thr || b>thr) ? Math.max(0, a-b) : 0;
  }
  const dm = blur(diff);
  const peaks = [];
  for(let y=6;y<N-6;y++) for(let x=6;x<N-6;x++){
    const v = dm[y*N+x]; if(v < 14) continue;
    let top = true;
    for(let j=-4;j<=4 && top;j++) for(let i=-4;i<=4;i++)
      if(dm[(y+j)*N + x+i] > v){ top=false; break; }
    if(top) peaks.push({x,y,v});
  }
  peaks.sort((a,b)=>b.v-a.v);
  const picked = [];
  for(const p of peaks){
    if(picked.some(q => Math.hypot(q.x-p.x, q.y-p.y) < 18)) continue;
    picked.push(p); if(picked.length===3) break;
  }
  return picked.map(p=>{
    let area = 0;
    for(let j=-16;j<=16;j++) for(let i=-16;i<=16;i++){
      const yy=p.y+j, xx=p.x+i; if(yy<0||yy>=N||xx<0||xx>=N) continue;
      if(dm[yy*N+xx] > p.v*0.45) area++;
    }
    const nx = p.x/N, ny = p.y/N, lb = lobeName(nx,ny);
    return { nx, ny, r: Math.min(.22, Math.max(.045, Math.sqrt(area/Math.PI)/N * 1.35)),
             area, score:p.v, conf: Math.min(.97, p.v/58), side:lb.side, part:lb.part, name:lb.full };
  });
}
function heuristicAnalyze(canvas){
  const regions = heuristicRegions(canvas);
  const g = toGray(canvas);
  let mean=0, min=255, max=0;
  for(let i=0;i<g.length;i++){ mean+=g[i]; if(g[i]<min)min=g[i]; if(g[i]>max)max=g[i]; }
  mean/=g.length;
  const quality = (max-min) < 70 ? '낮음 (대비 부족)' : mean < 14 ? '낮음 (너무 어두움)' : '양호';
  const s = {glioma:.35, meningioma:.30, pituitary:.20, no_tumor:1.2};
  if(regions.length){
    const t = regions[0];
    const dx = Math.abs(t.nx-.5), dy = t.ny-.5, edge = Math.hypot(dx,dy);
    s.no_tumor   = Math.max(.05, 1.2 - t.conf*1.6);
    s.glioma    += t.conf * (edge < .30 ? 1.5 : .5);
    s.meningioma+= t.conf * (edge > .30 ? 1.4 : .4);
    s.pituitary += t.conf * (dx < .09 && t.ny > .46 && t.ny < .68 ? 1.6 : .15);
  }
  const tot = Object.values(s).reduce((a,b)=>a+b,0);
  return {probs: CLASSES.map(c => s[c.key]/tot), regions, quality};
}

/* ═══════════════════════════════════════════════════════════
   학습 모델 연결 (ml/infer_server.py ← server.js 의 /api/analyze)
   분석 서버가 꺼져 있거나 응답이 이상하면 위의 데모 휴리스틱으로 돌아갑니다.
   사진은 같은 주소(이 컴퓨터)로만 보냅니다 — CSP connect-src 'self'.
   ═══════════════════════════════════════════════════════════ */
function setEngine(meta){
  Object.assign(ENGINE, meta);
  const b = document.getElementById('engineBadge');
  if(b) b.textContent = '엔진 · ' + ENGINE.name;
}
const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function validateModelResponse(j){
  if(!j || !Array.isArray(j.probs) || j.probs.length !== CLASSES.length ||
     !j.probs.every(p => Number.isFinite(p) && p >= 0 && p <= 1) ||
     !Array.isArray(j.regions)) throw new Error('응답 형식 오류');
  const total = j.probs.reduce((a, b) => a + b, 0);
  if(Math.abs(total - 1) > .02) throw new Error('모델 확률 합계 오류');
  return {
    ...j,
    probs: j.probs.map(p => p / total),
    regions: j.regions.filter(p => p && typeof p === 'object'),
    model: typeof j.model === 'string' && j.model.trim() ? j.model.trim().slice(0, 160) : MODEL_META.name
  };
}

let modelRequestVersion = 0;
const modelRequests = new Set();
function cancelModelRequests(){
  modelRequestVersion++;
  for(const controller of modelRequests) controller.abort();
  modelRequests.clear();
}
async function modelAnalyze(canvas){
  const requestVersion = modelRequestVersion;
  if(typeof CONFIG !== 'undefined' && CONFIG.privacy && !['localhost','127.0.0.1','[::1]'].includes(globalThis.location?.hostname))
    throw new Error('개인정보 보호 모드에서는 이 컴퓨터의 분석 서버만 사용할 수 있습니다.');
  const base = heuristicAnalyze(canvas);           // 화질 점검은 기존 계산을 그대로 사용
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
  if(requestVersion !== modelRequestVersion) throw new Error('분석이 취소되었습니다.');
  if(!blob) throw new Error('이미지 변환 실패');
  const ctl = new AbortController();
  modelRequests.add(ctl);
  const timer = setTimeout(() => ctl.abort(), 60000);
  let j;
  try{
    const r = await fetch('/api/analyze', { method:'POST', headers:{'Content-Type':'image/jpeg'},
                                            body:blob, signal:ctl.signal, cache:'no-store' });
    if(!r.ok) throw new Error('HTTP ' + r.status);
    j = validateModelResponse(await r.json());
  } finally { clearTimeout(timer); modelRequests.delete(ctl); }

  const regions = j.regions
    .filter(p => [p.nx, p.ny, p.r, p.conf].every(Number.isFinite) && p.nx >= 0 && p.nx <= 1 && p.ny >= 0 && p.ny <= 1)
    .slice(0, 3)
    .map((p, i) => ({     // 사진이 어느 방향 단면인지 모르므로 뇌엽 이름은 붙이지 않습니다
      nx:p.nx, ny:p.ny, r:clampTo(p.r, .045, .22),
      area:Number.isFinite(p.area) ? Math.max(0, Math.round(p.area)) : 0,
      score:Number.isFinite(p.score) ? Math.max(0, p.score) : 0,
      conf:clampTo(p.conf, 0, .97), name:'주목 영역 ' + 'ABC'[i], kind:'model'
    }));
  return { probs:j.probs, regions, quality:base.quality, kind:'model', model:j.model };
}

async function analyzeImage(canvas){
  try{
    return await modelAnalyze(canvas);
  }catch(e){
    return heuristicAnalyze(canvas);
  }
}
