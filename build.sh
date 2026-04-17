#!/usr/bin/env bash

set -euo pipefail

REGISTRY="ghcr.io"
GHCR_USER="${GHCR_USER:-$(git config --get user.name | tr '[:upper:]' '[:lower:]' | tr ' ' '-' || echo toki0179)}"
GHCR_IMAGE="${GHCR_IMAGE:-voidservices}"
PLATFORMS="${1:-${PLATFORMS:-linux/amd64,linux/arm64}}"
IMAGE_REF="${REGISTRY}/${GHCR_USER}/${GHCR_IMAGE}"
BUILDER_NAME="${BUILDER_NAME:-voidservices-builder}"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"

echo "==> Docker multi-arch release"
echo "Image: ${IMAGE_REF}"
echo "Platforms: ${PLATFORMS}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but not installed."
  exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
  echo "Docker buildx is required but unavailable."
  exit 1
fi

if ! docker buildx inspect "${BUILDER_NAME}" >/dev/null 2>&1; then
  docker buildx create --name "${BUILDER_NAME}" --driver docker-container --use >/dev/null
else
  docker buildx use "${BUILDER_NAME}" >/dev/null
fi

if [ -n "${GHCR_TOKEN:-}" ]; then
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER}" --password-stdin >/dev/null
fi

docker buildx build \
  --platform "${PLATFORMS}" \
  --tag "${IMAGE_REF}:latest" \
  --tag "${IMAGE_REF}:${GIT_SHA}" \
  --push \
  .

echo "✅ Build and push complete"
echo "Published tags:"
echo "- ${IMAGE_REF}:latest"
echo "- ${IMAGE_REF}:${GIT_SHA}"
