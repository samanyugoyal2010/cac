"""FastAPI application exposing the DermaSense inference endpoints."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .schemas import HealthResponse, PredictionResponse
from .services.model import SkinCancerModel
from .utils.image import load_and_preprocess_image
from .utils.timing import record_elapsed

LOGGER = logging.getLogger(__name__)

app = FastAPI(
    title="DermaSense Inference API",
    version="1.0.0",
    description="Real-time skin lesion classification powered by a fine-tuned ResNet50 model.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_allow_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_MODEL_INSTANCE: SkinCancerModel | None = None


def get_model() -> SkinCancerModel:
    global _MODEL_INSTANCE
    if _MODEL_INSTANCE is None:
        LOGGER.info("Initialising shared model instance")
        _MODEL_INSTANCE = SkinCancerModel(
            architecture_path=settings.model_json_path,
            weights_path=settings.model_weights_path,
            labels=settings.labels,
        )
        _MODEL_INSTANCE.load()
    return _MODEL_INSTANCE


@app.get("/health", response_model=HealthResponse, tags=["Operations"])
def health_check(model: Annotated[SkinCancerModel, Depends(get_model)]) -> HealthResponse:
    """Expose service and model readiness information."""

    return HealthResponse(status="ok", model_loaded=model.is_ready)


@app.post("/predict", response_model=PredictionResponse, tags=["Inference"])
async def predict(
    file: UploadFile = File(..., description="Dermatoscopic lesion image in JPEG/PNG format."),
    model: SkinCancerModel = Depends(get_model),
) -> PredictionResponse:
    """Run a single-image inference request."""

    if file.size and file.size > settings.max_image_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Uploaded file exceeds size limit.")

    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Unsupported file type. Upload JPEG or PNG.")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        with record_elapsed() as elapsed_ms:
            batch, _ = load_and_preprocess_image(payload)
            probabilities = model.predict(batch)
            inference_ms = elapsed_ms()
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.exception("Inference failed: %s", exc)
        raise HTTPException(status_code=400, detail="Unable to process image.") from exc

    max_index = int(probabilities.argmax())
    max_confidence = float(probabilities[max_index])

    return PredictionResponse(
        label=model.labels[max_index],
        confidence=max_confidence,
        probabilities={label: float(prob) for label, prob in zip(model.labels, probabilities)},
        inference_ms=inference_ms,
    )


@app.on_event("startup")
def warm_model() -> None:
    """Ensure the model is loaded during application startup."""

    LOGGER.info("Warming model on startup")
    get_model()