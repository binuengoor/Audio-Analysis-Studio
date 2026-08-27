import os
import secrets
from typing import Optional, Set
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials

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


def get_configured_api_keys() -> Set[str]:
    """
    Retrieves all valid API keys configured via API_KEY and/or API_KEYS environment variables.
    """
    keys = set()
    single_key = os.getenv("API_KEY", "").strip()
    if single_key:
        keys.add(single_key)
    
    multiple_keys = os.getenv("API_KEYS", "").strip()
    if multiple_keys:
        for k in multiple_keys.split(","):
            cleaned = k.strip()
            if cleaned:
                keys.add(cleaned)
    return keys


def is_auth_enabled() -> bool:
    """Returns True if at least one API key is configured in the environment."""
    return len(get_configured_api_keys()) > 0


async def verify_api_key(
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
