# Renovatie

Kanban-style project management for house renovation projects. See [SPEC.md](SPEC.md) for the full spec.

<img width="734" height="477" alt="image" src="https://github.com/user-attachments/assets/6c5d4642-0b3c-4af7-be12-9fb5ead5a590" />

## Running

Backend (FastAPI + SQLite, managed with [uv](https://docs.astral.sh/uv/)):

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

The SQLite database (`backend/renovatie.db`) is created automatically on first start and is excluded from git.

Frontend (React + Vite):

```bash
cd frontend
yarn dev
```

Open http://localhost:5173 — the dev server proxies `/api/*` to the backend on port 8000.

## Docker deployment

The app ships as a single Docker image: a multi-stage build compiles the frontend, and the
container serves it together with the API (mounted under `/api`) via `app.serve:app`.

```bash
cp .env.example .env    # then set DEPLOY_HOST to your Docker host (SSH alias or user@host)
./build.sh              # build the renovatie:latest image
./deploy.sh             # build + deploy to $DEPLOY_HOST on port 5567
```

`deploy.sh` transfers the image over SSH (no registry needed), creates the `renovatie-data`
named volume, and (re)starts the container. The SQLite database and uploaded images live on
that volume (`/data` in the container), so they survive image upgrades. It also opens the
port in ufw/firewalld when one is active. Deployment settings come from the gitignored
`.env` file; environment variables override it, e.g. `PORT=8080 DEPLOY_HOST=other-host ./deploy.sh`.

Runtime configuration (environment variables):

- `DATABASE_PATH` — SQLite file path (default `./renovatie.db`; `/data/renovatie.db` in the image)
- `UPLOADS_DIR` — uploaded images directory (default `backend/uploads`; `/data/uploads` in the image)
- `FRONTEND_DIST` — built frontend to serve (default `frontend/dist`; `/app/static` in the image)

## Quality tooling

- Backend: `uv run black app` (formatting), `uv run pyright` (type checking)
- Frontend: `yarn lint` (oxlint), `yarn format` (prettier), `yarn build` (typecheck + production build)
