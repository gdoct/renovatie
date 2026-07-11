from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# "deleted" is a soft-delete state: hidden from listings by default, rows kept.
Status = Literal["todo", "committed", "in_progress", "done", "deleted"]
EntityType = Literal["pbi", "task", "feature", "cost"]


class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    name: str | None = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime


class UserCreate(BaseModel):
    name: str
    is_admin: bool = False


class UserUpdate(BaseModel):
    name: str | None = None
    is_admin: bool | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_admin: bool


class RoomCreate(BaseModel):
    name: str
    project_id: int


class RoomUpdate(BaseModel):
    name: str | None = None


class RoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    project_id: int


class FeatureCreate(BaseModel):
    name: str
    project_id: int
    description: str = ""


class FeatureUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class FeatureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    project_id: int


class TaskCreate(BaseModel):
    title: str
    pbi_id: int
    description: str = ""
    status: Status = "todo"
    assignee_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: Status | None = None
    assignee_id: int | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    status: Status
    pbi_id: int
    assignee_id: int | None


class CostCreate(BaseModel):
    title: str
    pbi_id: int
    reason: str = ""
    estimated_cost: float | None = None
    actual_cost: float | None = None
    purchased: bool = False


class CostUpdate(BaseModel):
    title: str | None = None
    reason: str | None = None
    estimated_cost: float | None = None
    actual_cost: float | None = None
    purchased: bool | None = None


class CostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    reason: str
    estimated_cost: float | None
    actual_cost: float | None
    purchased: bool
    pbi_id: int


class PBICreate(BaseModel):
    title: str
    room_id: int
    description: str = ""
    status: Status = "todo"
    priority: float | None = None
    feature_id: int | None = None
    assignee_id: int | None = None


class PBIUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: Status | None = None
    priority: float | None = None
    room_id: int | None = None
    feature_id: int | None = None
    assignee_id: int | None = None


class CommentCreate(BaseModel):
    entity_type: EntityType
    entity_id: int
    body: str
    author_id: int | None = None


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entity_type: EntityType
    entity_id: int
    body: str
    author_id: int | None
    created_at: datetime


class PBIRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    status: Status
    priority: float
    room_id: int
    feature_id: int | None
    assignee_id: int | None
    project_id: int
    tasks: list[TaskRead]
    costs: list[CostRead]
