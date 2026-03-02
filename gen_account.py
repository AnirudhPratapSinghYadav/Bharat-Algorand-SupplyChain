from algosdk import account, mnemonic
from dotenv import set_key, load_dotenv
import os

def generate():
    pk, addr = account.generate_account()
    m = mnemonic.from_private_key(pk)
    
    # Save to a temporary file for the user to see separately if needed
    with open("TESTNET_ADDRESS.txt", "w") as f:
        f.write(f"ADDR: {addr}\n")
        f.write(f"MNEMONIC: {m}\n")
    
    # Update .env
    set_key(".env", "DEPLOYER_MNEMONIC", m)
    print(f"NEW_TESTNET_ADDR: {addr}")

if __name__ == "__main__":
    generate()
