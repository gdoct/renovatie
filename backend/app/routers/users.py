from collections.abc import Sequence

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .. import models, schemas
from ..deps import DbSession

router = APIRouter(prefix="/users", tags=["users"])


def get_user_or_404(db: DbSession, user_id: int) -> models.User:
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("", response_model=list[schemas.UserRead])
def list_users(db: DbSession) -> Sequence[models.User]:
    return db.scalars(select(models.User).order_by(models.User.name)).all()


@router.post("", response_model=schemas.UserRead, status_code=201)
def create_user(payload: schemas.UserCreate, db: DbSession) -> models.User:
    # The first user of a fresh install is always an admin, so someone can
    # manage projects and users from day one.
    first_user = db.scalar(select(models.User.id).limit(1)) is None
    user = models.User(name=payload.name, is_admin=payload.is_admin or first_user)
    db.add(user)
    db.commit()
    return user


@router.patch("/{user_id}", response_model=schemas.UserRead)
def update_user(user_id: int, payload: schemas.UserUpdate, db: DbSession) -> models.User:
    user = get_user_or_404(db, user_id)
    if payload.name is not None:
        user.name = payload.name
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
    db.commit()
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: DbSession) -> None:
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
