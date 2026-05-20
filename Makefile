.PHONY: test test-unit test-integration test-e2e test-all

test test-unit:
	pytest tests/unit tests/test_protocol_api.py -v --tb=short

test-integration:
	pytest tests/integration -v --tb=short --timeout=120 -m testnet

test-e2e:
	pytest tests/e2e -v --tb=short --timeout=300 -m "e2e and testnet"

test-all:
	pytest tests/ -v --tb=short --timeout=300
