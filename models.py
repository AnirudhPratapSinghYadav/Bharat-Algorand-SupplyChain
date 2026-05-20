# models.py
# All Pydantic models for request/response validation.
# Keep these lean — no business logic here.

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from pramanik_validate import validate_algorand_address, validate_lat_lon, validate_route


class WeatherData(BaseModel):
    city: str
    temperature_c: float
    precipitation_mm: float
    wind_kmh: float
    weather_code: int
    description: str
    source: str = "open-meteo"
    fetched_at: Optional[str] = None


class RiskPrediction(BaseModel):
    model_config = {"protected_namespaces": ()}

    risk_score: int = Field(ge=0, le=100)
    reasoning: str = ""
    fallback_used: bool = False
    model_used: Optional[str] = None
    # Legacy agent pipeline fields (optional)
    predicted_delay_probability: int = 0
    anomaly_detected: bool = False
    reasoning_narrative: str = ""
    mitigation: str = ""

    @model_validator(mode="after")
    def sync_reasoning_fields(self) -> "RiskPrediction":
        if not self.reasoning and self.reasoning_narrative:
            self.reasoning = self.reasoning_narrative
        if not self.reasoning_narrative and self.reasoning:
            self.reasoning_narrative = self.reasoning
        return self


class BlockchainState(BaseModel):
    shipment_id: str
    status: str
    funds_microalgo: int
    risk_score: int
    rep_score: int
    route: str
    verdict_json: Optional[str] = None
    verdict_hash: Optional[str] = None
    certificate_asa: Optional[int] = None
    registered: bool
    audit_report: str
    lora_app_url: Optional[str] = None
    lora_cert_url: Optional[str] = None


class RunJuryRequest(BaseModel):
    shipment_id: str

    @field_validator("shipment_id")
    @classmethod
    def shipment_id_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("shipment_id must not be empty")
        return v.strip()


class SettleBody(BaseModel):
    shipment_id: str


class NavibotRequest(BaseModel):
    message: str
    shipment_id: Optional[str] = None


class FundShipmentBuildBody(BaseModel):
    shipment_id: str
    amount_algo: float = Field(gt=0, le=1000)
    buyer_address: str

    def resolved_micro(self) -> int:
        return int(round(self.amount_algo * 1_000_000))


class RegisterShipmentBody(BaseModel):
    shipment_id: str
    supplier_address: str
    route: str = ""
    commodity: str = ""
    origin: str
    destination: str
    origin_lat: float
    origin_lon: float
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None

    @field_validator("shipment_id")
    @classmethod
    def shipment_id_nonempty(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("shipment_id required")
        return s

    @field_validator("supplier_address")
    @classmethod
    def supplier_valid(cls, v: str) -> str:
        return validate_algorand_address(v)

    @field_validator("route")
    @classmethod
    def route_valid(cls, v: str) -> str:
        if not (v or "").strip():
            return ""
        return validate_route(v)

    @model_validator(mode="after")
    def coords_valid(self) -> "RegisterShipmentBody":
        validate_lat_lon(self.origin_lat, self.origin_lon)
        if self.dest_lat is not None and self.dest_lon is not None:
            validate_lat_lon(self.dest_lat, self.dest_lon)
        return self


class SimulateEventBody(BaseModel):
    shipment_id: str
    event: str
    severity: str = "medium"

    @field_validator("severity")
    @classmethod
    def valid_severity(cls, v: str) -> str:
        allowed = {"low", "medium", "high", "critical"}
        s = (v or "medium").lower().strip()
        if s not in allowed:
            raise ValueError(f"severity must be one of {allowed}")
        return s


class VerifyHashBody(BaseModel):
    shipment_id: str
    weather: dict
    sentinel: dict
    auditor: dict
    fraud_detector: dict
    arbiter: dict


class SubmitSignedTxnBody(BaseModel):
    """Pera Wallet (or any signer) submits already-signed transaction bytes."""

    signed_txn_b64: Optional[str] = None
    signed_txns_b64: Optional[list[str]] = None

    @model_validator(mode="after")
    def require_one_form(self) -> "SubmitSignedTxnBody":
        single = (self.signed_txn_b64 or "").strip()
        group = [b for b in (self.signed_txns_b64 or []) if b and str(b).strip()]
        if not single and not group:
            raise ValueError("Provide signed_txn_b64 or signed_txns_b64 (atomic group)")
        if single and group:
            raise ValueError("Provide only one of signed_txn_b64 or signed_txns_b64")
        return self
