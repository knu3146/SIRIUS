"""작은 ResNet형 CNN (CAM 호환). 학습(train_cnn.py)·내보내기(export_onnx.py)가 함께 씁니다.

입력  : (B,1,128,128) 흑백, 값 [0,1]  ← features.to_gray 의 출력 그대로
출력  : probs (B,4) 소프트맥스 확률, cam (B,4,16,16) 클래스별 활성화 지도(로짓 단위)
전처리: 영상별 평균·표준편차 정규화를 모델 안에서 수행 → 학습·추론 전처리가 어긋나지 않음
마지막 층이 1x1 합성곱 → 전역평균이라 logits = mean(cam). 그래서 cam 이 곧 클래스 근거 지도(CAM).
"""
import torch
import torch.nn as nn
import torch.nn.functional as F


def conv_bn(cin, cout, stride=1):
    return nn.Sequential(nn.Conv2d(cin, cout, 3, stride, 1, bias=False), nn.BatchNorm2d(cout))


class Block(nn.Module):
    def __init__(self, cin, cout, stride):
        super().__init__()
        self.c1 = conv_bn(cin, cout, stride)
        self.c2 = conv_bn(cout, cout, 1)
        self.skip = None if (cin == cout and stride == 1) else nn.Sequential(
            nn.Conv2d(cin, cout, 1, stride, bias=False), nn.BatchNorm2d(cout))

    def forward(self, x):
        y = self.c2(F.relu(self.c1(x)))
        return F.relu(y + (x if self.skip is None else self.skip(x)))


class SiriusNet(nn.Module):
    def __init__(self, width=1.0, n_classes=4, drop=0.2):
        super().__init__()
        w = [int(round(c * width)) for c in (16, 32, 64, 96, 128)]
        self.stem = nn.Sequential(conv_bn(1, w[0], 2), nn.ReLU(inplace=True))      # 128 -> 64
        self.layers = nn.Sequential(
            Block(w[0], w[1], 2),     # 64 -> 32
            Block(w[1], w[2], 2),     # 32 -> 16
            Block(w[2], w[3], 1),     # 16
            Block(w[3], w[4], 1),     # 16
        )
        self.drop = nn.Dropout2d(drop)
        self.head = nn.Conv2d(w[4], n_classes, 1)
        self.n_classes = n_classes

    @staticmethod
    def normalize(x):
        m = x.mean(dim=(1, 2, 3), keepdim=True)
        s = x.std(dim=(1, 2, 3), keepdim=True)
        return (x - m) / (s + 1e-4)

    def forward_cam(self, x):
        x = self.normalize(x)
        x = self.layers(self.stem(x))
        return self.head(self.drop(x))

    def forward(self, x):                      # 학습용: 로짓
        return self.forward_cam(x).mean(dim=(2, 3))


class Export(nn.Module):
    """ONNX 내보내기용: (확률, CAM). temperature 는 val 로 보정한 값."""

    def __init__(self, net, temperature=1.0):
        super().__init__()
        self.net = net.eval()
        self.register_buffer("t", torch.tensor(float(temperature)))

    def forward(self, x):
        cam = self.net.forward_cam(x)
        logits = cam.mean(dim=(2, 3))
        return F.softmax(logits / self.t, dim=1), cam
