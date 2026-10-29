# 추가 MRI 데이터 후보 조사

2026-10-29, Kaggle 공개 API의 데이터 카드와 원 게시물(Mendeley Data)을 함께 확인했다. 아래 자료는 후보이며, 독립 평가에 적합하다는 결론은 중복·증강·환자 그룹 감사 후 내려야 한다.

| 후보 | 구성 | 현재 판단 |
|---|---|---|
| [PMRAM](https://www.kaggle.com/datasets/orvile/pmram-bangladeshi-brain-cancer-mri-dataset) | 원본 폴더 1,505장 / 증강 폴더 6,004장 | 다운로드 완료. 원본만 감사해 신경교종 152 / 수막종 279 / 정상 87 / 뇌하수체 0장이 남았다. 네 유형 독립 평가용으로 부적합하다. 설명의 원본 1,600장·증강 후 6,000장과 실제 파일 수가 다르다. |
| [MRI 12K](https://www.kaggle.com/datasets/arvinthcinmayangk/mendely-brain-tumor) | 4종, 12,064장; train 9,650 / test 2,414 | 다운로드 완료. 감사 후 신경교종 580 / 수막종 299 / 정상 221 / 뇌하수체 318장, 총 1,418장 잔존. 추가 학습 후보이며 환자 독립성과 변형·증강 중복은 미확인이다. 아직 예측·학습하지 않았다. |
| [Brain Cancer MRI](https://www.kaggle.com/datasets/orvile/brain-cancer-mri-dataset) | brain_glioma 2,004 / brain_menin 2,004 / brain_tumor 2,048 | 별도 원 게시물 DOI 10.17632/mk56jw9rns.1. 현재 자료와 감사 후 잔존 1,756 / 1,887 / 1,952장. brain_tumor 라벨을 뇌하수체로 추정하지 않는다. 네 유형 전체 독립 평가용은 아님. |
| [Brain Tumor MRI Images 17 Classes](https://www.kaggle.com/datasets/fernando2rad/brain-tumor-mri-images-17-classes) | 4,449장, T1/T1C/T2, 여러 종양·정상·기타 병변 | 알려진 클래스 밖의 입력과 일부 유형 확인 후보. 뇌하수체 유형이 카드에 없고 환자 단위 독립성 미확인. |
| [LGG MRI segmentation](https://www.kaggle.com/datasets/mateuszbuda/lgg-mri-segmentation) | TCIA/TCGA 저등급 신경교종 110명, FLAIR 이상 영역 마스크 | 위치·분할 학습 후보. 현재 4종 분류 데이터를 대신하지 않는다. |

## 원 게시물

- PMRAM: https://data.mendeley.com/datasets/m7w55sw88b/1
- MRI 12K: https://data.mendeley.com/datasets/zwr4ntf94j/5
- Brain Cancer MRI: https://data.mendeley.com/datasets/mk56jw9rns/1

## 실제 검사와 한계

`ml/audit_candidate.py`로 기존 개발 자료 두 세트와 비교했다. 정규화한 회색조 이미지의 SHA-256 및 pHash 거리 4 이하를 사용하고, 기존 자료와 연결되는 후보 유사 이미지 그룹 전체를 제외한다. 남은 그룹은 라벨이 충돌하면 제외하고 같은 라벨이면 파일명순 대표 한 장을 남긴다. 환자 식별자가 없으므로 이 과정을 통과해도 환자 단위 독립 평가라고 부를 수 없다. 회전·크롭·강한 증강본도 남을 수 있다. 후보끼리의 교차 중복은 아직 검사하지 않았다.

MRI 12K에서는 정확 중복 6,366장, 직접 유사 중복 3,912장, 기존 자료로 연결되는 그룹의 추가 51장, 후보 내부 중복 300장, 라벨 충돌 17장을 제외했다. 데이터 카드의 병원 수집 설명만으로 새 환자 자료라고 판단하지 않는다. 원본 이미지의 train/test 폴더는 보존했지만, 추가 학습 전에 누수 검사를 거쳐 평가 대상을 고정해야 한다.

- [MRI 12K 감사 결과](12k-overlap-audit.json)
- [PMRAM 원본 감사 결과](pmram-raw-overlap-audit.json)
- [Brain Cancer MRI 감사 결과](bangladesh-overlap-audit.json)
- [BRISC 사전 평가 규칙](external-evaluation-protocol.json) / [결과](external-overlap-audit.json): 기존에 등록한 직접 중복 제거 후 잔존 그룹 규칙을 사용했다. 후보 감사의 그룹 전체 제외 규칙과 구분한다.

전체 경로·이미지별 해시가 들어간 감사 원본과 다운로드 자료는 Git에서 제외한 `datasets/`에 보관한다. 공개 보고서는 집계값만 담는다. 이번 후보 자료로는 아직 분류 예측이나 추가 학습을 수행하지 않았다.

## 우선 제외한 재구성본

- tombackert/brain-tumor-mri-data: 카드에 Figshare·Sartaj·Br35H 재구성이라고 명시한다. 현재 개발 원천과 겹친다.
- Crystal Clean: 카드에 Sartaj 정제·증강본이라고 명시한다.
- MRI for Brain Tumor with Bounding Boxes: 카드에 Masoud/Sartaj를 원천으로 명시한다. 위치 라벨 학습에는 별도 가치가 있으나 새로운 독립 분류 코호트가 아니다.
- BRISC: 직접 감사한 공식 평가 1,000장 중 860장이 현재 개발 자료와 정확/유사 중복이다. 남은 그룹 대표 132장은 신경교종 0, 수막종 1, 뇌하수체 0, 종양 없음 131이어서 4종 독립 정확도를 검증할 수 없다. 아직 예측은 계산하지 않았다.
