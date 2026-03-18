from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import time

from app.config import settings


@dataclass
class TokenClaims:
    role: str
    employee_id: int | None


class TokenValidationError(Exception):
    pass


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign(value: str) -> str:
    digest = hmac.new(
        settings.auth_jwt_secret.encode("utf-8"),
        value.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _b64url_encode(digest)


def create_access_token(
    *,
    role: str,
    employee_id: int | None,
    expires_minutes: int | None = None,
) -> str:
    now = datetime.now(tz=timezone.utc)
    ttl_minutes = expires_minutes or settings.auth_access_token_minutes
    payload: dict[str, object] = {
        "iss": "goalai",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
        "role": role,
    }
    if employee_id is not None:
        payload["employee_id"] = str(employee_id)

    header = {"alg": settings.auth_jwt_algorithm, "typ": "JWT"}
    header_part = _b64url_encode(json.dumps(header, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))
    payload_part = _b64url_encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))
    signing_input = f"{header_part}.{payload_part}"
    signature = _sign(signing_input)
    return f"{signing_input}.{signature}"


def decode_access_token(token: str) -> TokenClaims:
    try:
        header_part, payload_part, signature = token.split(".")
    except ValueError as exc:
        raise TokenValidationError("Invalid token format") from exc

    signing_input = f"{header_part}.{payload_part}"
    expected_signature = _sign(signing_input)
    if not hmac.compare_digest(expected_signature, signature):
        raise TokenValidationError("Invalid token signature")

    try:
        payload_raw = _b64url_decode(payload_part)
        payload = json.loads(payload_raw.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise TokenValidationError("Invalid token payload") from exc

    if not isinstance(payload, dict):
        raise TokenValidationError("Invalid token payload")

    exp_raw = payload.get("exp")
    iat_raw = payload.get("iat")
    now_ts = int(time.time())
    if not isinstance(exp_raw, int) or not isinstance(iat_raw, int):
        raise TokenValidationError("Missing token timestamps")
    if now_ts >= exp_raw:
        raise TokenValidationError("Token expired")
    if iat_raw > now_ts + 60:
        raise TokenValidationError("Token iat is in the future")

    role_raw = payload.get("role")
    if not isinstance(role_raw, str) or not role_raw.strip():
        raise TokenValidationError("Invalid role in token")
    role = role_raw.strip().lower()

    employee_id_raw = payload.get("employee_id")
    employee_id: int | None = None
    if employee_id_raw is not None:
        try:
            employee_id = int(str(employee_id_raw))
        except (TypeError, ValueError) as exc:
            raise TokenValidationError("Invalid employee_id in token") from exc

    return TokenClaims(role=role, employee_id=employee_id)
