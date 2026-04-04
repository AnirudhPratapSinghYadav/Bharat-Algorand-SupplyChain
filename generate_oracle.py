"""Generate a new Algorand account and print its 25-word mnemonic (add to .env as ORACLE_MNEMONIC)."""

from algosdk import account, mnemonic as mn

if __name__ == "__main__":
    sk, addr = account.generate_account()
    words = mn.from_private_key(sk)
    print("Address:", addr)
    print("ORACLE_MNEMONIC=" + words)
    print("\nFund testnet: https://bank.testnet.algorand.network/")
