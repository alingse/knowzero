"""API dependencies."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_auth_user
from app.core.database import get_session


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get database session dependency."""
    async for session in get_session():
        yield session


# Database dependency
DBDep = Depends(get_db)

# Auth user dependency - returns user_id (default: 1 for anonymous access)
CurrentUser = Annotated[int, Depends(get_auth_user)]
