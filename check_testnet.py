import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

addr = 'ILLYWLTX7HQMX25YW3LCKEVD34ZULSCXGXEWKS37O2VA5XYY34ZU'
providers = [
    'https://testnet-api.algonode.cloud',
    'https://testnet-api.4160.nodely.io'
]

print(f"Checking address: {addr}\n")

for url in providers:
    try:
        r = requests.get(f"{url}/v2/accounts/{addr}", verify=False, timeout=10)
        if r.status_code == 200:
            print(f"SUCCESS {url}: Balance = {r.json().get('amount', 0)} microAlgos")
        else:
            print(f"FAILED {url}: Status {r.status_code} - {r.text}")
    except Exception as e:
        print(f"ERROR {url}: {e}")
