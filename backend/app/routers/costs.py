from collections.abc import Sequence

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .. import models, schemas
from ..deps import DbSession
from .comments import delete_comments_for
from .pbis import get_live_pbi_or_error

router = APIRouter(prefix="/costs", tags=["costs"])


def get_cost_or_404(db: DbSession, cost_id: int) -> models.Cost:
    cost = db.get(models.Cost, cost_id)
    if cost is None:
        raise HTTPException(status_code=404, detail="Cost not found")
    return cost


@router.get("", response_model=list[schemas.CostRead])
def list_costs(db: DbSession, pbi_id: int | None = None) -> Sequence[models.Cost]:
    # Costs of soft-deleted PBIs are hidden along with their parent.
    query = (
        select(models.Cost)
        .join(models.PBI)
        .where(models.PBI.status != "deleted")
        .order_by(models.Cost.id)
    )
    if pbi_id is not None:
        query = query.where(models.Cost.pbi_id == pbi_id)
    return db.scalars(query).all()


@router.post("", response_model=schemas.CostRead, status_code=201)
def create_cost(payload: schemas.CostCreate, db: DbSession) -> models.Cost:
    get_live_pbi_or_error(db, payload.pbi_id)
    cost = models.Cost(
        title=payload.title,
        reason=payload.reason,
        estimated_cost=payload.estimated_cost,
        actual_cost=payload.actual_cost,
        purchased=payload.purchased,
        pbi_id=payload.pbi_id,
    )
    db.add(cost)
    db.commit()
    return cost


@router.patch("/{cost_id}", response_model=schemas.CostRead)
def update_cost(cost_id: int, payload: schemas.CostUpdate, db: DbSession) -> models.Cost:
    cost = get_cost_or_404(db, cost_id)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(cost, field, value)
    db.commit()
    return cost


@router.delete("/{cost_id}", status_code=204)
def delete_cost(cost_id: int, db: DbSession) -> None:
    cost = get_cost_or_404(db, cost_id)
    delete_comments_for(db, "cost", cost.id)
    db.delete(cost)
    db.commit()
