#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [ ! -f "${ENV_FILE}" ]; then
  cp "${ROOT_DIR}/.env.example" "${ENV_FILE}"
  echo "Created .env from .env.example. Fill required values before deploying."
  exit 1
fi

required_vars=(DISCORD_TOKEN CLIENT_ID GUILD_ID)
for key in "${required_vars[@]}"; do
  if ! grep -q "^${key}=." "${ENV_FILE}"; then
    echo "Missing required value in .env: ${key}"
    exit 1
  fi
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but not installed."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin is required."
  exit 1
fi

docker compose --env-file "${ENV_FILE}" pull
docker compose --env-file "${ENV_FILE}" up -d

echo "✅ Stack is up"
docker compose ps
