"""Pydantic model validation."""

import pytest
from pydantic import ValidationError

from models import (
    FundShipmentBuildBody,
    RegisterShipmentBody,
    RunJuryRequest,
    SubmitSignedTxnBody,
    WeatherData,
)


def test_weather_data_valid():
    w = WeatherData(
        city="Mumbai",
        temperature_c=30.5,
        precipitation_mm=0.0,
        wind_kmh=12.3,
        weather_code=0,
        description="Clear",
    )
    assert w.city == "Mumbai"


def test_weather_data_missing_required():
    with pytest.raises(ValidationError):
        WeatherData(city="Mumbai")  # type: ignore[call-arg]


def test_run_jury_request_empty_id():
    with pytest.raises(ValidationError):
        RunJuryRequest(shipment_id="")


def test_run_jury_request_strips_id():
    r = RunJuryRequest(shipment_id="  SHIP_1  ")
    assert r.shipment_id == "SHIP_1"


def test_register_shipment_body_valid():
    body = RegisterShipmentBody(
        shipment_id="S1",
        supplier_address="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ",
        route="Mumbai→Delhi",
        origin="Mumbai",
        destination="Delhi",
        origin_lat=19.076,
        origin_lon=72.877,
    )
    assert body.shipment_id == "S1"


def test_fund_shipment_resolved_micro():
    b = FundShipmentBuildBody(
        shipment_id="S1",
        amount_algo=1.5,
        buyer_address="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ",
    )
    assert b.resolved_micro() == 1_500_000


def test_submit_signed_txn_requires_one_form():
    with pytest.raises(ValidationError):
        SubmitSignedTxnBody()
    with pytest.raises(ValidationError):
        SubmitSignedTxnBody(signed_txn_b64="abc", signed_txns_b64=["x"])
