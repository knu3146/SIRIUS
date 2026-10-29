'use strict';
/* ═══════════════════════════════════════════════════════════
   A. 인증 백엔드 어댑터
   ───────────────────────────────────────────────────────────
   demo   : 서버 없이 화면에 인증번호를 표시합니다 (시연용).
   server : 같은 도메인의 /api/send-code, /api/verify-code 를 호출해
            진짜 메일로 인증번호를 보냅니다. 인증번호는 서버에서만
            만들어지고 서버에서만 검증되므로 브라우저에서는 볼 수 없습니다.
   전환은 js/config.js 의 CONFIG.auth 한 줄만 바꾸면 됩니다.
   ═══════════════════════════════════════════════════════════ */
const AuthBackend = {
  mode: (typeof CONFIG !== 'undefined' && CONFIG.auth) || 'demo',
  base: (typeof CONFIG !== 'undefined' && CONFIG.apiBase) || '',
  tokens: {},                                  // purpose별 발급 티켓 (서버 모드)

  use(mode, base){ this.mode = mode; this.base = base || ''; },

  /* 'auto' 일 때 인증 서버가 살아 있는지 한 번만 확인합니다.
     서버가 없거나 메일 설정이 비어 있으면 조용히 데모 모드로 돌아갑니다. */
  async detect(){
    if(this.mode !== 'auto') return this.mode;
    if(this._detecting) return this._detecting;
    this._detecting = (async () => {
      try{
        const r = await fetch(this.base + '/api/health', {cache:'no-store'});
        const d = await r.json();
        this.mode = (d && d.ok && d.mail) ? 'server' : 'demo';
      }catch(e){
        this.mode = 'demo';
      }
      return this.mode;
    })();
    return this._detecting;
  },

  async post(path, body){
    let res;
    try{
      res = await fetch(this.base + path, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      });
    }catch(e){
      throw new Error('서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.');
    }
    let data = {};
    try{ data = await res.json(); }catch(e){}
    if(!res.ok) throw new Error(data.error || `서버 오류가 발생했습니다. (${res.status})`);
    return data;
  },

  /* 인증번호 발송. purpose: 'signup' | 'findid' | 'findpw' */
  async sendCode(purpose, email){
    if(this.mode === 'server'){
      const r = await this.post('/api/send-code', {purpose, email});
      this.tokens[purpose] = r.token;          // 서버가 암호화해 준 티켓 (내용은 못 봄)
      return { sent:true };                    // 인증번호는 메일로만 전달됨
    }
    const code = makeCode(6);
    DemoMail.put(purpose, email, code);
    return { sent:true, demoCode: code };
  },

  /* 인증번호 확인 */
  async verifyCode(purpose, email, code){
    if(this.mode === 'server'){
      const token = this.tokens[purpose];
      if(!token) return {ok:false, reason:'먼저 인증번호를 받아 주세요.'};
      try{
        const r = await this.post('/api/verify-code', {purpose, email, code, token});
        if(r.ok){ delete this.tokens[purpose]; if(r.regToken) this.regToken = r.regToken; }
        return r.ok ? {ok:true} : {ok:false, reason: r.reason || '인증번호가 맞지 않습니다.'};
      }catch(e){ return {ok:false, reason:e.message}; }
    }
    return DemoMail.check(purpose, email, code);
  },

  /* 아이디가 이미 쓰이고 있는지 (서버 등록부 기준)
     서버 메일 인증이 켜져 있을 때만 전체 사용자 기준으로 확인합니다.
     데모 모드에서는 아이디 선점(reserveId)이 불가능하므로 확인도 하지 않습니다. */
  async checkId(id){
    if(this.mode !== 'server') return {available:true, enforced:false};
    try{ return await this.post('/api/check-id', {id}); }
    catch(e){ return {available:true, enforced:false, error:e.message}; }
  },

  /* 아이디 선점 — 이메일 인증을 마친 뒤에만 성공합니다 */
  async reserveId(id){
    if(this.mode !== 'server') return {ok:true, enforced:false};
    const regToken = this.regToken;
    if(!regToken) throw new Error('이메일 인증을 먼저 완료해 주세요.');
    const r = await this.post('/api/register', {id, regToken});
    delete this.regToken;
    return r;
  }
};

/* 인증번호: 영문 대문자 + 숫자 6자리 (0/O/1/I/L 처럼 헷갈리는 글자는 제외) */
const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
function makeCode(n){
  // 나머지 연산 편향을 없애기 위해 범위를 벗어난 값은 버리고 다시 뽑습니다
  const out = [], max = 256 - (256 % CODE_ALPHA.length);
  while(out.length < n){
    for(const x of crypto.getRandomValues(new Uint8Array(n))){
      if(x < max){ out.push(CODE_ALPHA[x % CODE_ALPHA.length]); if(out.length === n) break; }
    }
  }
  return out.join('');
}
const normCode = s => String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

/* 데모용 인증번호 보관소 — 메모리에만 두고 새로고침하면 사라집니다 */
const DemoMail = {
  boxes: {},
  put(purpose, email, code){
    this.boxes[purpose] = { email, code, exp: Date.now() + 10*60*1000, tries: 0 };
  },
  check(purpose, email, code){
    const b = this.boxes[purpose];
    if(!b || b.email !== email) return {ok:false, reason:'요청 정보가 없습니다. 인증번호를 다시 받아 주세요.'};
    if(Date.now() > b.exp)  return {ok:false, reason:'인증번호가 만료되었습니다. 다시 받아 주세요.'};
    if(b.tries >= 5)        return {ok:false, reason:'입력 횟수를 초과했습니다. 인증번호를 다시 받아 주세요.'};
    b.tries++;
    if(b.code !== code)     return {ok:false, reason:`인증번호가 맞지 않습니다. (${5-b.tries}회 남음)`};
    delete this.boxes[purpose];
    return {ok:true};
  },
  expAt(purpose){ const b = this.boxes[purpose]; return b ? b.exp : 0; }
};
