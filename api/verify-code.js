// POST /api/verify-code  { purpose, email, code, token }  →  { ok:true } | { ok:false, reason }
// 티켓을 서버 키로 풀어 인증번호를 비교합니다. 브라우저는 정답을 알 수 없습니다.
import { PURPOSES, openTicket, sealTicket, emailHash, sameCode,
         tooMany, clientIp, readBody } from './_lib.js';

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({error:'POST 요청만 받습니다.'});

  const ip = clientIp(req);
  if(tooMany('verify:' + ip, 15, 10 * 60 * 1000))
    return res.status(429).json({error:'시도가 너무 많습니다. 인증번호를 다시 받아 주세요.'});

  const { purpose, email, code, token } = readBody(req);
  const mail = String(email || '').trim().toLowerCase();
  const input = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  if(!PURPOSES[purpose])    return res.status(400).json({ok:false, reason:'잘못된 요청입니다.'});
  if(!CODE_RE.test(input))  return res.status(200).json({ok:false, reason:'인증번호 6자리를 정확히 입력해 주세요.'});

  let t;
  try{ t = openTicket(token); }
  catch(e){ return res.status(200).json({ok:false, reason:'인증 정보가 올바르지 않습니다. 다시 받아 주세요.'}); }

  if(t.p !== purpose || t.e !== emailHash(mail))
    return res.status(200).json({ok:false, reason:'요청 정보가 일치하지 않습니다. 다시 받아 주세요.'});
  if(Date.now() > t.x)
    return res.status(200).json({ok:false, reason:'인증번호가 만료되었습니다. 다시 받아 주세요.'});
  if(!sameCode(t.c, input))
    return res.status(200).json({ok:false, reason:'인증번호가 맞지 않습니다.'});

  // 가입 절차라면, 아이디 선점에 쓸 수 있는 짧은 수명의 티켓을 함께 줍니다
  if(purpose === 'signup'){
    const regToken = sealTicket({ k:'reg', e: t.e, x: Date.now() + 15 * 60 * 1000 });
    return res.status(200).json({ ok:true, regToken });
  }
  return res.status(200).json({ ok:true });
}
