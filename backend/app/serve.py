"""Production entrypoint: serves the built frontend at / and the API under /api.

The frontend always calls the API with an /api prefix (stripped by the Vite dev
proxy during development); here the API app is mounted at /api instead.
"""

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from .main import app as api
from .main import migrate

FRONTEND_DIST = Path(
    os.environ.get(
        "FRONTEND_DIST", Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    )
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    # Mounted sub-apps do not get their lifespan run, so initialize the database here.
    Base.metadata.create_all(bind=engine)
    migrate()
    yield


app = FastAPI(lifespan=lifespan)
app.mount("/api", api)
app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
