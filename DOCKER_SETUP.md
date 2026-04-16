# Docker & GitHub Setup Guide

## Prerequisites
- Docker 20.10+ or Docker Desktop with BuildX
- GitHub account with `toki0179` user
- Personal Access Token with `repo` scope (generate at https://github.com/settings/tokens)

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `voidservices`
3. Description: "Discord bot with Nitro proof cards, selfbot, and LLM integration"
4. Make it **Public** (for GHCR access)
5. Click "Create repository"

## Step 2: Push Code to GitHub

After creating the repository, run:

```bash
cd /Users/olliwes01/Documents/voidservices

# Update remote URL if repo was created
git remote remove origin
git remote add origin https://toki0179:<YOUR_GITHUB_TOKEN>@github.com/toki0179/voidservices.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 3: Configure Docker Buildx for Multi-Arch

```bash
# Create buildx builder for multi-arch builds
docker buildx create --name voidservices-builder --use

# List available builders
docker buildx ls
```

## Step 4: Build and Push to GHCR

First, authenticate with GHCR:

```bash
echo "<YOUR_GITHUB_TOKEN>" | docker login ghcr.io -u toki0179 --password-stdin
```

Then build and push for multiple architectures:

```bash
cd /Users/olliwes01/Documents/voidservices

# Build for linux/amd64 and linux/arm64 (change as needed)
./build.sh "linux/amd64,linux/arm64"

# Or manually:
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/toki0179/voidservices:latest \
  --push \
  .
```

## Step 5: Deploy on Linux Server

Create `.env` file on your Linux server:

```bash
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id
```

Then deploy with docker-compose:

```bash
# Pull and run container
docker-compose up -d

# View logs
docker-compose logs -f voidbot

# Stop container
docker-compose down
```

## Supported Architectures

- `linux/amd64` - x86-64 (most common for servers)
- `linux/arm64` - ARM 64-bit (Apple Silicon, newer ARM servers)
- `linux/arm/v7` - 32-bit ARM (Raspberry Pi)

## GHCR Image Variants

Once built and pushed, image will be available at:
```
ghcr.io/toki0179/voidservices:latest
```

Or pull specific architecture:
```bash
docker pull ghcr.io/toki0179/voidservices:latest
```

## Environment Variables for docker-compose

Required:
- `DISCORD_TOKEN` - Your Discord bot token
- `DISCORD_CLIENT_ID` - Application ID from Discord Developer Portal
- `DISCORD_GUILD_ID` - Guild ID to deploy commands to

Optional:
- `NODE_ENV` - Set to `production` for deployment

## Resource Limits

Current docker-compose limits:
- CPU: 2 cores max, 1 core reserved
- Memory: 1GB max, 512MB reserved

Adjust in `docker-compose.yml` under `deploy.resources` if needed.

## Troubleshooting

### Build fails on BuildX
```bash
# Ensure buildx driver is docker-container
docker buildx create --driver=docker-container --name=voidservices-builder
```

### GHCR authentication fails
```bash
# Re-authenticate
docker logout ghcr.io
echo "<YOUR_GITHUB_TOKEN>" | docker login ghcr.io -u toki0179 --password-stdin
```

### Container won't start
```bash
# Check logs
docker logs voidservices-bot

# Verify .env file exists and has correct values
docker exec voidservices-bot env | grep DISCORD
```

### Multi-arch build issues
Check architecture support:
```bash
docker buildx ls
# Output should show: Platforms: linux/amd64, linux/arm64, ...
```

## Automated Image Updates (Watchtower)

To automatically update the container when new images are pushed:

```bash
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --cleanup \
  --interval 300
```

Add to docker-compose.yml:
```yaml
  watchtower:
    image: containrrr/watchtower:latest
    container_name: watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --cleanup --interval 300
    restart: unless-stopped
```

## Next Steps

1. Create GitHub repo
2. Push code
3. Build multi-arch image
4. Push to GHCR
5. Deploy on Linux server
6. Monitor logs: `docker-compose logs -f`
