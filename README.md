# Minecraft Hindi AI Companion — Upgrade

This is a separate starter project for a Mineflayer companion. It does not edit or connect to your existing Railway project.

## Features included
- Hindi/Hinglish text chat commands: follow, stop, gather wood, attempt basic tools, attempt iron mining, fight nearby hostile mobs, show health/inventory.
- Optional simple autonomous survival loop: looks for nearby wood, tries basic tools/stone gathering, and eats available food when hungry.
- `ALLOWED_PLAYERS` can allow multiple player usernames (comma-separated). `OWNER_USERNAME` also remains supported.

## Important limitations
This is a starter bot, not a fully independent human-like AI. Minecraft crafting recipes, block reachability, inventory, game version, server rules, and pathfinding can make tasks fail. Iron armor requires iron ore to be mined, smelted into ingots, and a working crafting workflow; the included armor routine is only a basic attempt and is not guaranteed to complete this whole chain. Building a full house and robust mining/armor progression need more implementation and testing. Do not assume it is working until you check Railway logs and test in-game.

## Railway variables
- `MC_HOST`: exact Aternos hostname only (no https://)
- `MC_PORT`: exact port shown on Aternos Connect page
- `MC_VERSION`: your server's exact Minecraft version, or remove it if version auto-detection is preferred
- `BOT_USERNAME`: bot's Minecraft username
- `OWNER_USERNAME`: your Minecraft username (optional)
- `ALLOWED_PLAYERS`: optional comma-separated list, e.g. `PlayerOne,PlayerTwo`
- `AUTO_SURVIVAL`: `true` or `false`
- `OPENROUTER_API_KEY` and `AI_MODEL` are not used by this starter version's local command/action logic; they are only needed if you add an AI API integration.

## Deploy safely
1. Create/use a separate GitHub repository for this upgrade.
2. Do not change the old Railway project.
3. Deploy the new repo as a separate Railway service.
4. Add variables, deploy, and inspect logs before testing in a world.
