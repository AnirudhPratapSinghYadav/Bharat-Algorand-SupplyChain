# Pramanik: install contract deps, then bootstrap new oracle + APP_ID on TestNet.
# From repo root:
#   .\scripts\setup_testnet.ps1
# If automatic funding fails, fund the printed address, then:
#   python scripts\bootstrap_testnet_oracle.py --skip-fund
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
Push-Location (Join-Path $Root "smart_contracts\navi_trust")
try {
    poetry install
} finally {
    Pop-Location
}
python (Join-Path $Root "scripts\bootstrap_testnet_oracle.py") @args
