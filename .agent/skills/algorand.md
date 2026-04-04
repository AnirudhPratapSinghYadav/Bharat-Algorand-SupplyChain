---
description: testnet config, algod client setup
---
# Algorand Setup
- Network: Testnet
- Algod: `https://testnet-api.algonode.cloud`
- Indexer: `https://testnet-idx.algonode.cloud`
- Port: `443`, Token: `""`
- Use `AlgorandClient` from `@algorandfoundation/algokit-utils`.
- All blockchain calls go ONLY in `src/services/algorand.ts`.
