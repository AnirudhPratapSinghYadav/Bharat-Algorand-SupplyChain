"""Small JSON file helpers next to app root (sensor log, oracle logs, etc.)."""

from __future__ import annotations

import json
import os
from typing import Any

_ROOT = os.path.dirname(os.path.abspath(__file__))


def data_path(name: str) -> str:
    return os.path.join(_ROOT, name)


def load_json(name: str, default: Any) -> Any:
    p = data_path(name)
    if not os.path.isfile(p):
        return default
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def save_json(name: str, data: Any) -> None:
    p = data_path(name)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
