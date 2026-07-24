import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from . import security
from .database import Base, engine
from .deps import get_current_user
from .mcp_server import mcp
from .routers import auth, comments, costs, features, pbis, projects, rooms, tasks, users

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
        # bcrypt hashes cannot be computed in SQL; backfill_passwords() fills
        # the empty hashes right after the SQL migrations run.
        "password_hash": [
            "ALTER TABLE users ADD COLUMN password_hash VARCHAR(100) NOT NULL DEFAULT ''",
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
        "start_date": ["ALTER TABLE features ADD COLUMN start_date DATE"],
        "end_date": ["ALTER TABLE features ADD COLUMN end_date DATE"],
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
    backfill_passwords()


def backfill_passwords() -> None:
    """Give users created before authentication existed their migration
    password: their name + '1234' (they should change it after first login).
    Idempotent — users created after the auth release always have a hash."""
    with engine.begin() as connection:
        rows = connection.execute(text("SELECT id, name FROM users WHERE password_hash = ''")).all()
        for user_id, name in rows:
            connection.execute(
                text("UPDATE users SET password_hash = :hash WHERE id = :id"),
                {"hash": security.hash_password(f"{name}1234"), "id": user_id},
            )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Shared by app.main (dev) and app.serve (prod): mounted sub-apps never get
    their lifespan run, so serve.py reuses this one for the whole stack."""
    Base.metadata.create_all(bind=engine)
    migrate()
    # The MCP streamable-HTTP transport only handles requests while its session
    # manager is running.
    async with mcp.session_manager.run():
        yield


app = FastAPI(title="Renovatie API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Everything except auth requires a valid JWT. The users router manages its
# own protection per route (creating the very first user must work without a
# token); the MCP mount below is not covered by FastAPI dependencies — see the
# trust-model note in mcp_server.py.
authenticated = [Depends(get_current_user)]

app.include_router(auth.router)
app.include_router(projects.router, dependencies=authenticated)
app.include_router(rooms.router, dependencies=authenticated)
app.include_router(features.router, dependencies=authenticated)
app.include_router(pbis.router, dependencies=authenticated)
app.include_router(tasks.router, dependencies=authenticated)
app.include_router(costs.router, dependencies=authenticated)
app.include_router(users.router)
app.include_router(comments.router, dependencies=authenticated)

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/images", StaticFiles(directory=UPLOADS_DIR), name="images")
# MCP endpoint: /mcp in development, /api/mcp behind app.serve. Creating the
# streamable-HTTP app here also instantiates mcp.session_manager for lifespan.
app.mount("/mcp", mcp.streamable_http_app())


@app.post("/uploads", status_code=201, dependencies=authenticated)
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
