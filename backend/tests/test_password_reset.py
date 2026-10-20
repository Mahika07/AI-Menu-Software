import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./password_reset_test.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-characters")
os.environ.setdefault("GEMINI_API_KEY", "test")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("API_HOST", "localhost")
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "")
os.environ.setdefault("CLOUDINARY_API_KEY", "")
os.environ.setdefault("CLOUDINARY_API_SECRET", "")

from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
import logging
import urllib.error

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password, verify_password
from app.database.base import Base
from app.database.connection import get_db
from app.main import app
from app.models import User, PasswordResetToken
from app.routes import auth as auth_routes

_real_send_password_reset_email = auth_routes._send_password_reset_email


@pytest.fixture
def client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr("app.routes.auth._send_password_reset_email", lambda email, token: None)
    with TestClient(app) as test_client:
        yield test_client, TestingSession
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def make_user(session_factory):
    db = session_factory()
    user = User(email="owner@example.com", password_hash=hash_password("old-password-123"), is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    user_id = user.id
    db.close()
    return user_id


def store_token(session_factory, user_id, token, expires_at):
    db = session_factory()
    db.add(PasswordResetToken(
        user_id=user_id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=expires_at,
        created_at=datetime.now(timezone.utc),
    ))
    db.commit()
    db.close()


def test_invalid_token_is_rejected(client):
    http, _ = client
    response = http.post("/auth/reset-password", json={"token": "x" * 32, "new_password": "new-password-123"})
    assert response.status_code == 400


def test_expired_token_is_rejected(client):
    http, sessions = client
    user_id = make_user(sessions)
    store_token(sessions, user_id, "expired-token-value-123456789012", datetime.now(timezone.utc) - timedelta(minutes=1))
    response = http.post("/auth/reset-password", json={"token": "expired-token-value-123456789012", "new_password": "new-password-123"})
    assert response.status_code == 400


def test_successful_reset_consumes_token_and_changes_password(client):
    http, sessions = client
    user_id = make_user(sessions)
    token = "single-use-token-value-123456789"
    store_token(sessions, user_id, token, datetime.now(timezone.utc) + timedelta(minutes=30))
    response = http.post("/auth/reset-password", json={"token": token, "new_password": "new-password-123"})
    assert response.status_code == 200
    db = sessions()
    user = db.query(User).filter(User.id == user_id).one()
    assert verify_password("new-password-123", user.password_hash)
    assert db.query(PasswordResetToken).count() == 0
    db.close()


def test_token_cannot_be_reused(client):
    http, sessions = client
    user_id = make_user(sessions)
    token = "single-use-token-value-123456789"
    store_token(sessions, user_id, token, datetime.now(timezone.utc) + timedelta(minutes=30))
    first = http.post("/auth/reset-password", json={"token": token, "new_password": "new-password-123"})
    second = http.post("/auth/reset-password", json={"token": token, "new_password": "another-password-123"})
    assert first.status_code == 200
    assert second.status_code == 400


def test_forgot_password_response_does_not_reveal_account(client, monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    http, sessions = client
    monkeypatch.setattr(auth_routes.settings, "BREVO_API_KEY", "configured-test-key")
    monkeypatch.setattr(auth_routes.settings, "EMAIL_FROM", "Smart Menu <sender@example.com>")
    make_user(sessions)
    unknown = http.post("/auth/forgot-password", json={"email": "unknown@example.com"})
    known = http.post("/auth/forgot-password", json={"email": "owner@example.com"})
    assert unknown.status_code == known.status_code == 200
    assert unknown.json() == known.json()
    assert "event=forgot_password_request_received" in caplog.text
    assert "event=forgot_password_account_lookup found=False" in caplog.text
    assert "event=forgot_password_account_lookup found=True" in caplog.text
    assert "brevo_api_key_configured=True email_from_configured=True" in caplog.text
    assert "event=brevo_request_attempted result=false reason=account_not_found" in caplog.text
    assert "unknown@example.com" not in caplog.text
    assert "owner@example.com" not in caplog.text
    assert "configured-test-key" not in caplog.text


def test_forgot_password_provider_failure_keeps_generic_response(client, monkeypatch, caplog):
    http, sessions = client
    make_user(sessions)

    def fail_send(email, token):
        raise RuntimeError("provider rejected")

    monkeypatch.setattr("app.routes.auth._send_password_reset_email", fail_send)
    response = http.post("/auth/forgot-password", json={"email": "owner@example.com"})
    assert response.status_code == 200
    assert response.json() == {"message": "If an account exists for that email, a password reset link has been sent."}
    assert "event=forgot_password_token_cleanup result=deleted" in caplog.text
    assert "owner@example.com" not in caplog.text
    db = sessions()
    assert db.query(PasswordResetToken).count() == 0
    db.close()


def test_forgot_password_missing_brevo_config_keeps_generic_response_and_cleans_token(client, monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    http, sessions = client
    user_id = make_user(sessions)
    monkeypatch.setattr(auth_routes.settings, "BREVO_API_KEY", None)
    monkeypatch.setattr(auth_routes.settings, "EMAIL_FROM", "Smart Menu <sender@example.com>")
    monkeypatch.setattr(auth_routes, "_send_password_reset_email", _real_send_password_reset_email)
    monkeypatch.setattr(
        auth_routes.urllib.request,
        "urlopen",
        lambda *args, **kwargs: pytest.fail("Brevo request must not run without its API key"),
    )

    response = http.post("/auth/forgot-password", json={"email": "owner@example.com"})
    assert response.status_code == 200
    assert response.json() == {"message": "If an account exists for that email, a password reset link has been sent."}
    assert "event=forgot_password_account_lookup found=True" in caplog.text
    assert "brevo_api_key_configured=False email_from_configured=True" in caplog.text
    assert "event=brevo_request_attempted result=false reason=missing_configuration" in caplog.text
    assert "event=forgot_password_token_cleanup result=deleted" in caplog.text
    db = sessions()
    assert db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user_id).count() == 0
    db.close()


def configure_brevo(monkeypatch):
    monkeypatch.setattr(auth_routes.settings, "BREVO_API_KEY", "test-brevo-api-key")
    monkeypatch.setattr(auth_routes.settings, "EMAIL_FROM", "Smart Menu <sender@example.com>")
    monkeypatch.setattr(auth_routes.settings, "FRONTEND_URL", "https://ai-menu-software.vercel.app")


def test_settings_load_brevo_api_key_from_exact_environment_name(monkeypatch):
    from app.core.config import Settings

    monkeypatch.setenv("BREVO_API_KEY", "test-environment-key")
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite:///./settings_test.db",
        SECRET_KEY="test-secret-key-that-is-at-least-32-characters",
        GEMINI_API_KEY="test",
        FRONTEND_URL="http://localhost:5173",
        API_HOST="localhost",
        CLOUDINARY_CLOUD_NAME="",
        CLOUDINARY_API_KEY="",
        CLOUDINARY_API_SECRET="",
    )
    assert settings.BREVO_API_KEY == "test-environment-key"


def test_brevo_success_sends_reset_email_over_https(monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    configure_brevo(monkeypatch)
    captured = {"status": 201}

    class FakeResponse:
        status = captured["status"]
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def read(self):
            return b'{"messageId":"provider-id"}'

    def fake_urlopen(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(auth_routes.urllib.request, "urlopen", fake_urlopen)
    auth_routes._send_password_reset_email("owner@example.com", "private-reset-token")
    request = captured["request"]
    body = json.loads(request.data.decode("utf-8"))
    assert request.full_url == "https://api.brevo.com/v3/smtp/email"
    assert request.get_method() == "POST"
    assert request.get_header("Api-key") == "test-brevo-api-key"
    assert request.get_header("Content-type") == "application/json"
    assert body["sender"] == {"name": "Smart Menu", "email": "sender@example.com"}
    assert body["to"] == [{"email": "owner@example.com"}]
    assert "https://ai-menu-software.vercel.app/reset-password?token=private-reset-token" in body["textContent"]
    assert "Reset password" in body["htmlContent"]
    assert "event=brevo_request_accepted http_status=201" in caplog.text
    assert "private-reset-token" not in caplog.text
    assert "owner@example.com" not in caplog.text
    assert "ai-menu-software.vercel.app" not in caplog.text
    assert "test-brevo-api-key" not in caplog.text


def test_brevo_request_trims_whitespace_from_configured_key(monkeypatch):
    configure_brevo(monkeypatch)
    monkeypatch.setattr(auth_routes.settings, "BREVO_API_KEY", "  test-brevo-api-key\n")

    class FakeResponse:
        status = 201
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout):
        assert request.get_header("Api-key") == "test-brevo-api-key"
        return FakeResponse()

    monkeypatch.setattr(auth_routes.urllib.request, "urlopen", fake_urlopen)
    auth_routes._send_password_reset_email("owner@example.com", "private-reset-token")


def test_brevo_authentication_failure_logs_sanitized_response(monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    configure_brevo(monkeypatch)
    body = json.dumps({"code": "unauthorized", "message": "Invalid API key test-brevo-api-key"}).encode()

    def reject(request, timeout):
        raise urllib.error.HTTPError(request.full_url, 401, "Unauthorized", {}, io.BytesIO(body))

    monkeypatch.setattr(auth_routes.urllib.request, "urlopen", reject)
    with pytest.raises(RuntimeError):
        auth_routes._send_password_reset_email("owner@example.com", "private-reset-token")
    assert "event=brevo_request_attempted result=true" in caplog.text
    assert "event=brevo_request_rejected http_status=401" in caplog.text
    assert "error_code=unauthorized" in caplog.text
    assert "owner@example.com" not in caplog.text
    assert "sender@example.com" not in caplog.text
    assert "private-reset-token" not in caplog.text
    assert "test-brevo-api-key" not in caplog.text


def test_brevo_network_error_is_logged_without_exception_details(monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    configure_brevo(monkeypatch)

    def fail_network(request, timeout):
        raise urllib.error.URLError("failure for owner@example.com with token private-reset-token")

    monkeypatch.setattr(auth_routes.urllib.request, "urlopen", fail_network)
    with pytest.raises(RuntimeError):
        auth_routes._send_password_reset_email("owner@example.com", "private-reset-token")
    assert "event=brevo_request_attempted result=true" in caplog.text
    assert "event=brevo_network_error error_type=URLError" in caplog.text
    assert "error_message=" in caplog.text
    assert "owner@example.com" not in caplog.text
    assert "private-reset-token" not in caplog.text
    assert "test-brevo-api-key" not in caplog.text


def test_brevo_rejected_sender_logs_code_and_sanitized_message(monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    configure_brevo(monkeypatch)
    body = json.dumps({"code": "sender_not_found", "message": "Sender owner@example.com is not verified at https://provider.example/senders token=private-reset-token"}).encode()

    def reject_sender(request, timeout):
        raise urllib.error.HTTPError(request.full_url, 400, "Bad Request", {}, io.BytesIO(body))

    monkeypatch.setattr(auth_routes.urllib.request, "urlopen", reject_sender)
    with pytest.raises(RuntimeError):
        auth_routes._send_password_reset_email("owner@example.com", "private-reset-token")
    assert "http_status=400" in caplog.text
    assert "error_code=sender_not_found" in caplog.text
    assert "Sender [redacted] is not verified at [url]" in caplog.text
    assert "owner@example.com" not in caplog.text
    assert "private-reset-token" not in caplog.text
    assert "provider.example" not in caplog.text


def test_brevo_missing_configuration_logs_only_variable_name(monkeypatch, caplog):
    monkeypatch.setattr(auth_routes.settings, "BREVO_API_KEY", None)
    monkeypatch.setattr(auth_routes.settings, "EMAIL_FROM", "Smart Menu <sender@example.com>")
    with pytest.raises(RuntimeError, match="not configured"):
        auth_routes._send_password_reset_email("owner@example.com", "private-reset-token")
    assert "event=brevo_request_attempted result=false reason=missing_configuration" in caplog.text
    assert "brevo_api_key_configured=False email_from_configured=True" in caplog.text
    assert "sender@example.com" not in caplog.text
    assert "owner@example.com" not in caplog.text
    assert "private-reset-token" not in caplog.text
