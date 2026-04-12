"""Pydantic models for Navi-Trust API."""

from typing import List, Optional

from algosdk import encoding as algo_encoding

from pydantic import BaseModel, Field, model_validator


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


class RegisterShipmentBuildBody(RegisterShipmentBody):
    """Wallet-signed registration: sender must match connected account."""

    sender_address: str = ""
    buyer_address: str = ""

    @model_validator(mode="after")
    def _sender_ok(self):
        addr = (self.sender_address or self.buyer_address).strip()
        if not addr:
            raise ValueError("sender_address or buyer_address is required")
        if not algo_encoding.is_valid_address(addr):
            raise ValueError("sender_address must be a valid Algorand address")
        return self

    def resolved_sender(self) -> str:
        return (self.sender_address or self.buyer_address).strip()


class RegisterShipmentConfirmBody(RegisterShipmentBody):
    tx_id: str


class RunJuryBody(BaseModel):
    shipment_id: str
    origin_lat: float = 0.0
    origin_lon: float = 0.0
    dest_lat: float = 0.0
    dest_lon: float = 0.0


class SettleBody(BaseModel):
    shipment_id: str


class FundShipmentBuildBody(BaseModel):
    """Build unsigned pay + fund_shipment group. Prefer buyer_address + amount_algo (ALGO)."""

    shipment_id: str
    buyer_address: str = ""
    payer_address: str = ""
    amount_algo: float | None = Field(default=None, gt=0, le=20.0)
    micro_algo: int | None = Field(default=None, ge=500_000, le=20_000_000)

    @model_validator(mode="after")
    def _wallet_present(self):
        addr = (self.buyer_address or self.payer_address).strip()
        if not addr:
            raise ValueError("buyer_address or payer_address is required")
        if not algo_encoding.is_valid_address(addr):
            raise ValueError("buyer_address / payer_address must be a valid Algorand address")
        return self

    def resolved_payer(self) -> str:
        return (self.buyer_address or self.payer_address).strip()

    def resolved_micro(self) -> int:
        if self.micro_algo is not None:
            return int(self.micro_algo)
        algo = self.amount_algo if self.amount_algo is not None else 0.5
        return max(500_000, int(round(float(algo) * 1_000_000)))


class NavibotRequest(BaseModel):
    """Accept `query` (legacy) or `message` (alias) — at least one should be non-empty for best results."""

    query: str = ""
    message: str = ""
    history: List[dict] = Field(default_factory=list)
    shipment_id: Optional[str] = None
    wallet_address: Optional[str] = None
    role: Optional[str] = None  # stakeholder | supplier (UI hint only)

    def effective_text(self) -> str:
        q = (self.query or "").strip()
        m = (self.message or "").strip()
        return q if q else m
