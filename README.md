# V0iD

A modern Discord.js v14 bot scaffold built around slash commands and a modular command loader.

## What it includes

- Slash-command first architecture
- Central command loader for easy feature expansion
- Safe demo commands for testing layouts and interactions
- HTML-to-image parody card rendering for fun/mockups (clearly marked fictional)
- Separate deploy script for registering commands

## Commands

- `/ping` checks latency and bot responsiveness
- `/help` lists available commands or explains one command
- `/gen` runs a configured Python file with a required numeric input
- `/showcase` creates a branded V0iD demo card embed that can be replaced with richer rendering later
- `/boost` renders a Nitro-style proof card with the executor shown on the first line and a response identity chosen from a supplied user ID or randomized fallback on the second line
- `/sbcreate` registers a Discord selfbot token (via secure modal popup)
- `/sbrun` starts a selfbot in a selected channel with an LLM model of your choice
- `/sbstop` stops a running selfbot in a selected channel
- `/sbdelete` removes your registered selfbot token

## Assets

- Uses a local font asset at `assets/fonts/Whitneyfont.woff` for rendering parity.
- Uses an imported template at `assets/templates/testingboost.html` for the boost parody command.
- Uses the invoking user for the executor line and a supplied Discord user ID, cached user, or fallback identity for the response line.
- Image outputs are fictional and are not valid proof/receipts.
- Rendering is done through an HTML template screenshot pipeline.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and fill in your bot token and app client ID.
3. Set `GUILD_ID` while developing for instant command updates.
4. Run `npm run deploy` to register slash commands.
5. Start the bot with `npm start`.

## Docker (Automated)

1. Copy `.env.example` to `.env` and fill required values.
2. Build and push multi-arch image:
   ```bash
   GHCR_TOKEN=<your_token> npm run docker:build
   ```
3. Deploy/update stack:
   ```bash
   npm run docker:up
   ```
4. View runtime logs:
   ```bash
   npm run docker:logs
   ```

### Selfbot Setup (Optional)

The selfbot feature allows Discord users to run AI chatbots in channels using their own Discord accounts.

1. Install Python selfbot dependencies:
   ```bash
   pip install -r selfbot/requirements.txt
   ```

2. The selfbot uses `ollamafreeapi` and does not require self-hosting Ollama.
   - Model endpoints are discovered dynamically from the free API catalog.
   - `/sbrun` exposes the supported model IDs.

3. Users can then:
   - Use `/sbcreate` to register their Discord token securely
   - Use `/sbrun` to open the setup menu and start a selfbot in any channel
   - Choose from 7 LLM models: llama3.2:3b, deepseek-r1:latest, gpt-oss:20b, mistral:latest, mistral-nemo:custom, bakllava:latest, smollm2:135m
   - Optionally select a preset prompt and/or add a custom prompt that is applied to every reply while the bot runs
   - The runtime always prepends a force prompt so replies stay normal chat length
   - Optionally toggle DM listening on or off for that run
   - The selfbot keeps up to 5000 characters of conversation context by default
   - Use `/sbdelete` to remove their token when done

### Generator Setup (Optional)

The `/gen` command runs `generator/main.py` and forwards the slash command number input as both a CLI argument and `GEN_NUMBER` environment variable.

1. Install generator dependencies:
   ```bash
   pip install -r generator/requirements.txt
   ```

2. Optionally override runtime defaults:
   - `GEN_SCRIPT` to point to a different Python script path
   - `GEN_PYTHON` to point to a specific Python executable

## Extending the bot

Add a new file in `src/commands/` that exports a `data` slash-command definition and an `execute` handler.

The bot is intentionally structured so future features can live in their own folders without changing the main event handler.
