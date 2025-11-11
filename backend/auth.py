from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.oauth2 import id_token
from google.auth.transport import requests
import os
from typing import Optional

security = HTTPBearer()

# Google OAuth client ID from environment
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

def verify_google_token(token: str) -> dict:
    """
    Verify Google ID token and return user info
    """
    try:
        # Verify the token with Google
        idinfo = id_token.verify_oauth2_token(
            token,
            requests.Request(),
            GOOGLE_CLIENT_ID
        )

        # Token is valid, return user info
        return {
            "email": idinfo.get("email"),
            "name": idinfo.get("name"),
            "sub": idinfo.get("sub"),  # Google user ID
            "email_verified": idinfo.get("email_verified", False),
            "picture": idinfo.get("picture"),  # Profile picture URL
        }
    except ValueError as e:
        # Token is invalid
        raise HTTPException(
            status_code=401,
            detail=f"Invalid authentication token: {str(e)}"
        )
    except Exception as e:
        # Other errors
        raise HTTPException(
            status_code=401,
            detail=f"Authentication failed: {str(e)}"
        )

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> dict:
    """
    Dependency to get current authenticated user from Google ID token
    Use this as a dependency in protected endpoints
    """
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing authentication token"
        )

    token = credentials.credentials
    user_info = verify_google_token(token)

    return user_info

async def get_optional_user(
    authorization: Optional[str] = None
) -> Optional[dict]:
    """
    Optional authentication - returns None if no token provided
    Import and use this for endpoints that don't require auth
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None

    try:
        token = authorization.replace("Bearer ", "")
        user_info = verify_google_token(token)
        return user_info
    except HTTPException:
        return None
