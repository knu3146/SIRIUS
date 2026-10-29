# SIRIUS — 뇌 MRI 이해 도우미

MRI 이미지와 분석 결과를 쉬운 한국어로 살펴보는 로컬 웹 프로젝트입니다. 영상 뷰어, 유형 추정, 관심 영역 표시, 회차 비교, 용어 설명, 질문 생성 및 브라우저 내 암호화 기록을 제공합니다.

> 학습·시연용입니다. 분석 결과는 의료 진단이 아니며, 표시 영역도 병변 경계가 아닙니다.

## 빠른 시작

Node.js 18 이상을 설치한 뒤 실행합니다.

```sh
git clone https://github.com/knu3146/SIRIUS.git
cd SIRIUS
npm ci
npm start
```

브라우저에서 http://localhost:3000 을 엽니다. Windows에서는 `start.bat` 또는 `mri-reader.code-workspace`를 열고 F5로 실행할 수도 있습니다. 서버는 `127.0.0.1`에만 연결됩니다. 메일 설정 없이도 데모 인증과 브라우저 분석을 사용할 수 있습니다.

시작 화면은 `index.html`입니다. `mri-reader.html`은 이전 단일 파일 데모로 보존한 파일입니다. 현재 기능 수정은 `index.html`, `js/`, `css/`를 기준으로 진행하세요.

## 구성

| 경로 | 역할 |
|---|---|
| `index.html`, `css/style.css` | 현재 화면과 스타일 |
| `js/engine.js`, `js/viewer.js` | 분석 엔진, 이미지 처리와 뷰어 |
| `js/store.js`, `js/auth-*.js` | 브라우저 암호화 저장 및 인증 UI·어댑터 |
| `js/report.js`, `js/render.js`, `js/glossary.js` | 설명, 결과 표시와 용어 사전 |
| `js/config.js`, `js/state.js`, `js/shell.js`, `js/app.js` | 설정·상태·화면 전환·앱 진입 |
| `server.js`, `api/` | 로컬 웹 서버, 메일 인증, 아이디 등록 API |
| `ml/` | HOG + 랜덤포레스트 분석 서버와 재학습 코드 |
| `train/` | 별도 Colab/TensorFlow 학습 노트북과 연결 예제 |
| `scripts/check.mjs`, `test/` | 문법·참조 경로 검사 및 서버 회귀 검증 |

`index.html` 하단 스크립트 순서는 의존 관계가 있으므로 유지하세요. [개발·업로드 안내](CONTRIBUTING.md)를 함께 참고하세요.

## 메일 인증 설정

서버를 처음 실행하면 `.env.local`과 인증 암호화 키가 자동 생성됩니다. 직접 준비하려면 `.env.example`을 `.env.local`로 복사하세요.

Gmail 사용 시 아래 항목을 채웁니다. `GMAIL_APP_PASSWORD`는 Google 계정의 앱 비밀번호입니다.

```dotenv
GMAIL_USER=your-address@gmail.com
GMAIL_APP_PASSWORD=your-app-password
```

다른 SMTP 서버를 쓰려면 `SMTP_HOST`, `SMTP_PORT`를 추가합니다. Resend를 사용하려면 Gmail 항목을 비우고 `RESEND_API_KEY`, `MAIL_FROM`을 설정합니다. 제공업체의 발송·도메인 정책을 확인하세요. `AUTH_SECRET`은 서버가 생성한 값을 유지합니다. `.env.local`은 Git에 올리지 않습니다.

## 선택: Python 분석 서버

기본 분석은 브라우저의 데모 휴리스틱입니다. 학습 모델이 준비되어 있으면 다음 흐름으로 분석합니다.

현재 로컬 기본 모델은 EfficientNet 고정 특징과 MRI 데이터로 학습한 분류 헤드를 사용합니다. 5개 그룹 분할의 평균 macro-F1을 기준으로 선택했습니다. 기존 모델과의 비교 및 평가 한계는 [학습 작업 기록](TRAINING_PROGRESS.md), [모델 선택 기록](reports/model-selection.json)에 있습니다.

```text
브라우저 → /api/analyze → Node.js → 127.0.0.1:5001 Python
```

Python 3.11 이상 환경에서:

```sh
python -m pip install -r ml/requirements.txt
python -m pip install torch==2.15.0 torchvision==0.29.2 --index-url https://download.pytorch.org/whl/cpu
python ml/infer_server.py
```

Windows에서는 `start-ml.bat`을 사용할 수 있습니다. 웹 서버와 분석 서버를 각각 실행하세요.

모델 가중치(`*.joblib`, `*.pth`)는 Git에서 제외되므로 clone만으로는 Python 분석이 켜지지 않습니다. 기존 로컬 모델을 사용하거나 다음 구조의 데이터로 후보를 학습하세요. `Training/Testing`과 `glioma/meningioma/pituitary/notumor` 폴더 이름도 지원합니다.

```text
dataset/
  train/{glioma_tumor,meningioma_tumor,pituitary_tumor,no_tumor}/*.jpg
  test/{glioma_tumor,meningioma_tumor,pituitary_tumor,no_tumor}/*.jpg
```

```sh
python ml/train_model.py "path/to/dataset" --output ml/experiments/my-run --source "데이터 출처"
```

후보 모델과 평가 보고서는 별도 실험 폴더에 생성되며 기본 모델을 자동으로 덮어쓰지 않습니다. 검토 후 `python ml/promote_model.py ml/experiments/my-run`으로 활성화하면 기존 모델을 백업합니다. 모델 종류에 따라 필요한 라이브러리 버전과 가중치 해시를 확인합니다. Python 서버에 연결할 수 없으면 웹앱은 데모 분석으로 돌아갑니다. [Colab 학습 안내](train/README.md)는 별도의 TensorFlow 연결 예제입니다.

## 검사

```sh
npm run check
npm test
```

첫 명령은 JavaScript 문법과 화면의 스크립트 경로를 확인합니다. 두 번째는 별도 임시 폴더에서 웹 서버를 실행해 화면·상태 API·비공개 경로 차단·잘못된 URL 처리를 검사합니다. 실제 메일 발송과 학습 모델 추론, 브라우저 화면 전체 동작은 별도 확인이 필요합니다.

## 데이터와 배포 범위

- MRI는 브라우저에서 처리하며 Python 분석을 켜면 같은 컴퓨터의 분석 서버에도 전달됩니다.
- 회차 기록은 브라우저에 암호화해 보관합니다. 계정·기록은 브라우저에 종속되며 복구 키 관리가 필요합니다.
- 메일 인증은 외부 메일 제공업체를 이용합니다. 브라우저 TTS의 외부 통신 여부는 사용 음성에 따라 다릅니다.
- `data/`의 등록 정보, 환경변수, 학습 데이터, 백업, 의존성 폴더는 업로드 대상에서 제외합니다.
- 현재는 로컬 실행을 기준으로 합니다. GitHub 업로드만으로 웹 서비스가 배포되지는 않습니다. 서버 배포 시 등록부 영속 저장소, 호출 제한, Python 프로세스 운영 및 이미지 전송 안내를 별도로 설계해야 합니다.

## 클로드로 수정한 뒤 반영하기

클로드가 이 저장소의 로컬 파일을 수정하면 그 변경을 Git으로 확인하고 커밋·푸시하세요. 파일을 저장하는 것만으로 GitHub가 자동 갱신되지는 않습니다.

```sh
git status
npm run check
npm test
git add -A
git diff --cached --stat
git commit -m "변경 내용을 설명"
git push origin main
```

다른 컴퓨터 또는 GitHub에서도 수정했다면 로컬 작업을 시작하기 전에 깨끗한 작업 폴더에서 `git pull --ff-only`로 동기화하세요. 충돌이 생기면 강제 푸시하지 말고 변경을 비교해 병합하세요.

## 재현 가능한 추가 학습

현재 서비스 모델을 덮어쓰지 않고 후보 모델을 별도 디렉터리에 학습할 수 있습니다.

```sh
python ml/audit_dataset.py datasets/brain-tumor-7023 --output datasets/audit-7023.json
python ml/train_candidates.py datasets/brain-tumor-7023 --output ml/experiments/new-run --source masoudnickparvar/brain-tumor-mri-dataset --audit datasets/audit-7023.json
```

감사 파일을 지정하면 pHash 거리 4 이하의 유사 이미지를 학습·테스트 사이에서 제외하고, 학습·검증도 유사 이미지 그룹 단위로 나눕니다. 모델은 검증 macro-F1로 선택합니다. 환자 식별자가 없는 공개 이미지이므로 환자 단위 독립성은 보장하지 못합니다. 같은 테스트를 여러 실험에서 다시 본 결과는 탐색 결과로 구분해야 합니다.

후보를 기존 모델과 분리해 실행하려면 PowerShell에서:

```powershell
$env:MODEL_DIR = 'C:\neuro\ml\experiments\new-run'
.\.venv\Scripts\python.exe ml/infer_server.py
```

`MODEL_DIR`에는 해당 실험의 모델 파일과 메타데이터가 함께 있어야 합니다. 기본 웹앱과 연결하려면 기존 분석 서버를 종료하고 후보 서버를 실행하세요. `start-ml.bat`은 프로젝트의 `.venv`가 있으면 우선 사용합니다.

`ml/train_transfer.py`는 MobileNet 또는 EfficientNet의 고정 특징으로 분류 헤드를 학습하고, `ml/train_finetune.py`는 MobileNet의 마지막 층도 미세조정합니다. 후보 선택에 사용하는 그룹 분할은 실험 보고서에 기록해 다른 모델에도 동일하게 적용합니다. 원본 영상·가상환경·가중치·전체 실험 산출물은 Git에 포함하지 않습니다.

## 추가 데이터 조사

Kaggle의 MRI 12K·PMRAM·Brain Cancer MRI와 BRISC 평가 자료를 내려받아 기존 개발 자료와의 중복을 조사했다. 후보별 구성과 실제 잔존 수는 [데이터 조사 보고서](reports/dataset-candidates.md)에 기록했다. MRI 12K는 네 유형 총 1,418장이 중복 감사 후 남았지만, 환자 단위 독립성이나 회전·크롭 증강 중복을 검증한 결과는 아니다. 이 후보 자료로 새 정확도를 계산하거나 모델을 추가 학습하지 않았다.

일반 후보 검사는 아래와 같이 재현한다. 경로와 원 게시물은 내려받은 자료에 맞게 지정한다.

```sh
python ml/audit_candidate.py --dataset datasets/new-candidate --references datasets/audit-7023.json datasets/audit-sartaj.json --source https://www.kaggle.com/datasets/OWNER/DATASET --output datasets/candidate-audit.json --summary reports/candidate-audit.json
```

후보 유사 이미지 그룹 전체가 기존 자료에 연결되는지도 확인한다. 이미지별 경로·해시가 들어간 전체 감사 파일과 원본 영상은 Git에 포함하지 않는다.

## 자동 검사

GitHub의 [Code checks](https://github.com/knu3146/SIRIUS/actions) 워크플로는 push와 pull request에서 JavaScript 문법·회귀 테스트 및 Python 테스트를 실행합니다. 실제 MRI 데이터나 학습된 가중치는 CI에 올리지 않으며, 모델의 임상 성능을 검증하는 검사도 아닙니다.

Windows 실행 스크립트는 프로젝트 `.venv`를 우선 사용합니다. `start.bat`은 로컬에 준비된 `.runtime/node/node.exe`가 있으면 사용하고, 없으면 설치된 Node.js를 찾습니다. 이 로컬 실행 파일 역시 Git에서 제외합니다.
