"""Navi-Trust — supply chain shipment state on Algorand (testnet). Oracle = app creator."""

from algopy import ARC4Contract, Account, BoxMap, String, UInt64, arc4, Global, Txn, gtxn, itxn


class NaviTrust(ARC4Contract):
    def __init__(self) -> None:
        self.shipment_status = BoxMap(String, String, key_prefix="st_")
        self.shipment_supplier = BoxMap(String, Account, key_prefix="sp_")
        self.shipment_buyer = BoxMap(String, Account, key_prefix="by_")
        self.shipment_funds = BoxMap(String, UInt64, key_prefix="fn_")
        self.shipment_risk = BoxMap(String, UInt64, key_prefix="rk_")
        self.shipment_verdict = BoxMap(String, String, key_prefix="vd_")
        self.shipment_route = BoxMap(String, String, key_prefix="rt_")

    @arc4.baremethod(create="require")
    def create_app(self) -> None:
        pass

    @arc4.abimethod
    def register_shipment(
        self, shipment_id: String, supplier: Account, route: String
    ) -> None:
        assert shipment_id not in self.shipment_status, "Shipment exists"
        self.shipment_status[shipment_id] = String("In_Transit")
        self.shipment_supplier[shipment_id] = supplier
        self.shipment_funds[shipment_id] = UInt64(0)
        self.shipment_risk[shipment_id] = UInt64(0)
        self.shipment_verdict[shipment_id] = String("")
        self.shipment_route[shipment_id] = route

    @arc4.abimethod
    def fund_shipment(
        self, shipment_id: String, payment: gtxn.PaymentTransaction
    ) -> None:
        assert shipment_id in self.shipment_status, "Unknown shipment"
        assert payment.receiver == Global.current_application_address
        assert payment.amount >= UInt64(500_000), "Min 0.5 ALGO"
        if shipment_id not in self.shipment_buyer:
            self.shipment_buyer[shipment_id] = payment.sender
            self.shipment_funds[shipment_id] = payment.amount
        else:
            assert payment.sender == self.shipment_buyer[shipment_id], "Buyer mismatch"
            self.shipment_funds[shipment_id] += payment.amount

    @arc4.abimethod
    def record_verdict(
        self, shipment_id: String, verdict_json: String, risk_score: UInt64
    ) -> None:
        assert Txn.sender == Global.creator_address, "Oracle only"
        assert shipment_id in self.shipment_status, "Unknown shipment"
        self.shipment_verdict[shipment_id] = verdict_json
        self.shipment_risk[shipment_id] = risk_score
        if risk_score > UInt64(65):
            self.shipment_status[shipment_id] = String("Disputed")
        else:
            self.shipment_status[shipment_id] = String("In_Transit")

    @arc4.abimethod
    def settle_shipment(self, shipment_id: String) -> UInt64:
        assert Txn.sender == Global.creator_address, "Oracle only"
        assert shipment_id in self.shipment_status, "Unknown shipment"
        funds = self.shipment_funds[shipment_id]
        supplier = self.shipment_supplier[shipment_id]
        cert_placeholder = UInt64(0)
        if funds > UInt64(0):
            itxn.Payment(
                receiver=supplier,
                amount=funds,
                fee=0,
            ).submit()
            self.shipment_funds[shipment_id] = UInt64(0)
            cert_placeholder = UInt64(1)
        self.shipment_status[shipment_id] = String("Settled")
        return cert_placeholder

    @arc4.abimethod(readonly=True)
    def get_shipment(self, shipment_id: String) -> arc4.Tuple[String, UInt64, UInt64, String]:
        if shipment_id not in self.shipment_status:
            return arc4.Tuple(
                (String("Not_Found"), UInt64(0), UInt64(0), String(""))
            )
        return arc4.Tuple(
            (
                self.shipment_status[shipment_id],
                self.shipment_funds[shipment_id],
                self.shipment_risk[shipment_id],
                self.shipment_route[shipment_id],
            )
        )

    @arc4.abimethod(readonly=True)
    def get_global_stats(self) -> arc4.Tuple[UInt64, UInt64, UInt64]:
        """Placeholder counts — full enumeration is off-chain via boxes."""
        return arc4.Tuple((UInt64(0), UInt64(0), UInt64(0)))
