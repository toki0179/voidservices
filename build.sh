#!/bin/bash

# Multi-architecture Docker build and push script
# Requires Docker buildx to be installed and configured
# Supported platforms: linux/amd64,linux/arm64,linux/arm/v7

REGISTRY="ghcr.io"
IMAGE_NAME="toki0179/voidservices"
PLATFORMS="${1:-linux/amd64,linux/arm64}"

echo "Building multi-arch Docker image..."
echo "Registry: $REGISTRY"
echo "Image: $IMAGE_NAME"
echo "Platforms: $PLATFORMS"

# Build and push
docker buildx build \
  --platform "$PLATFORMS" \
  --tag "$REGISTRY/$IMAGE_NAME:latest" \
  --push \
  .

if [ $? -eq 0 ]; then
  echo "✅ Multi-arch build successful!"
  echo "Image pushed to: $REGISTRY/$IMAGE_NAME:latest"
else
  echo "❌ Build failed"
  exit 1
fi
