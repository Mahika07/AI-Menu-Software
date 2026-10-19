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


def test_forgot_password_response_does_not_reveal_account(client):
    http, sessions = client
    make_user(sessions)
    unknown = http.post("/auth/forgot-password", json={"email": "unknown@example.com"})
    known = http.post("/auth/forgot-password", json={"email": "owner@example.com"})
    assert unknown.status_code == known.status_code == 200
    assert unknown.json() == known.json()


def test_forgot_password_provider_failure_keeps_generic_response(client, monkeypatch, caplog):
    http, sessions = client
    make_user(sessions)

    def fail_send(email, token):
        raise RuntimeError("provider rejected")

    monkeypatch.setattr("app.routes.auth._send_password_reset_email", fail_send)
    response = http.post("/auth/forgot-password", json={"email": "owner@example.com"})
    assert response.status_code == 200
    assert response.json() == {"message": "If an account exists for that email, a password reset link has been sent."}
    assert "was not accepted" in caplog.text
    assert "owner@example.com" not in caplog.text
    db = sessions()
    assert db.query(PasswordResetToken).count() == 0
    db.close()


def test_resend_success_is_logged_as_provider_acceptance(monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    monkeypatch.setattr(auth_routes.settings, "RESEND_API_KEY", "test-secret")
    monkeypatch.setattr(auth_routes.settings, "EMAIL_FROM", "Smart Menu <noreply@example.com>")

    class Response:
        status = 200
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False

    monkeypatch.setattr(auth_routes.urllib.request, "urlopen", lambda *args, **kwargs: Response())
    auth_routes._send_password_reset_email("owner@example.com", "private-reset-token")
    assert "accepted by provider=resend http_status=200" in caplog.text
    assert "private-reset-token" not in caplog.text
    assert "owner@example.com" not in caplog.text


def test_resend_http_failure_logs_sanitized_provider_details(monkeypatch, caplog):
    monkeypatch.setattr(auth_routes.settings, "RESEND_API_KEY", "test-secret")
    monkeypatch.setattr(auth_routes.settings, "EMAIL_FROM", "Smart Menu <noreply@example.com>")
    body = json.dumps({"name": "validation_error", "message": "Invalid sender owner@example.com https://secret.example/reset?token=private"}).encode()

    def reject(*args, **kwargs):
        raise urllib.error.HTTPError("https://api.resend.com/emails", 422, "Unprocessable", {}, io.BytesIO(body))

    monkeypatch.setattr(auth_routes.urllib.request, "urlopen", reject)
    with pytest.raises(RuntimeError):
        auth_routes._send_password_reset_email("owner@example.com", "private-reset-token")
    assert "http_status=422" in caplog.text
    assert "validation_error" in caplog.text
    assert "Invalid sender [email] [url]" in caplog.text
    assert "owner@example.com" not in caplog.text
    assert "private-reset-token" not in caplog.text
    assert "secret.example" not in caplog.text
