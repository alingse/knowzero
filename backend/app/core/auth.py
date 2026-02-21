"""Authentication utilities.

This module provides a simple authentication system that defaults to
a guest user (id=1). This design allows the app to work without login
while making it easy to add real auth later.

WARNING: This is a placeholder implementation for development only.
Always returns user_id=1 (guest user). Real authentication must be
implemented before production use.
"""

from typing import Annotated

from fastapi import Depends, Request, WebSocket

# Default guest user - used when no authentication is required
DEFAULT_USER_ID = 1


def get_auth_user(request: Request) -> int:
    """Get the current authenticated user ID for HTTP requests.

    This function returns the default user ID (1) for anonymous access.
    When authentication is implemented later, this function can be updated
    to extract user info from:
    - JWT token in Authorization header
    - Session cookie
    - API key

    Args:
        request: HTTP request object (injected by FastAPI)

    Returns:
        User ID (int)

    Example:
        @router.post("/items")
        async def create_item(user_id: Annotated[int, Depends(get_auth_user)]):
            return {"user_id": user_id}
    """
    # TODO: When implementing real auth, extract user from:
    # - request.headers.get("Authorization")
    # - Or from cookies/sessions

    # For now, return the default guest user
    return DEFAULT_USER_ID


def get_auth_user_from_ws(websocket: WebSocket) -> int:
    """Get the current authenticated user ID for WebSocket connections.

    Args:
        websocket: WebSocket object

    Returns:
        User ID (int)
    """
    # TODO: When implementing real auth, extract user from:
    # - websocket.headers.get("Authorization")

    return DEFAULT_USER_ID


# Type alias for FastAPI dependency
CurrentUserDep = Annotated[int, Depends(get_auth_user)]
