// 서버 전용 공통 모듈 — 브라우저로 내려가지 않습니다.
import crypto from 'node:crypto';

export const PURPOSES = {
  signup: '회원가입',
  login:  '로그인',
  findid: '아이디 찾기',
  findpw: '비밀번호 재설정'
};
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
export const authEnabled = () => process.env.ENABLE_EMAIL_AUTH === 'true';
const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 0/O/1/I/L 제외
const TTL_MS = 10 * 60 * 1000;

/* 인증번호: 영문 대문자 + 숫자 6자리, 편향 없는 난수 */
export function makeCode(n = 6){
  const out = [], max = 256 - (256 % CODE_ALPHA.length);
  while(out.length < n){
    for(const x of crypto.randomBytes(n)){
      if(x < max){ out.push(CODE_ALPHA[x % CODE_ALPHA.length]); if(out.length === n) break; }
    }
  }
  return out.join('');
}

function key(){
  const s = process.env.AUTH_SECRET;
  if(!s || s.length < 16) throw new Error('AUTH_SECRET 환경변수가 설정되지 않았습니다.');
  return crypto.createHash('sha256').update(s).digest();      // 32바이트
}
export const emailHash = email =>
  crypto.createHash('sha256').update('mri/' + String(email).trim().toLowerCase()).digest('hex').slice(0, 32);

/* 티켓 = 인증번호를 서버 키로 암호화한 문자열.
   브라우저가 들고 다니지만 내용을 볼 수 없고, 위조하면 복호화가 실패합니다.
   (규모가 커지면 티켓 대신 Vercel KV 같은 저장소에 코드를 넣는 편이 좋습니다) */
export function sealTicket(payload){
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
export function openTicket(token){
  const raw = Buffer.from(String(token), 'base64url');
  if(raw.length < 29) throw new Error('bad token');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
}
export const ticketTtl = () => TTL_MS;

export function sameCode(a, b){
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* 아주 단순한 호출 제한 — 인스턴스 메모리 기준이라 완벽하지 않습니다.
   실서비스에서는 Vercel KV / Upstash 같은 공용 저장소를 쓰세요. */
const hits = new Map();
export function tooMany(ip, limit, windowMs){
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if(hits.size > 5000) hits.clear();
  return list.length > limit;
}
export const clientIp = req =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

/* 메일 발송 — Resend REST API (외부 패키지 없이 fetch만 사용) */
/* 메일 설정이 되어 있는지 — Gmail 또는 Resend 중 하나면 됩니다 */
export const mailConfigured = () =>
  authEnabled() && Boolean((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
          (process.env.RESEND_API_KEY && process.env.MAIL_FROM));

function buildMessage(code, purpose){
  const what = PURPOSES[purpose] || '본인 확인';
  return {
    subject: `[뇌 MRI 읽어주기] 인증번호 ${code}`,
    text: `${what} 인증번호: ${code}\n10분 안에 입력해 주세요.`,
    html: `
  <div style="font-family:-apple-system,'Malgun Gothic',sans-serif;max-width:480px;margin:0 auto;padding:28px 24px;color:#151A1E">
    <div style="font-weight:700;font-size:17px;margin-bottom:6px">뇌 MRI 읽어주기</div>
    <div style="color:#56626A;font-size:14px;margin-bottom:20px">${what} 인증번호입니다.</div>
    <div style="font-family:ui-monospace,Consolas,monospace;font-size:30px;letter-spacing:.32em;
                font-weight:600;background:#F1F3F4;border-radius:10px;padding:18px;text-align:center">${code}</div>
    <div style="color:#56626A;font-size:13px;margin-top:20px;line-height:1.7">
      10분 안에 입력해 주세요.<br>
      본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.
    </div>
    <div style="color:#87939B;font-size:11px;margin-top:22px;border-top:1px solid #D6DCDF;padding-top:12px">
      이 서비스는 의료 진단을 제공하지 않습니다. 학습·이해를 돕는 도구입니다.
    </div>
  </div>`
  };
}
const fail = code => { const e = new Error(code); e.code = code; return e; };

/* ── 보내기 ───────────────────────────────────────────────
   GMAIL_USER + GMAIL_APP_PASSWORD 가 있으면 Gmail로 (누구에게나 발송 가능)
   없으면 RESEND_API_KEY + MAIL_FROM 으로 Resend 사용
   ───────────────────────────────────────────────────────── */
export async function sendMail(to, code, purpose){
  if(process.env.ENABLE_EMAIL_AUTH !== 'true') throw fail('MAIL_DISABLED');
  const msg = buildMessage(code, purpose);
  if(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return sendViaGmail(to, msg);
  if(process.env.RESEND_API_KEY && process.env.MAIL_FROM)      return sendViaResend(to, msg);
  throw fail('NO_MAIL_CONFIG');
}

async function sendViaGmail(to, {subject, html, text}){
  let nodemailer;
  try{ nodemailer = (await import('nodemailer')).default; }
  catch(e){ throw fail('NODEMAILER_MISSING'); }

  const user = process.env.GMAIL_USER.trim();
  const pass = process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '');   // 앱 비밀번호는 띄어쓰기로 보여 줍니다
  // 기본은 Gmail. 네이버 등 다른 메일을 쓰려면 SMTP_HOST / SMTP_PORT 를 .env.local 에 넣으세요.
  const transport = nodemailer.createTransport(
    process.env.SMTP_HOST
      ? { host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: String(process.env.SMTP_SECURE || '') === 'true',
          auth: { user, pass },
          ...(process.env.SMTP_INSECURE === 'true'
                ? { ignoreTLS: true, tls: { rejectUnauthorized: false } } : {}) }
      : { service: 'gmail', auth: { user, pass } }
  );
  try{
    await transport.sendMail({ from: `뇌 MRI 읽어주기 <${user}>`, to, subject, html, text });
  }catch(e){
    console.error('gmail send failed');
    if(e.responseCode === 535 || /Username and Password not accepted|BadCredentials|Invalid login/i.test(e.message || ''))
      throw fail('GMAIL_AUTH');
    if(e.responseCode === 550 || /Daily user sending (limit|quota) exceeded/i.test(e.message || ''))
      throw fail('GMAIL_LIMIT');
    throw fail('MAIL_FAILED');
  }
}

async function sendViaResend(to, {subject, html, text}){
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, text })
  });
  if(r.ok) return;
  const body = await r.text().catch(() => '');
  console.error('resend failed', r.status);

  // 도메인 인증 전 테스트 발신 주소(onboarding@resend.dev)는
  // Resend 계정 본인 이메일로만 보낼 수 있습니다.
  if(r.status === 403 && /only send testing emails/i.test(body)) throw fail('TEST_MODE_RECIPIENT');
  if(r.status === 401 || r.status === 403)                       throw fail('BAD_API_KEY');
  throw fail('MAIL_FAILED');
}

export function readBody(req){
  let body = req.body;
  if(typeof body === 'string'){
    try{ body = JSON.parse(body); }catch(e){ return {}; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}
