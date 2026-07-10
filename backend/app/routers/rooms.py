from collections.abc import Sequence

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .. import models, schemas
from ..deps import DbSession

router = APIRouter(prefix="/rooms", tags=["rooms"])


def get_room_or_404(db: DbSession, room_id: int) -> models.Room:
    room = db.get(models.Room, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


def check_project_exists(db: DbSession, project_id: int) -> None:
    if db.get(models.Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("", response_model=list[schemas.RoomRead])
def list_rooms(db: DbSession, project_id: int) -> Sequence[models.Room]:
    return db.scalars(
        select(models.Room)
        .where(models.Room.project_id == project_id)
        .order_by(models.Room.name)
    ).all()


@router.post("", response_model=schemas.RoomRead, status_code=201)
def create_room(payload: schemas.RoomCreate, db: DbSession) -> models.Room:
    check_project_exists(db, payload.project_id)
    room = models.Room(name=payload.name, project_id=payload.project_id)
    db.add(room)
    db.commit()
    return room


@router.patch("/{room_id}", response_model=schemas.RoomRead)
def update_room(room_id: int, payload: schemas.RoomUpdate, db: DbSession) -> models.Room:
    room = get_room_or_404(db, room_id)
    if payload.name is not None:
        room.name = payload.name
    db.commit()
    return room


@router.delete("/{room_id}", status_code=204)
def delete_room(room_id: int, db: DbSession) -> None:
    room = get_room_or_404(db, room_id)
    if room.pbis:
        raise HTTPException(
            status_code=409, detail="Room still has PBIs; move or delete them first"
        )
    db.delete(room)
    db.commit()
