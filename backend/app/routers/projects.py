from collections.abc import Sequence

from fastapi import APIRouter, HTTPException
from sqlalchemy import select, update

from .. import models, schemas
from ..deps import DbSession
from .comments import delete_comments_for
from .pbis import delete_pbi_cascade
from .users import get_user_or_404

router = APIRouter(prefix="/projects", tags=["projects"])


def get_project_or_404(db: DbSession, project_id: int) -> models.Project:
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=list[schemas.ProjectRead])
def list_projects(db: DbSession) -> Sequence[models.Project]:
    return db.scalars(select(models.Project).order_by(models.Project.name)).all()


@router.get("/{project_id}", response_model=schemas.ProjectRead)
def get_project(project_id: int, db: DbSession) -> models.Project:
    return get_project_or_404(db, project_id)


@router.post("", response_model=schemas.ProjectRead, status_code=201)
def create_project(payload: schemas.ProjectCreate, db: DbSession) -> models.Project:
    project = models.Project(name=payload.name)
    db.add(project)
    db.commit()
    return project


@router.patch("/{project_id}", response_model=schemas.ProjectRead)
def update_project(
    project_id: int, payload: schemas.ProjectUpdate, db: DbSession
) -> models.Project:
    project = get_project_or_404(db, project_id)
    if payload.name is not None:
        project.name = payload.name
    db.commit()
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: DbSession) -> None:
    project = get_project_or_404(db, project_id)
    for pbi in project.pbis:
        delete_pbi_cascade(db, pbi)
    for feature in project.features:
        delete_comments_for(db, "feature", feature.id)
        db.delete(feature)
    for room in project.rooms:
        db.delete(room)
    project.users.clear()
    db.delete(project)
    db.commit()


@router.get("/{project_id}/users", response_model=list[schemas.UserRead])
def list_project_users(project_id: int, db: DbSession) -> list[models.User]:
    project = get_project_or_404(db, project_id)
    return sorted(project.users, key=lambda user: user.name)


@router.put("/{project_id}/users/{user_id}", status_code=204)
def add_project_user(project_id: int, user_id: int, db: DbSession) -> None:
    project = get_project_or_404(db, project_id)
    user = get_user_or_404(db, user_id)
    if user not in project.users:
        project.users.append(user)
    db.commit()


@router.delete("/{project_id}/users/{user_id}", status_code=204)
def remove_project_user(project_id: int, user_id: int, db: DbSession) -> None:
    project = get_project_or_404(db, project_id)
    user = get_user_or_404(db, user_id)
    if user in project.users:
        project.users.remove(user)
    db.execute(
        update(models.PBI)
        .where(models.PBI.project_id == project_id, models.PBI.assignee_id == user_id)
        .values(assignee_id=None)
    )
    db.execute(
        update(models.Task)
        .where(
            models.Task.assignee_id == user_id,
            models.Task.pbi_id.in_(
                select(models.PBI.id).where(models.PBI.project_id == project_id)
            ),
        )
        .values(assignee_id=None)
    )
    db.commit()
