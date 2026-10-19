# Minecraft Hindi AI Companion (Aternos + Railway)

A separate bot project. It does not modify an existing Railway project or repository.

## What it can do
- Understand common Hindi/Hinglish phrases directly.
- Use OpenRouter's free-model router for other Hindi/English instructions and Minecraft questions.
- `mere paas aa`, `follow kar`, `ruk ja`
- `lakdi jama kar` (collects nearby logs)
- `ghar bana` (attempts a small plank structure; needs enough planks and flat/clear space)
- `mob se lad` (attempts to attack a nearby hostile mob)
- `khana kha`, `health bata`, `inventory bata`, `location bata`

**Limitations:** this is a starter companion, not a fully autonomous human-level agent. Building is a simple structure attempt, pathfinding can fail, and free AI has rate/availability limits. The AI can only trigger actions explicitly implemented in `index.js`.

## GitHub upload
Create a new repository named `minecraft-ai-companion` and upload `index.js`, `package.json`, `README.md`, and `.gitignore` to the root.

## Railway deployment
1. Create a new Railway project. Leave your old Railway project alone.
2. Deploy from the new GitHub repository.
3. Add these Variables to the new Railway service:

| Variable | Value |
|---|---|
| `MC_HOST` | Aternos server address only, e.g. `yourserver.aternos.me` |
| `MC_PORT` | The exact port shown on Aternos |
| `MC_VERSION` | Exact Java version, e.g. `1.21.11` if that is the server version |
| `BOT_USERNAME` | An unused username, e.g. `HindiAIDost` |
| `OPENROUTER_API_KEY` | Secret API key from https://openrouter.ai/keys |
| `AI_MODEL` | `openrouter/free` |
| `OWNER_USERNAME` | Your exact in-game username (recommended; only this username can issue commands) |

Never put API keys in GitHub or share them in chat.

## How to use
Start the Aternos server first. Then use Minecraft chat:
- `!help`
- `Bhai mere paas aa`
- `follow kar`
- `lakdi jama kar`
- `ghar bana`
- `mere saath chal`
- `zombie se lad`
- `khana kha`
- `health bata`
- `inventory bata`
- `!ai Minecraft mein iron kahan milta hai?`

## Important
- This bot uses offline-mode authentication. It will only connect if the server allows offline/cracked players. Do not change server security settings to make it work. If the server requires authenticated accounts, this configuration will not connect.
- Aternos servers may need to be started manually and can shut down when empty. Railway does not guarantee the Aternos server stays online.
- Mineflayer lists support for Minecraft 1.21.11; if connection errors occur, use the exact server version and inspect Railway logs.
- Free AI model availability and limits can change.
