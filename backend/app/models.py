from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

project_users = Table(
    "project_users",
    Base.metadata,
    Column("project_id", Integer, ForeignKey("projects.id"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    rooms: Mapped[list["Room"]] = relationship(back_populates="project")
    features: Mapped[list["Feature"]] = relationship(back_populates="project")
    pbis: Mapped[list["PBI"]] = relationship(back_populates="project")
    users: Mapped[list["User"]] = relationship(secondary=project_users, back_populates="projects")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    is_admin: Mapped[bool] = mapped_column(default=False)

    tasks: Mapped[list["Task"]] = relationship(back_populates="assignee")
    pbis: Mapped[list["PBI"]] = relationship(back_populates="assignee")
    comments: Mapped[list["Comment"]] = relationship(back_populates="author")
    projects: Mapped[list[Project]] = relationship(secondary=project_users, back_populates="users")


class Room(Base):
    """A room, or — when is_floor is set — a floor that groups rooms.

    A floor is a room like any other (PBIs can point at it directly); regular
    rooms may reference a floor via parent_id. The hierarchy is one level deep:
    floors never have a parent themselves.
    """

    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    is_floor: Mapped[bool] = mapped_column(default=False)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id"), default=None)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))

    project: Mapped[Project] = relationship(back_populates="rooms")
    parent: Mapped["Room | None"] = relationship(back_populates="children", remote_side="Room.id")
    children: Mapped[list["Room"]] = relationship(back_populates="parent")
    pbis: Mapped[list["PBI"]] = relationship(back_populates="room")


class Feature(Base):
    __tablename__ = "features"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))

    project: Mapped[Project] = relationship(back_populates="features")
    pbis: Mapped[list["PBI"]] = relationship(back_populates="feature")


class PBI(Base):
    __tablename__ = "pbis"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="todo")
    # Global sort order across all lanes; lower floats first. Reordering assigns
    # the midpoint of the new neighbours' priorities, so ties and fractions are normal.
    priority: Mapped[float] = mapped_column(default=0)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"))
    feature_id: Mapped[int | None] = mapped_column(ForeignKey("features.id"), default=None)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))

    project: Mapped[Project] = relationship(back_populates="pbis")
    room: Mapped[Room] = relationship(back_populates="pbis")
    feature: Mapped[Feature | None] = relationship(back_populates="pbis")
    assignee: Mapped[User | None] = relationship(back_populates="pbis")
    tasks: Mapped[list["Task"]] = relationship(back_populates="pbi", cascade="all, delete-orphan")
    costs: Mapped[list["Cost"]] = relationship(back_populates="pbi", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="todo")
    pbi_id: Mapped[int] = mapped_column(ForeignKey("pbis.id"))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)

    pbi: Mapped[PBI] = relationship(back_populates="tasks")
    assignee: Mapped[User | None] = relationship(back_populates="tasks")


class Cost(Base):
    __tablename__ = "costs"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    reason: Mapped[str] = mapped_column(Text, default="")
    estimated_cost: Mapped[float | None] = mapped_column(default=None)
    actual_cost: Mapped[float | None] = mapped_column(default=None)
    purchased: Mapped[bool] = mapped_column(default=False)
    pbi_id: Mapped[int] = mapped_column(ForeignKey("pbis.id"))

    pbi: Mapped[PBI] = relationship(back_populates="costs")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[int] = mapped_column()
    body: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    author: Mapped[User | None] = relationship(back_populates="comments")
