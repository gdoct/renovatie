"""Production entrypoint: serves the built frontend at / and the API under /api.

The frontend always calls the API with an /api prefix (stripped by the Vite dev
proxy during development); here the API app is mounted at /api instead.
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .main import app as api

# Mounted sub-apps do not get their lifespan run, so reuse the API's lifespan
# (database init + MCP session manager) on this outer app.
from .main import lifespan

FRONTEND_DIST = Path(
    os.environ.get(
        "FRONTEND_DIST", Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    )
)

app = FastAPI(lifespan=lifespan)
app.mount("/api", api)
app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
