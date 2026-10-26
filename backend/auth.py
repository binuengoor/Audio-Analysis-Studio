import secrets
from typing import Optional, Set
from fastapi import HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
from config import get_configured_api_keys

# Security schemes for OpenAPI / Swagger UI integration
api_key_header_scheme = APIKeyHeader(
    name="X-API-Key",
    auto_error=False,
    description="API Key via X-API-Key header"
)

http_bearer_scheme = HTTPBearer(
    auto_error=False,
    description="API Key via Authorization: Bearer <key> header"
)

def is_auth_enabled() -> bool:
    """Returns True if at least one API key is configured in the environment."""
    return len(get_configured_api_keys()) > 0

async def verify_api_key(
    request: Request,
    api_key_header: Optional[str] = Security(api_key_header_scheme),
    bearer_token: Optional[HTTPAuthorizationCredentials] = Security(http_bearer_scheme)
) -> Optional[str]:
    """
    Dependency that enforces API key authentication if configured.
    Supports both `X-API-Key: <key>` and `Authorization: Bearer <key>`.
    
    If neither API_KEY nor API_KEYS is set in the environment, authentication is disabled (open mode).
    """
    valid_keys = get_configured_api_keys()
    
    # If no keys configured, authentication is optional / open
    if not valid_keys:
        return None

    # Check X-API-Key header or Bearer token
    provided_key = None
    if api_key_header:
        provided_key = api_key_header.strip()
    elif bearer_token and bearer_token.credentials:
        provided_key = bearer_token.credentials.strip()
    elif request.method == "GET" and request.query_params.get("api_key"):
        # Browser downloads / media tags cannot send headers; GET-only to keep mutations header-authenticated
        provided_key = request.query_params["api_key"].strip()

    if not provided_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key required. Provide 'X-API-Key' header or 'Authorization: Bearer <token>'."
        )

    # Constant-time comparison to prevent timing attacks
    is_valid = any(secrets.compare_digest(provided_key, valid_key) for valid_key in valid_keys)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key."
        )

    return provided_key


def extract_request_key(headers, query_params) -> Optional[str]:
    """Reads an API key from headers, or the `api_key` query param (needed by <audio>/<img> media URLs)."""
    key = headers.get("x-api-key")
    if not key:
        authz = headers.get("authorization", "")
        if authz.lower().startswith("bearer "):
            key = authz[7:]
    if not key:
        key = query_params.get("api_key")
    return key.strip() if key else None


def is_valid_key(provided_key: Optional[str]) -> bool:
    """Constant-time check against configured keys; True when auth is disabled."""
    valid_keys = get_configured_api_keys()
    if not valid_keys:
        return True
    if not provided_key:
        return False
    return any(secrets.compare_digest(provided_key, k) for k in valid_keys)
