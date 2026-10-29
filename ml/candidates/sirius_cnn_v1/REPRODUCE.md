# 같은 그룹 분할로 Claude CNN 후보 다시 학습하기

Claude가 전달한 CNN 구조를 현재 프로젝트의 기존 pHash 그룹 분할에 맞춰 다시 학습한다. 받은 ONNX 바이너리와 과거 99.2% 결과는 이 재학습의 결과가 아니며 현재 기본 모델로 교체하지 않았다.

입력은 회색조 128×128, 모델은 SiriusNet width 1.5, seed 1, 22 epochs다. 학습 3,540장과 검증 885장을 사용하고, 검증 macro-F1로 에폭을 선택한다. 이번 학습에서 테스트 영상을 열거나 예측하지 않는다. 환자 단위 독립성은 확인되지 않았다.

먼저 기존 로컬 그룹 실험의 `evaluation.json`과 해당 원본 데이터·감사 파일이 필요하다. 이미지별 경로와 전체 실험 산출물은 개인정보 노출 범위를 줄이기 위해 Git에서 제외한다. 다음 명령의 입력 파일 SHA-256은 공개 프로토콜과 일치해야 같은 분할을 재현할 수 있다.

```powershell
.\.venv\Scripts\python.exe ml/prepare_sirius_data.py --evaluation ml/experiments/run-004-grouped/evaluation.json --audit datasets/audit-7023.json --output datasets/sirius-grouped --protocol reports/sirius-grouped-protocol.json
.\.venv\Scripts\python.exe ml/candidates/sirius_cnn_v1/src/train_cnn.py --data datasets/sirius-grouped --manifest datasets/sirius-grouped/training-manifest.json --out ml/experiments/run-008-sirius-grouped --epochs 22 --width 1.5 --bs 64 --threads 2 --seed 1 --cache datasets/sirius-grouped/training-cache.npz
```

출력 경로는 새 디렉터리여야 한다. 준비 과정은 학습·검증 그룹이 겹치지 않는지, 원본 이미지 해시가 바뀌지 않았는지 확인한 뒤 필요한 파일만 복사한다. 학습 로더는 요청한 split만 열고 캐시를 파일 내용 해시와 데이터 루트에 연결한다. 마지막 작은 배치도 학습하며 예전 체크포인트를 덮어쓰지 않는다.

의존성은 프로젝트의 NumPy/Pillow/scikit-image/scikit-learn과 CPU PyTorch다. 이 학습에는 ONNX Runtime이나 OpenCV가 필요하지 않다. 과거 ONNX의 재평가·내보내기 코드는 이번 공개 학습 경로에 포함하지 않는다. 학습 결과를 확인한 뒤 동일한 데이터·선택 규칙으로 비교하고, 근거 없이 활성 모델을 바꾸지 않는다.
