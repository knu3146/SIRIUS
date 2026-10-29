"""모델 다시 학습하기.

    python train_model.py "<MRI Dataset 폴더>"

폴더 구조: <루트>/train|val|test/<glioma_tumor|meningioma_tumor|pituitary_tumor|no_tumor>/*.jpg
결과: model_rf.joblib (압축) + model_meta.json (버전·해시·성능)
"""
import datetime
import glob
import hashlib
import json
import os
import sys
import time

import joblib
import numpy as np
import sklearn
from PIL import Image
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report

from features import CLASS_DIRS, hog_feature, to_gray

HERE = os.path.dirname(os.path.abspath(__file__))


def load_split(root, split):
    X, y = [], []
    for ci, cls in enumerate(CLASS_DIRS):
        for f in sorted(glob.glob(os.path.join(root, split, cls, "*.jpg"))):
            with Image.open(f) as im:
                X.append(hog_feature(to_gray(im)))
            y.append(ci)
    return np.asarray(X, dtype=np.float32), np.asarray(y, dtype=np.int64)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    root = sys.argv[1]
    t0 = time.time()
    Xtr, ytr = load_split(root, "train")
    Xte, yte = load_split(root, "test")
    print(f"특징 추출 {time.time() - t0:.0f}초 — train {len(ytr)}장, test {len(yte)}장")

    clf = RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=1)
    t0 = time.time()
    clf.fit(Xtr, ytr)
    print(f"학습 {time.time() - t0:.0f}초")

    pred = clf.predict(Xte)
    acc = float((pred == yte).mean())
    print(f"test 정확도 {acc:.3f}")
    print(classification_report(yte, pred, target_names=CLASS_DIRS, digits=3))

    model_path = os.path.join(HERE, "model_rf.joblib")
    joblib.dump(clf, model_path, compress=3)
    with open(model_path, "rb") as fh:
        sha = hashlib.sha256(fh.read()).hexdigest()
    meta = {
        "name": "HOG+RandomForest 시연용 v0.2",
        "classes": CLASS_DIRS,
        "sklearn_version": sklearn.__version__,
        "sha256": sha,
        "test_accuracy": round(acc, 4),
        "trained_on": "Brain Tumor Classification MRI (4-class, 분류 라벨만, 병변 마스크 없음)",
        "trained_at": datetime.date.today().isoformat(),
    }
    with open(os.path.join(HERE, "model_meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)
    print("저장:", model_path, f"({os.path.getsize(model_path) / 1e6:.1f}MB)")


if __name__ == "__main__":
    main()
