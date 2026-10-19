const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const pvp = require('mineflayer-pvp').plugin;

const HOST = process.env.MC_HOST;
const PORT = Number(process.env.MC_PORT || 25565);
const VERSION = (process.env.MC_VERSION || '1.21.11').trim();
const BOT_USERNAME = process.env.BOT_USERNAME || 'HindiAIDost';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'openrouter/free';
const OWNER = (process.env.OWNER_USERNAME || '').trim().toLowerCase();

if (!HOST) {
  console.error('ERROR: Railway Variables mein MC_HOST set karo.');
  process.exit(1);
}

let bot;
let reconnectTimer;
let busy = false;
let lastCommandAt = 0;
const COMMAND_COOLDOWN_MS = 1200;

const HOSTILE_NAMES = [
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
  'drowned', 'husk', 'stray', 'phantom', 'pillager', 'vindicator',
  'ravager', 'slime', 'magma_cube', 'blaze', 'guardian', 'hoglin',
  'piglin_brute', 'wither_skeleton', 'silverfish', 'cave_spider'
];

function say(msg) {
  if (!bot || !bot.player) return;
  const clean = String(msg).replace(/§./g, '').replace(/\s+/g, ' ').slice(0, 190);
  try { bot.chat(clean); } catch (e) { console.error('Chat error:', e.message); }
}

function playerEntity(username) {
  return bot.players[username]?.entity || null;
}

function nearestEntity(filter, maxDistance = 24) {
  return bot.nearestEntity(e =>
    e && e.position && e !== bot.entity &&
    bot.entity.position.distanceTo(e.position) <= maxDistance &&
    filter(e)
  );
}

function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[!,.?।]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIntent(text) {
  const s = normalize(text);
  if (/^(help|madad|commands|command|kya kar sakte)/.test(s)) return { action: 'help' };
  if (/(ruk ja|ruko|stop|bas kar|band kar|mat chal)/.test(s)) return { action: 'stop' };
  if (/(mere paas|paas aa|come here|come to me|idhar aa|yahan aa)/.test(s)) return { action: 'come' };
  if (/(follow|peeche aa|mere piche|mere saath chal|saath chal|follow me)/.test(s)) return { action: 'follow' };
  if (/(kahan hai|where are you|apni location|coordinates|location bata)/.test(s)) return { action: 'where' };
  if (/(lakdi|wood|logs|ped kaato|tree|tree chop)/.test(s)) return { action: 'wood' };
  if (/(ghar bana|house bana|build.*house|makaan bana|chhota ghar)/.test(s)) return { action: 'house' };
  if (/(mere liye lad|zombie se lad|mob se lad|protect me|meri raksha|attack nearest|hamla)/.test(s)) return { action: 'fight' };
  if (/(health|sehat|hp bata|kitni jaan)/.test(s)) return { action: 'health' };
  if (/(inventory|samaan|items bata|kya hai tere paas)/.test(s)) return { action: 'inventory' };
  if (/(khana|food|bhook|eat)/.test(s)) return { action: 'eat' };
  return null;
}

async function askAIForIntent(username, message) {
  if (!OPENROUTER_API_KEY) return null;
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://railway.app',
        'X-Title': 'Minecraft Hindi AI Companion'
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: `You control a Minecraft Java helper bot. Understand Hindi, Hinglish, and English. Return ONLY JSON with keys action and reply. Allowed actions: help, come, follow, stop, where, wood, house, fight, health, inventory, eat, answer. For any ordinary Minecraft question choose answer and write a brief Hindi/Hinglish reply in reply. For game action requests choose only one allowed action. Never invent other actions.`
          },
          { role: 'user', content: `${username}: ${message}` }
        ],
        max_tokens: 180,
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(18000)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('OpenRouter error:', resp.status, JSON.stringify(data).slice(0, 500));
      return null;
    }
    const raw = data.choices?.[0]?.message?.content || '';
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { action: 'answer', reply: cleaned.slice(0, 180) };
    const obj = JSON.parse(match[0]);
    const allowed = new Set(['help','come','follow','stop','where','wood','house','fight','health','inventory','eat','answer']);
    if (!allowed.has(obj.action)) return { action: 'answer', reply: 'Bhai, ye kaam abhi mujhe samajh nahi aaya. !help likho.' };
    return obj;
  } catch (e) {
    console.error('AI request failed:', e.message);
    return null;
  }
}

function getLogBlocks(maxDistance = 32) {
  const mcData = require('minecraft-data')(bot.version);
  const names = Object.keys(mcData.blocksByName).filter(n =>
    n === 'oak_log' || n === 'birch_log' || n === 'spruce_log' ||
    n === 'jungle_log' || n === 'acacia_log' || n === 'dark_oak_log' ||
    n === 'mangrove_log' || n === 'cherry_log' || n === 'pale_oak_log'
  );
  const ids = new Set(names.map(n => mcData.blocksByName[n]?.id).filter(Boolean));
  return bot.findBlocks({ matching: b => ids.has(b.type), maxDistance, count: 8 })
    .map(pos => bot.blockAt(pos)).filter(Boolean);
}

async function gatherWood() {
  const logs = getLogBlocks(32);
  if (!logs.length) {
    say('Bhai, 32 blocks ke andar ped ki lakdi nahi dikh rahi. Thoda paas ped ke saamne bulao.');
    return;
  }
  say('Theek hai, lakdi jama kar raha hoon!');
  try {
    await bot.collectBlock.collect(logs.slice(0, 5));
    say('Lakdi collect kar li jitni mil saki.');
  } catch (e) {
    console.error('Wood gathering error:', e.message);
    say('Lakdi tak nahi pahunch paya. Thoda khula rasta do.');
  }
}

async function buildSmallHouse() {
  const mcData = require('minecraft-data')(bot.version);
  const inv = bot.inventory.items();
  const logs = inv.filter(i => /_log$/.test(i.name));
  const planks = inv.filter(i => /_planks$/.test(i.name));
  if (!planks.length && !logs.length) {
    say('Ghar banane ke liye pehle lakdi chahiye. "lakdi jama kar" bolo.');
    return;
  }
  try {
    // Convert logs to planks when a matching recipe is available.
    if (!planks.length && logs.length) {
      const logItem = logs[0];
      const plankName = logItem.name.replace(/_log$/, '_planks');
      const plank = mcData.itemsByName[plankName];
      if (plank) {
        const recipes = bot.recipesFor(plank.id, null, 1, null);
        if (recipes.length) await bot.craft(recipes[0], Math.min(16, logItem.count), null);
      }
    }
    const plankItem = bot.inventory.items().find(i => /_planks$/.test(i.name));
    if (!plankItem) {
      say('Planks nahi ban paaye. Kuch logs inventory mein lao.');
      return;
    }
    const start = bot.entity.position.floored();
    // Build a compact 3x3 floor and 2-block-high walls around the player.
    // Requires a safe, flat area and enough planks; no roof/door in this first version.
    const positions = [];
    for (let y = 0; y < 2; y++) {
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          if (y === 0 && Math.abs(x) === 1 && Math.abs(z) === 1) continue;
          if (y === 1 && x === 0 && z === 0) continue; // doorway
          positions.push({ x: start.x + x, y: start.y + y, z: start.z + z });
        }
      }
    }
    if (plankItem.count < positions.length) {
      say(`Ghar ke liye lagbhag ${positions.length} planks chahiye; mere paas ${plankItem.count} hain. Aur lakdi jama karo.`);
      return;
    }
    say('Chhota ghar banana shuru kar raha hoon. Khuli aur flat jagah par khade rehna.');
    const item = bot.inventory.items().find(i => i.name === plankItem.name);
    await bot.equip(item, 'hand');
    let placed = 0;
    for (const p of positions) {
      const target = bot.blockAt(p);
      if (!target || target.name !== 'air' && target.name !== 'cave_air' && target.name !== 'void_air') continue;
      // Find a solid neighbouring block face to place against.
      const candidates = [
        { dx: 0, dy: -1, dz: 0 }, { dx: 1, dy: 0, dz: 0 },
        { dx: -1, dy: 0, dz: 0 }, { dx: 0, dy: 0, dz: 1 }, { dx: 0, dy: 0, dz: -1 }
      ];
      let done = false;
      for (const d of candidates) {
        const ref = bot.blockAt({ x: p.x + d.dx, y: p.y + d.dy, z: p.z + d.dz });
        if (ref && ref.boundingBox === 'block') {
          try {
            await bot.placeBlock(ref, { x: -d.dx, y: -d.dy, z: -d.dz });
            placed++; done = true; break;
          } catch (_) {}
        }
      }
      if (!done) continue;
      await new Promise(r => setTimeout(r, 180));
    }
    say(`Ghar ka kaam khatam: ${placed} blocks rakhe. Roof aur door abhi manually lagana pad sakta hai.`);
  } catch (e) {
    console.error('House build error:', e.message);
    say('Ghar poora nahi bana. Jagah flat karo aur bot ke paas blocks rakho.');
  }
}

async function fightNearest() {
  const enemy = nearestEntity(e =>
    e.type === 'mob' && HOSTILE_NAMES.some(n => e.name?.includes(n)), 20
  );
  if (!enemy) return say('Bhai, aas-paas koi hostile mob nazar nahi aa raha.');
  say('Hostile mob dikh gaya. Attack karne ki koshish karta hoon!');
  try { bot.pvp.attack(enemy); }
  catch (e) { console.error('PVP error:', e.message); say('Abhi attack nahi kar paaya.'); }
}

async function eatFood() {
  const food = bot.inventory.items().find(i =>
    /bread|apple|baked_potato|carrot|cooked_beef|cooked_porkchop|cooked_chicken|cooked_mutton|cooked_rabbit|cooked_cod|cooked_salmon|melon_slice|cookie|pumpkin_pie|golden_carrot/.test(i.name)
  );
  if (!food) return say('Mere paas khane ka item nahi hai.');
  try {
    await bot.equip(food, 'hand');
    await bot.consume();
    say('Kha liya!');
  } catch (e) {
    console.error('Eat error:', e.message);
    say('Abhi kha nahi paaya.');
  }
}

async function runAction(username, action, reply) {
  const player = playerEntity(username);
  switch (action) {
    case 'help':
      say('Hindi commands: mere paas aa, follow kar, ruk ja, lakdi jama kar, ghar bana, mob se lad, khana kha, health bata, inventory bata, !ai <sawal>.');
      break;
    case 'come':
      if (!player) return say('Bhai, main tumhe dekh nahi pa raha. Paas aao.');
      bot.pvp.stop();
      bot.pathfinder.setGoal(new goals.GoalNear(player.position.x, player.position.y, player.position.z, 2));
      say('Aa raha hoon bhai!');
      break;
    case 'follow':
      if (!player) return say('Bhai, main tumhe dekh nahi pa raha.');
      bot.pvp.stop();
      bot.pathfinder.setGoal(new goals.GoalFollow(player, 2), true);
      say('Theek hai, tere peeche aa raha hoon.');
      break;
    case 'stop':
      bot.pvp.stop();
      bot.pathfinder.setGoal(null);
      say('Theek hai, ruk gaya.');
      break;
    case 'where': {
      const p = bot.entity.position;
      say(`Meri location ${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)} hai.`);
      break;
    }
    case 'wood': await gatherWood(); break;
    case 'house': await buildSmallHouse(); break;
    case 'fight': await fightNearest(); break;
    case 'health':
      say(`Health ${Math.round(bot.health)}/20, food ${Math.round(bot.food)}/20.`);
      break;
    case 'inventory': {
      const items = bot.inventory.items().slice(0, 8).map(i => `${i.count} ${i.name}`).join(', ');
      say(items ? `Mere paas: ${items}` : 'Meri inventory khaali hai.');
      break;
    }
    case 'eat': await eatFood(); break;
    case 'answer': say(reply || 'Bhai, ye command samajh nahi aayi. !help likho.'); break;
    default: say('Ye kaam abhi available nahi. !help likho.');
  }
}

async function handleChat(username, message) {
  if (username === bot.username) return;
  if (OWNER && username.toLowerCase() !== OWNER) return;
  const msg = message.trim();
  if (!msg || msg.length > 220) return;
  // Commands can start with ! or be plain Hindi/English in chat.
  const clean = msg.startsWith('!') ? msg.slice(1).trim() : msg;
  if (Date.now() - lastCommandAt < COMMAND_COOLDOWN_MS) return;
  lastCommandAt = Date.now();

  const direct = parseIntent(clean);
  if (direct) return runAction(username, direct.action, '');

  if (OPENROUTER_API_KEY) {
    if (busy) return say('Ek second bhai, pehle wala kaam complete kar raha hoon.');
    busy = true;
    try {
      const intent = await askAIForIntent(username, clean);
      if (intent) return await runAction(username, intent.action, intent.reply);
      say('AI abhi respond nahi kar raha. Seedha command try kar: !help');
    } finally {
      busy = false;
    }
  } else {
    say('AI key set nahi hai. Railway Variables mein OPENROUTER_API_KEY add karo.');
  }
}

function createBot() {
  console.log(`Connecting to ${HOST}:${PORT} as ${BOT_USERNAME}; requested version ${VERSION}`);
  bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: BOT_USERNAME,
    auth: 'offline',
    version: VERSION
  });
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(collectBlock);
  bot.loadPlugin(pvp);

  bot.once('spawn', () => {
    console.log('Bot spawned successfully. Actual version:', bot.version);
    bot.pathfinder.setMovements(new Movements(bot));
    say('Salaam bhai! Main tera AI dost hoon. Hindi mein command de ya !help likh.');
  });
  bot.on('chat', (username, message) => {
    handleChat(username, message).catch(e => {
      console.error('Chat action error:', e);
      say('Bhai, command fail ho gayi. Railway logs check karo.');
    });
  });
  bot.on('kicked', reason => console.log('Kicked by server:', reason));
  bot.on('error', err => console.error('Minecraft connection error:', err.message));
  bot.on('end', () => {
    console.log('Disconnected. Reconnecting in 20 seconds...');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(createBot, 20000);
  });
}

createBot();
