from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.oauth2 import id_token
from google.auth.transport import requests
import os
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

security = HTTPBearer()

# Load .env file if not already loaded (handles import order issues)
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    load_dotenv(env_path, override=False)

def get_google_client_id() -> str:
    """Get Google Client ID, loading from .env if needed"""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        # Try loading .env again in case it wasn't loaded yet
        env_path = Path(__file__).parent / '.env'
        if env_path.exists():
            load_dotenv(env_path, override=True)
            client_id = os.getenv("GOOGLE_CLIENT_ID")
    return client_id

def verify_google_token(token: str) -> dict:
    """
    Verify Google ID token and return user info.
    
    Requires GOOGLE_CLIENT_ID to be set in environment variables.
    This is used to verify that the token was issued by Google for your application.
    """
    google_client_id = get_google_client_id()
    if not google_client_id:
        import logging
        logger = logging.getLogger(__name__)
        logger.error("GOOGLE_CLIENT_ID not configured on server - check backend/.env file")
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_CLIENT_ID not configured on server. Please check backend/.env file and restart the server."
        )
    
    try:
        # Verify the token with Google
        # GOOGLE_CLIENT_ID is required to verify the token was issued for your app
        idinfo = id_token.verify_oauth2_token(
            token,
            requests.Request(),
            google_client_id
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
