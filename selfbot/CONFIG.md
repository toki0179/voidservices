# Selfbot Configuration Guide

This directory contains the Discord selfbot implementation using discord.py-self and LLM integration.

## Requirements

- Python 3.9+
- discord.py-self (`import discord`, no explicit `Intents` setup)
- httpx (for LLM API calls)

## Installation

```bash
pip install -r requirements.txt
```

## LLM Setup

The selfbot communicates through `ollamafreeapi`, which discovers public Ollama endpoints automatically.
You do not need to self-host an Ollama server for this mode.

### Model Access

`ollamafreeapi` provides a live model catalog and selects an available server for the chosen model.
No local model pull step is required.

### Available Models

- **llama3.2:3b** - Meta's efficient 3.2B parameter model
- **deepseek-r1:latest** - Strong reasoning capabilities built on Qwen
- **gpt-oss:20b** - Powerful Gemma-based 20B completion model
- **mistral:latest** - High-performance baseline Mistral model
- **mistral-nemo:custom** - 12.2B open weights language model
- **bakllava:latest** - Vision and language model
- **smollm2:135m** - Extremely lightweight assistant

## Environment Variables

The JavaScript bot passes these to the Python selfbot:

- `DISCORD_TOKEN` - User's Discord account token (from `/sbcreate`)
- `CHANNEL_ID` - Target channel ID for the selfbot
- `USER_ID` - ID of the user who started the bot
- `LLM_MODEL` - Selected LLM model from `/sbrun`
- `BASE_PROMPT` - Optional persistent instruction applied to every generation while the bot is running
- `LLM_TIMEOUT_SECONDS` - Per-request timeout in seconds (default: `30`)

## Model Parameters

Each model has tuned hyperparameters for optimal performance:

- Temperature: controls randomness (0.7-0.8 typically)
- Top P: controls diversity (0.9-0.95 typically)

## Security Notes

- User tokens are stored in SQLite database (`data/tokens.db`)
- Tokens are only passed to child processes via environment variables
- Each selfbot process runs independently and is isolated

## Troubleshooting

- **"Failed to connect to LLM API"**: Public model endpoints may be temporarily unavailable. Try again shortly.
- **"Model not found"**: The selected model may no longer be present in the live `ollamafreeapi` catalog.
- **"Token invalid"**: Verify the discord.py-self library is compatible with your Discord account type
