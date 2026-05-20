"""
Re-export root `pramanik_config` for prompts that import `backend.pramanik_config`.
All runtime config is loaded from repo-root `config.json` + `.env`.
"""

from pramanik_config import *  # noqa: F403
