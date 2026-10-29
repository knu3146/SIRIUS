'use strict';

/* ═══════════════════════════════════════════════════════════
   E. 예시 영상 (합성 — 실제 환자 영상 아님)
   ═══════════════════════════════════════════════════════════ */
function makeSample(seed){
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0,0,512,512);
  const cx=256, cy=256;
  x.save(); x.translate(cx,cy); x.scale(1,1.18);
  x.beginPath(); x.arc(0,0,196,0,7); x.fillStyle='#3a3f45'; x.fill();
  x.beginPath(); x.arc(0,0,182,0,7); x.fillStyle='#0b0d10'; x.fill();
  const gr = x.createRadialGradient(0,-20,40, 0,0,180);
  gr.addColorStop(0,'#9aa3ac'); gr.addColorStop(.72,'#767f88'); gr.addColorStop(1,'#565f68');
  x.beginPath(); x.arc(0,0,176,0,7); x.fillStyle=gr; x.fill();
  x.restore();
  x.fillStyle = '#12161a';
  [[-26,-6],[26,-6]].forEach(([ox,oy])=>{
    x.save(); x.translate(cx+ox, cy+oy); x.rotate(ox<0?-.34:.34);
    x.beginPath(); x.ellipse(0,0,15,52,0,0,7); x.fill(); x.restore();
  });
  let r = seed || 7;
  const rnd = ()=> (r = (r*1103515245 + 12345) % 2147483648) / 2147483648;
  for(let i=0;i<2600;i++){
    const a = rnd()*Math.PI*2, d = Math.sqrt(rnd())*172;
    const px = cx + Math.cos(a)*d, py = cy + Math.sin(a)*d*1.12;
    x.fillStyle = `rgba(${200+rnd()*40|0},${205+rnd()*40|0},${210+rnd()*40|0},${.03+rnd()*.07})`;
    x.beginPath(); x.arc(px,py, 1+rnd()*5, 0,7); x.fill();
  }
  const lx = cx+72, ly = cy-34;
  const lg = x.createRadialGradient(lx,ly,2, lx,ly,44);
  lg.addColorStop(0,'rgba(240,244,248,.95)'); lg.addColorStop(.45,'rgba(205,212,220,.6)');
  lg.addColorStop(1,'rgba(150,158,168,0)');
  x.beginPath(); x.arc(lx,ly,44,0,7); x.fillStyle=lg; x.fill();
  return c;
}

/* ═══════════════════════════════════════════════════════════
   F. 렌더링
   ═══════════════════════════════════════════════════════════ */
const cv = $('cv'), ctx = cv.getContext('2d');
const COLORVAR = {good:'--good', bad:'--bad', spread:'--spread', neutral:'--neutral'};
/* 색맹 모드에서 쓰는 테두리 모양 — 네 상태가 서로 다른 패턴이어야 합니다 */
const DASH = {bad:[], spread:[10,7], good:[2,6], neutral:[14,6,3,6]};
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* 색에 투명도를 입힙니다. #RGB · #RRGGBB 를 처리하고,
   rgb()/oklch() 같은 다른 표기가 들어와도 그리기가 멈추지 않게 원본을 돌려줍니다. */
function withAlpha(col, a){
  let v = String(col).trim();
  const short = /^#([0-9a-f]{3})$/i.exec(v);
  if(short) v = '#' + [...short[1]].map(c => c + c).join('');
  if(/^#[0-9a-f]{6}$/i.test(v)){
    const n = v.slice(1);
    return `rgba(${parseInt(n.slice(0,2),16)},${parseInt(n.slice(2,4),16)},${parseInt(n.slice(4,6),16)},${a})`;
  }
  return v;
}
/* 배경색 위에서 읽히는 글자색 (밝으면 검정, 어두우면 흰색) */
function inkOn(col){
  const m = /^#([0-9a-f]{6})$/i.exec(String(col).trim());
  if(!m) return '#FFFFFF';
  const n = m[1];
  const r = parseInt(n.slice(0,2),16), g = parseInt(n.slice(2,4),16), b = parseInt(n.slice(4,6),16);
  return (0.299*r + 0.587*g + 0.114*b) > 150 ? '#0A0E13' : '#FFFFFF';
}

function draw(){
  const W = cv.width, H = cv.height;
  ctx.fillStyle = cssVar('--film'); ctx.fillRect(0,0,W,H);
  if(!S.img) return;
  const s = Math.min(W/S.img.width, H/S.img.height);
  const w = S.img.width*s, h = S.img.height*s;
  ctx.drawImage(S.img, (W-w)/2, (H-h)/2, w, h);
  if(!S.overlay) return;
  const cvd = document.documentElement.getAttribute('data-cvd') === 'on';
  S.regions.forEach((rg, i) => {
    const px = (W-w)/2 + rg.nx*w, py = (H-h)/2 + rg.ny*h, rr = rg.r*Math.min(w,h);
    const col = cssVar(COLORVAR[rg.status || 'neutral']) || '#7C3AED';

    // 빛무리
    const grd = ctx.createRadialGradient(px,py,rr*.15, px,py,rr*1.6);
    grd.addColorStop(0, withAlpha(col, S.alpha*0.62));
    grd.addColorStop(1, withAlpha(col, 0));
    ctx.beginPath(); ctx.arc(px,py,rr*1.6,0,7); ctx.fillStyle = grd; ctx.fill();

    // 테두리 — 어두운 선을 먼저 깔아 밝은 뇌 조직 위에서도 윤곽이 보이게 합니다
    const lw = Math.max(2.5, W/260);
    ctx.save();
    ctx.setLineDash(!cvd ? [] : DASH[rg.status] || DASH.neutral);
    ctx.lineWidth = lw + 3; ctx.strokeStyle = 'rgba(6,9,13,.55)';
    ctx.beginPath(); ctx.arc(px,py,rr,0,7); ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.arc(px,py,rr,0,7); ctx.stroke();
    ctx.restore();

    // 이름표 — 상태 색으로 채우고 글자색은 밝기에 맞춰 자동 선택
    const label = `${i+1}. ${rg.name}`;
    ctx.font = `700 ${Math.round(W/38)}px ${cssVar('--f-ui')}`;
    const bh = W/26, bw = ctx.measureText(label).width + 18;
    let ty = py - rr - bh*0.95;
    if(ty - bh/2 < 4) ty = py + rr + bh*0.95;            // 위가 잘리면 아래쪽에
    const bx = Math.min(Math.max(px - bw/2, 4), Math.max(4, W - bw - 4));
    ctx.fillStyle = col;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(bx, ty - bh/2, bw, bh, bh/2);
    else              ctx.rect(bx, ty - bh/2, bw, bh);
    ctx.fill();
    ctx.fillStyle = inkOn(col); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + bw/2, ty + 1);
  });
}

/* ═══════════════════════════════════════════════════════════
   J. 이미지 처리
   ═══════════════════════════════════════════════════════════ */
let imageSeq = 0;
function cancelPendingImages(){
  imageSeq++;
  analysisSeq++;
  document.body.style.cursor = '';
}
function loadCanvas(canvas, seriesLabel){
  const seq = ++imageSeq;
  analysisSeq++;
  const img = new Image();
  img.onload = () => {
    if(seq !== imageSeq || $('app').hidden) return;
    S.img = img; S.src = canvas;
    $('emptyState').hidden = true; $('orient').hidden = false;
    $('fbSeries').textContent = seriesLabel;
    $('fbSize').textContent = `${img.width} × ${img.height}`;
    $('fbTime').textContent = new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    runAnalysis();
  };
  img.src = canvas.toDataURL('image/png');
}
function loadFile(file){
  if(!file || !file.type.startsWith('image/')) return;
  if(file.size > 25*1024*1024){ alert('25MB 이하 이미지만 열 수 있습니다.'); return; }
  const seq = ++imageSeq;
  analysisSeq++;
  const fr = new FileReader();
  fr.onload = e => {
    if(seq !== imageSeq || $('app').hidden) return;
    const im = new Image();
    im.onerror = () => alert('이미지를 읽을 수 없습니다. JPG 또는 PNG 파일인지 확인해 주세요.');
    im.onload = () => {
      if(seq !== imageSeq || $('app').hidden) return;
      const c = document.createElement('canvas');
      const m = Math.min(1, 900/Math.max(im.width, im.height));
      c.width = Math.round(im.width*m); c.height = Math.round(im.height*m);
      c.getContext('2d').drawImage(im,0,0,c.width,c.height);
      loadCanvas(c, 'SERIES 업로드 영상');   // 파일명은 환자 식별정보일 수 있어 표시하지 않음
    };
    im.src = e.target.result;
  };
  fr.readAsDataURL(file);
}
let analysisSeq = 0;
async function runAnalysis(){
  const seq = ++analysisSeq, src = S.src;
  S.analysis = null; S.regions = []; S.compared = false;
  $('saveScan').disabled = true;
  $('probsWrap').hidden = true; $('confWrap').hidden = true; $('checkBox').hidden = true;
  $('vTitle').textContent = '분석 중…'; $('vConf').textContent = '';
  $('report').innerHTML = ''; $('findings').innerHTML = '';
  draw();
  document.body.style.cursor = 'progress';
  let a;
  try{ a = await ENGINE.analyze(src); }
  catch(e){
    if(seq === analysisSeq && src === S.src) alert('이미지를 분석하지 못했습니다. 다른 JPG 또는 PNG 이미지로 다시 시도해 주세요.');
    return;
  }
  finally{ if(seq === analysisSeq) document.body.style.cursor = ''; }
  if(seq !== analysisSeq || src !== S.src) return;   // 분석 중에 다른 영상이 열렸으면 이 결과는 버림
  setEngine(a.kind === 'model' ? { ...MODEL_META, name:a.model || MODEL_META.name } : DEMO_META);
  S.analysis = a; S.regions = a.regions;
  S.compared = compareWithPrev(S.regions);
  S.simple = false;
  $('checkMsg').hidden = true;
  renderAll();
  if(typeof go === 'function') go('result');
}
function thumbOf(canvas, size){
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.fillStyle='#0A0D10'; x.fillRect(0,0,size,size);
  const s = Math.min(size/canvas.width, size/canvas.height);
  x.drawImage(canvas, (size-canvas.width*s)/2, (size-canvas.height*s)/2, canvas.width*s, canvas.height*s);
  return c.toDataURL('image/jpeg', .72);
}
