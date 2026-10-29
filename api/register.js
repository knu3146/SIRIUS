// POST /api/register  { id, regToken }  →  { ok:true }
// 이메일 인증을 마친 사람만 아이디를 선점할 수 있습니다.
// regToken 은 /api/verify-code 가 인증 성공 시에만 발급하는 암호화 티켓입니다.
import { openTicket, readBody, tooMany, clientIp } from './_lib.js';
import { reserve, registryAvailable } from './_store.js';

const ID_RE = /^[A-Za-z0-9_]{4,20}$/;

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({error:'POST 요청만 받습니다.'});
  if(tooMany('register:' + clientIp(req), 10, 10 * 60 * 1000))
    return res.status(429).json({error:'요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'});

  if(!registryAvailable())
    return res.status(503).json({error:
      '이 환경에서는 아이디 등록부를 쓸 수 없어 가입을 받지 않습니다. (서버리스 배포 시 외부 저장소 연결 필요 — README 참고)'});

  const { id, regToken } = readBody(req);
  if(!ID_RE.test(String(id || '')))
    return res.status(400).json({error:'아이디는 영문·숫자·밑줄 4~20자여야 합니다.'});

  let t;
  try{ t = openTicket(regToken); }
  catch(e){ return res.status(400).json({error:'이메일 인증 정보가 올바르지 않습니다. 처음부터 다시 진행해 주세요.'}); }

  if(t.k !== 'reg')      return res.status(400).json({error:'이메일 인증이 필요합니다.'});
  if(Date.now() > t.x)   return res.status(400).json({error:'인증이 만료되었습니다. 인증번호를 다시 받아 주세요.'});

  const r = reserve(id, t.e);
  if(!r.ok){
    return res.status(409).json({error:
      r.reason === 'ID_TAKEN' ? '이미 사용 중인 아이디입니다. 다른 아이디를 골라 주세요.'
                              : '이미 가입된 이메일입니다.'});
  }
  return res.status(200).json({ ok:true });
}
