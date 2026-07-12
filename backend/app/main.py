import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from .database import Base, engine
from .routers import comments, costs, features, pbis, projects, rooms, tasks, users

UPLOADS_DIR = Path(
    os.environ.get("UPLOADS_DIR", Path(__file__).resolve().parent.parent / "uploads")
)
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

# Pre-project databases get their existing data attached to a default project.
# Idempotent (WHERE NOT EXISTS) and repeated in every project_id block so the
# outcome does not depend on dict iteration order.
SEED_DEFAULT_PROJECT = (
    "INSERT INTO projects (name, created_at) "
    "SELECT 'Renovatie 2026', CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM projects)"
)

MIGRATIONS: dict[str, dict[str, list[str]]] = {
    "users": {
        "is_admin": [
            "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0",
            "UPDATE users SET is_admin = 1 WHERE id = 1",
        ],
    },
    "rooms": {
        # SQLite cannot ADD COLUMN NOT NULL without a constant default, so the
        # column is added nullable and backfilled in the same transaction.
        "project_id": [
            SEED_DEFAULT_PROJECT,
            "ALTER TABLE rooms ADD COLUMN project_id INTEGER REFERENCES projects(id)",
            "UPDATE rooms SET project_id = (SELECT min(id) FROM projects)",
            "INSERT OR IGNORE INTO project_users (project_id, user_id) "
            "SELECT (SELECT min(id) FROM projects), id FROM users",
        ],
        "is_floor": ["ALTER TABLE rooms ADD COLUMN is_floor BOOLEAN NOT NULL DEFAULT 0"],
        "parent_id": ["ALTER TABLE rooms ADD COLUMN parent_id INTEGER REFERENCES rooms(id)"],
    },
    "features": {
        "project_id": [
            SEED_DEFAULT_PROJECT,
            "ALTER TABLE features ADD COLUMN project_id INTEGER REFERENCES projects(id)",
            "UPDATE features SET project_id = (SELECT min(id) FROM projects)",
        ],
    },
    "pbis": {
        "assignee_id": ["ALTER TABLE pbis ADD COLUMN assignee_id INTEGER REFERENCES users(id)"],
        "priority": [
            "ALTER TABLE pbis ADD COLUMN priority REAL NOT NULL DEFAULT 0",
            "UPDATE pbis SET priority = id",
        ],
        "project_id": [
            SEED_DEFAULT_PROJECT,
            "ALTER TABLE pbis ADD COLUMN project_id INTEGER REFERENCES projects(id)",
            "UPDATE pbis SET project_id = (SELECT min(id) FROM projects)",
        ],
    },
    "tasks": {
        "description": ["ALTER TABLE tasks ADD COLUMN description TEXT NOT NULL DEFAULT ''"],
    },
}


def migrate() -> None:
    """Add columns introduced after a table was first created; create_all skips those."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table, columns in MIGRATIONS.items():
            if table not in tables:
                continue
            existing = {column["name"] for column in inspector.get_columns(table)}
            for column, statements in columns.items():
                if column not in existing:
                    for statement in statements:
                        connection.execute(text(statement))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    Base.metadata.create_all(bind=engine)
    migrate()
    yield


app = FastAPI(title="Renovatie API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(rooms.router)
app.include_router(features.router)
app.include_router(pbis.router)
app.include_router(tasks.router)
app.include_router(costs.router)
app.include_router(users.router)
app.include_router(comments.router)

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/images", StaticFiles(directory=UPLOADS_DIR), name="images")


@app.post("/uploads", status_code=201)
async def upload_image(file: UploadFile) -> dict[str, str]:
    extension = Path(file.filename or "").suffix.lower()
    if extension not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Only image files are supported")
    name = f"{uuid4().hex}{extension}"
    content = await file.read()
    (UPLOADS_DIR / name).write_bytes(content)
    return {"url": f"/images/{name}"}


@app.get("/")
def health() -> dict[str, str]:
    return {"status": "ok"}
