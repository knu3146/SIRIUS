'use strict';

/* ═══════════════════════════════════════════════════════════
   K. 인증 화면 제어
   ═══════════════════════════════════════════════════════════ */
const SCREENS = ['login','signup','recovery','findid','idresult','findpw','newpw','chpw'];
function show(screen){
  SCREENS.forEach(s => { const el = $('scr-'+s); if(el) el.hidden = (s !== screen); });
  $('landing').hidden = true; $('gate').hidden = false; $('app').hidden = true;
  SCREENS.forEach(s => { const e = $('err-'+s); if(e) e.hidden = true; });
  $('ok-login').hidden = true;
  if(typeof clearPending === 'function') clearPending();   // 로그인 2단계 진행 중이던 상태 초기화
  const first = $('scr-'+screen).querySelector('input');
  if(first) setTimeout(()=>first.focus(), 40);
}
function fail(screen, msg){ const e = $('err-'+screen); if(e){ e.textContent = msg; e.hidden = false; } }
/* ── 비밀번호 규칙 (모두 필수) ── */
const SPECIAL_RE = /[~!@#$%^&*()_\-+=\[\]{}|\\;:'",.<>\/?`]/;
const PW_RULES = [
  {k:'len',   label:'8자 이상',    test:p => p.length >= 8},
  {k:'upper', label:'영문 대문자', test:p => /[A-Z]/.test(p)},
  {k:'lower', label:'영문 소문자', test:p => /[a-z]/.test(p)},
  {k:'spec',  label:'특수문자',    test:p => SPECIAL_RE.test(p)},
  {k:'nosp',  label:'공백 없이',   test:p => p.length > 0 && !/\s/.test(p)}
];
const MAXR = PW_RULES.length;
const pwValid   = p => PW_RULES.every(r => r.test(p));
const pwMissing = p => PW_RULES.filter(r => !r.test(p)).map(r => r.label);
function pwScore(p){
  return PW_RULES.filter(r => r.test(p)).length;
}
function bindPw(input, bar, req){
  const paint = () => {
    const p = $(input).value;
    $(req).innerHTML = PW_RULES.map(r =>
      `<span class="${r.test(p) ? 'ok' : ''}">${r.label}</span>`).join('');
    const s = pwScore(p);
    $(bar).style.width = (s/MAXR*100)+'%';
    $(bar).style.background = s < MAXR-1 ? 'var(--bad)' : s < MAXR ? 'var(--spread)' : 'var(--good)';
  };
  $(input).addEventListener('input', paint);
  paint();
  return paint;
}
const paintSuPw = bindPw('suPw','suPwBar','suPwReq');
const paintNpPw = bindPw('npPw','npPwBar','npPwReq');
const paintCpPw = bindPw('cpNew','cpBar','cpPwReq');

const ID_RE = /^[A-Za-z0-9_]{4,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

/* 아이디 중복확인 — 이 브라우저 + 서버 등록부(다른 사용자 포함) 양쪽을 봅니다 */
const idState = { value:'', available:false, checking:false, timer:null };
function setIdHelp(text, kind){
  const h = $('suIdHelp');
  h.textContent = text;
  h.className = 'help' + (kind ? ' ' + kind : '');
}
async function checkIdNow(){
  const v = $('suId').value.trim();
  idState.value = v; idState.available = false;
  if(!v){ setIdHelp('로그인에 사용합니다. 다른 사용자와 겹치지 않아야 합니다.'); updateSignupBtn(); return; }
  if(!ID_RE.test(v)){ setIdHelp('영문·숫자·밑줄 4~20자만 쓸 수 있습니다.', 'no'); updateSignupBtn(); return; }
  if(accounts.byId(v)){ setIdHelp('이미 사용 중인 아이디입니다.', 'no'); updateSignupBtn(); return; }

  idState.checking = true; setIdHelp('중복 확인 중…'); updateSignupBtn();
  await AuthBackend.detect();
  const r = await AuthBackend.checkId(v);
  idState.checking = false;
  if($('suId').value.trim() !== v) return;            // 그새 더 입력했으면 버림

  if(r.available){
    idState.available = true;
    setIdHelp(r.enforced === false
      ? '사용할 수 있는 아이디입니다. (데모 모드 — 이 브라우저 기준으로만 확인)'
      : '사용할 수 있는 아이디입니다.', 'ok');
  } else {
    setIdHelp(r.reason === 'FORMAT' ? '영문·숫자·밑줄 4~20자만 쓸 수 있습니다.'
                                    : '이미 사용 중인 아이디입니다. 다른 아이디를 골라 주세요.', 'no');
  }
  updateSignupBtn();
}
$('suId').addEventListener('input', () => {
  clearTimeout(idState.timer);
  idState.available = false;
  setIdHelp('…');
  updateSignupBtn();
  idState.timer = setTimeout(checkIdNow, 400);        // 타이핑이 멈추면 확인
});
$('suPw2').addEventListener('input', e=>{
  const h = $('suPw2Help');
  if(!e.target.value){ h.textContent=''; h.className='help'; return; }
  const same = e.target.value === $('suPw').value;
  h.textContent = same ? '일치합니다.' : '아직 일치하지 않습니다.';
  h.className = 'help ' + (same ? 'ok' : 'no');
});

/* ── 이메일 인증 (입력 화면에 바로 붙는 공용 부품) ────────────
   send  : 인증번호 요청 → 입력칸·타이머 표시
   check : 입력한 번호 확인 → 성공 시 onVerified 호출
   이메일을 고치면 인증 상태가 자동으로 풀립니다.
   ─────────────────────────────────────────────────────────── */
function makeVerifier(cfg){
  const st = {sent:false, verified:false, email:'', resendAt:0, tid:null};
  const stop = () => { clearInterval(st.tid); st.tid = null; };

  function reset(){
    stop();
    st.sent = st.verified = false; st.email = '';
    $(cfg.box).hidden = true; $(cfg.ok).hidden = true;
    $(cfg.input).value = ''; $(cfg.input).disabled = false;
    $(cfg.check).disabled = false;
    $(cfg.send).disabled = false; $(cfg.send).textContent = '인증번호 받기';
    if(cfg.onReset) cfg.onReset();
  }
  function tick(){
    if(st.verified) return stop();
    const rleft = Math.max(0, st.resendAt - Date.now());
    if(AuthBackend.mode === 'demo'){
      const left = Math.max(0, DemoMail.expAt(cfg.purpose) - Date.now());
      $(cfg.timer).textContent = left
        ? `남은 시간 ${Math.floor(left/60000)}:${String(Math.floor(left%60000/1000)).padStart(2,'0')}`
        : '인증번호가 만료되었습니다. 다시 받아 주세요.';
    } else {
      $(cfg.timer).textContent = '10분 안에 입력해 주세요.';
    }
    $(cfg.send).disabled = rleft > 0;
    $(cfg.send).textContent = rleft > 0 ? `재발송 ${Math.ceil(rleft/1000)}초` : '재발송';
  }
  async function send(){
    const email = cfg.getEmail();
    const bad = await cfg.validate(email);
    if(bad) return fail(cfg.screen, bad);
    $(cfg.send).disabled = true; $(cfg.send).textContent = '보내는 중…';
    try{
      await AuthBackend.detect();                // 서버가 켜져 있으면 실제 메일로
      const r = await AuthBackend.sendCode(cfg.purpose, email);
      st.sent = true; st.verified = false; st.email = email;
      $(cfg.box).hidden = false; $(cfg.ok).hidden = true;
      $(cfg.demo).hidden = AuthBackend.mode !== 'demo';
      $(cfg.demoCode).textContent = r.demoCode || '';
      $(cfg.input).value = ''; $(cfg.input).disabled = false; $(cfg.check).disabled = false;
      $('err-'+cfg.screen).hidden = true;
      st.resendAt = Date.now() + 60*1000;
      stop(); st.tid = setInterval(tick, 500); tick();
      setTimeout(()=>$(cfg.input).focus(), 30);
    }catch(e){
      fail(cfg.screen, e.message);
      $(cfg.send).disabled = false; $(cfg.send).textContent = '인증번호 받기';
    }
  }
  async function check(){
    const code = normCode($(cfg.input).value);
    if(!st.sent) return fail(cfg.screen, '먼저 인증번호를 받아 주세요.');
    if(!CODE_RE.test(code)) return fail(cfg.screen, '인증번호 6자리(영문·숫자)를 정확히 입력해 주세요.');
    $(cfg.check).disabled = true;
    try{
      const r = await AuthBackend.verifyCode(cfg.purpose, st.email, code);
      if(!r.ok){ $(cfg.check).disabled = false; return fail(cfg.screen, r.reason || '인증에 실패했습니다.'); }
      st.verified = true; stop();
      $(cfg.box).hidden = true; $(cfg.ok).hidden = false;
      $(cfg.send).disabled = true; $(cfg.send).textContent = '인증 완료';
      $('err-'+cfg.screen).hidden = true;
      if(cfg.onVerified) cfg.onVerified(st.email);
    }catch(e){ $(cfg.check).disabled = false; fail(cfg.screen, e.message); }
  }
  $(cfg.send).onclick = send;
  $(cfg.check).onclick = check;
  $(cfg.input).addEventListener('input', e => {
    e.target.value = normCode(e.target.value).slice(0,6);
  });
  $(cfg.input).addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); check(); } });
  $(cfg.emailInput).addEventListener('input', () => { if(st.sent || st.verified) reset(); });
  return { reset, isVerified: email => st.verified && st.email === email, email: () => st.email };
}

/* 회원가입용 */
const vSignup = makeVerifier({
  purpose:'signup', screen:'signup',
  emailInput:'suEmail', send:'suSend', box:'suBox', input:'suCode', check:'suCheck',
   timer:'suTimer', demo:'suDemo', demoCode:'suDemoCode', ok:'suOk',
  getEmail: () => $('suEmail').value.trim().toLowerCase(),
  validate: async email => {
    if(!EMAIL_RE.test(email)) return '이메일 형식이 올바르지 않습니다.';
    if(await accounts.byEmail(email)) return '이미 가입된 이메일입니다.';
    return null;
  },
  onVerified: () => { $('suStep2').classList.add('on'); updateSignupBtn(); },
  onReset:    () => { $('suStep2').classList.remove('on'); updateSignupBtn(); }
});
/* 아이디 찾기용 */
const vFindId = makeVerifier({
  purpose:'findid', screen:'findid',
  emailInput:'fiEmail', send:'fiSend', box:'fiBox', input:'fiCode', check:'fiCheck',
   timer:'fiTimer', demo:'fiDemo', demoCode:'fiDemoCode', ok:'fiOk',
  getEmail: () => $('fiEmail').value.trim().toLowerCase(),
  validate: async email => {
    if(!EMAIL_RE.test(email)) return '이메일 형식이 올바르지 않습니다.';
    const acc = await accounts.byEmail(email);
    if(!acc) return '그 이메일로 가입된 계정이 없습니다.';
    flow.acc = acc;
    return null;
  },
  onVerified: () => {
    const acc = flow.acc;
    $('foundId').textContent = maskId(acc.id);
    $('foundWhen').textContent = `가입일 ${new Date(acc.created).toLocaleDateString('ko-KR')} · 전체 아이디는 ${acc.id.length}자입니다`;
    show('idresult');
  }
});
/* 비밀번호 찾기용 */
const vFindPw = makeVerifier({
  purpose:'findpw', screen:'findpw',
  emailInput:'fpEmail', send:'fpSend', box:'fpBox', input:'fpCode', check:'fpCheck',
   timer:'fpTimer', demo:'fpDemo', demoCode:'fpDemoCode', ok:'fpOk',
  getEmail: () => $('fpEmail').value.trim().toLowerCase(),
  validate: async email => {
    const id = $('fpId').value.trim();
    if(!id) return '아이디를 입력해 주세요.';
    if(!EMAIL_RE.test(email)) return '이메일 형식이 올바르지 않습니다.';
    const acc = accounts.byId(id);
    const h = await sha256hex(EMAIL_PEPPER + email);
    if(!acc || acc.emailHash !== h) return '아이디와 이메일이 일치하는 계정이 없습니다.';
    flow.acc = acc; flow.id = acc.id; flow.email = email;
    return null;
  },
  onVerified: () => {
    $('npPw').value = ''; $('npPw2').value = ''; $('npRec').value = '';
    show('newpw');
  }
});
$('fpId').addEventListener('input', () => vFindPw.reset());

/* ── 회원가입 ── */
function updateSignupBtn(){
  const id = $('suId').value.trim(), email = $('suEmail').value.trim().toLowerCase();
  const pw = $('suPw').value, pw2 = $('suPw2').value;
  const ready = ID_RE.test(id) && !accounts.byId(id) && vSignup.isVerified(email)
             && idState.available && idState.value === id && !idState.checking
             && pwValid(pw) && pw === pw2 && agreeOk();
  $('btnSignup').disabled = !ready;
}
['suId','suEmail','suPw','suPw2'].forEach(id => $(id).addEventListener('input', updateSignupBtn));

/* ── 약관 동의 ── */
const agreeBoxes = () => [...document.querySelectorAll('#suAgreeBox .agreq')];
function agreeOk(){ return agreeBoxes().every(c => c.checked); }
function resetAgree(){
  $('suAgreeAll').checked = false;
  agreeBoxes().forEach(c => c.checked = false);
  document.querySelectorAll('#suAgreeBox .terms').forEach(t => t.hidden = true);
  document.querySelectorAll('#suAgreeBox .agview').forEach(b => {
    b.setAttribute('aria-expanded','false'); b.textContent = '보기';
  });
}
$('suAgreeAll').addEventListener('change', e => {
  agreeBoxes().forEach(c => c.checked = e.target.checked);
  updateSignupBtn();
});
agreeBoxes().forEach(c => c.addEventListener('change', () => {
  $('suAgreeAll').checked = agreeOk();
  updateSignupBtn();
}));
$('suAgreeBox').addEventListener('click', e => {
  const btn = e.target.closest('.agview'); if(!btn) return;
  const box = $(btn.getAttribute('aria-controls')); if(!box) return;
  const open = box.hidden;
  box.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  btn.textContent = open ? '닫기' : '보기';
});

$('goSignup').onclick = () => {
  if(CONFIG.privacy) return enterGuest('analyze');
  ['suName','suId','suEmail','suPw','suPw2'].forEach(id => $(id).value = '');
  resetAgree();
  $('suIdHelp').textContent = '로그인에 사용합니다.'; $('suIdHelp').className = 'help';
  $('suPw2Help').textContent = ''; paintSuPw();
  idState.value = ''; idState.available = false; idState.checking = false; clearTimeout(idState.timer);
  setIdHelp('로그인에 사용합니다. 다른 사용자와 겹치지 않아야 합니다.');
  vSignup.reset(); updateSignupBtn();
  show('signup');
};
$('su2login').onclick = () => show('login');

$('btnSignup').onclick = async () => {
  if(CONFIG.privacy) return enterGuest('analyze');
  const id = $('suId').value.trim(), email = $('suEmail').value.trim().toLowerCase();
  const pw = $('suPw').value, pw2 = $('suPw2').value;
  if(!ID_RE.test(id))       return fail('signup','아이디는 영문·숫자·밑줄 4~20자여야 합니다.');
  if(accounts.byId(id))     return fail('signup','이미 사용 중인 아이디입니다.');
  if(!vSignup.isVerified(email)) return fail('signup','이메일 인증을 먼저 완료해 주세요.');
  if(!pwValid(pw))          return fail('signup','비밀번호에 ' + pwMissing(pw).join(', ') + ' 조건이 빠졌습니다.');
  if(pw !== pw2)            return fail('signup','두 비밀번호가 서로 다릅니다.');
  if(!agreeOk())            return fail('signup','필수 약관에 모두 동의해 주세요.');
  $('btnSignup').disabled = true; $('btnSignup').textContent = '계정을 만드는 중…';
  try{
    // 먼저 서버 등록부에 아이디를 선점합니다 (다른 사용자와의 중복을 여기서 막습니다)
    try{
      await AuthBackend.reserveId(id);
    }catch(err){
      setIdHelp('이미 사용 중인 아이디입니다. 다른 아이디를 골라 주세요.', 'no');
      idState.available = false;
      return fail('signup', err.message);
    }
    // 이전 버전에 남아 있던 기록이 있으면 이어받는다
    const v1 = ls.get(OLD1);
    const scans = Array.isArray(v1) && v1.length ? v1 : [];
    const {rec} = await createAccount({id, email, pw, scans, name: $('suName').value.trim()});
    ls.del(OLD1);
    flow.id = id;
    $('suPw').value = ''; $('suPw2').value = '';     // 메모리·화면에서 비밀번호 제거
    $('recKey').textContent = rec;
    $('recSaved').checked = false;
    show('recovery');
  }catch(e){ fail('signup', e.message || '가입에 실패했습니다.'); }
  finally{ $('btnSignup').disabled = false; $('btnSignup').textContent = '회원가입 완료'; }
};

/* ── 복구 키 ── */
$('copyRec').onclick = async e => {
  try{ await navigator.clipboard.writeText($('recKey').textContent); e.target.textContent = '복사했습니다'; }
  catch(err){ e.target.textContent = '복사할 수 없습니다'; }
  setTimeout(()=>e.target.textContent='복사', 1600);
};
$('dlRec').onclick = () => {
  const txt = `뇌 MRI 읽어주기 — 복구 키\n아이디: ${flow.id}\n복구 키: ${$('recKey').textContent}\n발급일: ${new Date().toLocaleString('ko-KR')}\n\n이 키는 비밀번호를 잊었을 때 검사 기록을 되살리는 유일한 수단입니다.\n안전한 곳에 보관하세요.`;
  const url = URL.createObjectURL(new Blob([txt], {type:'text/plain;charset=utf-8'}));
  const a = document.createElement('a');
  a.href = url; a.download = 'mri-reader-복구키.txt'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
};
$('btnRecDone').onclick = async () => {
  if(!$('recSaved').checked) return alert('복구 키를 보관했는지 확인해 주세요.');
  $('recKey').textContent = '';
  $('loginId').value = flow.id; $('loginPw').value = '';
  flow.id = ''; flow.email = '';
  show('login');
  $('ok-login').textContent = '가입이 완료되었습니다. 방금 만든 비밀번호로 로그인하세요.';
  $('ok-login').hidden = false;
};

/* ── 로그인 ── */
function attempts(){ return ls.get(LKEY) || {n:0, until:0}; }
/* ── 로그인 2단계: 비밀번호 확인 → 이메일 인증번호 ────────────────── */
const pending = { acc:null, raw:null, key:null, email:'', name:'', scans:[], resendAt:0, tid:null, sent:false };

function loginStep(stage){            // 'password' | 'code'
  const code = stage === 'code';
  $('lgBox').hidden = !code;
  $('loginId').disabled = code;
  $('loginPw').disabled = code;
  $('btnLogin').hidden = code;
  if(code) setTimeout(()=>$('lgCode').focus(), 40);
}
function clearPending(){
  clearInterval(pending.tid); pending.tid = null;
  pending.acc = pending.raw = pending.key = null;
  pending.email = ''; pending.name = ''; pending.scans = []; pending.sent = false;
  $('lgCode').value = ''; $('lgCode').disabled = false; $('lgCheck').disabled = false;
  loginStep('password');
}
function lgTick(){
  const rleft = Math.max(0, pending.resendAt - Date.now());
  if(AuthBackend.mode === 'demo'){
    const left = Math.max(0, DemoMail.expAt('login') - Date.now());
    $('lgTimer').textContent = left
      ? `남은 시간 ${Math.floor(left/60000)}:${String(Math.floor(left%60000/1000)).padStart(2,'0')}`
      : '인증번호가 만료되었습니다. 다시 받아 주세요.';
  } else {
    $('lgTimer').textContent = '10분 안에 입력해 주세요.';
  }
  $('lgResend').disabled = rleft > 0;
  $('lgResend').textContent = rleft > 0 ? `재발송 ${Math.ceil(rleft/1000)}초` : '재발송';
}
async function sendLoginCode(){
  $('lgResend').disabled = true;
  try{
    const r = await AuthBackend.sendCode('login', pending.email);
    pending.sent = true;
    $('lgDemo').hidden = AuthBackend.mode !== 'demo';
    $('lgDemoCode').textContent = r.demoCode || '';
    pending.resendAt = Date.now() + 60*1000;
    clearInterval(pending.tid); pending.tid = setInterval(lgTick, 500); lgTick();
    $('err-login').hidden = true;
    return true;
  }catch(e){ fail('login', e.message); return false; }
}

$('btnLogin').onclick = async () => {
  const who = $('loginId').value.trim(), pw = $('loginPw').value;
  $('ok-login').hidden = true;
  if(!who || !pw) return fail('login','아이디와 비밀번호를 입력해 주세요.');
  const at = attempts();
  if(at.until > Date.now())
    return fail('login', `로그인 시도가 너무 많습니다. ${Math.ceil((at.until-Date.now())/1000)}초 뒤에 다시 시도하세요.`);

  $('btnLogin').disabled = true; $('btnLogin').textContent = '확인 중…';
  try{
    const acc = who.includes('@') ? await accounts.byEmail(who) : accounts.byId(who);
    if(!acc) throw new Error('mismatch');
    const {raw, key} = await unlockWithPw(acc, pw);       // 비밀번호가 틀리면 예외
    const data = await unseal(key, acc.data);
    ls.del(LKEY);

    // 비밀번호는 맞았습니다. 아직 들여보내지 않고 이메일 인증을 한 번 더 받습니다.
    pending.acc = acc; pending.raw = raw; pending.key = key;
    pending.email = data.email || ''; pending.scans = data.scans || []; pending.name = data.name || '';
    $('loginPw').value = '';

    if(!pending.email){                                   // 예전 계정이라 이메일이 없으면 통과
      finishLogin(); return;
    }
    await AuthBackend.detect();
    loginStep('code');
    $('lgTimer').textContent = `${acc.emailMask} 으로 인증번호를 보내는 중…`;
    if(!(await sendLoginCode())) clearPending();
  }catch(err){
    const n = at.n + 1;
    ls.set(LKEY, {n, until: n >= 5 ? Date.now() + Math.min(300, Math.pow(2, n-4)*15)*1000 : 0});
    fail('login', '아이디 또는 비밀번호가 맞지 않습니다.' + (n>=5 ? ' 잠시 후 다시 시도해 주세요.' : ''));
  }finally{
    $('btnLogin').disabled = false; $('btnLogin').textContent = '로그인';
  }
};

function finishLogin(){
  S.acc = pending.acc; S.masterRaw = pending.raw; S.masterKey = pending.key;
  S.email = pending.email; S.name = pending.name || ''; S.scans = pending.scans; S.guest = false;
  clearInterval(pending.tid); pending.tid = null;
  pending.acc = pending.raw = pending.key = null; pending.scans = [];
  $('lgCode').value = ''; $('lgBox').hidden = true;
  $('loginId').disabled = false; $('loginPw').disabled = false; $('btnLogin').hidden = false;
  enterApp();
}

$('lgCode').addEventListener('input', e => { e.target.value = normCode(e.target.value).slice(0,6); });
$('lgCode').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); $('lgCheck').click(); } });
$('lgResend').onclick = sendLoginCode;
$('lgCheck').onclick = async () => {
  const code = normCode($('lgCode').value);
  if(!pending.sent) return fail('login','먼저 인증번호를 받아 주세요.');
  if(!CODE_RE.test(code)) return fail('login','인증번호 6자리(영문·숫자)를 정확히 입력해 주세요.');
  $('lgCheck').disabled = true;
  try{
    const r = await AuthBackend.verifyCode('login', pending.email, code);
    if(!r.ok){ $('lgCheck').disabled = false; return fail('login', r.reason || '인증에 실패했습니다.'); }
    $('err-login').hidden = true;
    finishLogin();
  }catch(e){ $('lgCheck').disabled = false; fail('login', e.message); }
};
['loginId','loginPw'].forEach(id => $(id).addEventListener('keydown', e=>{ if(e.key==='Enter') $('btnLogin').click(); }));
$('goGuest').onclick = () => enterGuest('analyze');

/* ── 아이디 찾기 ── */
$('goFindId').onclick = () => { $('fiEmail').value=''; vFindId.reset(); show('findid'); };
$('fi2login').onclick = () => show('login');
$('btnIdDone').onclick = () => { $('loginId').value=''; show('login'); };

/* ── 비밀번호 찾기 ── */
$('goFindPw').onclick = () => { $('fpId').value=''; $('fpEmail').value=''; vFindPw.reset(); show('findpw'); };
$('fp2login').onclick = () => show('login');
$('np2login').onclick = () => show('login');
$('btnNewPw').onclick = async () => {
  const pw = $('npPw').value, pw2 = $('npPw2').value, rec = $('npRec').value.trim();
  if(!pwValid(pw)) return fail('newpw','비밀번호에 ' + pwMissing(pw).join(', ') + ' 조건이 빠졌습니다.');
  if(pw !== pw2)   return fail('newpw','두 비밀번호가 서로 다릅니다.');
  const acc = flow.acc;
  $('btnNewPw').disabled = true;
  try{
    let masterRaw = null, keptRecords = false;
    if(rec){
      try{
        const u = await unlockWithRec(acc, rec);
        masterRaw = u.raw; keptRecords = true;
      }catch(e){ return fail('newpw','복구 키가 맞지 않습니다. 다시 확인하거나 비워 두고 진행하세요.'); }
    }
    if(!masterRaw){
      if(!confirm('복구 키 없이 진행하면 저장된 회차 기록이 모두 삭제됩니다.\n계속할까요?')) return;
      masterRaw = crypto.getRandomValues(new Uint8Array(32));
      const mKey = await importMaster(masterRaw);
      acc.data = await seal(mKey, {email: flow.email, scans: []});
      await rewrapRecovery(acc, masterRaw);     // 마스터가 바뀌었으므로 복구 키도 새로 발급
    }
    await rewrapPassword(acc, masterRaw, pw);
    accounts.put(acc);
    ls.del(LKEY);
    show('login');
    $('loginId').value = acc.id;
    $('ok-login').textContent = keptRecords
      ? '비밀번호를 변경했습니다. 검사 기록은 그대로 유지됩니다.'
      : '비밀번호를 변경했습니다. 복구 키가 없어 이전 회차 기록은 삭제되었고, 복구 키도 새로 발급되었습니다(계정 메뉴에서 확인).';
    $('ok-login').hidden = false;
  }catch(e){ fail('newpw','변경에 실패했습니다.'); }
  finally{ $('btnNewPw').disabled = false; }
};

/* ── 비밀번호 변경(로그인 상태) ── */
$('cp2app').onclick = () => { $('gate').hidden = true; $('app').hidden = false; };
$('btnChPw').onclick = async () => {
  const oldPw = $('cpOld').value, np = $('cpNew').value, np2 = $('cpNew2').value;
  if(!pwValid(np)) return fail('chpw','비밀번호에 ' + pwMissing(np).join(', ') + ' 조건이 빠졌습니다.');
  if(np !== np2)   return fail('chpw','두 비밀번호가 서로 다릅니다.');
  try{
    const u = await unlockWithPw(S.acc, oldPw);
    await rewrapPassword(S.acc, u.raw, np);
    accounts.put(S.acc);
    $('cpOld').value = $('cpNew').value = $('cpNew2').value = '';
    $('gate').hidden = true; $('app').hidden = false;
    alert('비밀번호를 변경했습니다. 복구 키는 그대로 사용할 수 있습니다.');
  }catch(e){ fail('chpw','현재 비밀번호가 맞지 않습니다.'); }
};
