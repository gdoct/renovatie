from collections.abc import Sequence

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from .. import models, schemas
from ..deps import DbSession
from .comments import delete_comments_for

router = APIRouter(prefix="/pbis", tags=["pbis"])


def get_pbi_or_404(db: DbSession, pbi_id: int) -> models.PBI:
    pbi = db.get(models.PBI, pbi_id)
    if pbi is None:
        raise HTTPException(status_code=404, detail="PBI not found")
    return pbi


def get_room_or_404(db: DbSession, room_id: int) -> models.Room:
    room = db.get(models.Room, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


def get_feature_or_404(db: DbSession, feature_id: int) -> models.Feature:
    feature = db.get(models.Feature, feature_id)
    if feature is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    return feature


def check_user_exists(db: DbSession, user_id: int) -> None:
    if db.get(models.User, user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")


def get_live_pbi_or_error(db: DbSession, pbi_id: int) -> models.PBI:
    """Fetch a PBI that new work may be attached to: 404 if missing, 409 if soft-deleted."""
    pbi = db.get(models.PBI, pbi_id)
    if pbi is None:
        raise HTTPException(status_code=404, detail="PBI not found")
    if pbi.status == "deleted":
        raise HTTPException(status_code=409, detail="PBI is deleted")
    return pbi


def delete_pbi_cascade(db: DbSession, pbi: models.PBI) -> None:
    """Delete a PBI plus its own and its tasks'/costs' comments; caller commits."""
    for task in pbi.tasks:
        delete_comments_for(db, "task", task.id)
    for cost in pbi.costs:
        delete_comments_for(db, "cost", cost.id)
    delete_comments_for(db, "pbi", pbi.id)
    db.delete(pbi)


@router.get("", response_model=list[schemas.PBIRead])
def list_pbis(
    db: DbSession,
    project_id: int,
    room_id: int | None = None,
    feature_id: int | None = None,
    status: schemas.Status | None = None,
) -> Sequence[models.PBI]:
    query = (
        select(models.PBI)
        .options(selectinload(models.PBI.tasks), selectinload(models.PBI.costs))
        .where(models.PBI.project_id == project_id)
        .order_by(models.PBI.priority, models.PBI.id)
    )
    if room_id is not None:
        query = query.where(models.PBI.room_id == room_id)
    if feature_id is not None:
        query = query.where(models.PBI.feature_id == feature_id)
    if status is not None:
        query = query.where(models.PBI.status == status)
    else:
        query = query.where(models.PBI.status != "deleted")
    return db.scalars(query).all()


@router.get("/{pbi_id}", response_model=schemas.PBIRead)
def get_pbi(pbi_id: int, db: DbSession) -> models.PBI:
    return get_pbi_or_404(db, pbi_id)


@router.post("", response_model=schemas.PBIRead, status_code=201)
def create_pbi(payload: schemas.PBICreate, db: DbSession) -> models.PBI:
    room = get_room_or_404(db, payload.room_id)
    if payload.feature_id is not None:
        feature = get_feature_or_404(db, payload.feature_id)
        if feature.project_id != room.project_id:
            raise HTTPException(status_code=422, detail="Feature belongs to a different project")
    if payload.assignee_id is not None:
        check_user_exists(db, payload.assignee_id)
    priority = payload.priority
    if priority is None:
        lowest = db.scalar(
            select(func.max(models.PBI.priority)).where(models.PBI.project_id == room.project_id)
        )
        priority = (lowest or 0) + 1
    pbi = models.PBI(
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=priority,
        room_id=payload.room_id,
        feature_id=payload.feature_id,
        assignee_id=payload.assignee_id,
        project_id=room.project_id,
    )
    db.add(pbi)
    db.commit()
    return pbi


@router.patch("/{pbi_id}", response_model=schemas.PBIRead)
def update_pbi(pbi_id: int, payload: schemas.PBIUpdate, db: DbSession) -> models.PBI:
    pbi = get_pbi_or_404(db, pbi_id)
    changes = payload.model_dump(exclude_unset=True)
    # A soft-deleted PBI is read-only; the only PATCH it accepts is one that
    # restores it (possibly editing other fields in the same request).
    restoring = changes.get("status") not in (None, "deleted")
    if pbi.status == "deleted" and not restoring:
        raise HTTPException(status_code=409, detail="PBI is deleted; restore it first")
    if "room_id" in changes:
        if changes["room_id"] is None:
            raise HTTPException(status_code=422, detail="room_id cannot be null")
        room = get_room_or_404(db, changes["room_id"])
        if room.project_id != pbi.project_id:
            raise HTTPException(
                status_code=422, detail="Cannot move PBI to a room in another project"
            )
    if "priority" in changes and changes["priority"] is None:
        raise HTTPException(status_code=422, detail="priority cannot be null")
    if changes.get("feature_id") is not None:
        feature = get_feature_or_404(db, changes["feature_id"])
        if feature.project_id != pbi.project_id:
            raise HTTPException(status_code=422, detail="Feature belongs to a different project")
    if changes.get("assignee_id") is not None:
        check_user_exists(db, changes["assignee_id"])
    for field, value in changes.items():
        setattr(pbi, field, value)
    db.commit()
    return pbi


@router.delete("/{pbi_id}", status_code=204)
def delete_pbi(pbi_id: int, db: DbSession) -> None:
    """Soft delete: the PBI and its tasks/costs/comments are kept but hidden."""
    pbi = get_pbi_or_404(db, pbi_id)
    pbi.status = "deleted"
    db.commit()
