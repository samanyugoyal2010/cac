"""Utility helpers for working with dermatoscopic images."""

from __future__ import annotations

import io
from typing import Tuple

import numpy as np
from PIL import Image

_TARGET_HEIGHT = 224
_TARGET_WIDTH = 224


class ImageTooLargeError(ValueError):
    """Raised when the uploaded image exceeds the allowed payload size."""


def load_and_preprocess_image(data: bytes) -> Tuple[np.ndarray, Tuple[int, int]]:
    """Decode raw image bytes and prepare them for model inference.

    Returns a tuple containing the preprocessed image tensor and the original
    (height, width) for potential downstream use.
    """

    with Image.open(io.BytesIO(data)) as img:
        original_size = img.size[::-1]  # PIL returns (width, height)
        if img.mode != "RGB":
            img = img.convert("RGB")
        img = img.resize((_TARGET_WIDTH, _TARGET_HEIGHT))
        array = np.asarray(img, dtype=np.float32)

    # ResNet preprocessing: scale to [0, 255] -> [0, 1], then apply ImageNet mean/std.
    array = array / 255.0
    imagenet_mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    imagenet_std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    array = (array - imagenet_mean) / imagenet_std
    array = np.expand_dims(array, axis=0)
    return array, original_size
