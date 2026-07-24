from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from .. import models, schemas, security
from ..deps import CurrentUser, DbSession, OptionalUser, get_current_user

router = APIRouter(prefix="/users", tags=["users"])


def get_user_or_404(db: DbSession, user_id: int) -> models.User:
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("", response_model=list[schemas.UserRead], dependencies=[Depends(get_current_user)])
def list_users(db: DbSession) -> Sequence[models.User]:
    return db.scalars(select(models.User).order_by(models.User.name)).all()


@router.post("", response_model=schemas.UserCreated, status_code=201)
def create_user(
    payload: schemas.UserCreate, db: DbSession, current_user: OptionalUser
) -> schemas.UserCreated:
    # The first user of a fresh install is created unauthenticated (there is
    # nobody to log in as yet) and is always an admin, so someone can manage
    # projects and users from day one. After that, creating users requires a
    # logged-in user.
    first_user = db.scalar(select(models.User.id).limit(1)) is None
    if not first_user and current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    password = security.generate_password()
    user = models.User(
        name=payload.name,
        is_admin=payload.is_admin or first_user,
        password_hash=security.hash_password(password),
    )
    db.add(user)
    db.commit()
    # The password is returned exactly once; only the hash is stored.
    return schemas.UserCreated(
        id=user.id, name=user.name, is_admin=user.is_admin, password=password
    )


@router.patch("/{user_id}", response_model=schemas.UserRead)
def update_user(
    user_id: int, payload: schemas.UserUpdate, db: DbSession, current_user: CurrentUser
) -> models.User:
    user = get_user_or_404(db, user_id)
    if payload.name is not None:
        user.name = payload.name
    if payload.is_admin is not None:
        if not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Only admins can change admin status")
        user.is_admin = payload.is_admin
    db.commit()
    return user


@router.post("/{user_id}/password-reset", response_model=schemas.PasswordReset)
def reset_password(user_id: int, db: DbSession, current_user: CurrentUser) -> schemas.PasswordReset:
    """Give a user a fresh random password (admins for anyone, users for
    themselves) — the recovery path for forgotten passwords."""
    if not current_user.is_admin and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Only admins can reset other users' passwords")
    user = get_user_or_404(db, user_id)
    password = security.generate_password()
    user.password_hash = security.hash_password(password)
    db.commit()
    return schemas.PasswordReset(password=password)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: DbSession, current_user: CurrentUser) -> None:
    if not current_user.is_admin and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Only admins can delete other users")
    user = get_user_or_404(db, user_id)
    for task in user.tasks:
        task.assignee_id = None
    for pbi in user.pbis:
        pbi.assignee_id = None
    for comment in user.comments:
        comment.author_id = None
    user.projects.clear()
    db.delete(user)
    db.commit()
