import os
from pathlib import Path


TEST_DB = Path(__file__).parent / "test-cezar.db"
if TEST_DB.exists():
    TEST_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["ENVIRONMENT"] = "test"
os.environ["PAYMENT_MODE"] = "mock"
os.environ["ADMIN_TOKEN"] = "test-admin-token-long-enough"
os.environ["PAYMENT_WEBHOOK_SECRET"] = "test-webhook-secret"
os.environ["PUBLIC_BASE_URL"] = "http://testserver"
