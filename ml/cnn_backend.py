"""Optional local MobileNet feature classifier; no downloads during inference."""
from pathlib import Path

import joblib
import numpy as np
from PIL import Image
from skimage.filters import gaussian
import torch
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights, efficientnet_b0, EfficientNet_B0_Weights

from features import IMG_SIZE, NO_TUMOR_IDX, to_gray

FEATURE_BACKBONES = {
    'mobilenet_v3_small': (mobilenet_v3_small, MobileNet_V3_Small_Weights.IMAGENET1K_V1, 576),
    'efficientnet_b0': (efficientnet_b0, EfficientNet_B0_Weights.IMAGENET1K_V1, 1280),
}


def restore_attention(heat, image_size, resize):
    """Undo the classifier center crop before returning normalized image positions."""
    width, height = image_size
    size = heat.shape[0]
    resized_w = int(resize * width / min(width, height))
    resized_h = int(resize * height / min(width, height))
    left = int(round((resized_w - size) / 2))
    top = int(round((resized_h - size) / 2))
    full = Image.new('F', (resized_w, resized_h), 0)
    full.paste(Image.fromarray(heat.astype(np.float32)), (left, top))
    return np.asarray(full.resize((IMG_SIZE, IMG_SIZE), Image.Resampling.BILINEAR))


def make_finetuned_model():
    model = mobilenet_v3_small(weights=None)
    model.classifier = torch.nn.Sequential(torch.nn.Linear(576, 128), torch.nn.Hardswish(), torch.nn.Dropout(.2), torch.nn.Linear(128, 4))
    return model


class MobileClassifier:
    def __init__(self, directory, meta):
        directory = Path(directory)
        if meta.get('torch_version') != torch.__version__:
            raise ValueError('PyTorch version does not match model metadata')
        torch.set_num_threads(4)
        constructor, weights, dimensions = FEATURE_BACKBONES[meta['architecture']]
        self.backbone = constructor(weights=None).eval()
        self.backbone.load_state_dict(torch.load(directory / 'backbone.pth', weights_only=True, map_location='cpu'))
        self.transform = weights.transforms()
        self.head = joblib.load(directory / 'classifier.joblib')
        if not np.array_equal(self.head.classes_, np.arange(4)) or self.head.n_features_in_ != dimensions:
            raise ValueError('Invalid CNN classifier dimensions or class order')

    def predict_tensors(self, tensors):
        with torch.inference_mode():
            features = self.backbone.avgpool(self.backbone.features(tensors)).flatten(1).numpy()
        return self.head.predict_proba(features)

    def predict_image(self, image):
        if min(image.size) <= 0 or max(image.size) / min(image.size) > 8:
            raise ValueError('Unsupported image aspect ratio')
        tensor = self.transform(image.convert('RGB'))
        probs = self.predict_tensors(tensor.unsqueeze(0))[0]
        cls = int(np.argmax(probs))
        if cls == NO_TUMOR_IDX:
            return probs, None
        size, patch, stride = tensor.shape[-1], 48, 32
        positions = list(range(0, size - patch + 1, stride))
        if positions[-1] != size - patch:
            positions.append(size - patch)
        boxes = [(y, x) for y in positions for x in positions]
        heat = np.zeros((size, size), dtype=np.float32)
        count = np.zeros_like(heat)
        for start in range(0, len(boxes), 16):
            batch = []
            for y, x in boxes[start:start + 16]:
                occluded = tensor.clone()
                occluded[:, y:y + patch, x:x + patch] = 0
                batch.append(occluded)
            values = self.predict_tensors(torch.stack(batch))[:, cls]
            for (y, x), value in zip(boxes[start:start + 16], values):
                heat[y:y + patch, x:x + patch] += max(float(probs[cls] - value), 0)
                count[y:y + patch, x:x + patch] += 1
        heat = gaussian(heat / np.maximum(count, 1), sigma=3)
        # The transform center-crops after aspect-preserving resize. Map attention
        # back to original image coordinates before the common region extractor.
        result = restore_attention(heat, image.size, self.transform.resize_size[0])
        result = result * gaussian((to_gray(image) > .08).astype(np.float32), sigma=1)
        return probs, result


class TorchMRIClassifier(MobileClassifier):
    def __init__(self, directory, meta):
        if meta.get('torch_version') != torch.__version__:
            raise ValueError('PyTorch version does not match model metadata')
        torch.set_num_threads(4)
        self.backbone = make_finetuned_model().eval()
        self.backbone.load_state_dict(torch.load(Path(directory) / 'model.pth', weights_only=True, map_location='cpu'))
        self.transform = MobileNet_V3_Small_Weights.IMAGENET1K_V1.transforms()

    def predict_tensors(self, tensors):
        with torch.inference_mode():
            return self.backbone(tensors).softmax(dim=1).numpy()
