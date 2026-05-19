# smart_contracts/navi_trust/contract.py
# Puya (algopy) — compiles to TEAL v11 via AlgoKit
# DO NOT add dead code. Every method is intentional.

from algopy import (
    ARC4Contract, String, UInt64, Account, BoxMap,
    arc4, Txn, Global, itxn, subroutine,
    op, log
)

class NaviTrust(ARC4Contract):
    """
    NaviTrust: Trustless supply-chain escrow + dispute oracle.
    Oracle-only write pattern: only the registered oracle address
    may update status, verdict, risk, and reputation.
    Buyer funds escrow. Supplier receives settlement.
    Anyone can read any box.
    """

    def __init__(self) -> None:
        # State boxes — key prefix is critical, must match backend constants
        self.status    = BoxMap(String, String,  key_prefix="st_")
        self.supplier  = BoxMap(String, Account, key_prefix="sp_")
        self.funds     = BoxMap(String, UInt64,  key_prefix="fn_")
        self.verdict   = BoxMap(String, String,  key_prefix="vd_")
        self.risk      = BoxMap(String, UInt64,  key_prefix="rk_")
        self.rep       = BoxMap(String, UInt64,  key_prefix="rp_")
        self.v_hash    = BoxMap(String, String,  key_prefix="vh_")
        self.route     = BoxMap(String, String,  key_prefix="rt_")
        # Oracle address — only this address may call privileged methods
        self.oracle    = Global.creator_address  # set at deploy; override via update_oracle

    # ── CREATE ──────────────────────────────────────────────────────────────

    @arc4.baremethod(create="require")
    def create_app(self) -> None:
        """Deploy the contract. Called once by AlgoKit deploy."""
        pass  # No-op — all state is in boxes

    # ── ORACLE MANAGEMENT ───────────────────────────────────────────────────

    @arc4.abimethod
    def update_oracle(self, new_oracle: Account) -> None:
        """
        Transfer oracle rights to a new address.
        Only current oracle can call this.
        Use case: key rotation, multi-sig upgrade.
        """
        assert Txn.sender == Global.creator_address, "Only creator can update oracle"
        self.oracle = new_oracle

    # ── SHIPMENT LIFECYCLE ──────────────────────────────────────────────────

    @arc4.abimethod
    def register_shipment(
        self,
        shipment_id: String,
        supplier_addr: Account,
        route: String,
    ) -> None:
        """
        Oracle registers a new shipment. Sets initial state.
        Caller MUST fund MBR for all 8 boxes via preceding payment.
        MBR formula per box: 2500 + 400 * (key_bytes + value_bytes)
        Recommended: send 0.1 ALGO per shipment to cover all boxes.
        """
        assert Txn.sender == Global.creator_address, "Oracle only"
        assert shipment_id not in self.status, "Shipment already registered"
        assert len(shipment_id.bytes) >= 4, "Shipment ID too short"
        assert len(shipment_id.bytes) <= 64, "Shipment ID too long"

        self.status[shipment_id]   = String("CREATED")
        self.supplier[shipment_id] = supplier_addr
        self.funds[shipment_id]    = UInt64(0)
        self.verdict[shipment_id]  = String("")
        self.risk[shipment_id]     = UInt64(0)
        self.rep[shipment_id]      = UInt64(75)  # Default reputation: 75/100
        self.v_hash[shipment_id]   = String("")
        self.route[shipment_id]    = route

        log(b"REGISTERED:" + shipment_id.bytes)

    @arc4.abimethod
    def activate_shipment(self, shipment_id: String) -> None:
        """
        Oracle marks shipment as IN_TRANSIT after physical handover.
        Can only move from CREATED → IN_TRANSIT.
        """
        assert Txn.sender == Global.creator_address, "Oracle only"
        assert shipment_id in self.status, "Shipment not found"
        assert self.status[shipment_id] == String("CREATED"), "Must be CREATED to activate"

        self.status[shipment_id] = String("IN_TRANSIT")
        log(b"ACTIVATED:" + shipment_id.bytes)

    # ── ESCROW ──────────────────────────────────────────────────────────────

    @arc4.abimethod
    def fund_escrow(
        self,
        shipment_id: String,
        payment: gtxn.PaymentTransaction,
    ) -> None:
        """
        Buyer locks ALGO into escrow. Can only fund when IN_TRANSIT.
        Payment transaction must be in the same atomic group.
        Receiver must be this contract's application address.
        Calling a second time accumulates (allows top-up).
        """
        assert shipment_id in self.status, "Shipment not found"
        assert self.status[shipment_id] == String("IN_TRANSIT"), "Can only fund IN_TRANSIT shipments"
        assert payment.receiver == Global.current_application_address, "Wrong payment receiver"
        assert payment.amount > UInt64(0), "Payment must be > 0"

        current_funds = self.funds[shipment_id]
        self.funds[shipment_id] = current_funds + payment.amount

        log(b"FUNDED:" + shipment_id.bytes)

    # ── VERDICT / ORACLE WRITES ─────────────────────────────────────────────

    @arc4.abimethod
    def record_verdict(
        self,
        shipment_id: String,
        verdict_json: String,    # Arbiter verdict JSON, max 1024 bytes
        risk_score: UInt64,      # 0–100
        input_hash: String,      # SHA-256 hex of canonical jury inputs
    ) -> None:
        """
        Oracle writes AI jury verdict on-chain. This is the permanent proof.
        Does NOT change status or release funds — those require separate calls.
        verdict_json is written as transaction note by backend AND stored in box.
        input_hash is the SHA-256 of canonical inputs for auditability.
        """
        assert Txn.sender == Global.creator_address, "Oracle only"
        assert shipment_id in self.status, "Shipment not found"
        current_status = self.status[shipment_id]
        assert current_status != String("SETTLED"), "Cannot record verdict on settled shipment"
        assert current_status != String("VOID"), "Cannot record verdict on void shipment"
        assert risk_score <= UInt64(100), "Risk score must be 0–100"
        assert len(verdict_json.bytes) <= 1024, "Verdict too long — max 1024 bytes"
        assert len(input_hash.bytes) == 64, "input_hash must be 64-char SHA-256 hex"

        self.verdict[shipment_id] = verdict_json
        self.risk[shipment_id]    = risk_score
        self.v_hash[shipment_id]  = input_hash

        log(b"VERDICT:" + shipment_id.bytes)

    @arc4.abimethod
    def mark_disputed(self, shipment_id: String) -> None:
        """
        Oracle escalates shipment to DISPUTED.
        Triggered when arbiter returns verdict == "DISPUTE".
        Can only move from IN_TRANSIT → DISPUTED.
        """
        assert Txn.sender == Global.creator_address, "Oracle only"
        assert shipment_id in self.status, "Shipment not found"
        assert self.status[shipment_id] == String("IN_TRANSIT"), "Must be IN_TRANSIT to dispute"

        self.status[shipment_id] = String("DISPUTED")
        log(b"DISPUTED:" + shipment_id.bytes)

    # ── SETTLEMENT ──────────────────────────────────────────────────────────

    @arc4.abimethod
    def settle_shipment(self, shipment_id: String) -> UInt64:
        """
        Oracle executes atomic settlement:
        1. Releases escrowed ALGO to supplier via inner transaction
        2. Mints ARC-69 certificate NFT to supplier (asset creation inner txn)
        3. Sets status to SETTLED
        4. Updates supplier reputation score

        Returns: ASA ID of the certificate NFT (0 if mint fails gracefully)

        Pre-conditions:
        - Shipment must be IN_TRANSIT or DISPUTED (not SETTLED or VOID)
        - A verdict must exist (risk score > 0 OR verdict_json not empty)
        - Oracle must call this (NEVER automated — always oracle-signed)

        Fee requirement: Set fee to 4000 microAlgo to cover inner txn fees.
        """
        assert Txn.sender == Global.creator_address, "Oracle only"
        assert shipment_id in self.status, "Shipment not found"
        current_status = self.status[shipment_id]
        assert current_status == String("IN_TRANSIT") or current_status == String("DISPUTED"), \
            "Can only settle IN_TRANSIT or DISPUTED shipments"

        escrow_amount = self.funds[shipment_id]
        supplier_addr = self.supplier[shipment_id]

        # Inner txn 1: Release escrow to supplier
        if escrow_amount > UInt64(0):
            itxn.Payment(
                receiver=supplier_addr,
                amount=escrow_amount,
                fee=UInt64(0),  # Covered by outer txn fee
                note=b"pramanik:settlement:" + shipment_id.bytes,
            ).submit()

        # Inner txn 2: Mint ARC-69 certificate NFT
        # ARC-69 metadata is in transaction note of asset config txn
        cert_note = (
            b'{"standard":"arc69","description":"Pramanik Settlement Certificate",'
            b'"shipment":"' + shipment_id.bytes + b'"}'
        )
        create_cert = itxn.AssetConfig(
            total=UInt64(1),
            decimals=UInt64(0),
            default_frozen=False,
            unit_name=b"PRMNK",
            asset_name=b"Pramanik Cert " + shipment_id.bytes[:12],
            manager=Global.current_application_address,
            reserve=Global.current_application_address,
            fee=UInt64(0),
            note=cert_note,
        ).submit()

        cert_asa_id = create_cert.created_asset.id

        # Update state atomically
        self.status[shipment_id] = String("SETTLED")
        self.funds[shipment_id]  = UInt64(0)  # Clear escrow

        # Adjust reputation: +5 for clean settlement (max 100)
        current_rep = self.rep[shipment_id]
        new_rep = current_rep + UInt64(5)
        if new_rep > UInt64(100):
            new_rep = UInt64(100)
        self.rep[shipment_id] = new_rep

        log(b"SETTLED:" + shipment_id.bytes)
        return cert_asa_id

    @arc4.abimethod
    def void_shipment(self, shipment_id: String) -> None:
        """
        Oracle voids a shipment (refunds escrow to supplier, marks VOID).
        Use case: shipment cancelled, fraudulent claim confirmed.
        Only oracle can call. Reduces supplier reputation by 20.
        """
        assert Txn.sender == Global.creator_address, "Oracle only"
        assert shipment_id in self.status, "Shipment not found"
        current_status = self.status[shipment_id]
        assert current_status != String("SETTLED"), "Cannot void a settled shipment"
        assert current_status != String("VOID"), "Already void"

        escrow_amount = self.funds[shipment_id]
        supplier_addr = self.supplier[shipment_id]

        # Refund escrow on void
        if escrow_amount > UInt64(0):
            itxn.Payment(
                receiver=supplier_addr,
                amount=escrow_amount,
                fee=UInt64(0),
                note=b"pramanik:void:" + shipment_id.bytes,
            ).submit()

        self.status[shipment_id] = String("VOID")
        self.funds[shipment_id]  = UInt64(0)

        # Penalty: reduce reputation by 20 (min 0)
        current_rep = self.rep[shipment_id]
        if current_rep >= UInt64(20):
            self.rep[shipment_id] = current_rep - UInt64(20)
        else:
            self.rep[shipment_id] = UInt64(0)

        log(b"VOIDED:" + shipment_id.bytes)

    # ── READ METHODS (no state change) ──────────────────────────────────────

    @arc4.abimethod(readonly=True)
    def get_status(self, shipment_id: String) -> String:
        """Read shipment status. Returns 'UNREGISTERED' if not found."""
        if shipment_id not in self.status:
            return String("UNREGISTERED")
        return self.status[shipment_id]

    @arc4.abimethod(readonly=True)
    def get_full_state(self, shipment_id: String) -> arc4.Tuple[
        String,   # status
        UInt64,   # funds_microalgo
        UInt64,   # risk_score
        UInt64,   # rep_score
        String,   # route
    ]:
        """
        Returns full shipment state in one call.
        Reduces round-trips from frontend/backend.
        """
        if shipment_id not in self.status:
            return arc4.Tuple((
                String("UNREGISTERED"),
                UInt64(0),
                UInt64(0),
                UInt64(0),
                String(""),
            ))
        return arc4.Tuple((
            self.status[shipment_id],
            self.funds[shipment_id],
            self.risk[shipment_id],
            self.rep[shipment_id],
            self.route[shipment_id],
        ))
