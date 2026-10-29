# 모델 학습 · 연결 안내

```
train/
  neuria_train.ipynb   ← Google Colab 에서 여는 학습 노트북
  README.md            ← 이 파일 (학습 후 웹사이트에 붙이는 방법)
```

## 1. 학습 (Colab)

1. <https://colab.research.google.com> → **파일 → 노트북 업로드** → `neuria_train.ipynb`
2. **런타임 → 런타임 유형 변경 → T4 GPU** → 저장
3. **런타임 → 모두 실행** (Ctrl+F9)
4. 중간에 Kaggle 로그인 또는 `kaggle.json` 업로드 창이 한 번 뜹니다
5. 끝나면 `web_model.zip` 과 `neuria_tumor_cls.keras` 가 자동 다운로드됩니다

전체 20분 내외 (GPU 기준). GPU를 안 켜면 2시간 넘게 걸립니다.

| 파일 | 용도 |
|---|---|
| `web_model.zip` | 브라우저용. 웹사이트에 넣는 것 |
| `neuria_tumor_cls.keras` | 원본. 나중에 추가 학습·재변환할 때 필요 — 따로 보관 |

**데이터셋**: Kaggle `masoudnickparvar/brain-tumor-mri-dataset` (약 7,000장).
`Training/`, `Testing/` 안에 `glioma`, `meningioma`, `pituitary`, `notumor` 폴더가 있는 구조면
다른 데이터셋도 그대로 됩니다.

> 보고서에 쓸 정확도는 노트북 **6번 칸(성능 측정)** 에서 나온 숫자만 쓰세요.
> 학습 중에 찍히는 `val_accuracy` 는 모델 고르는 데 쓰였으니 실제보다 높게 나옵니다.

---

## 2. 웹사이트에 붙이기

### 2-1. 모델 파일 넣기

`web_model.zip` 을 풀어서 내용물을 `C:\neuro\model\` 에 넣습니다.

```
C:\neuro\model\
  model.json
  group1-shard1of3.bin   (개수는 다를 수 있음)
  group1-shard2of3.bin
  group1-shard3of3.bin
  labels.json
```

### 2-2. TensorFlow.js 라이브러리 내려받기

이 사이트는 CSP 를 `script-src 'self'` 로 잠가놨습니다 — **CDN 주소로는 안 불러와집니다.**
파일로 받아서 프로젝트 안에 두세요.

브라우저로 아래 주소를 열고 `Ctrl+S` → `C:\neuro\js\vendor\tf.min.js` 로 저장:

```
https://cdn.jsdelivr.net/npm/@tensorflow/tfjs/dist/tf.min.js
```

받은 파일이 1MB 이상이고 첫 줄이 자바스크립트인지 확인하세요 (HTML 이면 잘못 받은 것).

### 2-3. `index.html` 에 한 줄 추가

`<script src="js/config.js"></script>` **위에** 넣습니다. 순서가 중요합니다.

```html
<script src="js/vendor/tf.min.js"></script>
<script src="js/config.js"></script>
```

### 2-4. `js/engine.js` 맨 아래에 붙여넣기

기존 코드는 **지우지 마세요.** 모델 로드가 실패하면 자동으로 데모 엔진으로 돌아갑니다.

```js
/* ═══════════════════════════════════════════════════════════
   학습한 모델 연결 (model/model.json)
   파일이 없거나 로드 실패 시 위의 데모 휴리스틱을 그대로 씁니다.
   ═══════════════════════════════════════════════════════════ */
let MODEL = null;

function modelAnalyze(canvas){
  // 위치 표시(regions)와 화질 점검은 기존 영상처리 결과를 그대로 사용하고,
  // 종양 종류 확률(probs)만 학습한 모델이 계산합니다.
  const base = heuristicAnalyze(canvas);
  const probs = tf.tidy(() => {
    const t = tf.browser.fromPixels(canvas)       // 0~255 RGB
                .resizeBilinear([224, 224])
                .toFloat()
                .expandDims(0);                    // [1,224,224,3]
    const out = MODEL.predict(t);                  // 전처리는 모델에 내장되어 있음
    return out.dataSync();
  });
  if(probs.length !== CLASSES.length){
    console.warn('모델 출력 개수가 CLASSES 와 다릅니다 — 데모 결과를 사용합니다');
    return base;
  }
  return { probs: Array.from(probs), regions: base.regions, quality: base.quality };
}

(async function loadTumorModel(){
  if(typeof tf === 'undefined'){
    console.info('tf.min.js 가 없습니다 — 데모 엔진으로 동작합니다');
    return;
  }
  try{
    MODEL = await tf.loadGraphModel('model/model.json');
    // 더미 입력으로 한 번 돌려 실제로 추론되는지 확인한 뒤에 교체합니다
    tf.tidy(() => MODEL.predict(tf.zeros([1, 224, 224, 3])).dataSync());

    ENGINE.name    = '종양 분류 모델 v1';
    ENGINE.analyze = modelAnalyze;
    const b = document.getElementById('engineBadge');
    if(b) b.textContent = '엔진 · ' + ENGINE.name;
    console.info('모델 로드 완료');
  }catch(e){
    MODEL = null;
    console.warn('모델 로드 실패 — 데모 엔진을 유지합니다:', e.message);
  }
})();
```

### 2-5. 확인

`F5` 로 서버를 실행하고, 화면 오른쪽 위 엔진 배지를 봅니다.

| 배지 | 의미 |
|---|---|
| `엔진 · 종양 분류 모델 v1` | 모델이 붙었습니다 |
| `엔진 · 데모 휴리스틱 v0.1` | 아직 데모. `F12 → Console` 의 경고 메시지를 보세요 |

---

## 3. 흔한 문제

| 증상 | 원인 / 해결 |
|---|---|
| Console 에 `Refused to load the script` | CSP 차단. CDN 주소를 쓴 것 — `js/vendor/tf.min.js` 파일로 받아야 합니다 |
| `model.json 404` | 경로 확인. `C:\neuro\model\model.json` 이어야 합니다 (`web_model` 폴더째로 넣으면 안 됩니다) |
| `tf is not defined` | `index.html` 에서 `tf.min.js` 가 `engine.js` 보다 **뒤**에 있습니다 |
| 결과 종류가 항상 뒤바뀜 | 학습 때 `CLASS_NAMES` 순서가 `engine.js` 의 `CLASSES` 와 달랐습니다. `model/labels.json` 의 `classes` 를 확인하세요 |
| 분석이 1~2초 멈춘다 | 정상입니다. 첫 추론은 GPU 셰이더 컴파일 때문에 느립니다 |

## 4. 지금 안 되는 것

- **DICOM(.dcm)** — 병원 CD 파일은 못 읽습니다. PNG/JPG 로 변환 후 올려야 합니다
- 위치 표시(병변 윤곽)는 여전히 밝기 기반 추정입니다. 진짜 위치를 내려면 분류 모델이 아니라
  **분할(segmentation) 모델**(U-Net 등)이 따로 필요합니다
- 이 모델은 수업·학습용입니다. 진단 목적으로 쓸 수 없습니다
