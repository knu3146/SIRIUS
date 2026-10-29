// POST /api/check-id  { id }  →  { available: true|false }
// 가입 전에 아이디가 이미 쓰이고 있는지 확인합니다.
import { readBody, tooMany, clientIp } from './_lib.js';
import { idTaken, registryAvailable } from './_store.js';
import { authEnabled } from './_lib.js';

const ID_RE = /^[A-Za-z0-9_]{4,20}$/;

export default async function handler(req, res){
  if(!authEnabled()) return res.status(403).json({error:'서버 계정 기능이 비활성화되어 있습니다.'});
  if(req.method !== 'POST') return res.status(405).json({error:'POST 요청만 받습니다.'});
  if(tooMany('checkid:' + clientIp(req), 120, 10 * 60 * 1000))
    return res.status(429).json({error:'요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'});

  const { id } = readBody(req);
  if(!ID_RE.test(String(id || '')))
    return res.status(200).json({ available:false, reason:'FORMAT' });
  if(!registryAvailable())
    return res.status(200).json({ available:true, enforced:false });

  return res.status(200).json({ available: !idTaken(id), enforced:true });
}
