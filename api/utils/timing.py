"""Context manager utilities for timing execution blocks."""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Generator


@contextmanager
def record_elapsed() -> Generator[callable, None, None]:
    """Yield a callback that returns milliseconds elapsed since entry."""

    start = time.perf_counter()

    def _elapsed_ms() -> float:
        return (time.perf_counter() - start) * 1000.0

    yield _elapsed_ms
