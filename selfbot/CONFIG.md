# Selfbot Configuration Guide

This directory contains the Discord selfbot implementation using discord.py-self and LLM integration.

## Requirements

- Python 3.9+
- discord.py-self (`import discord`)
- httpx (for LLM API calls)

## Installation

```bash
pip install -r requirements.txt
```

## LLM Setup

The selfbot communicates with an LLM API at `http://localhost:8000/api/generate` by default.

### Using Ollama (Recommended)

1. Install Ollama from https://ollama.ai
2. Run the Ollama server:
   ```bash
   ollama serve
   ```
3. Pull desired models:
   ```bash
   ollama pull neural-chat
   ollama pull mistral
   ollama pull llama2
   ollama pull phi
   ollama pull orca
   ```

### Available Models

- **Neural Chat** - Fast, conversational, good for casual chat
- **Mistral** - Powerful reasoning, good for complex questions
- **Llama 2** - General purpose, balanced performance
- **Phi** - Lightweight, efficient, good for limited resources
- **Orca** - Instruction-following, good for directing behavior

## Environment Variables

The JavaScript bot passes these to the Python selfbot:

- `DISCORD_TOKEN` - User's Discord account token (from `/sbcreate`)
- `CHANNEL_ID` - Target channel ID for the selfbot
- `USER_ID` - ID of the user who started the bot
- `LLM_MODEL` - Selected LLM model from `/sbrun`

## Model Parameters

Each model has tuned hyperparameters for optimal performance:

- Temperature: controls randomness (0.7-0.8 typically)
- Top P: controls diversity (0.9-0.95 typically)

## Security Notes

- User tokens are stored in SQLite database (`data/tokens.db`)
- Tokens are only passed to child processes via environment variables
- Each selfbot process runs independently and is isolated

## Troubleshooting

- **"Failed to connect to LLM API"**: Ensure Ollama is running on localhost:8000
- **"Model not found"**: Pull the model with `ollama pull <model-name>`
- **"Token invalid"**: Verify the discord.py-self library is compatible with your Discord account type
