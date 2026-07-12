# Renovatie

Kanban-style project management for house renovation projects. See [SPEC.md](SPEC.md) for the full spec.

<img width="734" height="477" alt="image" src="https://github.com/user-attachments/assets/6c5d4642-0b3c-4af7-be12-9fb5ead5a590" />

# Features
* Extremely easy to use — no setup beyond picking a name, and all changes are saved automatically
* Kanban board with To Do / Committed / In Progress / Done columns; drag and drop to change status or reprioritize (priority is a single global order across the whole project)
* Organize work by **room** and by **feature** — see at a glance what is still outstanding in each area of the house
* Work items carry tasks, an assignee, comments (with Markdown and image uploads), and costs
* Cost tracking: estimated vs. actual price per purchase, a purchase checklist on each card, and a spending dashboard with planned/spent/remaining totals and a per-room breakdown
* Progress at a glance: done/total counters per room and per feature in the sidebar (which doubles as a board filter), plus a dashboard with status and per-person workload charts
* Backlog view for planning work that isn't on the board yet
* Multiple projects with a new-project wizard; deleted items are soft-deleted so nothing is lost by accident
* Multi-user without authentication — intended for your trusted home network
* Built-in [MCP server](MCP.md): manage the board in natural language from Claude (Desktop/Code) — "add 'request painter quote' to the bathroom", "what has the bathroom cost so far?"
* Available in English and Dutch
* Responsive layout, so you can update the board from your phone while standing in the room you're renovating
* Ships as a single Docker image (frontend + API + SQLite), deployable with one script


## Running the app locally

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

## Using it from Claude (MCP)

The backend exposes its tools over MCP at `/mcp` (development) or `/api/mcp` (Docker
deployment), so Claude Desktop and Claude Code can read and update the board directly —
no API key or LLM configuration in the app itself. Quick start with Claude Code:

```bash
claude mcp add --transport http renovatie http://<host>:5567/api/mcp
```

For Claude Desktop, use the local `mcp-remote` bridge described in [MCP.md](MCP.md) —
Desktop's "custom connectors" are brokered by Anthropic's cloud and cannot reach LAN-only
servers. `./setup-https.sh` provisions a local CA plus an nginx TLS proxy on the Docker
host (port 8443) for encrypted, warning-free access. MCP.md also has the full tool list and
security notes (the endpoint is unauthenticated, like the rest of the app — keep it on your
trusted network).

## Quality tooling

- Backend: `uv run black app` (formatting), `uv run pyright` (type checking)
- Frontend: `yarn lint` (oxlint), `yarn format` (prettier), `yarn build` (typecheck + production build)
