#!/usr/bin/env bash
# Build the renovatie Docker image.
# Usage: ./build.sh [tag]   (default tag: latest)
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${IMAGE:-renovatie}"
TAG="${1:-latest}"

docker build -t "$IMAGE:$TAG" .
echo "Built $IMAGE:$TAG"
