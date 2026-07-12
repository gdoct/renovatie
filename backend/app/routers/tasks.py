from collections.abc import Sequence

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .. import models, schemas
from ..deps import DbSession
from .comments import delete_comments_for
from .pbis import get_live_pbi_or_error

router = APIRouter(prefix="/tasks", tags=["tasks"])


def get_task_or_404(db: DbSession, task_id: int) -> models.Task:
    task = db.get(models.Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def check_user_exists(db: DbSession, user_id: int) -> None:
    if db.get(models.User, user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")


@router.get("", response_model=list[schemas.TaskRead])
def list_tasks(
    db: DbSession,
    pbi_id: int | None = None,
    assignee_id: int | None = None,
) -> Sequence[models.Task]:
    # Tasks of soft-deleted PBIs are hidden along with their parent.
    query = (
        select(models.Task)
        .join(models.PBI)
        .where(models.PBI.status != "deleted")
        .order_by(models.Task.id)
    )
    if pbi_id is not None:
        query = query.where(models.Task.pbi_id == pbi_id)
    if assignee_id is not None:
        query = query.where(models.Task.assignee_id == assignee_id)
    return db.scalars(query).all()


@router.post("", response_model=schemas.TaskRead, status_code=201)
def create_task(payload: schemas.TaskCreate, db: DbSession) -> models.Task:
    get_live_pbi_or_error(db, payload.pbi_id)
    if payload.assignee_id is not None:
        check_user_exists(db, payload.assignee_id)
    task = models.Task(
        title=payload.title,
        description=payload.description,
        status=payload.status,
        pbi_id=payload.pbi_id,
        assignee_id=payload.assignee_id,
    )
    db.add(task)
    db.commit()
    return task


@router.patch("/{task_id}", response_model=schemas.TaskRead)
def update_task(task_id: int, payload: schemas.TaskUpdate, db: DbSession) -> models.Task:
    task = get_task_or_404(db, task_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("assignee_id") is not None:
        check_user_exists(db, changes["assignee_id"])
    for field, value in changes.items():
        setattr(task, field, value)
    db.commit()
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: DbSession) -> None:
    task = get_task_or_404(db, task_id)
    delete_comments_for(db, "task", task.id)
    db.delete(task)
    db.commit()
