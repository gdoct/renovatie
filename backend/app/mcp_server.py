"""MCP server exposing the Renovatie backlog to MCP clients (Claude Desktop,
Claude Code, ...).

Tools call the router functions directly (same process, same DB session
semantics) so all domain rules — soft-delete visibility, cross-project checks,
priority assignment, comment cascades — apply exactly as they do over REST.
Router HTTPExceptions are translated into MCP tool errors.

The write surface is deliberately conservative: PBIs can only be soft-deleted,
and there are no tools that hard-delete rooms, features, projects, or users.
"""

from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

from fastapi import HTTPException
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas
from .database import SessionLocal
from .routers import comments as comments_router
from .routers import costs as costs_router
from .routers import features as features_router
from .routers import pbis as pbis_router
from .routers import projects as projects_router
from .routers import rooms as rooms_router
from .routers import tasks as tasks_router
from .routers import users as users_router

mcp = FastMCP(
    "renovatie",
    instructions=(
        "Backlog and cost tracking for house renovation projects. "
        "Work items are called PBIs; each PBI belongs to a room (rooms may be grouped "
        "under floors), optionally to a feature (a cross-room theme like 'electricity'), "
        "and carries tasks, costs, and comments. PBI/task status is one of: todo, "
        "committed, in_progress, done. Most tools need a project_id — call list_projects "
        "first if you don't have one. Deleting a PBI is a soft delete; restore it by "
        "setting its status back to e.g. 'todo'."
    ),
    stateless_http=True,
    json_response=True,
    streamable_http_path="/",
)


@contextmanager
def db_session() -> Generator[Session, None, None]:
    """Open a DB session for one tool call; surface router errors as tool errors."""
    with SessionLocal() as db:
        try:
            yield db
        except HTTPException as exc:
            raise ToolError(str(exc.detail)) from exc


def dump(schema: type[BaseModel], obj: object) -> dict[str, Any]:
    return schema.model_validate(obj).model_dump(mode="json")


def changes(**kwargs: Any) -> dict[str, Any]:
    """Drop absent fields so router PATCH semantics (exclude_unset) hold.

    Fields therefore cannot be cleared to null through the update tools.
    """
    return {key: value for key, value in kwargs.items() if value is not None}


# --- Read tools ---------------------------------------------------------------


@mcp.tool()
def list_projects() -> list[dict[str, Any]]:
    """List all renovation projects. Call this first to find the project_id
    that other tools need."""
    with db_session() as db:
        return [dump(schemas.ProjectRead, p) for p in projects_router.list_projects(db)]


@mcp.tool()
def list_users() -> list[dict[str, Any]]:
    """List all users. Use this to resolve a person's name to the assignee_id
    accepted by PBI and task tools."""
    with db_session() as db:
        return [dump(schemas.UserRead, u) for u in users_router.list_users(db)]


@mcp.tool()
def list_rooms(project_id: int) -> list[dict[str, Any]]:
    """List the rooms of a project, including floors (is_floor=true); regular
    rooms may reference a floor via parent_id. Use this to resolve a room name
    to the room_id needed when creating or moving PBIs."""
    with db_session() as db:
        return [dump(schemas.RoomRead, r) for r in rooms_router.list_rooms(db, project_id)]


@mcp.tool()
def list_features(project_id: int) -> list[dict[str, Any]]:
    """List the features of a project (cross-room themes like 'plumbing').
    Use this to resolve a feature name to a feature_id."""
    with db_session() as db:
        return [dump(schemas.FeatureRead, f) for f in features_router.list_features(db, project_id)]


@mcp.tool()
def list_pbis(
    project_id: int,
    room_id: int | None = None,
    feature_id: int | None = None,
    status: schemas.Status | None = None,
) -> list[dict[str, Any]]:
    """List the work items (PBIs) of a project, sorted by priority, each with
    its tasks and costs. Filter by room, feature, or status; soft-deleted PBIs
    are hidden unless you explicitly pass status='deleted'."""
    with db_session() as db:
        pbis = pbis_router.list_pbis(
            db, project_id, room_id=room_id, feature_id=feature_id, status=status
        )
        return [dump(schemas.PBIRead, p) for p in pbis]


@mcp.tool()
def get_pbi(pbi_id: int) -> dict[str, Any]:
    """Get one work item (PBI) with its tasks, costs, and comments."""
    with db_session() as db:
        pbi = dump(schemas.PBIRead, pbis_router.get_pbi_or_404(db, pbi_id))
        pbi["comments"] = [
            dump(schemas.CommentRead, c) for c in comments_router.list_comments(db, "pbi", pbi_id)
        ]
        return pbi


@mcp.tool()
def cost_summary(project_id: int) -> dict[str, Any]:
    """Summarize project costs: estimated and actual totals, overall and per
    room. Call this for questions like 'what has the bathroom cost so far?'.
    For individual cost lines, use get_pbi or list_pbis instead."""
    with db_session() as db:
        rows = db.execute(
            select(models.Cost, models.Room.name)
            .join(models.PBI, models.Cost.pbi_id == models.PBI.id)
            .join(models.Room, models.PBI.room_id == models.Room.id)
            .where(models.PBI.project_id == project_id, models.PBI.status != "deleted")
        ).all()
        rooms: dict[str, dict[str, float | int]] = {}
        total = {"estimated": 0.0, "actual": 0.0, "cost_lines": 0, "purchased": 0}
        for cost, room_name in rows:
            room = rooms.setdefault(
                room_name, {"estimated": 0.0, "actual": 0.0, "cost_lines": 0, "purchased": 0}
            )
            for bucket in (room, total):
                bucket["estimated"] += cost.estimated_cost or 0
                bucket["actual"] += cost.actual_cost or 0
                bucket["cost_lines"] += 1
                bucket["purchased"] += 1 if cost.purchased else 0
        return {"total": total, "per_room": rooms}


@mcp.tool()
def list_comments(entity_type: schemas.EntityType, entity_id: int) -> list[dict[str, Any]]:
    """List the comments on a PBI, task, feature, or cost, oldest first."""
    with db_session() as db:
        return [
            dump(schemas.CommentRead, c)
            for c in comments_router.list_comments(db, entity_type, entity_id)
        ]


# --- Write tools --------------------------------------------------------------


@mcp.tool()
def create_pbi(
    room_id: int,
    title: str,
    description: str = "",
    status: schemas.Status = "todo",
    feature_id: int | None = None,
    assignee_id: int | None = None,
) -> dict[str, Any]:
    """Create a work item (PBI) in a room. It is appended at the bottom of the
    project's priority order. Resolve room/feature/assignee names to ids with
    list_rooms, list_features, and list_users first."""
    with db_session() as db:
        payload = schemas.PBICreate(
            title=title,
            room_id=room_id,
            description=description,
            status=status,
            feature_id=feature_id,
            assignee_id=assignee_id,
        )
        return dump(schemas.PBIRead, pbis_router.create_pbi(payload, db))


@mcp.tool()
def update_pbi(
    pbi_id: int,
    title: str | None = None,
    description: str | None = None,
    status: schemas.Status | None = None,
    priority: float | None = None,
    room_id: int | None = None,
    feature_id: int | None = None,
    assignee_id: int | None = None,
) -> dict[str, Any]:
    """Update a work item (PBI); only the fields you pass are changed (fields
    cannot be cleared to null with this tool). Use status to move it across the
    board (todo/committed/in_progress/done) or to restore a soft-deleted PBI.
    Lower priority values sort first."""
    with db_session() as db:
        payload = schemas.PBIUpdate(
            **changes(
                title=title,
                description=description,
                status=status,
                priority=priority,
                room_id=room_id,
                feature_id=feature_id,
                assignee_id=assignee_id,
            )
        )
        return dump(schemas.PBIRead, pbis_router.update_pbi(pbi_id, payload, db))


@mcp.tool()
def delete_pbi(pbi_id: int) -> str:
    """Soft-delete a work item (PBI): it disappears from listings but its
    tasks, costs, and comments are kept. Reversible via update_pbi with a new
    status."""
    with db_session() as db:
        pbis_router.delete_pbi(pbi_id, db)
        return f"PBI {pbi_id} soft-deleted; restore it with update_pbi(status='todo')."


@mcp.tool()
def create_task(
    pbi_id: int,
    title: str,
    description: str = "",
    assignee_id: int | None = None,
) -> dict[str, Any]:
    """Add a task (checklist item) to a work item (PBI)."""
    with db_session() as db:
        payload = schemas.TaskCreate(
            title=title, pbi_id=pbi_id, description=description, assignee_id=assignee_id
        )
        return dump(schemas.TaskRead, tasks_router.create_task(payload, db))


@mcp.tool()
def update_task(
    task_id: int,
    title: str | None = None,
    description: str | None = None,
    status: schemas.Status | None = None,
    assignee_id: int | None = None,
) -> dict[str, Any]:
    """Update a task; only the fields you pass are changed. Set status='done'
    to tick it off."""
    with db_session() as db:
        payload = schemas.TaskUpdate(
            **changes(title=title, description=description, status=status, assignee_id=assignee_id)
        )
        return dump(schemas.TaskRead, tasks_router.update_task(task_id, payload, db))


@mcp.tool()
def create_cost(
    pbi_id: int,
    title: str,
    reason: str = "",
    estimated_cost: float | None = None,
    actual_cost: float | None = None,
    purchased: bool = False,
) -> dict[str, Any]:
    """Add a cost line (planned or actual purchase) to a work item (PBI).
    Amounts are in euros."""
    with db_session() as db:
        payload = schemas.CostCreate(
            title=title,
            pbi_id=pbi_id,
            reason=reason,
            estimated_cost=estimated_cost,
            actual_cost=actual_cost,
            purchased=purchased,
        )
        return dump(schemas.CostRead, costs_router.create_cost(payload, db))


@mcp.tool()
def update_cost(
    cost_id: int,
    title: str | None = None,
    reason: str | None = None,
    estimated_cost: float | None = None,
    actual_cost: float | None = None,
    purchased: bool | None = None,
) -> dict[str, Any]:
    """Update a cost line; only the fields you pass are changed. Typically used
    to record the actual price and set purchased=true after buying."""
    with db_session() as db:
        payload = schemas.CostUpdate(
            **changes(
                title=title,
                reason=reason,
                estimated_cost=estimated_cost,
                actual_cost=actual_cost,
                purchased=purchased,
            )
        )
        return dump(schemas.CostRead, costs_router.update_cost(cost_id, payload, db))


@mcp.tool()
def create_room(
    project_id: int,
    name: str,
    is_floor: bool = False,
    parent_id: int | None = None,
) -> dict[str, Any]:
    """Create a room in a project. Pass is_floor=true to create a floor that
    groups rooms; pass parent_id (a floor's room_id) to place a room on a
    floor."""
    with db_session() as db:
        payload = schemas.RoomCreate(
            name=name, project_id=project_id, is_floor=is_floor, parent_id=parent_id
        )
        return dump(schemas.RoomRead, rooms_router.create_room(payload, db))


@mcp.tool()
def create_feature(project_id: int, name: str, description: str = "") -> dict[str, Any]:
    """Create a feature (a cross-room theme like 'electricity' or 'painting')
    in a project."""
    with db_session() as db:
        payload = schemas.FeatureCreate(name=name, project_id=project_id, description=description)
        return dump(schemas.FeatureRead, features_router.create_feature(payload, db))


@mcp.tool()
def add_comment(
    entity_type: schemas.EntityType,
    entity_id: int,
    body: str,
    author_id: int | None = None,
) -> dict[str, Any]:
    """Add a comment (Markdown supported) to a PBI, task, feature, or cost.
    Pass author_id (see list_users) so the comment is attributed."""
    with db_session() as db:
        payload = schemas.CommentCreate(
            entity_type=entity_type, entity_id=entity_id, body=body, author_id=author_id
        )
        return dump(schemas.CommentRead, comments_router.create_comment(payload, db))
