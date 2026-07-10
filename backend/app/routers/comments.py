from collections.abc import Sequence

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import DbSession

router = APIRouter(prefix="/comments", tags=["comments"])

ENTITY_MODELS: dict[
    str, type[models.PBI] | type[models.Task] | type[models.Feature] | type[models.Cost]
] = {
    "pbi": models.PBI,
    "task": models.Task,
    "feature": models.Feature,
    "cost": models.Cost,
}


def delete_comments_for(db: Session, entity_type: str, entity_id: int) -> None:
    """Remove all comments attached to an entity; call this when the entity is deleted."""
    db.execute(
        delete(models.Comment).where(
            models.Comment.entity_type == entity_type,
            models.Comment.entity_id == entity_id,
        )
    )


@router.get("", response_model=list[schemas.CommentRead])
def list_comments(
    db: DbSession, entity_type: schemas.EntityType, entity_id: int
) -> Sequence[models.Comment]:
    query = (
        select(models.Comment)
        .where(
            models.Comment.entity_type == entity_type,
            models.Comment.entity_id == entity_id,
        )
        .order_by(models.Comment.created_at, models.Comment.id)
    )
    return db.scalars(query).all()


@router.post("", response_model=schemas.CommentRead, status_code=201)
def create_comment(payload: schemas.CommentCreate, db: DbSession) -> models.Comment:
    if not payload.body.strip():
        raise HTTPException(status_code=422, detail="Comment body cannot be empty")
    if db.get(ENTITY_MODELS[payload.entity_type], payload.entity_id) is None:
        raise HTTPException(status_code=404, detail=f"{payload.entity_type} not found")
    if payload.author_id is not None and db.get(models.User, payload.author_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    comment = models.Comment(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        body=payload.body,
        author_id=payload.author_id,
    )
    db.add(comment)
    db.commit()
    return comment


@router.delete("/{comment_id}", status_code=204)
def delete_comment(comment_id: int, db: DbSession) -> None:
    comment = db.get(models.Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    db.delete(comment)
    db.commit()
