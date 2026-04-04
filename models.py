"""Pydantic models for Navi-Trust API."""

from typing import List, Optional

from pydantic import BaseModel, Field


class WeatherData(BaseModel):
    temperature: float
    precipitation: float
    weather_code: int


class RiskPrediction(BaseModel):
    risk_score: int
    predicted_delay_probability: int
    anomaly_detected: bool
    reasoning_narrative: str
    mitigation: str = ""


class BlockchainState(BaseModel):
    blockchain_status: str
    audit_report: str


class RunJuryRequest(BaseModel):
    shipment_id: str


class SubmitMitigationRequest(BaseModel):
    shipment_id: str
    wallet: str
    resolution_text: str


class RegisterShipmentBody(BaseModel):
    shipment_id: str
    supplier_address: str
    origin: str
    destination: str


class RunJuryBody(BaseModel):
    shipment_id: str
    origin_lat: float = 0.0
    origin_lon: float = 0.0
    dest_lat: float = 0.0
    dest_lon: float = 0.0


class SettleBody(BaseModel):
    shipment_id: str


class FundShipmentBuildBody(BaseModel):
    shipment_id: str
    payer_address: str
    micro_algo: int = Field(default=500_000, ge=500_000, le=20_000_000)


class NavibotRequest(BaseModel):
    """Accept `query` (legacy) or `message` (alias) — at least one should be non-empty for best results."""

    query: str = ""
    message: str = ""
    history: List[dict] = Field(default_factory=list)
    shipment_id: Optional[str] = None
    wallet_address: Optional[str] = None

    def effective_text(self) -> str:
        q = (self.query or "").strip()
        m = (self.message or "").strip()
        return q if q else m
