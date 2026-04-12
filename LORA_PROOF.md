# Navi-Trust — on-chain proof (Lora)

Fill this file **after** you deploy and run `python seed_blockchain.py`. Replace every `YOUR_*` placeholder with values from your terminal and from [Lora](https://lora.algokit.io/testnet).

## Application

- **App:** `https://lora.algokit.io/testnet/application/YOUR_APP_ID`
- **Contract account (escrow balance):** `https://lora.algokit.io/testnet/account/YOUR_APP_ADDRESS`

---

## SHIP_MUMBAI_001 — in transit, 2 ALGO locked

| Step     | Lora link |
|----------|-----------|
| Register | `https://lora.algokit.io/testnet/transaction/YOUR_REGISTER_TX` |
| Fund     | `https://lora.algokit.io/testnet/transaction/YOUR_FUND_TX`     |

---

## SHIP_CHEN_002 — disputed, 3 ALGO locked, risk 87

| Step     | Lora link |
|----------|-----------|
| Register | `https://lora.algokit.io/testnet/transaction/YOUR_REGISTER_TX` |
| Fund     | `https://lora.algokit.io/testnet/transaction/YOUR_FUND_TX`     |
| Verdict  | `https://lora.algokit.io/testnet/transaction/YOUR_VERDICT_TX`  |

**Check:** open the verdict transaction → **Note** tab → JSON should include `"type":"NAVI_VERDICT"`.

---

## SHIP_DELHI_003 — settled, certificate minted

| Step        | Lora link |
|-------------|-----------|
| Register    | `https://lora.algokit.io/testnet/transaction/YOUR_REGISTER_TX` |
| Fund        | `https://lora.algokit.io/testnet/transaction/YOUR_FUND_TX`     |
| Verdict     | `https://lora.algokit.io/testnet/transaction/YOUR_VERDICT_TX`  |
| Settle      | `https://lora.algokit.io/testnet/transaction/YOUR_SETTLE_TX`   |
| Cert (ASA)  | `https://lora.algokit.io/testnet/asset/YOUR_ASA_ID`              |

**Check:** open the settle transaction → **Inner transactions** → (1) payment to supplier, (2) asset config creating **NAVI-CERT** / **NCERT**.

---

## Quick verification commands

```bash
curl -s http://127.0.0.1:12445/stats
# Expect total_shipments=3, total_settled=1, total_disputed=1, escrow_total_algo ≈ sum of locked ALGO
```

```bash
curl -s "http://127.0.0.1:12445/shipment/SHIP_DELHI_003"
# Expect certificate_asa set after successful settle
```

---

## Method selectors (from `artifacts/NaviTrust.arc56.json`)

Regenerate any time you rebuild the contract:

```bash
python -c "import json,hashlib; a=json.load(open('artifacts/NaviTrust.arc56.json')); \
[print(hashlib.new('sha512_256', (m['name']+'('+','.join(x['type'] for x in m.get('args',[]))+')'+m.get('returns',{}).get('type','void')).encode()).digest()[:4].hex(), m['name']) for m in a['methods']]"
```

These must match `ARC4_SELECTOR_TO_METHOD` / `verification.py` decoding (return type included in the signature string).
