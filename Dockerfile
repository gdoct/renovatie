# Stage 1: build the frontend
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ ./
RUN yarn build

# Stage 2: backend runtime
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/app ./app
COPY --from=frontend /build/dist ./static

ENV DATABASE_PATH=/data/renovatie.db \
    UPLOADS_DIR=/data/uploads \
    FRONTEND_DIST=/app/static

VOLUME /data
EXPOSE 5567

CMD ["uv", "run", "--no-sync", "uvicorn", "app.serve:app", "--host", "0.0.0.0", "--port", "5567"]
