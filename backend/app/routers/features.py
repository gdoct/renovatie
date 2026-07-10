from collections.abc import Sequence

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .. import models, schemas
from ..deps import DbSession
from .comments import delete_comments_for

router = APIRouter(prefix="/features", tags=["features"])


def get_feature_or_404(db: DbSession, feature_id: int) -> models.Feature:
    feature = db.get(models.Feature, feature_id)
    if feature is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    return feature


def check_project_exists(db: DbSession, project_id: int) -> None:
    if db.get(models.Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("", response_model=list[schemas.FeatureRead])
def list_features(db: DbSession, project_id: int) -> Sequence[models.Feature]:
    return db.scalars(
        select(models.Feature)
        .where(models.Feature.project_id == project_id)
        .order_by(models.Feature.name)
    ).all()


@router.post("", response_model=schemas.FeatureRead, status_code=201)
def create_feature(payload: schemas.FeatureCreate, db: DbSession) -> models.Feature:
    check_project_exists(db, payload.project_id)
    feature = models.Feature(
        name=payload.name, description=payload.description, project_id=payload.project_id
    )
    db.add(feature)
    db.commit()
    return feature


@router.patch("/{feature_id}", response_model=schemas.FeatureRead)
def update_feature(
    feature_id: int, payload: schemas.FeatureUpdate, db: DbSession
) -> models.Feature:
    feature = get_feature_or_404(db, feature_id)
    if payload.name is not None:
        feature.name = payload.name
    if payload.description is not None:
        feature.description = payload.description
    db.commit()
    return feature


@router.delete("/{feature_id}", status_code=204)
def delete_feature(feature_id: int, db: DbSession) -> None:
    feature = get_feature_or_404(db, feature_id)
    for pbi in feature.pbis:
        pbi.feature_id = None
    delete_comments_for(db, "feature", feature.id)
    db.delete(feature)
    db.commit()
