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

The selfbot communicates with Ollama directly at `http://127.0.0.1:11434` by default.
You can override this with `OLLAMA_HOST`.

### Using Ollama (Recommended)

1. Install Ollama from https://ollama.ai
2. Run the Ollama server:
   ```bash
   ollama serve
   ```
3. Pull desired models:
   ```bash
   ollama pull llama3.2:3b
   ollama pull deepseek-r1:latest
   ollama pull gpt-oss:20b
   ollama pull mistral:latest
   ollama pull mistral-nemo:custom
   ollama pull bakllava:latest
   ollama pull smollm2:135m
   ```

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
- `OLLAMA_HOST` - Ollama server URL (default: `http://127.0.0.1:11434`)
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

- **"Failed to connect to LLM API"**: Ensure Ollama is running and `OLLAMA_HOST` is reachable
- **"Model not found"**: Pull the model with `ollama pull <model-name>`
- **"Token invalid"**: Verify the discord.py-self library is compatible with your Discord account type
