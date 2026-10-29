// POST /api/send-code  { purpose, email }  →  { ok:true, token }
// 인증번호를 만들어 메일로 보내고, 암호화된 티켓만 브라우저에 돌려줍니다.
import { PURPOSES, EMAIL_RE, makeCode, sealTicket, emailHash, ticketTtl,
         sendMail, tooMany, clientIp, readBody } from './_lib.js';
import { emailTaken, registryAvailable } from './_store.js';
import { authEnabled } from './_lib.js';

export default async function handler(req, res){
  if(!authEnabled()) return res.status(403).json({error:'서버 계정 기능이 비활성화되어 있습니다.'});
  if(req.method !== 'POST') return res.status(405).json({error:'POST 요청만 받습니다.'});

  const ip = clientIp(req);
  if(tooMany('send:' + ip, 5, 10 * 60 * 1000))
    return res.status(429).json({error:'요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'});

  const { purpose, email } = readBody(req);
  const mail = String(email || '').trim().toLowerCase();
  if(!PURPOSES[purpose])   return res.status(400).json({error:'잘못된 요청입니다.'});
  if(!EMAIL_RE.test(mail)) return res.status(400).json({error:'이메일 형식이 올바르지 않습니다.'});
  if(purpose === 'signup' && registryAvailable() && emailTaken(emailHash(mail)))
    return res.status(409).json({error:'이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.'});

  try{
    const code = makeCode(6);
    const token = sealTicket({ p: purpose, e: emailHash(mail), c: code, x: Date.now() + ticketTtl() });
    await sendMail(mail, code, purpose);
    return res.status(200).json({ ok:true, token });
  }catch(e){
    console.error('send-code', e.code || e.message);
    const MSG = {
      TEST_MODE_RECIPIENT: '아직 도메인 인증 전이라 이 주소로는 보낼 수 없습니다. Gmail 발송(GMAIL_USER/GMAIL_APP_PASSWORD)으로 바꾸거나, Resend에서 도메인을 인증해 주세요.',
      BAD_API_KEY:         '메일 발송 키(RESEND_API_KEY)가 올바르지 않습니다. .env.local 을 확인해 주세요.',
      GMAIL_AUTH:          'Gmail 로그인에 실패했습니다. GMAIL_USER 와 앱 비밀번호(16자리)를 다시 확인해 주세요.',
      GMAIL_LIMIT:         '오늘 보낼 수 있는 메일 수를 넘었습니다. 하루 뒤에 다시 시도해 주세요.',
      NODEMAILER_MISSING:  'Gmail 발송에 필요한 패키지가 없습니다. 터미널에서 npm install 을 한 번 실행해 주세요.',
      NO_MAIL_CONFIG:      '메일 설정이 없습니다. .env.local 에 GMAIL_USER / GMAIL_APP_PASSWORD 를 넣어 주세요.'
    };
    if(MSG[e.code]) return res.status(400).json({error: MSG[e.code]});
    return res.status(500).json({error:'인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.'});
  }
}
