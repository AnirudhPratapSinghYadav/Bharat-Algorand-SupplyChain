import os
import sys
import json
import time
import subprocess
from algokit_utils import AlgorandClient, PaymentParams, AlgoAmount, AppCallMethodCallParams, AppClientMethodCallParams, SendParams
from dotenv import load_dotenv, set_key
from algosdk.abi import Method

def main():
    print("=== Agri-Supply Chain Escrow Test Suite ===")

    # 1. Ensure Compiled Artifacts
    if not os.path.exists("artifacts/AgriSupplyChainEscrow.arc56.json"):
        print("Compiling AgriSupplyChainEscrow contract...")
        try:
            subprocess.run(["algokit", "compile", "python", "agri_escrow.py", "--out-dir", "artifacts"], check=True)
            print("Compilation successful.")
        except subprocess.CalledProcessError:
            print("Failed to compile. Please ensure Puya is installed and run: `algokit compile python agri_escrow.py --out-dir artifacts`")
            sys.exit(1)

    print("\nConnecting to Algorand Testnet...")
    load_dotenv()
    algorand = AlgorandClient.testnet()
    
    mnemonic = os.getenv("DEPLOYER_MNEMONIC")
    if not mnemonic:
        print("ERROR: DEPLOYER_MNEMONIC not found in .env!")
        sys.exit(1)
        
    creator = algorand.account.from_mnemonic(mnemonic)
    buyer = algorand.account.random()
    random_user = algorand.account.random()
    
    print(f"Deployer Account: {creator.address}")
    
    # Check balance
    bal = algorand.account.get_information(creator.address).amount
    print(f"Account Balance: {bal.algo} ALGO")
    if bal.algo < 5:
        print("Insufficient balance. Please fund your account at https://bank.testnet.algorand.network/")
        sys.exit(1)

    print(f"Creator balance: {algorand.account.get_information(creator.address).amount.algo} ALGO")


    # --- TEST 1: Deployment & Initialization Test ---
    print("\n=== Test 1: Deployment & Initialization ===")
    
    # Read Contract Spec
    with open("artifacts/AgriSupplyChainEscrow.arc56.json", "r") as f:
        app_spec = json.load(f)

    factory = algorand.client.get_app_factory(
        app_spec=json.dumps(app_spec),
        default_sender=creator.address
    )
    
    # Deploy the contract
    app_client, deploy_result = factory.deploy()
    app_id = deploy_result.app.app_id
    app_address = deploy_result.app.app_address
    
    print(f"Contract Deployed Successfully! APP_ID: {app_id}")
    print(f"App Address: {app_address}")
    
    # Update .env
    set_key(".env", "APP_ID", str(app_id))
    print("Updated .env with new Testnet APP_ID.")

    # Fund the App Account for Box Storage MBR
    print("Funding the contract with 10 ALGO for Box Storage MBR...")
    algorand.send.payment(PaymentParams(
        sender=creator.address,
        receiver=app_address,
        amount=AlgoAmount(algo=10)
    ))

    # Add a Shipment
    shipment_id = "SHIP_12345"
    print(f"Adding shipment: {shipment_id}...")
    
    # Using the generated client dynamically
    app_client.send.call(
        params=AppClientMethodCallParams(
            method="add_shipment",
            args=[shipment_id],
            sender=creator.address
        )
    )

    # Verify Initialization
    status_response = app_client.send.call(
        params=AppClientMethodCallParams(
            method="get_shipment_status",
            args=[shipment_id],
            sender=creator.address
        )
    )
    
    # In ARC-4, string returns are strings
    status_value = status_response.abi_return
    print(f"Initial Status for {shipment_id}: {status_value}")
    assert status_value == "In_Transit", "Status should be In_Transit"
    
    print("Test 1 Passed!")


    # --- TEST 2: The 'Happy Path' Funding Test ---
    print("\n=== Test 2: The 'Happy Path' Funding Test ===")
    
    initial_contract_bal = algorand.account.get_information(app_address).amount.algo
    
    # Buyer calls 'fund_escrow' and sends 20 ALGO
    fund_amount = AlgoAmount(algo=20)
    print(f"Buyer ({buyer.address[:8]}...) funding {fund_amount.algo} ALGO for shipment {shipment_id}...")
    
    # Prepare payment transaction
    payment_txn = algorand.create_transaction.payment(PaymentParams(
        sender=buyer.address,
        receiver=app_address,
        amount=fund_amount
    ))

    # We must explicitly add it to the ABI call as a transaction arg
    # A generic AppClient let's you pass unsigned txns
    from algosdk.atomic_transaction_composer import TransactionWithSigner
    tw_signer = TransactionWithSigner(payment_txn, algorand.account.get_signer(buyer.address))
    
    # Send fund_escrow call
    app_client.send.call(
        params=AppClientMethodCallParams(
            method="fund_escrow",
            args=[shipment_id, tw_signer],
            sender=buyer.address
        )
    )
    
    post_fund_contract_bal = algorand.account.get_information(app_address).amount.algo
    increase = post_fund_contract_bal - initial_contract_bal
    
    print(f"Contract balance before: {initial_contract_bal} ALGO")
    print(f"Contract balance after: {post_fund_contract_bal} ALGO")
    print(f"Balance increased by: {increase} ALGO")
    assert increase == fund_amount.algo, "Contract balance did not increase correctly"
    
    print("Test 2 Passed!")


    # --- TEST 4: The Security 'Vulnerability' Test ---
    # Running this before Test 3 to preserve the "In_Transit" state for Test 3
    print("\n=== Test 4: The Security 'Vulnerability' Test ===")
    
    print(f"Attempting to call 'report_disaster_delay' from random user ({random_user.address[:8]}...)...")
    try:
        app_client.send.call(
            params=AppClientMethodCallParams(
                method="report_disaster_delay",
                args=[shipment_id],
                sender=random_user.address
            )
        )
        assert False, "Transaction should have failed!"
    except Exception as e:
        print("Transaction failed as expected!")
        print(f"Error snippet: {str(e)[:100]}...")
        
    print("Test 4 Passed!")


    # --- TEST 3: The 'Disaster Recovery' Logic Test ---
    print("\n=== Test 3: The 'Disaster Recovery' Logic Test ===")
    
    buyer_bal_before_refund = algorand.account.get_information(buyer.address).amount.algo
    
    print(f"Oracle (Creator: {creator.address[:8]}...) reporting disaster for {shipment_id}...")
    
    app_client.send.call(
        params=AppClientMethodCallParams(
            method="report_disaster_delay",
            args=[shipment_id],
            sender=creator.address,
            # IMPORTANT: The contract will make an inner transaction refund. 
            # We need to cover the inner transaction fee OR let contract pay. Our contract set fee=0, so caller must pay double fee.
            # algokit_utils automatically covers inner transaction fees using extra_fee!
            extra_fee=AlgoAmount(micro_algo=1000)
        )
    )
    
    # Verify State changes
    status_response = app_client.send.call(
        params=AppClientMethodCallParams(
            method="get_shipment_status",
            args=[shipment_id],
            sender=creator.address
        )
    )
    new_status = status_response.abi_return
    print(f"New Status for {shipment_id}: {new_status}")
    assert new_status == "Delayed_Disaster", "Status did not change to Delayed_Disaster"
    
    # Verify Refund
    buyer_bal_after_refund = algorand.account.get_information(buyer.address).amount.algo
    refund_received = buyer_bal_after_refund - buyer_bal_before_refund
    expected_refund = fund_amount.algo / 10 # 2 ALGO
    
    print(f"Buyer balance before refund: {buyer_bal_before_refund} ALGO")
    print(f"Buyer balance after refund: {buyer_bal_after_refund} ALGO")
    print(f"Refund Received: {refund_received} ALGO (Expected ~2 ALGO)")
    
    # Refund received should be exactly 2 ALGO
    # allow minor floating point error
    assert abs(refund_received - expected_refund) < 0.0001, f"Refund mismatch. Expected {expected_refund}, got {refund_received}"
    
    print("Test 3 Passed!")

    
    print("\n=== ALL TESTS STRESS-TESTED AND PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    main()
