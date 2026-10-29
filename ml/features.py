"""학습(train_model.py)과 추론(infer_server.py)이 함께 쓰는 특징 추출.
두 곳이 달라지면 결과가 어긋나므로 반드시 이 파일 하나만 씁니다."""
import numpy as np
from PIL import Image
from skimage.color import rgb2gray
from skimage.feature import hog

IMG_SIZE = 128

# 순서가 js/engine.js 의 CLASSES(glioma, meningioma, pituitary, no_tumor)와 같아야 합니다.
CLASS_DIRS = ["glioma_tumor", "meningioma_tumor", "pituitary_tumor", "no_tumor"]
NO_TUMOR_IDX = CLASS_DIRS.index("no_tumor")


def to_gray(img: Image.Image) -> np.ndarray:
    """PIL 이미지 -> 128x128 흑백 float [0,1]"""
    arr = np.asarray(img.convert("RGB").resize((IMG_SIZE, IMG_SIZE)), dtype=np.float64) / 255.0
    return rgb2gray(arr)


def hog_feature(gray: np.ndarray) -> np.ndarray:
    return hog(
        gray,
        orientations=9,
        pixels_per_cell=(16, 16),
        cells_per_block=(2, 2),
        block_norm="L2-Hys",
    )
