# Pramanik — on-chain proof (Lora)

This file is **generated** when you run:

```bash
python seed_blockchain.py
```

or refreshed with:

```bash
python tools/refresh_lora_proof.py
```

Until then, there are no pinned transaction links here. After deploy, set **`APP_ID`** (and optional **`LORA_BASE_URL`**) in `.env` / `config.json`. Demo shipment IDs come from **`demo_shipments`** in `config.json` (also exposed as `GET /config`).

## Application

Use: `{lora_base_url}/application/{APP_ID}` (for example `https://lora.algokit.io/testnet/application/<your_app_id>`).

## ARC-28

Upgraded NaviTrust emits structured **ShipmentEvent** logs (`REGISTERED`, `FUNDED`, `VERDICT`, `SETTLED`, `VOID`). Inspect transaction logs on Lora for your deployed `APP_ID`.
