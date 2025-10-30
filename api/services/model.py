"""Model service responsible for loading and running the DermaSense classifier."""

from __future__ import annotations

import os
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")

import logging
from pathlib import Path
from threading import Lock
from typing import Sequence, Tuple

import numpy as np
import tensorflow as tf

LOGGER = logging.getLogger(__name__)

_TARGET_INPUT_SHAPE: Tuple[int, int, int] = (224, 224, 3)


class SkinCancerModel:
    """Lazy-loading wrapper around the fine-tuned ResNet50 model."""

    def __init__(self, architecture_path: Path, weights_path: Path, labels: Sequence[str]):
        self._architecture_path = architecture_path
        self._weights_path = weights_path
        self._labels = tuple(labels)
        self._model: tf.keras.Model | None = None
        self._load_lock = Lock()
        self._predict_lock = Lock()

    @property
    def labels(self) -> Tuple[str, ...]:
        return self._labels

    @property
    def is_ready(self) -> bool:
        return self._model is not None

    def load(self, force: bool = False) -> None:
        """Load the model architecture and weights into memory."""

        if self._model is not None and not force:
            return

        with self._load_lock:
            if self._model is not None and not force:
                return

            LOGGER.info("Loading model architecture from %s", self._architecture_path)
            with self._architecture_path.open("r", encoding="utf-8") as architecture_file:
                architecture_json = architecture_file.read()

            tf.keras.utils.get_custom_objects()["Model"] = tf.keras.Model
            try:
                model = tf.keras.models.model_from_json(architecture_json, compile=False)
            except TypeError:
                # Legacy Keras signatures do not accept the ``compile`` kwarg.
                model = tf.keras.models.model_from_json(architecture_json)

            LOGGER.info("Loading model weights from %s", self._weights_path)
            model.load_weights(str(self._weights_path))

            expected_output = model.output_shape[-1]
            if expected_output != len(self._labels):
                raise ValueError(
                    "Mismatch between model output units and configured labels: "
                    f"{expected_output} != {len(self._labels)}"
                )

            # Prime the model to avoid cold-start latency on first inference.
            dummy_batch = np.zeros((1, *_TARGET_INPUT_SHAPE), dtype=np.float32)
            model.predict(dummy_batch, verbose=0)

            self._model = model
            LOGGER.info("Model loaded successfully with labels: %s", ", ".join(self._labels))

    def predict(self, batch: np.ndarray) -> np.ndarray:
        """Run inference on a preprocessed image batch."""

        if batch.ndim != 4:
            raise ValueError(
                "Expected batch dimension of 4 (batch, height, width, channels), "
                f"received shape {batch.shape}."
            )

        if batch.shape[1:] != _TARGET_INPUT_SHAPE:
            raise ValueError(
                "Input batch has incorrect spatial dimensions. Expected "
                f"{_TARGET_INPUT_SHAPE}, got {batch.shape[1:]}"
            )

        if self._model is None:
            self.load()

        assert self._model is not None, "Model failed to load."

        with self._predict_lock:
            predictions = self._model.predict(batch, verbose=0)

        if predictions.ndim != 2 or predictions.shape[0] != 1:
            raise ValueError(f"Unexpected prediction output shape: {predictions.shape}")

        return predictions[0]
