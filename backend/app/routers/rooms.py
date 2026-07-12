from collections.abc import Sequence

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .. import models, schemas
from ..deps import DbSession
from .pbis import delete_pbi_cascade

router = APIRouter(prefix="/rooms", tags=["rooms"])


def get_room_or_404(db: DbSession, room_id: int) -> models.Room:
    room = db.get(models.Room, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


def check_project_exists(db: DbSession, project_id: int) -> None:
    if db.get(models.Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")


def get_floor_or_422(db: DbSession, parent_id: int, project_id: int) -> models.Room:
    """The room a parent_id points at must be a floor in the same project."""
    parent = db.get(models.Room, parent_id)
    if parent is None:
        raise HTTPException(status_code=404, detail="Floor not found")
    if not parent.is_floor:
        raise HTTPException(status_code=422, detail="Parent must be a floor")
    if parent.project_id != project_id:
        raise HTTPException(status_code=422, detail="Floor belongs to a different project")
    return parent


@router.get("", response_model=list[schemas.RoomRead])
def list_rooms(db: DbSession, project_id: int) -> Sequence[models.Room]:
    return db.scalars(
        select(models.Room).where(models.Room.project_id == project_id).order_by(models.Room.name)
    ).all()


@router.post("", response_model=schemas.RoomRead, status_code=201)
def create_room(payload: schemas.RoomCreate, db: DbSession) -> models.Room:
    check_project_exists(db, payload.project_id)
    if payload.parent_id is not None:
        if payload.is_floor:
            raise HTTPException(status_code=422, detail="A floor cannot be inside a floor")
        get_floor_or_422(db, payload.parent_id, payload.project_id)
    room = models.Room(
        name=payload.name,
        project_id=payload.project_id,
        is_floor=payload.is_floor,
        parent_id=payload.parent_id,
    )
    db.add(room)
    db.commit()
    return room


@router.patch("/{room_id}", response_model=schemas.RoomRead)
def update_room(room_id: int, payload: schemas.RoomUpdate, db: DbSession) -> models.Room:
    room = get_room_or_404(db, room_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("name") is not None:
        room.name = changes["name"]
    if "parent_id" in changes:
        if changes["parent_id"] is not None:
            if room.is_floor:
                raise HTTPException(status_code=422, detail="A floor cannot be inside a floor")
            get_floor_or_422(db, changes["parent_id"], room.project_id)
        room.parent_id = changes["parent_id"]
    db.commit()
    return room


@router.delete("/{room_id}", status_code=204)
def delete_room(room_id: int, db: DbSession) -> None:
    room = get_room_or_404(db, room_id)
    if room.children:
        raise HTTPException(
            status_code=409, detail="Floor still has rooms; move or delete them first"
        )
    if any(pbi.status != "deleted" for pbi in room.pbis):
        raise HTTPException(
            status_code=409, detail="Room still has PBIs; move or delete them first"
        )
    # Only soft-deleted PBIs remain; purge them for real so no rows keep
    # referencing the room.
    for pbi in list(room.pbis):
        delete_pbi_cascade(db, pbi)
    db.delete(room)
    db.commit()
