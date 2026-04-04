# Navi-Trust toolchain (local)

Use **your machine’s current Algokit CLI** — do not vendor an old copy in this repo.

## Verified on this laptop (upgrade anytime)

```bash
algokit --version    # e.g. 2.10.2
python -m pip install -U algokit algokit-utils py-algorand-sdk vibekit
```

- **Algokit** (PyPI `algokit`): CLI for `algokit project run build`, deploy, localnet.
- **algokit-utils**: Python library used by [`app.py`](app.py) (`AlgorandClient`).
- **VibeKit** (PyPI `vibekit` 0.1.0): optional AI/agent helpers; install via [`requirements-dev.txt`](requirements-dev.txt).

## Repo layout

- Runtime API dependencies: [`requirements.txt`](requirements.txt) (Railway/production).
- Local smart-contract + agent tooling: [`requirements-dev.txt`](requirements-dev.txt).

- **AlgoKit**: project config is `smart_contracts/navi_trust/.algokit.toml` (run builds from that directory).
- **VibeKit**: PyPI package is optional (`requirements-dev.txt`). Repo-local layout for agents is documented in `vibekit.repo.json` (paths only; no secrets).

## Smart contract build (AlgoKit)

From the contract project directory:

```bash
cd smart_contracts/navi_trust
poetry install
algokit project run build
```

The FastAPI backend reads **`artifacts/NaviTrust.arc56.json` at the repo root**. After a successful build, refresh that file from the project output (same content as `smart_contracts/navi_trust/smart_contracts/artifacts/navi_trust/NaviTrust.arc56.json`).
