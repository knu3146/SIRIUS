'use strict';
/* ═══════════════════════════════════════════════════════════
   화면 전환 · 테마 · 랜딩 · 사이드바 라우터
   ═══════════════════════════════════════════════════════════ */

/* ── 테마 (밝게 / 어둡게 / 시스템) ───────────────────────── */
const THEME_KEY = 'neuria-theme';
function applyTheme(t){
  if(t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
}
function toggleTheme(){
  let cur;
  try{ cur = localStorage.getItem(THEME_KEY); }catch(e){}
  const isDark = cur ? cur === 'dark'
                     : window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(isDark ? 'light' : 'dark');
}
(function initTheme(){
  let t = null;
  try{ t = localStorage.getItem(THEME_KEY); }catch(e){}
  if(t) applyTheme(t);
})();
['themeBtn','themeBtn2','themeBtn3'].forEach(id => { const b = $(id); if(b) b.onclick = toggleTheme; });

/* ── 색맹(색각 보조) 모드 — 저장되고, 어느 화면에서든 켜고 끌 수 있습니다 ── */
const CVD_KEY = 'neuria-cvd';
function cvdOn(){ return document.documentElement.getAttribute('data-cvd') === 'on'; }
function applyCvd(on){
  document.documentElement.setAttribute('data-cvd', on ? 'on' : 'off');
  try{ localStorage.setItem(CVD_KEY, on ? 'on' : 'off'); }catch(e){}

  // 영상 위 버튼
  const btn = $('cvdBtn');
  if(btn){ btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? '색맹 모드 켜짐' : '색맹 모드 꺼짐'; }
  // 마이페이지 · 접근성의 선택 버튼 (두 곳이 항상 같은 상태를 보여줍니다)
  const set = $('cvdSet');
  if(set) [...set.children].forEach(o => o.setAttribute('aria-pressed', String((o.dataset.cvd === 'on') === on)));

  if(typeof draw === 'function') draw();
}
(function initCvd(){
  let v = null;
  try{ v = localStorage.getItem(CVD_KEY); }catch(e){}
  applyCvd(v === 'on');
})();
if($('cvdBtn')) $('cvdBtn').onclick = () => applyCvd(!cvdOn());
if($('cvdSet')) $('cvdSet').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  applyCvd(b.dataset.cvd === 'on');
});

/* ── 랜딩 ↔ 인증 ↔ 앱 ───────────────────────────────────── */
function showLanding(){
  $('landing').hidden = false; $('gate').hidden = true; $('app').hidden = true;
  window.scrollTo({top:0});
}
function showAuth(){ $('landing').hidden = true; }   // show() 가 gate 를 띄웁니다

$('toLoginTop').onclick  = () => { if(CONFIG.privacy) return enterGuest('analyze'); showAuth(); show('login'); };
$('toSignupTop').onclick = () => { showAuth(); $('goSignup').click(); };
$('authHome').onclick    = showLanding;

/* 가입 없이 둘러보는 진입점 */
function enterGuest(page){
  if(S.acc || S.img) logout();
  S.guest = true; S.scans = [];
  $('landing').hidden = true;
  enterApp();
  if(page) go(page);
}
$('heroStart').onclick = () => { if(CONFIG.privacy) return enterGuest('analyze'); showAuth(); show('login'); };
document.querySelectorAll('[data-landing]').forEach(b => b.onclick = () => {
  const to = b.dataset.landing;
  if(to === 'about'){
    if($('landing').hidden) showLanding();
    setTimeout(() => $('about').scrollIntoView({behavior:'smooth', block:'start'}), 30);
  } else {
    enterGuest(to);                       // 가이드 / FAQ 는 로그인 없이 볼 수 있습니다
  }
});

/* ── 사이드바 라우터 ─────────────────────────────────────── */
const PAGE_TITLE = {
  analyze:'MRI 분석하기', result:'분석 결과', history:'분석 기록',
  guide:'사용 가이드', faq:'자주 묻는 질문', mypage:'마이페이지'
};
/* 로그인 없이 볼 수 있는 페이지 — 도움말뿐입니다 */
const GUEST_OK = {guide:true, faq:true, analyze:true, result:true};
/* '분석하기' + 는 / '분석 결과' + 은 — 받침에 맞는 조사를 고릅니다 */
function josa(word, withJong, noJong){
  const c = String(word).trim().slice(-1).charCodeAt(0);
  if(c < 0xAC00 || c > 0xD7A3) return noJong;          // 한글이 아니면 받침 없음으로
  return (c - 0xAC00) % 28 ? withJong : noJong;
}
function requireLogin(page){
  if(CONFIG.privacy) { $('secMode').textContent = '개인정보 보호 모드에서는 계정과 기록을 저장하지 않습니다.'; return; }
  show('login');
  const nm = PAGE_TITLE[page];
  const el = $('ok-login');
  el.textContent = nm ? `${nm}${josa(nm,'은','는')} 로그인한 뒤에 쓸 수 있습니다.`
                      : '이 기능은 로그인한 뒤에 쓸 수 있습니다.';
  el.hidden = false;
}
function go(page){
  if(!PAGE_TITLE[page]) page = 'analyze';
  if(S.guest && !GUEST_OK[page]){ requireLogin(page); return; }
  document.querySelectorAll('[data-page]').forEach(el => { el.hidden = el.dataset.page !== page; });
  document.querySelectorAll('.navitem').forEach(b => {
    if(b.dataset.go === page) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('pageTitle').textContent = PAGE_TITLE[page];
  if(page === 'mypage' && typeof renderAccount === 'function') renderAccount();
  window.scrollTo({top:0});
}
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

/* ── 아직 준비되지 않은 버튼 ─────────────────────────────── */
document.querySelectorAll('[data-soon]').forEach(b => b.onclick = () => {
  const el = $('err-login');
  el.textContent = `${b.dataset.soon} 계정 로그인은 아직 준비 중입니다. 아이디와 비밀번호로 로그인해 주세요.`;
  el.hidden = false;
});

/* ── 아이디 기억하기 ─────────────────────────────────────── */
const ID_KEY = 'neuria-last-id';
(function initRememberId(){
  if(CONFIG.privacy) return;
  let v = null;
  try{ v = localStorage.getItem(ID_KEY); }catch(e){}
  if(v){ $('loginId').value = v; $('rememberId').checked = true; }
})();
$('btnLogin').addEventListener('click', () => {
  if(CONFIG.privacy) return;
  try{
    if($('rememberId').checked) localStorage.setItem(ID_KEY, $('loginId').value.trim());
    else localStorage.removeItem(ID_KEY);
  }catch(e){}
}, true);                                  // 로그인 처리보다 먼저 기록

/* ── PDF로 저장 (브라우저 인쇄 → PDF) ────────────────────── */
$('printBtn').onclick = () => window.print();

/* ── FAQ 분류 필터 ───────────────────────────────────────── */
$('faqPills').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  [...e.currentTarget.children].forEach(o => o.setAttribute('aria-pressed', String(o === b)));
  const cat = b.dataset.cat;
  $('faqList').querySelectorAll('details').forEach(d => {
    d.hidden = !(cat === 'all' || d.dataset.cat === cat);
    if(d.hidden) d.open = false;
  });
});

/* ── 랜딩 일러스트 · 예시 이미지 썸네일 ──────────────────── */
function paintHero(){
  const c = $('heroCanvas'); if(!c) return;
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.clearRect(0,0,W,H);
  const cx = W*0.52, cy = H*0.46, R = Math.min(W,H)*0.33;

  // 부드러운 빛무리
  const glow = x.createRadialGradient(cx, cy, R*0.2, cx, cy, R*1.9);
  glow.addColorStop(0, 'rgba(37,99,235,.30)');
  glow.addColorStop(1, 'rgba(37,99,235,0)');
  x.fillStyle = glow; x.beginPath(); x.arc(cx, cy, R*1.9, 0, 7); x.fill();

  // 뇌 윤곽 (좌우 반구)
  x.lineWidth = Math.max(2, R*0.035); x.lineCap = 'round'; x.lineJoin = 'round';
  x.strokeStyle = 'rgba(37,99,235,.85)';
  for(const dir of [-1, 1]){
    x.beginPath();
    x.moveTo(cx, cy - R);
    x.bezierCurveTo(cx + dir*R*1.05, cy - R*1.02, cx + dir*R*1.25, cy - R*0.1, cx + dir*R*0.82, cy + R*0.52);
    x.bezierCurveTo(cx + dir*R*0.6, cy + R*0.98, cx + dir*R*0.18, cy + R*1.02, cx, cy + R*0.86);
    x.stroke();
    // 주름
    x.lineWidth = Math.max(1.2, R*0.018); x.strokeStyle = 'rgba(37,99,235,.42)';
    for(let i=1;i<=3;i++){
      const k = i/4;
      x.beginPath();
      x.moveTo(cx + dir*R*0.12, cy - R*0.72 + k*R*1.3);
      x.bezierCurveTo(cx + dir*R*(0.45+k*0.2), cy - R*0.8 + k*R*1.25,
                      cx + dir*R*(0.5+k*0.1), cy - R*0.3 + k*R*1.1,
                      cx + dir*R*(0.2+k*0.3), cy - R*0.1 + k*R*1.0);
      x.stroke();
    }
    x.lineWidth = Math.max(2, R*0.035); x.strokeStyle = 'rgba(37,99,235,.85)';
  }
  x.beginPath(); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R*0.86);
  x.lineWidth = Math.max(1.5, R*0.022); x.strokeStyle = 'rgba(37,99,235,.55)'; x.stroke();

  // 표시 지점
  const px = cx + R*0.46, py = cy - R*0.12;
  const hot = x.createRadialGradient(px, py, 1, px, py, R*0.3);
  hot.addColorStop(0, 'rgba(96,165,250,.95)'); hot.addColorStop(1, 'rgba(96,165,250,0)');
  x.beginPath(); x.arc(px, py, R*0.3, 0, 7); x.fillStyle = hot; x.fill();
  x.beginPath(); x.arc(px, py, R*0.12, 0, 7);
  x.strokeStyle = '#2563EB'; x.lineWidth = Math.max(2, R*0.028); x.stroke();

  // 떠 있는 MRI 카드 3장
  const films = [[W*0.80, H*0.20, R*0.42], [W*0.20, H*0.26, R*0.33], [W*0.26, H*0.80, R*0.30]];
  films.forEach(([fx, fy, fs], i) => {
    x.save(); x.translate(fx, fy); x.rotate((i-1) * 0.12);
    x.fillStyle = '#0A0E13';
    x.strokeStyle = 'rgba(37,99,235,.35)'; x.lineWidth = 2;
    x.beginPath(); x.roundRect(-fs/2, -fs/2, fs, fs, fs*0.12); x.fill(); x.stroke();
    const g = x.createRadialGradient(0, 0, fs*0.05, 0, 0, fs*0.5);
    g.addColorStop(0, 'rgba(190,205,220,.85)'); g.addColorStop(.7, 'rgba(120,135,150,.5)'); g.addColorStop(1, 'rgba(60,70,82,.2)');
    x.beginPath(); x.ellipse(0, 0, fs*0.34, fs*0.38, 0, 0, 7); x.fillStyle = g; x.fill();
    x.fillStyle = 'rgba(10,14,19,.9)';
    x.beginPath(); x.ellipse(-fs*0.07, 0, fs*0.045, fs*0.14, -.2, 0, 7); x.fill();
    x.beginPath(); x.ellipse( fs*0.07, 0, fs*0.045, fs*0.14,  .2, 0, 7); x.fill();
    x.restore();
  });
}
function paintSamples(){
  const wrap = $('samples'); if(!wrap) return;
  wrap.innerHTML = '';
  [7, 1234, 5150, 90210].forEach(seed => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = '이 예시로 분석해 보기';
    const src = makeSample(seed);
    const th = document.createElement('canvas');
    th.width = th.height = 168;
    th.getContext('2d').drawImage(src, 0, 0, 168, 168);
    btn.appendChild(th);
    btn.onclick = () => loadCanvas(makeSample(seed), 'SERIES SAMPLE-AX-T2');
    wrap.appendChild(btn);
  });
}
paintHero();
paintSamples();
