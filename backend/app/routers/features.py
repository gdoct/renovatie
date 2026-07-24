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


@router.get("/dependencies", response_model=list[schemas.FeatureDependencyRead])
def list_dependencies(db: DbSession, project_id: int) -> Sequence[models.FeatureDependency]:
    return db.scalars(
        select(models.FeatureDependency)
        .join(models.Feature, models.FeatureDependency.feature_id == models.Feature.id)
        .where(models.Feature.project_id == project_id)
        .order_by(models.FeatureDependency.id)
    ).all()


@router.patch("/{feature_id}", response_model=schemas.FeatureRead)
def update_feature(
    feature_id: int, payload: schemas.FeatureUpdate, db: DbSession
) -> models.Feature:
    feature = get_feature_or_404(db, feature_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("name") is None and "name" in changes:
        raise HTTPException(status_code=422, detail="name cannot be null")
    if changes.get("description") is None and "description" in changes:
        raise HTTPException(status_code=422, detail="description cannot be null")
    for field, value in changes.items():
        setattr(feature, field, value)
    if (
        feature.start_date is not None
        and feature.end_date is not None
        and feature.start_date > feature.end_date
    ):
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")
    db.commit()
    return feature


@router.post(
    "/{feature_id}/dependencies", response_model=schemas.FeatureDependencyRead, status_code=201
)
def add_dependency(
    feature_id: int, payload: schemas.FeatureDependencyCreate, db: DbSession
) -> models.FeatureDependency:
    feature = get_feature_or_404(db, feature_id)
    pbi = db.get(models.PBI, payload.depends_on_pbi_id)
    if pbi is None:
        raise HTTPException(status_code=404, detail="PBI not found")
    if pbi.status == "deleted":
        raise HTTPException(status_code=409, detail="PBI is deleted")
    if pbi.project_id != feature.project_id:
        raise HTTPException(status_code=422, detail="PBI belongs to a different project")
    if pbi.feature_id == feature.id:
        raise HTTPException(status_code=422, detail="A feature cannot depend on its own PBI")
    duplicate = db.scalar(
        select(models.FeatureDependency).where(
            models.FeatureDependency.feature_id == feature.id,
            models.FeatureDependency.depends_on_pbi_id == pbi.id,
        )
    )
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="Dependency already exists")
    dependency = models.FeatureDependency(feature_id=feature.id, depends_on_pbi_id=pbi.id)
    db.add(dependency)
    db.commit()
    return dependency


@router.delete("/{feature_id}/dependencies/{dependency_id}", status_code=204)
def remove_dependency(feature_id: int, dependency_id: int, db: DbSession) -> None:
    dependency = db.get(models.FeatureDependency, dependency_id)
    if dependency is None or dependency.feature_id != feature_id:
        raise HTTPException(status_code=404, detail="Dependency not found")
    db.delete(dependency)
    db.commit()


@router.delete("/{feature_id}", status_code=204)
def delete_feature(feature_id: int, db: DbSession) -> None:
    feature = get_feature_or_404(db, feature_id)
    for pbi in feature.pbis:
        pbi.feature_id = None
    delete_comments_for(db, "feature", feature.id)
    db.delete(feature)
    db.commit()
