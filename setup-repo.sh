#!/bin/bash

# GitHub API script to create repository and push code

GITHUB_USER="toki0179"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
REPO_NAME="voidservices"
REPO_DESCRIPTION="Discord bot with Nitro proof cards, selfbot, and LLM integration"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ Error: GITHUB_TOKEN environment variable not set"
  echo "Usage: GITHUB_TOKEN=your_token ./setup-repo.sh"
  exit 1
fi

echo "🔄 Creating GitHub repository via API..."

# Create repository
RESPONSE=$(curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/user/repos \
  -d "{
    \"name\": \"$REPO_NAME\",
    \"description\": \"$REPO_DESCRIPTION\",
    \"private\": false,
    \"auto_init\": false
  }")

# Check if repository was created successfully
if echo "$RESPONSE" | grep -q '"id"'; then
  echo "✅ Repository created successfully!"
  REPO_URL=$(echo "$RESPONSE" | grep -o '"clone_url":"[^"]*' | cut -d'"' -f4)
  echo "Repository: $REPO_URL"
else
  if echo "$RESPONSE" | grep -q '"message":"Repository creation failed"'; then
    echo "⚠️  Repository already exists or creation failed"
    echo "Continuing with existing repository..."
  else
    echo "❌ Error creating repository:"
    echo "$RESPONSE" | grep -o '"message":"[^"]*'
    exit 1
  fi
fi

# Add remote and push
echo "🔄 Pushing code to GitHub..."
cd /Users/olliwes01/Documents/voidservices

# Update or add remote
git remote remove origin 2>/dev/null || true
git remote add origin https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git

# Ensure we're on main branch
git branch -M main

# Push to GitHub
git push -u origin main

if [ $? -eq 0 ]; then
  echo "✅ Code pushed successfully!"
  echo "📍 Repository: https://github.com/${GITHUB_USER}/${REPO_NAME}"
else
  echo "❌ Push failed"
  exit 1
fi
