from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import json
import logging
import re
import urllib.error
import urllib.request
import html
from email.utils import parseaddr
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.rate_limit import limiter
from app.core.security import hash_password, verify_password, create_access_token
from app.core.config import settings
from app.database.connection import get_db
from app.models.user import User
from app.schemas.auth import (
    UserRegister,
    UserLogin,
    LoginResponse,
    UserResponse,
    UserProfileUpdate,
    PasswordChangeRequest,
    PasswordResetRequest,
    PasswordResetConfirm,
)
from app.models.password_reset_token import PasswordResetToken
from app.core.dependencies import get_current_user
router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)
logger = logging.getLogger(__name__)


def _safe_brevo_message(value: object, sensitive_values: tuple[str, ...] = ()) -> str:
    """Keep provider diagnostics useful without copying addresses, URLs, or tokens."""
    message = str(value or "")
    for sensitive_value in sensitive_values:
        if sensitive_value:
            message = message.replace(sensitive_value, "[redacted]")
    if settings.BREVO_API_KEY:
        message = message.replace(settings.BREVO_API_KEY, "[redacted]")
    message = re.sub(r"https?://\S+", "[url]", message, flags=re.IGNORECASE)
    message = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[email]", message)
    message = re.sub(
        r'(?i)(["\']?(?:token|api[_-]?key|key|secret|password|authorization|email|to|url|reset[_-]?url)["\']?)\s*:\s*["\']?[^,"\'\s}]+["\']?',
        r'\1:"[redacted]"',
        message,
    )
    message = re.sub(r"(?i)(token|api[_-]?key|key|secret|password)\s*[:=]\s*\S+", r"\1=[redacted]", message)
    message = " ".join(message.split())
    return message[:300]


def _brevo_error_details(body: bytes, sensitive_values: tuple[str, ...] = ()) -> tuple[str | None, str | None]:
    try:
        parsed = json.loads(body.decode("utf-8", errors="replace"))
    except (ValueError, UnicodeError):
        return None, _safe_brevo_message(body.decode("utf-8", errors="replace"), sensitive_values)
    if not isinstance(parsed, dict):
        return None, _safe_brevo_message(parsed, sensitive_values)
    code = parsed.get("code") or parsed.get("errorCode")
    message = parsed.get("message") or parsed.get("error")
    safe_code = re.sub(r"[^A-Za-z0-9_.-]", "", _safe_brevo_message(code, sensitive_values))[:80] if code else None
    return safe_code, _safe_brevo_message(message, sensitive_values) if message else None


def _send_password_reset_email(email: str, token: str) -> None:
    missing = [name for name, value in (
        ("BREVO_API_KEY", settings.BREVO_API_KEY),
        ("FRONTEND_URL", settings.FRONTEND_URL),
        ("EMAIL_FROM", settings.EMAIL_FROM),
    ) if not value or not str(value).strip()]
    if missing:
        logger.error("Password reset email configuration missing variables=%s", ",".join(missing))
        raise RuntimeError("Password reset email is not configured")
    sender_address = parseaddr(settings.EMAIL_FROM)[1]
    if not sender_address or "@" not in sender_address:
        logger.error("Password reset email sender configuration is invalid variable=EMAIL_FROM")
        raise RuntimeError("Password reset email sender is invalid")
    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    sender_name, _ = parseaddr(settings.EMAIL_FROM)
    sender = {"email": sender_address}
    if sender_name:
        sender["name"] = sender_name
    payload = json.dumps({
        "sender": sender,
        "to": [{"email": email}],
        "subject": "Reset your Smart Menu password",
        "textContent": (
            f"Use this link to reset your Smart Menu password. It expires in "
            f"{settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes:\n\n{reset_url}\n\n"
            "If you did not request this, you can ignore this email."
        ),
        "htmlContent": (
            f'<p>Use this link to reset your Smart Menu password. It expires in '
            f'{settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes.</p>'
            f'<p><a href="{html.escape(reset_url, quote=True)}">Reset password</a></p>'
            '<p>If you did not request this, you can ignore this email.</p>'
        ),
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=payload,
        headers={
            "api-key": settings.BREVO_API_KEY,
            "accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    sensitive_values = (email, token, reset_url, sender_address)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status >= 300:
                body = response.read()
                code, message = _brevo_error_details(body, sensitive_values)
                logger.error("Password reset email provider rejected request provider=brevo http_status=%s error_code=%s error_message=%s", response.status, code or "unknown", message or "unavailable")
                raise RuntimeError("Email provider rejected the message")
            logger.info("Password reset email accepted by provider=brevo http_status=%s", response.status)
    except urllib.error.HTTPError as exc:
        code, message = _brevo_error_details(exc.read(), sensitive_values)
        logger.error("Password reset email provider rejected request provider=brevo http_status=%s error_code=%s error_message=%s", exc.code, code or "unknown", message or "unavailable")
        raise RuntimeError("Email provider rejected the message") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.error("Password reset email provider request failed provider=brevo error_type=%s", type(exc).__name__)
        raise RuntimeError("Could not send password reset email") from exc


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, data: PasswordResetRequest, db: Session = Depends(get_db)):
    email = str(data.email).strip().lower()
    user = db.query(User).filter(User.email == email, User.is_active.is_(True)).first()
    if user:
        raw_token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete(synchronize_session=False)
        record = PasswordResetToken(
            user_id=user.id,
            token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
            expires_at=now + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
            created_at=now,
        )
        db.add(record)
        db.commit()
        try:
            _send_password_reset_email(user.email, raw_token)
        except Exception:
            db.delete(record)
            db.commit()
            # Keep the response generic; details were logged by the sender.
            logger.error("Password reset email was not accepted; reset token record removed")
    return {"message": "If an account exists for that email, a password reset link has been sent."}


@router.post("/reset-password")
@limiter.limit("10/minute")
def reset_password(request: Request, data: PasswordResetConfirm, db: Session = Depends(get_db)):
    digest = hashlib.sha256(data.token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    record = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == digest).with_for_update().first()
    if not record:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")
    expiry = record.expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry <= now:
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")
    user = db.query(User).filter(User.id == record.user_id, User.is_active.is_(True)).first()
    if not user:
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")
    user.password_hash = hash_password(data.new_password)
    db.delete(record)
    db.commit()
    return {"message": "Your password has been reset. You can now sign in."}


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
def register(
    request: Request,
    user_data: UserRegister,
    db: Session = Depends(get_db),
):
    """
    Register a new Smart Menu user.
    """

    # Normalize email so Test@Email.com and test@email.com
    # are treated as the same account.
    email = user_data.email.strip().lower()

    # Check whether the email already exists.
    existing_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    # Hash password using Argon2.
    password_hash = hash_password(user_data.password)

    new_user = User(
        email=email,
        password_hash=password_hash,
        full_name=(
            user_data.full_name.strip()
            if user_data.full_name
            else None
        ),
        is_active=True,
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

    except IntegrityError:
        # Important:
        # The duplicate check above does NOT completely protect
        # against two requests arriving at the same time.
        #
        # The database UNIQUE constraint is the final protection.
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create account.",
        )

    return new_user


@router.post(
    "/login",
    response_model=LoginResponse,
)
@limiter.limit("5/minute")
def login(
    request: Request,
    user_data: UserLogin,
    db: Session = Depends(get_db),
):
    """
    Authenticate an existing Smart Menu user.
    """

    email = user_data.email.strip().lower()

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    # Do not reveal whether the email exists.
    # This prevents account/email enumeration.
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(
        user_data.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    access_token = create_access_token(user.id)

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
    )

@router.get(
    "/me",
    response_model=UserResponse,
)
def get_me(
    current_user: User = Depends(get_current_user),
):
    return current_user


@router.patch(
    "/me",
    response_model=UserResponse,
)
def update_me(
    profile_data: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the authenticated user's profile."""
    full_name = profile_data.full_name.strip()
    email = str(profile_data.email).strip().lower()

    if not full_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Full name cannot be empty.",
        )

    existing_user = (
        db.query(User)
        .filter(
            User.email == email,
            User.id != current_user.id,
        )
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    current_user.full_name = full_name
    current_user.email = email

    try:
        db.commit()
        db.refresh(current_user)
        return current_user
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update profile.",
        )


@router.post("/change-password")
def change_password(
    password_data: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change the authenticated user's password."""

    if not verify_password(
        password_data.current_password,
        current_user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your current password is incorrect.",
        )

    if password_data.current_password == password_data.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The new password must differ from the current password.",
        )

    try:
        current_user.password_hash = hash_password(
            password_data.new_password
        )

        db.commit()

        return {
            "message": "Password updated successfully."
        }

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update your password.",
        )
