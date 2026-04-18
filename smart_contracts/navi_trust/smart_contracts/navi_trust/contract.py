"""Pramanik (प्रमाणिक) — supply chain dispute oracle (Algorand / Puya)."""

from algopy import (
    ARC4Contract,
    Account,
    BoxMap,
    Bytes,
    Global,
    GlobalState,
    String,
    UInt64,
    arc4,
    gtxn,
    itxn,
    Txn,
)

from algopy.arc4 import UInt64 as arc4_UInt64


class NaviTrust(ARC4Contract):
    """
    Pramanik (प्रमाणिक) — Supply Chain Dispute Oracle on Algorand.

    "Pramanik" means verified and authentic in Hindi.
    Buyer locks ALGO. 4-Agent AI jury examines evidence.
    Verdict is immutable on-chain. Settlement is atomic.

    Box prefix scheme (all keys are prefix + shipment_id bytes):
      st_ = status          (String: In_Transit / Disputed / Settled)
      sp_ = supplier        (Account)
      by_ = buyer           (Account)
      fn_ = funds           (UInt64 microALGO)
      rs_ = risk_score      (UInt64 0-100)
      vd_ = verdict_json    (Bytes)
      rt_ = route           (Bytes)
      ce_ = certificate ASA (UInt64)
      rp_ = supplier rep    (UInt64, key = supplier)
    """

    def __init__(self) -> None:
        self.total_shipments = GlobalState(UInt64)
        self.total_settled = GlobalState(UInt64)
        self.total_disputed = GlobalState(UInt64)
        self.oracle_address = GlobalState(Account)
        self.is_paused = GlobalState(UInt64)

        self.shipment_status = BoxMap(Bytes, String, key_prefix=b"st_")
        self.shipment_supplier = BoxMap(Bytes, Account, key_prefix=b"sp_")
        self.shipment_buyer = BoxMap(Bytes, Account, key_prefix=b"by_")
        self.shipment_funds = BoxMap(Bytes, UInt64, key_prefix=b"fn_")
        self.shipment_risk = BoxMap(Bytes, UInt64, key_prefix=b"rs_")
        self.shipment_verdict = BoxMap(Bytes, Bytes, key_prefix=b"vd_")
        self.shipment_route = BoxMap(Bytes, Bytes, key_prefix=b"rt_")
        self.shipment_cert = BoxMap(Bytes, UInt64, key_prefix=b"ce_")
        self.supplier_rep = BoxMap(Account, UInt64, key_prefix=b"rp_")

    @arc4.baremethod(create="require")
    def create_app(self) -> None:
        self.total_shipments.value = UInt64(0)
        self.total_settled.value = UInt64(0)
        self.total_disputed.value = UInt64(0)
        self.oracle_address.value = Global.creator_address
        self.is_paused.value = UInt64(0)

    @arc4.abimethod
    def register_shipment(
        self,
        shipment_id: arc4.String,
        supplier: Account,
        route: arc4.String,
    ) -> None:
        """Register a new shipment. Oracle only. Cannot re-register."""
        assert Txn.sender == self.oracle_address.value, "Oracle only"
        assert self.is_paused.value == UInt64(0), "Oracle is paused"
        sid = shipment_id.native.bytes
        assert sid not in self.shipment_status, "Shipment already registered"
        self.shipment_status[sid] = String("In_Transit")
        self.shipment_supplier[sid] = supplier
        self.shipment_funds[sid] = UInt64(0)
        self.shipment_risk[sid] = UInt64(0)
        self.shipment_route[sid] = route.native.bytes
        self.total_shipments.value = self.total_shipments.value + UInt64(1)

    @arc4.abimethod
    def fund_shipment(
        self,
        shipment_id: arc4.String,
        payment: gtxn.PaymentTransaction,
    ) -> None:
        """Buyer locks ALGO into escrow. Minimum 0.1 ALGO."""
        assert payment.receiver == Global.current_application_address
        assert payment.amount >= UInt64(100_000), "Minimum 0.1 ALGO"
        sid = shipment_id.native.bytes
        assert sid in self.shipment_status, "Shipment not registered"
        assert self.shipment_status[sid] != String("Settled"), "Cannot fund settled shipment"
        self.shipment_buyer[sid] = payment.sender
        has_funds, current = self.shipment_funds.maybe(sid)
        self.shipment_funds[sid] = (
            current + payment.amount if has_funds else payment.amount
        )

    @arc4.abimethod
    def record_verdict(
        self,
        shipment_id: arc4.String,
        verdict_json: arc4.String,
        risk_score: arc4_UInt64,
    ) -> None:
        """Oracle writes 4-agent jury verdict on-chain. Immutable."""
        assert Txn.sender == self.oracle_address.value, "Oracle only"
        assert self.is_paused.value == UInt64(0), "Oracle is paused"
        sid = shipment_id.native.bytes
        assert sid in self.shipment_status, "Shipment not registered"
        assert self.shipment_status[sid] != String("Settled"), "Cannot record verdict on settled shipment"
        rs = risk_score.native
        old_r = UInt64(0)
        if sid in self.shipment_risk:
            old_r = self.shipment_risk[sid]
        old_status = self.shipment_status[sid]
        self.shipment_verdict[sid] = verdict_json.native.bytes
        self.shipment_risk[sid] = rs
        if rs > UInt64(65):
            self.shipment_status[sid] = String("Disputed")
            if old_r <= UInt64(65) and old_status != String("Disputed"):
                self.total_disputed.value = self.total_disputed.value + UInt64(1)
        else:
            if old_status == String("Disputed"):
                if self.total_disputed.value > UInt64(0):
                    self.total_disputed.value = self.total_disputed.value - UInt64(1)
            self.shipment_status[sid] = String("In_Transit")

    @arc4.abimethod
    def settle_shipment(self, shipment_id: arc4.String) -> arc4_UInt64:
        """
        Atomic settlement:
          1. Pay supplier locked ALGO
          2. Mint ARC-69 settlement certificate NFT (PRAMANIK-CERT)
          3. Update supplier reputation
        Returns certificate ASA ID.
        """
        assert Txn.sender == self.oracle_address.value, "Oracle only"
        sid = shipment_id.native.bytes
        assert sid in self.shipment_status, "Shipment not registered"
        assert self.shipment_status[sid] != String("Settled"), "Shipment already settled"
        assert self.shipment_status[sid] != String(
            "Disputed"
        ), "Cannot settle disputed shipment directly — record cleared verdict first"
        assert sid in self.shipment_verdict, "No verdict recorded — run jury first"
        if sid in self.shipment_cert:
            assert self.shipment_cert[sid] == UInt64(0), "Certificate already minted"

        funds_u = self.shipment_funds[sid]
        assert funds_u > UInt64(0), "No funds locked in escrow"

        supplier = self.shipment_supplier[sid]

        itxn.Payment(
            receiver=supplier,
            amount=funds_u,
            note=Bytes(b"Pramanik: escrow released on verified settlement"),
            fee=UInt64(0),
        ).submit()

        cert = itxn.AssetConfig(
            total=UInt64(1),
            decimals=UInt64(0),
            default_frozen=False,
            asset_name=Bytes(b"PRAMANIK-CERT"),
            unit_name=Bytes(b"PCERT"),
            url=Bytes(b"https://pramanik.vercel.app/verify/"),
            manager=Global.creator_address,
            reserve=Global.creator_address,
            freeze=Global.zero_address,
            clawback=Global.zero_address,
            fee=UInt64(0),
        ).submit()

        cert_id = cert.created_asset.id

        self.shipment_funds[sid] = UInt64(0)
        self.shipment_status[sid] = String("Settled")
        self.shipment_cert[sid] = cert_id
        self.total_settled.value = self.total_settled.value + UInt64(1)

        if supplier in self.supplier_rep:
            acc = self.supplier_rep[supplier]
        else:
            acc = UInt64(50)
        new_rep = acc + UInt64(5)
        if new_rep > UInt64(100):
            self.supplier_rep[supplier] = UInt64(100)
        else:
            self.supplier_rep[supplier] = new_rep

        return arc4_UInt64(cert_id)

    @arc4.abimethod
    def pause_oracle(self) -> None:
        """Pause oracle write paths that check is_paused. Oracle only."""
        assert Txn.sender == self.oracle_address.value, "Oracle only"
        self.is_paused.value = UInt64(1)

    @arc4.abimethod
    def unpause_oracle(self) -> None:
        """Resume oracle operations. Oracle only."""
        assert Txn.sender == self.oracle_address.value, "Oracle only"
        self.is_paused.value = UInt64(0)

    @arc4.abimethod
    def update_oracle(self, new_oracle: Account) -> None:
        """Transfer oracle role. Creator only."""
        assert Txn.sender == Global.creator_address, "Creator only"
        self.oracle_address.value = new_oracle

    @arc4.abimethod(readonly=True)
    def get_required_mbr(self) -> arc4_UInt64:
        """
        Minimum balance required to register one shipment (~9 boxes).
        Conservative estimate: 0.5 ALGO = 500_000 microALGO.
        """
        return arc4_UInt64(UInt64(500_000))

    @arc4.abimethod(readonly=True)
    def get_global_stats(
        self,
    ) -> arc4.Tuple[arc4_UInt64, arc4_UInt64, arc4_UInt64, arc4_UInt64]:
        """Returns (total_shipments, total_settled, total_disputed, is_paused)."""
        return arc4.Tuple(
            (
                arc4_UInt64(self.total_shipments.value),
                arc4_UInt64(self.total_settled.value),
                arc4_UInt64(self.total_disputed.value),
                arc4_UInt64(self.is_paused.value),
            )
        )
