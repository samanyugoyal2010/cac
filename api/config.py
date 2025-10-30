"""Application configuration for the DermaSense inference service."""

from __future__ import annotations

from pathlib import Path
from typing import Tuple

from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Centralised runtime configuration.

    Values can be overridden using environment variables prefixed with
    ``DERMASENSE_`` (e.g. ``DERMASENSE_MODEL_JSON_PATH``). An optional ``.env``
    file located at the repository root will be read automatically if present.
    """

    model_config = SettingsConfigDict(
        env_prefix="DERMASENSE_",
        env_file=_REPO_ROOT / ".env",
        extra="ignore",
        protected_namespaces=("settings_",),
    )

    model_json_path: Path = _REPO_ROOT / "resnet50.json"
    model_weights_path: Path = _REPO_ROOT / "resnet50.h5"
    labels: Tuple[str, ...] = ("Benign", "Malignant")
    max_image_size_mb: int = 25
    cors_allow_origins: Tuple[str, ...] = ("*",)


settings = Settings()
