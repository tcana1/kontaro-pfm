import hashlib
import logging
import os
from datetime import timedelta

import jwt as pyjwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.security.api_key import APIKeyHeader

from src import context
from src.database import db_handler

logger = logging.getLogger(__name__)

_SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
_SUPABASE_URL = os.getenv("SUPABASE_URL", "")

# JWKS client for ES256/RS256 verification (new Supabase CLI uses ES256).
# Only consulted when HS256 (shared secret) is not configured or fails — the JWKS
# URL is the browser-facing SUPABASE_URL, which may be unreachable from inside
# this container (e.g. selfhost). Timeout caps a dead endpoint to 10s.
_jwks_client: pyjwt.PyJWKClient | None = None
if _SUPABASE_URL:
    try:
        _jwks_client = pyjwt.PyJWKClient(
            f"{_SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
            timeout=10,
        )
    except Exception as e:
        logger.warning("Failed to initialize JWKS client: %s", e)

if not _SUPABASE_JWT_SECRET and not _jwks_client:
    logger.warning(
        "Neither SUPABASE_JWT_SECRET nor SUPABASE_URL is set — JWT auth disabled; only API key auth will work."
    )

_bearer_scheme = HTTPBearer(auto_error=False)
_api_key_header = APIKeyHeader(name="x-api-key", auto_error=False)

_JWT_DECODE_OPTIONS = {"require": ["exp", "sub"]}
_JWT_LEEWAY = timedelta(seconds=30)


def _user_id_from_jwt(token: str) -> str | None:
    # Verify HS256 FIRST when a shared secret is configured — the JWKS fetch goes
    # to SUPABASE_URL (the browser-facing origin), which can be slow or unreachable
    # from inside the container (e.g. selfhost). JWKS remains the fallback for
    # ES256/RS256 tokens (new Supabase CLI) and for setups without a shared secret.
    if _SUPABASE_JWT_SECRET:
        try:
            payload = pyjwt.decode(
                token, _SUPABASE_JWT_SECRET, algorithms=["HS256"],
                audience="authenticated",
                options=_JWT_DECODE_OPTIONS,
                leeway=_JWT_LEEWAY,
            )
            return payload.get("sub")
        except pyjwt.PyJWTError:
            pass

    # JWKS: ES256/RS256 (new Supabase CLI).
    if _jwks_client:
        try:
            signing_key = _jwks_client.get_signing_key_from_jwt(token)
            payload = pyjwt.decode(
                token, signing_key.key, algorithms=["ES256", "RS256"],
                audience="authenticated",
                options=_JWT_DECODE_OPTIONS,
                leeway=_JWT_LEEWAY,
            )
            return payload.get("sub")
        except Exception:
            pass

    return None


async def get_current_user(
    bearer: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
    api_key: str | None = Security(_api_key_header),
) -> str:
    if bearer and bearer.credentials:
        user_id = _user_id_from_jwt(bearer.credentials)
        if user_id:
            context.set_user_id(user_id)
            return user_id
    if api_key:
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        user_id = db_handler.resolve_user_id_from_key_hash(key_hash)
        if user_id:
            context.set_user_id(user_id)
            return user_id
    raise HTTPException(status_code=403, detail="Authentication required: provide Authorization: Bearer <jwt> or x-api-key")
