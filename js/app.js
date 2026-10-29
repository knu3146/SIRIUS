'use strict';

/* ═══════════════════════════════════════════════════════════
   L. 앱 진입 · 잠금
   ═══════════════════════════════════════════════════════════ */
async function saveVault(){
  if(S.guest || !S.masterKey || !S.acc) return true;
  try{
    S.acc.data = await seal(S.masterKey, {email:S.email, name:S.name, scans:S.scans});
    return accounts.put(S.acc);
  }catch(e){ return false; }
}
function enterApp(){
  $('landing').hidden = true; $('gate').hidden = true; $('app').hidden = false;
  const label = S.guest ? '둘러보기 모드' : `<b>${esc(S.name || S.acc.id)}</b>님`;
  $('who').innerHTML = label;
  $('acctBtn').hidden = S.guest;
  if(typeof renderAccount === 'function') renderAccount();
  document.querySelectorAll('.navitem').forEach(b => {
    const locked = S.guest && !GUEST_OK[b.dataset.go];
    b.classList.toggle('locked', locked);
    b.title = locked ? '로그인한 뒤에 쓸 수 있습니다' : '';
  });
  if(typeof go === 'function') go(S.guest ? 'guide' : (S.img ? 'result' : 'analyze'));
  $('lockBtn').textContent = S.guest ? '나가기' : '로그아웃';
  $('secMode').textContent = S.guest
    ? '지금은 둘러보기 모드라 아무것도 저장되지 않습니다.'
    : '로그아웃하면 이 기기에서도 내용을 읽을 수 없습니다.';
  $('tlHint').textContent = S.guest ? '둘러보기 모드 — 저장 기능 꺼짐' : '암호화되어 이 기기에만 저장됩니다 · 최대 8회';
  $('saveScan').disabled = S.guest || !S.analysis;
  renderTimeline();
  resetIdle();
}
function logout(){
  S.acc = null; S.masterRaw = null; S.masterKey = null; S.email = ''; S.name = '';
  S.scans = []; S.img = null; S.src = null; S.analysis = null; S.regions = []; S.guest = false;
  flow.purpose = null; flow.id = ''; flow.email = ''; flow.pw = ''; flow.acc = null;
  try{ if(window.speechSynthesis) speechSynthesis.cancel(); }catch(e){}
  ctx.clearRect(0,0,cv.width,cv.height);
  $('emptyState').hidden = false; $('orient').hidden = true;
  $('report').innerHTML = ''; $('findings').innerHTML = ''; $('probsWrap').hidden = true;
  $('checkBox').hidden = true; $('tlScroll').innerHTML = ''; $('vTitle').textContent = '';
  $('loginPw').value = '';
  show('login');
}
let idleTimer = null;
function resetIdle(){
  clearTimeout(idleTimer);
  if($('app').hidden || S.guest) return;
  idleTimer = setTimeout(logout, 10*60*1000);
}
['pointerdown','keydown','wheel','touchstart'].forEach(ev => window.addEventListener(ev, resetIdle, {passive:true}));

$('lockBtn').onclick = logout;
/* 계정 정보 표 */
function renderAccount(){
  if(S.guest || !S.acc){ $('acctState').innerHTML = '<dt>상태</dt><dd>둘러보기 모드 — 저장되지 않습니다</dd>'; return; }
  $('acctState').innerHTML =
      `<dt>이름</dt><dd>${esc(S.name || '—')}</dd>`
    + `<dt>아이디</dt><dd class="mono">${esc(S.acc.id)}</dd>`
    + `<dt>이메일</dt><dd class="mono">${esc(S.acc.emailMask)}</dd>`
    + `<dt>가입일</dt><dd>${new Date(S.acc.created).toLocaleDateString('ko-KR')}</dd>`
    + `<dt>저장된 회차</dt><dd>${S.scans.length}회</dd>`;
}
$('chPwBtn').onclick = () => show('chpw');
$('newRecBtn').onclick = async () => {
  if(!S.acc || !S.masterRaw) return;
  if(!confirm('복구 키를 새로 발급하면 이전 복구 키는 쓸 수 없게 됩니다. 계속할까요?')) return;
  // (아래에서 복구 키 화면을 띄웁니다)
  const rec = await rewrapRecovery(S.acc, S.masterRaw);
  accounts.put(S.acc);
  flow.id = S.acc.id;
  $('recKey').textContent = rec; $('recSaved').checked = false;
  show('recovery');
  $('btnRecDone').textContent = '앱으로 돌아가기';
  $('btnRecDone').onclick = () => {
    if(!$('recSaved').checked) return alert('복구 키를 보관했는지 확인해 주세요.');
    $('recKey').textContent = '';
    $('gate').hidden = true; $('app').hidden = false;
  };
};
$('delAcct').onclick = () => {
  if(!S.acc) return;
  if(!confirm('계정과 저장된 모든 회차 기록을 이 기기에서 완전히 지웁니다.\n되돌릴 수 없습니다. 계속할까요?')) return;
  accounts.remove(S.acc.id);
  ls.del(LKEY);
  alert('삭제했습니다.');
  logout();
};

/* ═══════════════════════════════════════════════════════════
   M. 앱 이벤트
   ═══════════════════════════════════════════════════════════ */
$('pickBtn').onclick = () => $('fileIn').click();
$('fileIn').onchange = e => { loadFile(e.target.files[0]); e.target.value=''; };
$('sampleBtn').onclick = () => loadCanvas(makeSample(Date.now()%9973), 'SERIES SAMPLE-AX-T2');

[$('film'), $('film2')].forEach(zone => {
  if(!zone) return;
  ['dragenter','dragover'].forEach(t => zone.addEventListener(t, e=>{ e.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(t => zone.addEventListener(t, e=>{ e.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
});

$('alpha').oninput = e => { S.alpha = e.target.value/100; draw(); };
$('ovBtn').onclick = e => {
  S.overlay = !S.overlay;
  e.target.setAttribute('aria-pressed', String(S.overlay));
  e.target.textContent = S.overlay ? '표시 켜짐' : '표시 꺼짐';
  draw();
};
document.querySelectorAll('[role=tab]').forEach(t => t.onclick = () => {
  document.querySelectorAll('[role=tab]').forEach(o=>{
    const on = o===t; o.setAttribute('aria-selected', String(on));
    $(o.getAttribute('aria-controls')).hidden = !on;
  });
});
$('report').addEventListener('click', e => {
  const b = e.target.closest('.term'); if(!b) return;
  $('tab-g').click();
  renderGlossary(b.dataset.term);
  const el = $('g-'+b.dataset.term); if(el) el.scrollIntoView({block:'center', behavior:'smooth'});
});
$('againBtn').onclick = () => {
  S.simple = true; renderAll();
  $('checkMsg').hidden = false;
  $('checkMsg').textContent = '더 쉬운 말로 다시 적었습니다. 그래도 막히는 낱말이 있으면 밑줄 친 부분을 눌러보세요.';
};
$('okBtn').onclick = () => {
  $('checkMsg').hidden = false;
  $('checkMsg').textContent = '좋습니다. 이제 "의사에게 할 질문" 탭을 열어 진료 전에 복사해 두세요.';
};

let rate = 1;
$('ttsRate').oninput = e => { rate = +e.target.value; $('ttsRateVal').textContent = rate.toFixed(1)+'×'; };
function speak(text){
  if(!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g,''));
  u.lang = 'ko-KR'; u.rate = rate;
  const v = speechSynthesis.getVoices().find(x=>x.lang && x.lang.startsWith('ko'));
  if(v) u.voice = v;
  speechSynthesis.speak(u);
}
$('ttsBtn').onclick = () => {
  if(speechSynthesis.speaking){ speechSynthesis.cancel(); return; }
  speak($('vTitle').textContent + '. ' + $('report').innerText);
};
$('ttsQ').onclick = () => {
  if(speechSynthesis.speaking){ speechSynthesis.cancel(); return; }
  speak('의사에게 물어볼 질문입니다. ' + [...$('questions').querySelectorAll('li')].map((l,i)=>`${i+1}번. ${l.textContent}`).join(' '));
};
$('copyQ').onclick = async e => {
  const txt = [...$('questions').querySelectorAll('li')].map((l,i)=>`${i+1}. ${l.textContent}`).join('\n');
  try{ await navigator.clipboard.writeText(txt); e.target.textContent='복사했습니다'; }
  catch(err){ e.target.textContent='복사할 수 없습니다'; }
  setTimeout(()=>e.target.textContent='질문 복사하기', 1800);
};

$('saveScan').onclick = async () => {
  if(!S.analysis || S.guest) return;
  S.scans.push({
    date: new Date().toLocaleString('ko-KR',{year:'2-digit',month:'2-digit',day:'2-digit'}),
    thumb: thumbOf(S.src, 200),
    regions: S.regions.map(r=>({nx:r.nx, ny:r.ny, r:r.r, area:r.area, status:r.status, name:r.name})),
    probs: S.analysis.probs,
    kind: S.analysis.kind,
    cost: +($('cost').value || 0)
  });
  if(S.scans.length > 8) S.scans.shift();
  const ok = await saveVault();
  if(!ok){ S.scans.pop(); alert('저장 공간이 부족해 기록하지 못했습니다. 오래된 회차를 지운 뒤 다시 시도해 주세요.'); return; }
  renderTimeline(); renderAccount();
  $('cost').value = '';
  $('scanLabel').textContent = `${S.scans.length}차로 저장됨`;
  $('saveScan').disabled = true;
};
$('tlScroll').addEventListener('click', e => {
  const c = e.target.closest('.tlcard'); if(!c) return;
  const s = S.scans[+c.dataset.i]; if(!s) return;
  const im = new Image();
  im.onload = () => {
    S.img = im; S.regions = s.regions;
    S.analysis = {probs:s.probs, regions:s.regions, quality:'저장본', kind:s.kind};
    S.compared = true;
    $('emptyState').hidden = true; $('orient').hidden = false;
    $('fbSeries').textContent = `SERIES 저장본 #${+c.dataset.i+1}`;
    $('fbSize').textContent = `${im.width} × ${im.height}`;
    S.regions.forEach(r=>{ if(!r.change) r.change='저장된 기록'; if(!r.conf) r.conf=.5; });
    renderAll();
    document.querySelectorAll('.tlcard').forEach(x=>x.setAttribute('aria-current', String(x===c)));
  };
  im.src = s.thumb;
});
$('clearScans').onclick = async () => {
  if(!S.scans.length) return;
  if(!confirm('저장된 회차 기록을 모두 지웁니다. 되돌릴 수 없습니다.')) return;
  S.scans = []; await saveVault(); renderTimeline(); renderAccount();
};

$('fsSet').onclick = e => {
  const b = e.target.closest('button'); if(!b) return;
  [...e.currentTarget.children].forEach(o=>o.setAttribute('aria-pressed', String(o===b)));
  document.documentElement.style.setProperty('--fs', b.dataset.fs);
  requestAnimationFrame(draw);
};

/* ═══════════════════════════════════════════════════════════
   N. 시작
   ═══════════════════════════════════════════════════════════ */
renderGlossary();
$('engineBadge').textContent = '엔진 · ' + ENGINE.name;
$('backendBadge').textContent = '인증 방식 확인 중…';
AuthBackend.detect().then(mode => {
  $('backendBadge').textContent = mode === 'server' ? '메일 인증' : '데모 인증';
});
if(!SUBTLE){
  $('scr-login').innerHTML = '<h2>안전하게 저장할 수 없는 환경입니다</h2>'
    + '<p class="lede">이 브라우저에서는 암호화 기능(Web Crypto)을 쓸 수 없어 계정 기능을 켜지 않습니다. 분석 기능만 사용할 수 있습니다.</p>'
    + '<button class="btn primary full" id="goGuest2">저장 없이 사용하기</button>';
  $('goGuest2').onclick = () => { S.guest = true; enterApp(); };
  show('login');
} else {
  show('login');
  if(Object.keys(accounts.all()).length === 0 && ls.get(OLD2)){
    $('ok-login').textContent = '이전 버전의 잠금 데이터가 있습니다. 회원가입을 하면 새 계정 방식으로 전환됩니다.';
    $('ok-login').hidden = false;
  }
  // 첫 화면은 표지(랜딩). '이미지 올리기' 를 누르면 로그인 화면이 뜹니다.
  // 세션은 메모리에만 있으므로 새로고침·재방문하면 항상 여기서 다시 시작합니다.
  showLanding();
}
