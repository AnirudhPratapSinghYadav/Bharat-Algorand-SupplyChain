"""Open-Meteo backed weather for cities (dead reckoning + weather oracle)."""

from __future__ import annotations

import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)

TOP_PORTS: dict[str, tuple[float, float]] = {
    "Mumbai": (19.076, 72.877),
    "Dubai": (25.276, 55.296),
    "Rotterdam": (51.924, 4.477),
    "Singapore": (1.352, 103.819),
    "Shanghai": (31.230, 121.473),
    "Chennai": (13.082, 80.270),
    "Delhi": (28.614, 77.209),
    "New York": (40.712, -74.005),
    "London": (51.507, -0.127),
    "Hamburg": (53.550, 10.000),
}


def fetch_weather_real(city: str) -> dict[str, Any]:
    """Returns temperature_c, precipitation_mm, wind_kmh, weather_code, source."""
    key = city.strip()
    for k, coords in TOP_PORTS.items():
        if k.lower() == key.lower():
            lat, lon = coords
            break
    else:
        lat, lon = TOP_PORTS.get("Dubai", (25.276, 55.296))
    try:
        r = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,precipitation,weather_code,wind_speed_10m",
                "timezone": "auto",
            },
            timeout=8,
        )
        r.raise_for_status()
        cur = r.json().get("current") or {}
        precip = float(cur.get("precipitation") or 0)
        wind = float(cur.get("wind_speed_10m") or 0)
        return {
            "temperature_c": float(cur.get("temperature_2m", 20.0)),
            "precipitation_mm": precip,
            "wind_kmh": wind,
            "weather_code": int(cur.get("weather_code", 0)),
            "source": "open-meteo",
            "city_resolved": key,
        }
    except Exception as e:
        logger.debug("fetch_weather_real failed: %s", e)
        return {
            "temperature_c": 22.0,
            "precipitation_mm": 0.0,
            "wind_kmh": 10.0,
            "weather_code": 0,
            "source": "fallback",
            "city_resolved": key,
        }
