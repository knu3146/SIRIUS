/* ═══════════════════════════════════════════════════════════
   로컬 실행 서버 — 설치할 패키지가 없습니다 (Node 18 이상)
   ───────────────────────────────────────────────────────────
   하는 일
     · index.html 같은 파일을 http://localhost:3000 으로 띄웁니다
     · /api/send-code, /api/verify-code 요청을 api/ 폴더의 코드로 넘깁니다
     · .env.local 을 읽어 환경변수로 넣고, AUTH_SECRET 이 없으면 만들어 줍니다
   실행
     node server.js        (또는 start.bat 더블클릭, VS Code에서 F5)
   ═══════════════════════════════════════════════════════════ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(ROOT, '.env.local');
const PORT = Number(process.env.PORT) || 3000;

/* ── .env.local 읽기 ──────────────────────────────────────── */
function loadEnv(){
  if(!fs.existsSync(ENV_FILE)) return;
  for(const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)){
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if(!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, '');
    if(v) process.env[m[1]] = v;
  }
}
/* ⚠ 이 파일(server.js)에는 절대 키를 적지 마세요.
   키는 아래에서 만들어 주는 .env.local 에만 넣습니다.
   소스에 적힌 키는 깃에 올라가고 공유 시 그대로 새어 나갑니다. */
function refuseHardcodedKey(){
  const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  if(/RESEND_API_KEY\s*=\s*re_[A-Za-z0-9_-]{8,}/.test(self)){
    console.error('');
    console.error('  ❌ server.js 안에 API 키가 적혀 있습니다. 서버를 시작하지 않습니다.');
    console.error('');
    console.error('  1) resend.com 에서 그 키를 Revoke 하고 새 키를 발급하세요 (이미 노출된 키입니다)');
    console.error('  2) server.js 의 그 줄을  RESEND_API_KEY=  로 되돌리세요 (값 없이)');
    console.error('  3) 새 키는 .env.local 파일에만 넣으세요');
    console.error('');
    process.exit(1);
  }
}

function ensureEnvFile(){
  const secret = crypto.randomBytes(32).toString('base64url');
  if(!fs.existsSync(ENV_FILE)){
    fs.writeFileSync(ENV_FILE,
`# ╔══════════════════════════════════════════════════════╗
# ║  Gmail로 보내기 (누구에게나 발송 가능 · 권장)        ║
# ╚══════════════════════════════════════════════════════╝
# 보내는 사람 Gmail 주소
GMAIL_USER=
# Google 앱 비밀번호 16자리 (띄어쓰기는 그대로 둬도 됩니다)
GMAIL_APP_PASSWORD=

# ── 또는 Resend 사용 (도메인 인증 전에는 본인 메일로만 발송) ──
RESEND_API_KEY=

# 발신 주소 (도메인이 없으면 이대로 두세요 — 본인 가입 이메일로만 발송됩니다)
MAIL_FROM=onboarding@resend.dev

# 자동 생성된 암호화 비밀키 — 바꾸지 마세요
AUTH_SECRET=${secret}
`, 'utf8');
    console.log('  .env.local 을 새로 만들었습니다. GMAIL_USER / GMAIL_APP_PASSWORD 를 채워 주세요.');
    loadEnv();
    return;
  }

  // 예전 버전에서 만들어진 .env.local 에는 Gmail 항목이 없습니다 — 맨 위에 추가해 줍니다
  const before = fs.readFileSync(ENV_FILE, 'utf8');
  if(!/^\s*GMAIL_USER\s*=/m.test(before)){
    fs.writeFileSync(ENV_FILE,
`# ╔══════════════════════════════════════════════════════╗
# ║   ↓↓↓  여기 아래 두 줄만 채우면 됩니다  ↓↓↓          ║
# ╚══════════════════════════════════════════════════════╝

# 보내는 사람 Gmail 주소  (예: hong@gmail.com)
GMAIL_USER=

# Google 앱 비밀번호 16자리  (예: abcd efgh ijkl mnop)
GMAIL_APP_PASSWORD=

# ─────────── 아래는 그대로 두세요 ───────────

` + before, 'utf8');
    console.log('  .env.local 맨 위에 GMAIL_USER / GMAIL_APP_PASSWORD 줄을 추가했습니다.');
  }

  if(!process.env.AUTH_SECRET){
    const cur = fs.readFileSync(ENV_FILE, 'utf8');
    const filled = /^\s*AUTH_SECRET\s*=\s*$/m.test(cur)
      ? cur.replace(/^\s*AUTH_SECRET\s*=\s*$/m, `AUTH_SECRET=${secret}`)
      : cur.replace(/\s*$/, `\n\n# 자동 생성된 암호화 비밀키 — 그대로 두세요\nAUTH_SECRET=${secret}\n`);
    fs.writeFileSync(ENV_FILE, filled, 'utf8');
    process.env.AUTH_SECRET = secret;
    console.log('  AUTH_SECRET 을 자동으로 만들어 .env.local 에 넣었습니다.');
  }
}

/* ── 정적 파일 ────────────────────────────────────────────── */
const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp',
  '.woff2':'font/woff2', '.map':'application/json; charset=utf-8', '.md':'text/markdown; charset=utf-8'
};
// 밖으로 새어 나가면 안 되는 것들
const BLOCKED = [/^\.env/i, /^node_modules/i, /^\.git/i, /^api[\\/]/i, /^data[\\/]/i, /^server\.js$/i, /^ml[\\/]/i, /^_backup/i, /^train[\\/]/i, /^scripts[\\/]/i, /^test[\\/]/i];

function serveStatic(req, res, pathname){
  let rel;
  try { rel = decodeURIComponent(pathname.replace(/^\/+/, '')) || 'index.html'; }
  catch { return send(res, 400, 'text/plain; charset=utf-8', '잘못된 URL입니다.'); }
  if(rel.endsWith('/')) rel += 'index.html';
  rel = path.normalize(rel).replace(/^(\.\.[\\/])+/, '');
  if(BLOCKED.some(re => re.test(rel))) return send(res, 403, 'text/plain; charset=utf-8', '접근할 수 없는 경로입니다.');

  const file = path.join(ROOT, rel);
  if(!file.startsWith(ROOT + path.sep) && file !== ROOT)
    return send(res, 403, 'text/plain; charset=utf-8', '접근할 수 없는 경로입니다.');
  if(!fs.existsSync(file) || !fs.statSync(file).isFile())
    return send(res, 404, 'text/plain; charset=utf-8', '없는 파일입니다: /' + rel);

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(file).pipe(res);
}
function send(res, code, type, body){
  res.writeHead(code, {'Content-Type': type, 'Cache-Control': 'no-store'});
  res.end(body);
}

/* 서버가 뜨면 기본 브라우저로 사이트를 자동으로 엽니다.
   자동으로 열고 싶지 않으면 NO_OPEN=1 을 주고 실행하세요. */
function openBrowser(url){
  if(process.env.NO_OPEN) return;
  const cmd = process.platform === 'win32'  ? `start "" "${url}"`
            : process.platform === 'darwin' ? `open "${url}"`
            :                                 `xdg-open "${url}"`;
  exec(cmd, () => {});   // 실패해도 서버는 그대로 돌아갑니다
}

/* ── API — api/ 폴더의 Vercel 함수를 그대로 재사용 ────────── */
const ROUTES = {
  '/api/send-code':   './api/send-code.js',
  '/api/verify-code': './api/verify-code.js',
  '/api/check-id':    './api/check-id.js',
  '/api/register':    './api/register.js'
};
async function serveApi(req, res, modPath){
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try{ req.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch(e){ req.body = {}; }

  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(obj));
  };
  try{
    const mod = await import(modPath);
    await mod.default(req, res);
  }catch(e){
    console.error('API 오류:', e.message);
    if(!res.headersSent) res.status(500).json({error:'서버 내부 오류'});
  }
}

/* ── 로컬 분석 서버(ml/infer_server.py)로 넘기기 ──────────────
   사진은 이 컴퓨터 안(127.0.0.1)에서만 오갑니다.
   분석 서버가 꺼져 있으면 503 을 돌려주고, 화면은 브라우저 안의 기본 분석으로 돌아갑니다. */
const ML_PORT = Number(process.env.ML_PORT) || 5001;
const ANALYZE_MAX = 8 * 1024 * 1024;
const JSON_HDR = 'application/json; charset=utf-8';
async function serveAnalyze(req, res){
  if(req.method !== 'POST') return send(res, 405, JSON_HDR, '{"error":"POST만 받습니다."}');
  // 다른 사이트에서 날아온 요청 차단 — 같은 주소에서 연 화면의 요청만 받습니다
  const origin = req.headers.origin;
  if(origin){
    let same = false;
    try{ same = new URL(origin).host === req.headers.host; }catch(e){}
    if(!same) return send(res, 403, JSON_HDR, '{"error":"허용되지 않은 요청입니다."}');
  }
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if(type !== 'image/jpeg' && type !== 'image/png')
    return send(res, 415, JSON_HDR, '{"error":"JPEG 또는 PNG만 받습니다."}');

  const chunks = []; let size = 0;
  for await (const c of req){
    size += c.length;
    if(size > ANALYZE_MAX) return send(res, 413, JSON_HDR, '{"error":"이미지가 너무 큽니다."}');
    chunks.push(c);
  }
  const body = Buffer.concat(chunks);

  const up = http.request(
    { host: '127.0.0.1', port: ML_PORT, path: '/analyze', method: 'POST', timeout: 60000,
      headers: { 'Content-Type': type, 'Content-Length': body.length } },
    upRes => {
      const out = []; let n = 0;
      upRes.on('data', c => { n += c.length; if(n <= 1024 * 1024) out.push(c); });
      upRes.on('end', () => {
        if(res.headersSent) return;
        if(upRes.statusCode === 200) return send(res, 200, JSON_HDR, Buffer.concat(out));
        send(res, upRes.statusCode === 422 ? 422 : 502, JSON_HDR, '{"error":"분석에 실패했습니다."}');
      });
    });
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', () => { if(!res.headersSent) send(res, 503, JSON_HDR, '{"error":"분석 서버가 꺼져 있습니다."}'); });
  up.end(body);
}

/* ── 서버 ─────────────────────────────────────────────────── */
refuseHardcodedKey();
loadEnv();
ensureEnvFile();

const mailReady = Boolean((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
                          (process.env.RESEND_API_KEY && process.env.MAIL_FROM));

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if(pathname === '/api/health'){
    return send(res, 200, 'application/json; charset=utf-8',
      JSON.stringify({ ok:true, mail: Boolean((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
                                              (process.env.RESEND_API_KEY && process.env.MAIL_FROM)) }));
  }
  if(pathname === '/api/analyze') return serveAnalyze(req, res);
  if(ROUTES[pathname]) return serveApi(req, res, ROUTES[pathname]);
  if(pathname.startsWith('/api/')) return send(res, 404, 'application/json; charset=utf-8', '{"error":"없는 API"}');
  if(req.method !== 'GET' && req.method !== 'HEAD')
    return send(res, 405, 'text/plain; charset=utf-8', 'GET만 받습니다.');

  serveStatic(req, res, pathname);
});

/* .env.local 을 고치면 서버를 다시 켜지 않아도 바로 반영됩니다 */
try{
  fs.watchFile(ENV_FILE, {interval: 1000}, (cur, prev) => {
    if(cur.mtimeMs === prev.mtimeMs) return;
    for(const k of ['GMAIL_USER','GMAIL_APP_PASSWORD','RESEND_API_KEY','MAIL_FROM','SMTP_HOST','SMTP_PORT']) delete process.env[k];
    loadEnv();
    const ok = Boolean((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
                       (process.env.RESEND_API_KEY && process.env.MAIL_FROM));
    console.log(`  .env.local 을 다시 읽었습니다 — 메일 ${ok ? '켜짐' : '꺼짐'}`);
  });
}catch(e){}

// 내 컴퓨터에서만 접속 가능하게 묶습니다 (같은 와이파이의 다른 기기에서 접근 불가)
server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  뇌 MRI 읽어주기');
  console.log('  ───────────────────────────────────────────');
  console.log(`  주소   http://localhost:${PORT}   ← Ctrl+클릭 하면 열립니다`);
  console.log(`  메일   ${mailReady ? '켜짐 — 실제 인증번호가 메일로 갑니다' : '꺼짐 — 지금은 인증번호가 화면에 표시되는 데모 모드입니다'}`);
  console.log('  종료   Ctrl + C');
  openBrowser(`http://localhost:${PORT}`);
  if(!mailReady){
    console.log('');
    console.log('  ── 메일 인증을 켜려면 ───────────────────────────────');
    console.log('  1) Gmail 앱 비밀번호를 만드세요 (README의 메일 인증 설정 참고)');
    console.log('  2) 아래 파일에 GMAIL_USER 와 GMAIL_APP_PASSWORD 를 넣고 저장하세요');
    console.log(`     ${ENV_FILE}`);
    console.log('  3) Ctrl+C 로 끄고 다시 실행하세요');
    console.log('  ─────────────────────────────────────────────────────');
  }
  console.log('');
});
server.on('error', e => {
  if(e.code === 'EADDRINUSE'){
    console.error(`\n  ${PORT}번 포트를 이미 다른 프로그램이 쓰고 있습니다.`);
    console.error(`  다른 포트로 실행: set PORT=3001 && node server.js\n`);
  } else {
    console.error('\n  서버를 시작하지 못했습니다:', e.message, '\n');
  }
  process.exit(1);
});
