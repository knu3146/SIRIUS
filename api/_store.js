// 가입자 등록부 — 아이디 중복을 "모든 사용자 사이에서" 막기 위한 서버 쪽 목록.
// 저장하는 건 아이디와 이메일 해시뿐입니다. 비밀번호·MRI 기록은 여전히 브라우저 안에만 있습니다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR  = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DIR, 'registry.json');

/* Vercel 같은 서버리스 환경은 파일이 매 요청마다 사라집니다.
   그런 곳에서는 등록부를 신뢰할 수 없으므로 조용히 통과시키지 않고 분명히 알립니다.
   (배포해서 쓰려면 Vercel KV 등 외부 저장소로 바꾸세요 — README 참고) */
export const registryAvailable = () => !process.env.VERCEL;

function read(){
  let raw;
  try{ raw = fs.readFileSync(FILE, 'utf8'); }
  catch(e){ if(e.code === 'ENOENT') return {users: []}; throw e; }
  const data = JSON.parse(raw);
  if(!data || !Array.isArray(data.users) || data.users.some(u =>
    !u || typeof u.id !== 'string' || typeof u.emailHash !== 'string'))
    throw new Error('가입자 등록부 형식이 올바르지 않습니다. 기존 파일을 확인해 주세요.');
  return data;
}
function write(data){
  fs.mkdirSync(DIR, {recursive: true});
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);                     // 쓰다 만 파일이 남지 않도록
}

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export function idTaken(id){
  return read().users.some(u => same(u.id, id));
}
export function emailTaken(emailHash){
  return read().users.some(u => u.emailHash === emailHash);
}
export function findIdByEmail(emailHash){
  const u = read().users.find(x => x.emailHash === emailHash);
  return u ? u.id : null;
}
/* 아이디 선점 — 이메일 인증을 마친 뒤에만 호출됩니다 */
export function reserve(id, emailHash){
  const data = read();
  if(data.users.some(u => same(u.id, id)))        return {ok:false, reason:'ID_TAKEN'};
  if(data.users.some(u => u.emailHash === emailHash)) return {ok:false, reason:'EMAIL_TAKEN'};
  data.users.push({ id, emailHash, at: new Date().toISOString() });
  write(data);
  return {ok:true};
}
