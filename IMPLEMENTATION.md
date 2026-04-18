# Navi-Trust — implementation index

This file is a short index for reviewers. The **canonical overview** is [README.md](./README.md). **On-chain proof links** are maintained in [LORA_PROOF.md](./LORA_PROOF.md) (regenerate with `python tools/refresh_lora_proof.py` after deployments).

- **Backend:** `app.py` (FastAPI), `algorand_client.py` (chain I/O), `models.py` (Pydantic)
- **Contract:** `smart_contracts/navi_trust/smart_contracts/navi_trust/contract.py`
- **Seed / demo:** `seed_blockchain.py`
- **Chain helpers:** `verification.py` (standalone algod/indexer checks; optional tooling)
- **Tests:** `tests/` — run `pytest tests/ -q`
