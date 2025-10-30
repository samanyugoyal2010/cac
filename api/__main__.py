"""Entry point for running the DermaSense FastAPI service via `python -m api`."""

from __future__ import annotations

import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
