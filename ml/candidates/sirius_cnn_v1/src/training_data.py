"""Load only requested splits and bind cached pixels to their source files."""
import hashlib
import os
from pathlib import Path
import tempfile
import zipfile

import numpy as np
from PIL import Image

from features import IMG_SIZE, to_gray


def load_gray(root, rels, cache=None, allowed_splits=None):
    root = Path(root).resolve()
    rels = list(rels)
    if not rels or len(set(rels)) != len(rels):
        raise ValueError('Image selection must be nonempty and contain no repeated paths')
    files = []
    for rel in rels:
        parts = Path(rel).parts
        file = (root / rel).resolve()
        if not file.is_relative_to(root) or not file.is_file():
            raise ValueError(f'Invalid image path: {rel}')
        if allowed_splits is not None and (not parts or parts[0] not in allowed_splits):
            raise ValueError(f'Image belongs to a forbidden split: {rel}')
        files.append(file)
    cached = {}
    if cache and Path(cache).is_file():
        try:
            with np.load(cache, allow_pickle=False) as data:
                if data['version'].item() == 2 and data['root'].item() == str(root):
                    names, hashes, pixels = data['rels'].tolist(), data['hashes'].tolist(), data['x']
                    if (len(names) == len(hashes) == len(set(names)) and
                            pixels.shape == (len(names), IMG_SIZE, IMG_SIZE) and
                            np.isfinite(pixels).all() and (pixels >= 0).all() and (pixels <= 1).all()):
                        cached = dict(zip(names, zip(hashes, pixels)))
        except (ValueError, KeyError, OSError, zipfile.BadZipFile):
            # A cache is disposable; old/unreadable formats are rebuilt from
            # requested images without scanning other splits.
            cached = {}
    result = []
    for rel, file in zip(rels, files):
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        old = cached.get(rel)
        if old is not None and old[0] == digest:
            pixels = old[1]
        else:
            with Image.open(file) as image:
                pixels = np.asarray(to_gray(image), dtype=np.float32)
            cached[rel] = (digest, pixels)
        result.append(pixels)
    if cache:
        target = Path(cache)
        target.parent.mkdir(parents=True, exist_ok=True)
        names = sorted(cached)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=target.parent, suffix='.npz', delete=False) as handle:
                temporary = Path(handle.name)
                np.savez_compressed(handle, version=2, root=str(root), rels=np.asarray(names),
                                    hashes=np.asarray([cached[name][0] for name in names]),
                                    x=np.stack([cached[name][1] for name in names]))
            os.replace(temporary, target)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    return np.stack(result).astype(np.float32)
