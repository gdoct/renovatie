# Renovatie — product spec

Renovatie is a kanban-style project management tool inspired by Azure DevOps, tailored to
house renovation projects. It helps organize work, track progress, and manage
responsibilities across rooms, features, PBIs, and tasks. It is intended for personal use
on a trusted network, so there is deliberately no authentication or security hardening.

## Domain model

- **Project** — one renovation (e.g. "Renovatie 2026"). Rooms, features, and PBIs belong
  to a project. Users are global and are joined to projects; the first user ever created
  is an admin and can manage projects and users.
- **Room** — an area of the house. The room view shows all remaining PBIs for that room,
  making it easy to see what work is still outstanding in each area.
- **Feature** — groups related PBIs so a larger renovation goal can be tracked as a
  single unit of progress.
- **PBI** (product backlog item) — a renovation work item with a status, assignee,
  priority, and its associated tasks, costs, and comments.
- **Task** — a unit of work within a PBI, assignable to a user, with its own status.
- **Cost** — a purchase or expense attached to a PBI: what it is, why it is needed, the
  estimated cost, and the actual cost once purchased. Costs appear on board cards as a
  checklist (checked = purchased), visually distinct from tasks, with a spent/planned
  total per PBI.
- **Comment** — discussion on a PBI, attributed to a user, with Markdown support and
  image uploads.

## Frontend

The frontend provides a sprint-board experience:

- create new PBIs and move them between the To Do, Committed, In Progress, and Done
  columns
- drag PBIs up or down to reprioritize; priority is a single global number across all
  columns, so the whole project can be ordered by priority
- monitor progress by room and by feature, and track spending on the cost dashboard
- assign users to PBIs and tasks and update status as work advances

It is a React + TypeScript single-page app built with Vite, talking to the backend REST
API, and designed to be responsive so the board is usable from any device. Code quality
is enforced with oxlint and formatting with prettier.

## Backend

The backend is a FastAPI application exposing a REST API for projects, rooms, features,
PBIs, tasks, costs, users, comments, and image uploads. Data is stored in a SQLite
database via the SQLAlchemy ORM; the schema is created on startup, and small idempotent
in-app migrations add columns introduced after a table first shipped. The database file
and uploaded images live outside git (and on a named volume in the Docker deployment).

Dependencies are managed with `uv`. Code quality is enforced with `black` (formatting)
and `pyright` in strict mode (type checking).
