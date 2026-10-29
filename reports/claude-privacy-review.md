# SIRIUS(NEURIA) 개인정보 보호 추가 검토 보고서

> Codex 후속 조치: 아래 발견 사항은 `da9007c`/`267a971` 시점의 검토 기록이다. 이후 F-02·F-05·F-06·F-07·F-09를 추가 수정하고 기존 해결 항목까지 실제 소스와 합성 데이터로 재검증했다. 결과·질문·파일 정보 DOM을 초기화하고 원본 캔버스 크기를 0으로 해제하며, 정적 파일을 실제 참조 목록으로 제한한다. 메일 기능을 켜지 않으면 인증 키 파일을 만들지 않는다. 기록 이미지 URL과 상태 값은 허용 목록으로 제한하고 보고서의 동적 이름을 이스케이프한다. 보안 흐름 테스트의 TODO 5개를 일반 테스트로 전환했으며 JavaScript 전체 48개가 통과했다. F-10~F-13의 명시적 계정 기능에 관한 범위는 `PRIVACY.md`에 설명한다. 실제 브라우저·운영체제 메모리의 완전 삭제나 외부 보안 인증을 확인한 결과는 아니다.

- 작성: Claude (2026-10-30)
- 검토 대상: 요청하신 커밋 `da9007c`. 검토 도중 저장소가 `267a971`로 앞서 가서 **두 커밋을 모두 평가**했습니다(아래 표에 각각 표시).
- 방법: 공개 소스만 읽기 전용으로 확인했고(`git archive`로 임시 위치에 추출), 재현은 **합성 데이터와 가짜 DOM**만 사용했습니다.
- 이 보고서에는 원본 영상, 개인 경로, 키·비밀값을 넣지 않았습니다.

## 1. 범위와 한계

Codex 추가 검증: 이후 `ml/test_handler_privacy.py`로 Python의 실제 HTTP 핸들러와 영상 전처리도 별도로 검사했다. 합성 환자명 메타데이터·합성 오류 경로·영상 본문을 응답이나 로그로 내보내지 않고, 외부 Host/Origin/Fetch-Site 및 잘못된 유형·길이를 분석 전에 거부하는지 확인했다. 전체 Python 테스트 24개가 통과했다. 아래의 "Python 미검토"는 Claude가 수행한 최초 검토의 범위를 뜻한다.

읽은 것: `PRIVACY.md`, `index.html`, `server.js`, `.env.example`, `js/*.js`, `api/*.js`, `test/`, 보조로 `scripts/check.mjs`, `package.json`.

읽지 않은 것(요청대로): 실제 `.env`/`.env.local`, `data/`, `datasets/`, 브라우저 저장소, 사용자 파일, 비밀키, 실제 MRI.
이번에 검토하지 못한 것: `css/`, `ml/`(특히 Python 추론 서버), `.gitignore`, 실제 브라우저에서의 동작(가짜 DOM으로 대체). 따라서 **Python 쪽의 로깅·임시 파일 여부는 판단하지 못했습니다.**

저장소 소스는 수정하지 않았고, 커밋·푸시·설치·외부 전송을 하지 않았으며 `ml/`과 실행 중인 프로세스에는 손대지 않았습니다.

## 2. 질문별 결론

1. **익명 모드에서 시작·가입·기록 메뉴로 이름/이메일 화면을 우회해 열 수 있는가** — 아니요. 시작·가입·기록 진입점을 모두 눌러 보는 테스트에서 이름/이메일 화면이 열리지 않았습니다. 다만 `da9007c`는 **부팅 중 한 순간 gate가 열리는 문제(F-08)**가 있었고 `267a971`에서 고쳐졌습니다.
2. **MRI·계정 정보의 원격 전송·영구 저장 경로** — 익명 모드에서는 `js/`에 원격 전송 API와 영구 저장 API(저장소 쓰기는 테마·색각 설정뿐)가 없고, 네트워크 호출은 같은 호스트의 `POST /api/analyze`(image/jpeg) 하나뿐입니다. 서버는 이를 `127.0.0.1:5001`로만 프록시하며 파일·로그에 남기지 않고 업스트림 오류 문구도 노출하지 않습니다. **예외**: 이메일 인증을 켜면(옵트인) 이메일 주소가 메일 발송 사업자를 거치고 아이디가 `data/registry.json`에 영구 저장됩니다(F-10~F-13).
3. **나가기·유휴 잠금·이전 비동기 요청 후 잔존** — `da9007c`는 익명 모드에 유휴 잠금이 없고(F-01), 나가기가 진행 중이던 분석 요청을 중단하지 않으며(F-03), 읽어주기가 원격 음성 엔진을 쓸 수 있었습니다(F-04). `267a971`에서 이 셋은 고쳐졌고 늦게 도착한 응답은 폐기됩니다. **남은 문제**: 나가기 후에도 결과 요약·확률·질문 등의 DOM 텍스트와 캔버스 버퍼가 남습니다(F-02).
4. **DOM XSS, CSP, Host/Origin, 정적 파일 노출** — CSP(`script-src 'self'; connect-src 'self'`), Host/Origin/Sec-Fetch-Site 검사, 경로 순회(`..`, 인코딩, `//`) 차단, CORS 헤더 없음은 모두 확인되었습니다. 출력 렌더링은 대부분 이스케이프하지만 **저장 기록의 일부 필드는 그대로 끼워 넣습니다(F-07, 심층 방어 수준)**. 정적 허용 목록이 `js/*.js` 전체라 `js/`에 둔 임의 파일이 공개됩니다(F-06).
5. **안내와 구현의 불일치** — 푸터와 FAQ가 계정·메일 인증·암호화 기록을 기본 동작처럼 설명합니다(F-09).

## 3. 발견 사항

심각도는 "이 앱의 목표(수집·노출 방지)" 기준입니다.

| ID | 내용 | 심각도 | da9007c | 267a971 |
|---|---|---|---|---|
| F-01 | 익명 모드에 10분 유휴 잠금 없음 → 화면에 결과·영상이 계속 남음 | 중 | 재현(테스트 실패) | 해결 |
| F-02 | 나가기(`logout`)가 일부 요소만 비움: 요약·확률·질문·파일 정보 텍스트, 캔버스 버퍼 잔존 | 중 | 재현 | **미해결** |
| F-03 | 나가기가 진행 중인 `/api/analyze`를 중단하지 않음 | 중 | 재현 | 해결 |
| F-04 | 읽어주기(TTS)가 기기 내 음성이 아닌 원격 음성 엔진을 쓸 수 있음 → 보고서 문장이 외부로 나갈 수 있음 | 중~상 | 재현 | 해결 |
| F-05 | `ensureEnvFile()`이 이메일 인증을 안 켜도 `AUTH_SECRET`이 든 `.env.local`을 생성 | 하 | 재현 | **미해결** |
| F-06 | 정적 허용 패턴이 `js/*.js` 전체 → `js/`에 둔 파일이 공개됨 | 하 | 재현 | **미해결** |
| F-07 | 저장 기록의 `thumb`·`status`·이름을 이스케이프 없이 HTML에 삽입(`renderTimeline`, `buildModelReport`) | 하~중(CSP가 막아 주므로 심층 방어) | 재현 | **미해결** |
| F-08 | 부팅 중 로그인/가입 gate가 잠깐 열림 | 중 | 재현 | 해결 |
| F-09 | 푸터·FAQ가 계정/메일 인증/암호화 기록을 기본 동작처럼 설명 | 중(신뢰) | 재현 | **미해결** |
| F-10 | (옵트인) 이메일 인증을 켜면 이메일 주소가 메일 발송 사업자를 거침 — `PRIVACY.md`에 명시 필요 | 정보 | 해당 | 해당 |
| F-11 | (옵트인) 아이디가 `data/registry.json`에 영구 저장됨 | 정보 | 해당 | 해당 |
| F-12 | (옵트인/시연) `demo` 모드는 인증번호를 화면에 표시 — 운영 인증으로 오해 금지 | 정보 | 해당 | 해당 |
| F-13 | (옵트인) 서버 오류 로그는 `console.error`로 코드/상태만 남기는 것을 확인했으나, 메일 사업자 쪽 보관은 이 저장소에서 확인 불가 | 정보 | 해당 | 해당 |

F-10~F-13은 정적 읽기 기준의 관찰이며 기본(익명) 모드에는 영향이 없습니다.

### 재현·권장 패치 요약

- **F-02** 재현: 합성 분석 결과를 그린 뒤 `logout()` → 요약·확률·질문·`fbSize` 등의 `innerHTML`/텍스트가 비어 있지 않음(테스트 `F-02`). 패치: 부팅 직후 상태를 `PRISTINE`으로 기억해 `resetResultDom()`으로 복원하고, 나갈 때 `S.src` 캔버스 크기를 0으로 줄여 픽셀 버퍼를 해제.
- **F-05** 재현: 인증을 켜지 않은 채 서버 임시 복사본을 띄우면 `.env.local` 생성. 패치: `ENABLE_EMAIL_AUTH !== 'true'`면 즉시 반환.
- **F-06** 재현: `js/` 에 합성 파일을 두면 200. 패치: `index.html`이 참조하는 `js/`·`css/` 파일만 허용 집합으로 만들어 비교.
- **F-07** 패치: 썸네일은 `data:image/jpeg;base64,…` 형식만 허용, `status`는 알려진 값만, 이름은 `esc()`.
- **F-09** 패치: 푸터 문구를 "파일로 저장하지 않으며 기본 설정에서는 계정과 기록도 저장하지 않음"으로 교체, 상단 버튼 "로그인" → "분석 시작", 매번 인증번호를 받아야 한다는 FAQ 삭제(옵트인 모드에서만 노출하는 방식도 가능).

## 4. 확인된 양호 항목

- CSP 헤더와 `index.html`에 인라인 스크립트·외부 출처 없음.
- `js/`에 `sendBeacon`, 외부 `fetch`, `localStorage`/`IndexedDB` 영상 저장 없음(테마·색각 설정만 저장).
- 비루프백 호스트명에서는 `fetch`를 하지 않음.
- 나가기 뒤 늦게 온 응답 폐기(`analysisSeq`/`imageSeq`).
- 서버: 경로 순회 매트릭스, Host/Origin/Sec-Fetch-Site 매트릭스, CORS 헤더 없음, 프록시는 루프백만, 요청/응답 파일·로그 기록 없음, 업스트림 오류 문구 비노출.

## 5. 테스트

파일: `test/claude-privacy-flow.test.js` (node:test, 의존성 추가 없음). 실행: `node --test test/claude-privacy-flow.test.js`.

| 대상 | 통과 | 실패 | todo(열린 문제) |
|---|---|---|---|
| `da9007c` | 11 | 4 (F-01/03/04/08) | 5 |
| `267a971` | 15 | 0 | 5 (F-02/05/06/07/09, 아직 재현됨) |
| 저장소 전체(`267a971` + 이 파일) | 43 | 0 | 5 |
| 아래 부록 패치 적용 임시 복사본 | 43 | 0 | 5(모두 해결 상태로 통과) |

`todo` 테스트는 문제가 고쳐지면 `todo` 옵션만 제거하면 회귀 테스트가 됩니다. 패치 적용본에서는 처음에 기존 테스트 `test/privacy-lifecycle.test.js` 하나가 실패했는데, 그 테스트의 가짜 요소에 `style`이 없어 `resetResultDom()`이 오류를 낸 것이었습니다. 부록 패치는 이를 방어하도록 보정한 최종본이며 전체 통과를 확인했습니다. `node scripts/check.mjs`도 통과했습니다.

## 6. 권장 순서

1. F-02, F-09 (사용자에게 직접 보이는 잔존·안내 불일치)
2. F-07, F-06, F-05 (심층 방어)
3. 옵트인 모드 문서화(F-10~F-13)를 `PRIVACY.md`에 추가
4. 별도 검토 필요: `ml/` 추론 서버의 로깅·임시 파일, 실제 브라우저에서의 확인

## 부록. 제안 패치 (저장소에 적용하지 않음, `267a971` 기준 비교본)

패치는 최신 `267a971`의 임시 추출본과 수정본의 차이입니다(`a/` = 기존, `b/` = 수정). 테스트 파일은 포함하지 않았습니다.

```diff
--- a/index.html
+++ b/index.html
@@ -27,7 +27,7 @@
       </nav>
       <div class="right">
         <button class="iconbtn" id="themeBtn" title="밝게 / 어둡게">◐</button>
-        <button class="btn sm" id="toLoginTop">로그인</button>
+        <button class="btn sm" id="toLoginTop">분석 시작</button>
         <button class="btn sm primary" id="toSignupTop">회원가입</button>
       </div>
     </div>
@@ -70,7 +70,7 @@
   <footer class="sitefoot">
     <div class="in">
       <b>NEURIA는 의료 진단을 하지 않습니다.</b> 학습·이해를 돕는 도구이며, 실제 판독과 치료 결정은 담당 의사에게 확인하세요.<br>
-      올린 사진은 브라우저 메모리에서만 처리되고 저장되지 않습니다. 저장한 회차 기록은 비밀번호로 암호화되어 이 기기에만 남습니다.
+      올린 사진은 이 컴퓨터의 브라우저와 분석 프로그램 메모리에서만 처리되며 파일로 저장하지 않습니다. 기본 설정에서는 계정과 분석 기록도 저장하지 않습니다.
     </div>
   </footer>
 </div>
@@ -582,7 +582,6 @@
               <details data-cat="result"><summary>분석 결과를 병원에서 보여줘도 되나요?</summary><div class="body">참고 자료로는 괜찮지만, 진료의 근거가 되지는 않습니다. <b>의사에게 할 질문</b> 탭을 함께 보여드리면 대화에 도움이 됩니다.</div></details>
               <details data-cat="use"><summary>무료로 이용할 수 있나요?</summary><div class="body">네. 학습·과제용으로 만든 서비스라 비용이 들지 않습니다.</div></details>
               <details data-cat="privacy"><summary>다른 기기에서도 로그인할 수 있나요?</summary><div class="body">아니요. 기록을 서버에 두지 않는 설계라 계정은 가입한 브라우저에만 존재합니다. 아이디 중복만 서버에서 막습니다.</div></details>
-              <details data-cat="use"><summary>로그인할 때마다 인증번호를 받아야 하나요?</summary><div class="body">네. 비밀번호가 새어 나가도 메일함까지 뚫리지 않으면 로그인되지 않도록 매번 확인합니다.</div></details>
             </div>
           </div>
         </div>
--- a/js/app.js
+++ b/js/app.js
@@ -24,7 +24,16 @@
   renderTimeline();
   resetIdle();
 }
+/* 부팅 직후의 결과 화면 상태를 기억해 두었다가 나가기 때 그대로 되돌립니다 */
+const PRISTINE_IDS = ['vTitle','vConf','report','findings','confPct','confNote','probs','probsTitle','questions','scanLabel','fbSeries','fbSize','fbTime','fbQuality','checkMsg','tlScroll'];
+const PRISTINE = Object.fromEntries(PRISTINE_IDS.map(id => [id, $(id).innerHTML]));
+function resetResultDom(){
+  PRISTINE_IDS.forEach(id => { $(id).innerHTML = PRISTINE[id]; });
+  ['confWrap','probsWrap','checkBox'].forEach(id => { $(id).hidden = true; });
+  { const b = $('confBar'); if(b && b.style) b.style.width = ''; } $('cost').value = '';
+}
 function logout(){
+  if(S.src){ try{ S.src.width = S.src.height = 0; }catch(e){} }   // 캔버스 픽셀 버퍼 즉시 해제
   clearTimeout(idleTimer);
   cancelVaultWrites();
   cancelPendingImages();
@@ -43,7 +52,7 @@
   ctx.clearRect(0,0,cv.width,cv.height);
   $('emptyState').hidden = false; $('orient').hidden = true;
   $('report').innerHTML = ''; $('findings').innerHTML = ''; $('probsWrap').hidden = true;
-  $('checkBox').hidden = true; $('tlScroll').innerHTML = ''; $('vTitle').textContent = '';
+  resetResultDom();
   $('loginPw').value = '';
   if(typeof CONFIG !== 'undefined' && CONFIG.privacy) showLanding(); else show('login');
 }
--- a/js/render.js
+++ b/js/render.js
@@ -44,6 +44,8 @@
   renderGlossary();
   draw();
 }
+const SAFE_THUMB = /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/;
+const safeStatus = s => (Object.prototype.hasOwnProperty.call(STATUS_KO, s) ? s : 'neutral');
 function renderTimeline(){
   $('tlScroll').innerHTML = !S.scans.length ? '' : `
     <table class="rec">
@@ -52,9 +54,9 @@
         <tr>
           <td class="mono">${i+1}차</td>
           <td class="mono">${esc(s.date)}</td>
-          <td><img src="${s.thumb}" alt="${i+1}차 영상 축소본"></td>
+          <td><img src="${SAFE_THUMB.test(s.thumb) ? s.thumb : ''}" alt="${i+1}차 영상 축소본"></td>
           <td>${s.regions.length ? esc(s.regions[0].name) + (s.regions.length>1 ? ` 외 ${s.regions.length-1}곳` : '') : '특이 소견 없음'}</td>
-          <td><span class="recdots">${s.regions.length ? s.regions.map(r=>`<i class="dot ${r.status}"></i>`).join('') : '<i class="dot neutral"></i>'}</span></td>
+          <td><span class="recdots">${s.regions.length ? s.regions.map(r=>`<i class="dot ${safeStatus(r.status)}"></i>`).join('') : '<i class="dot neutral"></i>'}</span></td>
           <td><button class="btn sm tlcard" data-i="${i}">결과 보기</button></td>
         </tr>`).join('')}</tbody>
     </table>`;
--- a/js/report.js
+++ b/js/report.js
@@ -50,7 +50,7 @@
   }
   return [
     `이번 ${nth}차 영상에서 학습 모델이 가장 가깝다고 본 유형은 <b>${top.c.ko}</b>(${pct}%)입니다. 이 모델은 4가지 유형을 나누도록만 학습한 시연용이라, 그 밖의 질환이나 작은 변화는 구분하지 못합니다.`,
-    n ? `${regions.map(r=>`<b>${r.name}</b>`).join(', ')}은(는) 모델이 이 판단에 크게 반영한 영역입니다. 병변의 경계나 정확한 위치가 아니며, 영상이 어느 방향 단면인지도 따지지 않고 계산한 값입니다.`
+    n ? `${regions.map(r=>`<b>${esc(r.name)}</b>`).join(', ')}은(는) 모델이 이 판단에 크게 반영한 영역입니다. 병변의 경계나 정확한 위치가 아니며, 영상이 어느 방향 단면인지도 따지지 않고 계산한 값입니다.`
       : '모델이 이 판단에 특별히 크게 반영한 영역은 표시할 만큼 뚜렷하지 않았습니다.',
     '이 모델로는 회차 간 호전·악화를 가릴 수 없어, 표시 영역은 모두 보라색으로 둡니다.',
     '이 결과는 진단이 아니라 <b>질문을 준비하기 위한 정리</b>입니다. 확진에는 여러 단면과 촬영 기법, 필요하면 조영증강 영상과 임상 진찰이 함께 필요합니다.'
--- a/server.js
+++ b/server.js
@@ -47,6 +47,7 @@
 }

 function ensureEnvFile(){
+  if(process.env.ENABLE_EMAIL_AUTH !== 'true') return;   // 기본 익명 모드: 비밀키 파일을 만들지 않음
   const secret = crypto.randomBytes(32).toString('base64url');
   if(!fs.existsSync(ENV_FILE)){
     fs.writeFileSync(ENV_FILE,
@@ -112,6 +113,8 @@
   '.woff2':'font/woff2', '.map':'application/json; charset=utf-8', '.md':'text/markdown; charset=utf-8'
 };
 // 밖으로 새어 나가면 안 되는 것들
+const PUBLIC_FILES = new Set(['index.html']);
+for(const m of fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/(?:src|href)="((?:js|css)\/[A-Za-z0-9_.-]+)"/g)) PUBLIC_FILES.add(m[1]);
 const BLOCKED = [/^\.env/i, /^node_modules/i, /^\.git/i, /^api[\\/]/i, /^data(?:sets)?[\\/]/i, /^server\.js$/i, /^ml[\\/]/i, /^_backup/i, /^train[\\/]/i, /^scripts[\\/]/i, /^test[\\/]/i];

 function serveStatic(req, res, pathname){
@@ -123,7 +126,7 @@
   if(rel.split(/[\\/]/).some(segment => segment.startsWith('.')) || BLOCKED.some(re => re.test(rel)))
     return send(res, 403, 'text/plain; charset=utf-8', '접근할 수 없는 경로입니다.');
   // Serve a fixed application surface, never arbitrary files added to the workspace.
-  if(rel !== 'index.html' && !/^(?:js[\\/][A-Za-z0-9_-]+\.js|css[\\/]style\.css)$/.test(rel))
+  if(!PUBLIC_FILES.has(rel.replace(/\\/g, '/')))
     return send(res, 403, 'text/plain; charset=utf-8', '접근할 수 없는 경로입니다.');

   const file = path.join(ROOT, rel);
```
