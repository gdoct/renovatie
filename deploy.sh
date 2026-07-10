#!/usr/bin/env bash
# Build the renovatie image, ship it to the Docker host over SSH, and (re)start
# the container with persistent data on a named volume.
#
# Usage: ./deploy.sh [tag]   (default tag: latest)
#
# Configuration (set in a gitignored .env file — see .env.example — or the
# environment; environment variables take precedence):
#   DEPLOY_HOST  SSH host to deploy to        (required)
#   PORT         host port to publish         (default: 5567)
#   IMAGE        image name                   (default: renovatie)
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] && . ./.env

HOST="${DEPLOY_HOST:?DEPLOY_HOST is not set — copy .env.example to .env and edit it, or export DEPLOY_HOST}"
IMAGE="${IMAGE:-renovatie}"
TAG="${1:-latest}"
PORT="${PORT:-5567}"
CONTAINER="renovatie"
VOLUME="renovatie-data"

if docker info >/dev/null 2>&1; then
  ./build.sh "$TAG"
  echo "==> Transferring $IMAGE:$TAG to $HOST ..."
  docker save "$IMAGE:$TAG" | gzip | ssh "$HOST" 'gunzip | docker load'
else
  echo "==> Local Docker unavailable; building on $HOST from streamed source ..."
  tar -czf - \
    --exclude=./.git \
    --exclude=./frontend/node_modules \
    --exclude=./frontend/dist \
    --exclude=./backend/.venv \
    --exclude='__pycache__' \
    --exclude=./backend/renovatie.db \
    --exclude=./backend/uploads \
    . | ssh "$HOST" "docker build --network=host -t '$IMAGE:$TAG' -"
fi

echo "==> Ensuring data volume exists on $HOST ..."
ssh "$HOST" "docker volume create $VOLUME >/dev/null"

# One-off seed: if we have a local database and the volume doesn't hold one yet,
# copy the local database and uploads into the volume before the first start.
if [ -f backend/renovatie.db ] &&
  ! ssh "$HOST" "docker run --rm -v $VOLUME:/data alpine test -f /data/renovatie.db" 2>/dev/null; then
  echo "==> Seeding volume with local database and uploads ..."
  seed_items=(renovatie.db)
  [ -d backend/uploads ] && seed_items+=(uploads)
  tar -C backend -cf - "${seed_items[@]}" |
    ssh "$HOST" "docker run --rm -i -v $VOLUME:/data alpine tar -C /data -xf -"
fi

echo "==> Starting container on $HOST ..."
ssh "$HOST" bash -s <<EOF
set -euo pipefail

docker rm -f $CONTAINER >/dev/null 2>&1 || true
docker run -d --name $CONTAINER \
  --restart unless-stopped \
  -p $PORT:5567 \
  -v $VOLUME:/data \
  -e DATABASE_PATH=/data/renovatie.db \
  -e UPLOADS_DIR=/data/uploads \
  "$IMAGE:$TAG" >/dev/null

# Open the firewall port if a host firewall is active. Note that Docker's
# published ports bypass ufw by default, so this is belt-and-braces.
if command -v ufw >/dev/null 2>&1 && sudo -n ufw status 2>/dev/null | grep -q "Status: active"; then
  sudo -n ufw allow $PORT/tcp
  echo "ufw: allowed $PORT/tcp"
elif command -v firewall-cmd >/dev/null 2>&1 && sudo -n firewall-cmd --state >/dev/null 2>&1; then
  sudo -n firewall-cmd --permanent --add-port=$PORT/tcp
  sudo -n firewall-cmd --reload
  echo "firewalld: opened $PORT/tcp"
else
  echo "No active ufw/firewalld found (or passwordless sudo unavailable); skipped firewall step."
fi
EOF

echo "==> Waiting for the app to come up ..."
for i in {1..15}; do
  if ssh "$HOST" "curl -fsS http://localhost:$PORT/api/" >/dev/null 2>&1; then
    echo "Deployed: http://$HOST:$PORT/"
    exit 0
  fi
  sleep 1
done

echo "App did not respond on port $PORT; recent container logs:" >&2
ssh "$HOST" "docker logs --tail 50 $CONTAINER" >&2
exit 1
