"""Pydantic schemas shared across the DermaSense inference API."""

from __future__ import annotations

from typing import Dict, Optional

from pydantic import BaseModel, Field


class PredictionResponse(BaseModel):
    """Response payload returned by the /predict endpoint."""

    label: str = Field(..., description="Most likely class name.")
    confidence: float = Field(
        ..., ge=0, le=1, description="Maximum softmax probability associated with the label."
    )
    probabilities: Optional[Dict[str, float]] = Field(
        None,
        description="Optional mapping of class probabilities for downstream auditing.",
    )
    inference_ms: Optional[float] = Field(
        None,
        ge=0,
        description="Total inference time in milliseconds, surfaced for observability.",
    )


class HealthResponse(BaseModel):
    """Simple health response for uptime checks."""

    status: str = Field(..., description="Overall service status indicator.")
    model_loaded: bool = Field(..., description="Whether the TensorFlow model weights are in memory.")
