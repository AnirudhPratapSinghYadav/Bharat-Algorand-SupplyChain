from algopy import ARC4Contract, BoxMap, String, Account, UInt64, arc4, Global, Txn, gtxn, itxn

class AgriSupplyChainEscrow(ARC4Contract):
    def __init__(self) -> None:
        self.shipments = BoxMap(String, String, key_prefix="shipment_")
        self.shipment_buyers = BoxMap(String, Account, key_prefix="buyer_")
        self.shipment_funds = BoxMap(String, UInt64, key_prefix="funds_")
        self.shipment_suppliers = BoxMap(String, Account, key_prefix="supplier_")
        self.shipment_hashes = BoxMap(String, String, key_prefix="hash_")
        self.shipment_breached = BoxMap(String, UInt64, key_prefix="breach_") # 0=no, 1=yes

    @arc4.baremethod(create="require")
    def create_app(self) -> None:
        """Application creation method."""
        pass

    @arc4.abimethod
    def log_alert(self, message: String) -> None:
        """A simple NoOp method to log an alert, as requested."""
        arc4.emit("Alert", message)

    @arc4.abimethod
    def add_shipment(self, shipment_id: String, supplier: Account) -> None:
        """
        Adds a new shipment to the Box Storage mapping.
        The default status is initialized to "In_Transit".
        """
        assert shipment_id not in self.shipments, "Shipment already exists"
        self.shipments[shipment_id] = String("In_Transit")
        self.shipment_suppliers[shipment_id] = supplier
        self.shipment_breached[shipment_id] = UInt64(0)

    @arc4.abimethod(readonly=True)
    def get_shipment_status(self, shipment_id: String) -> String:
        """Returns the current status of a shipment, or an error if not found."""
        assert shipment_id in self.shipments, "Shipment not found"
        return self.shipments[shipment_id]

    @arc4.abimethod
    def fund_escrow(self, shipment_id: String, payment: gtxn.PaymentTransaction) -> None:
        """
        Accepts ALGO to fund the escrow for a specific shipment.
        """
        assert shipment_id in self.shipments, "Shipment not found"
        assert self.shipments[shipment_id] == String("In_Transit"), "Shipment not in transit"
        assert payment.receiver == Global.current_application_address, "Payment must be to the contract"
        
        # Record buyer and funds (for simplicity, assuming one buyer per shipment)
        if shipment_id not in self.shipment_buyers:
            self.shipment_buyers[shipment_id] = payment.sender
            self.shipment_funds[shipment_id] = payment.amount
        else:
            assert payment.sender == self.shipment_buyers[shipment_id], "Different buyer funding"
            self.shipment_funds[shipment_id] += payment.amount

    @arc4.abimethod
    def report_disaster_delay(self, shipment_id: String, reasoning_hash: String) -> None:
        """
        Oracle (creator) reports a disaster delay. Changes status and refunds 10% to the buyer.
        Stores the AI reasoning hash for cryptographic verification.
        """
        assert Txn.sender == Global.creator_address, "Only oracle can report disaster"
        assert shipment_id in self.shipments, "Shipment not found"
        assert self.shipments[shipment_id] == String("In_Transit"), "Shipment not in transit"
        
        self.shipments[shipment_id] = String("Delayed_Disaster")
        self.shipment_hashes[shipment_id] = reasoning_hash
        self.shipment_breached[shipment_id] = UInt64(1)

    @arc4.abimethod
    def resolve_disaster(self, shipment_id: String, resolution_hash: String) -> None:
        """
        Oracle (creator) resolves a disaster after AI validation of supplier mitigation.
        Reverts status to In_Transit and stores the resolution hash.
        """
        assert Txn.sender == Global.creator_address, "Only oracle can resolve disaster"
        assert shipment_id in self.shipments, "Shipment not found"
        assert self.shipments[shipment_id] == String("Delayed_Disaster"), "Shipment not flagged"
        
        self.shipments[shipment_id] = String("In_Transit")
        self.shipment_hashes[shipment_id] = resolution_hash
        self.shipment_breached[shipment_id] = UInt64(0)
        
        # Refund 10%
        if shipment_id in self.shipment_funds and shipment_id in self.shipment_buyers:
            total_funds = self.shipment_funds[shipment_id]
            refund_amount = total_funds // UInt64(10) # 10%
            
            if refund_amount > UInt64(0):
                buyer = self.shipment_buyers[shipment_id]
                itxn.Payment(
                    receiver=buyer,
                    amount=refund_amount,
                    fee=0
                ).submit()
                
                # Deduct the refunded amount
                self.shipment_funds[shipment_id] -= refund_amount
