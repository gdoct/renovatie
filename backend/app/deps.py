from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models, security
from .database import get_db

DbSession = Annotated[Session, Depends(get_db)]

# auto_error=False so a missing header yields our own 401 (instead of 403) and
# optional-auth routes (bootstrap user creation) can proceed without a token.
bearer_scheme = HTTPBearer(auto_error=False)

Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]


def get_optional_user(credentials: Credentials, db: DbSession) -> models.User | None:
    if credentials is None:
        return None
    user_id = security.decode_access_token(credentials.credentials)
    if user_id is None:
        return None
    return db.get(models.User, user_id)


def get_current_user(credentials: Credentials, db: DbSession) -> models.User:
    user = get_optional_user(credentials, db)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


CurrentUser = Annotated[models.User, Depends(get_current_user)]
OptionalUser = Annotated[models.User | None, Depends(get_optional_user)]
