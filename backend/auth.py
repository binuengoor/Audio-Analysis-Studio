import secrets
from typing import Optional
from fastapi import HTTPException, Security, status
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

# Paths reachable without an API key even when authentication is enabled
PUBLIC_PATHS = {"/", "/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json"}


def is_auth_enabled() -> bool:
    """Returns True if at least one API key is configured in the environment."""
    return len(get_configured_api_keys()) > 0


def extract_api_key(x_api_key: Optional[str], authorization: Optional[str]) -> Optional[str]:
    """Pulls the client key from `X-API-Key: <key>` or `Authorization: Bearer <key>`."""
    if x_api_key and x_api_key.strip():
        return x_api_key.strip()
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token.strip():
            return token.strip()
    return None


def check_api_key(provided_key: Optional[str]) -> Optional[str]:
    """
    Returns None if the key is acceptable, otherwise an error message.
    If neither API_KEY nor API_KEYS is set, authentication is disabled (open mode).
    """
    valid_keys = get_configured_api_keys()
    if not valid_keys:
        return None
    if not provided_key:
        return "API Key required. Provide 'X-API-Key' header or 'Authorization: Bearer <token>'."
    # Constant-time comparison to prevent timing attacks
    if not any(secrets.compare_digest(provided_key, valid_key) for valid_key in valid_keys):
        return "Invalid API Key."
    return None


async def verify_api_key(
    api_key_header: Optional[str] = Security(api_key_header_scheme),
    bearer_token: Optional[HTTPAuthorizationCredentials] = Security(http_bearer_scheme)
) -> Optional[str]:
    """
    Dependency that enforces API key authentication if configured and documents the
    security schemes in OpenAPI. The gateway-wide middleware applies the same check to
    every other route.
    """
    provided_key = extract_api_key(
        api_key_header,
        f"Bearer {bearer_token.credentials}" if bearer_token and bearer_token.credentials else None,
    )
    error = check_api_key(provided_key)
    if error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error)
    return provided_key
