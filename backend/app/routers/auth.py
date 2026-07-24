from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from .. import models, schemas, security
from ..deps import CurrentUser, DbSession

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/setup", response_model=schemas.SetupStatus)
def setup_status(db: DbSession) -> schemas.SetupStatus:
    """Whether the instance still needs its first user; the frontend shows the
    first-admin form instead of the login form. Unauthenticated by design."""
    has_users = db.scalar(select(models.User.id).limit(1)) is not None
    return schemas.SetupStatus(needs_setup=not has_users)


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: DbSession) -> schemas.TokenResponse:
    user = db.scalar(
        select(models.User).where(func.lower(models.User.name) == payload.name.strip().lower())
    )
    if user is None or not security.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid name or password")
    return schemas.TokenResponse(
        access_token=security.create_access_token(user.id),
        user=schemas.UserRead.model_validate(user),
    )


@router.get("/me", response_model=schemas.UserRead)
def me(current_user: CurrentUser) -> models.User:
    return current_user


@router.post("/change-password", status_code=204)
def change_password(
    payload: schemas.ChangePasswordRequest, current_user: CurrentUser, db: DbSession
) -> None:
    # 403, not 401: the session is valid, the proof-of-identity failed. The
    # frontend treats 401 as "session expired" and drops the token.
    if not security.verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="Current password is incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    current_user.password_hash = security.hash_password(payload.new_password)
    db.add(current_user)
    db.commit()
