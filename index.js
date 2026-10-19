const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const pvp = require('mineflayer-pvp').plugin;
const mcDataLoader = require('minecraft-data');

const cfg = {
  host: process.env.MC_HOST,
  port: Number(process.env.MC_PORT || 25565),
  version: process.env.MC_VERSION || false,
  username: process.env.BOT_USERNAME || 'HindiAIDost',
  owner: (process.env.OWNER_USERNAME || '').trim().toLowerCase(),
  allowedPlayers: (process.env.ALLOWED_PLAYERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  autoSurvival: (process.env.AUTO_SURVIVAL || 'true').toLowerCase() === 'true'
};

if (!cfg.host) {
  console.error('Missing MC_HOST environment variable.');
  process.exit(1);
}

const bot = mineflayer.createBot({
  host: cfg.host,
  port: cfg.port,
  username: cfg.username,
  ...(cfg.version ? { version: cfg.version } : {})
});

bot.loadPlugin(pathfinder);
bot.loadPlugin(collectBlock);
bot.loadPlugin(pvp);

let mcData;
let movements;
let followTarget = null;
let survivalTimer = null;
let busy = false;
let lastSurvivalTask = 0;

const say = (s) => { try { bot.chat(String(s).slice(0, 220)); } catch {} };
const norm = s => String(s || '').toLowerCase().trim();
const isAllowed = username => {
  const u = norm(username);
  return !cfg.owner && cfg.allowedPlayers.length === 0 ? true :
    u === cfg.owner || cfg.allowedPlayers.includes(u);
};
const invCount = name => bot.inventory.items().filter(i => i.name === name).reduce((n, i) => n + i.count, 0);
const has = name => invCount(name) > 0;
const findBlock = (names, maxDistance = 48) => {
  const ids = names.map(n => mcData.blocksByName[n]?.id).filter(Boolean);
  if (!ids.length) return null;
  return bot.findBlock({ matching: ids, maxDistance });
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function equipBest(names, destination = 'hand') {
  for (const n of names) {
    const item = bot.inventory.items().find(i => i.name === n);
    if (item) { await bot.equip(item, destination); return true; }
  }
  return false;
}

async function craftItem(name, amount = 1) {
  const item = mcData.itemsByName[name];
  if (!item) return false;
  let table = findBlock(['crafting_table'], 5);
  if (!table) {
    const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table');
    if (!tableItem) {
      const planks = bot.inventory.items().filter(i => /_planks$/.test(i.name));
      if (planks.length && mcData.itemsByName.crafting_table) {
        const recipe = bot.recipesFor(mcData.itemsByName.crafting_table.id, null, 1, null)[0];
        if (recipe) await bot.craft(recipe, 1, null);
      }
    }
    if (has('crafting_table')) {
      const t = bot.inventory.items().find(i => i.name === 'crafting_table');
      await bot.equip(t, 'hand');
      const placeAt = bot.blockAt(bot.entity.position.offset(1, 0, 0));
      if (placeAt && placeAt.name === 'air') {
        try { await bot.placeBlock(placeAt, bot.entity.position.offset(0, -1, 0)); } catch {}
      }
      table = findBlock(['crafting_table'], 5);
    }
  }
  const recipe = bot.recipesFor(item.id, null, amount, table)[0] ||
                 bot.recipesFor(item.id, null, amount, null)[0];
  if (!recipe) return false;
  await bot.craft(recipe, amount, table || null);
  return true;
}

async function collectNearby(names, count = 4) {
  const block = findBlock(names, 40);
  if (!block) { say('Bhai, aas-paas ' + names.join('/') + ' nahi mil raha.'); return false; }
  try {
    await bot.collectBlock.collect(block);
    say('Bhai, ' + block.name + ' collect kar liya.');
    return true;
  } catch (e) {
    say('Collect karne mein dikkat aayi: ' + e.message.slice(0, 80));
    return false;
  }
}

async function makeBasicTools() {
  if (!has('oak_planks') && !has('spruce_planks') && !has('birch_planks') && !has('jungle_planks') && !has('acacia_planks') && !has('dark_oak_planks')) {
    const log = findBlock(['oak_log','spruce_log','birch_log','jungle_log','acacia_log','dark_oak_log','mangrove_log'], 40);
    if (log) await collectNearby([log.name], 4);
  }
  const plankItem = bot.inventory.items().find(i => /_log$/.test(i.name));
  if (plankItem) {
    const plankName = plankItem.name.replace('_log', '_planks');
    try {
      const plank = mcData.itemsByName[plankName];
      const recipe = bot.recipesFor(plank.id, null, 4, null)[0];
      if (recipe) await bot.craft(recipe, 4, null);
    } catch {}
  }
  if (!has('crafting_table')) {
    try { await craftItem('crafting_table', 1); } catch {}
  }
  if (!has('wooden_pickaxe') && !has('stone_pickaxe') && !has('iron_pickaxe')) {
    try { await craftItem('wooden_pickaxe', 1); } catch {}
  }
  if (!has('wooden_axe') && !has('stone_axe') && !has('iron_axe')) {
    try { await craftItem('wooden_axe', 1); } catch {}
  }
  if (!has('wooden_sword') && !has('stone_sword') && !has('iron_sword')) {
    try { await craftItem('wooden_sword', 1); } catch {}
  }
}

async function mineIron() {
  const block = findBlock(['iron_ore', 'deepslate_iron_ore'], 32);
  if (!block) { say('Iron ore paas nahi mila. Main safe jagah explore kar sakta hoon—deep cave mein bina tayari nahi jaunga.'); return; }
  await equipBest(['stone_pickaxe','iron_pickaxe','diamond_pickaxe']);
  try {
    await bot.collectBlock.collect(block);
    say('Iron ore mil gaya, mine kar liya.');
  } catch { say('Iron mine nahi ho paaya; pickaxe ya raasta check karna hoga.'); }
}

async function makeArmor() {
  const pieces = [
    ['iron_helmet',1], ['iron_chestplate',1], ['iron_leggings',1], ['iron_boots',1]
  ];
  let made = 0;
  for (const [name, amount] of pieces) {
    const armor = bot.inventory.items().find(i => i.name === name);
    if (armor) {
      try { await bot.equip(armor, 'torso'); made++; } catch {}
      continue;
    }
    try {
      const recipe = bot.recipesFor(mcData.itemsByName[name]?.id, null, amount, findBlock(['crafting_table'], 5))[0];
      if (recipe) { await bot.craft(recipe, amount, findBlock(['crafting_table'], 5)); made++; }
    } catch {}
  }
  if (!made) say('Armor banane ke liye iron ingots chahiye. Pehle iron mine aur furnace mein smelt karna padega.');
  else say('Armor crafting/equip ki koshish kar li. Inventory check karna, bhai!');
}

async function smeltIron() {
  const furnace = findBlock(['furnace'], 5);
  if (!furnace) { say('Iron ore smelt karne ke liye furnace chahiye. Abhi furnace routine basic hai; pehle furnace aur fuel arrange karo.'); return; }
  say('Furnace mil gaya. Smelting abhi basic support mein hai; inventory mein iron ingots hon to armor craft karunga.');
}

async function follow(playerName) {
  const p = bot.players[playerName]?.entity;
  if (!p) { say('Bhai, tum dikh nahi rahe. Thoda paas aao.'); return; }
  followTarget = playerName;
  bot.pathfinder.setGoal(new goals.GoalFollow(p, 2), true);
  say('Theek hai bhai, tumhare peeche aa raha hoon!');
}

async function gatherWood() {
  say('Wood collect karne ja raha hoon, bhai.');
  const b = findBlock(['oak_log','spruce_log','birch_log','jungle_log','acacia_log','dark_oak_log','mangrove_log','cherry_log'], 48);
  if (!b) { say('Paas mein tree nahi mila.'); return; }
  await collectNearby([b.name], 4);
  await makeBasicTools();
}

async function fightNearby() {
  const target = bot.nearestEntity(e => e.type === 'mob' && e.position && e.mobType && /zombie|skeleton|spider|creeper|drowned|husk/i.test(e.mobType));
  if (!target) { say('Bhai, paas mein hostile mob nahi dikh raha.'); return; }
  await equipBest(['iron_sword','stone_sword','wooden_sword']);
  try { bot.pvp.attack(target); say('Main mob se lad raha hoon, bhai!'); }
  catch { say('Fight start nahi ho paayi.'); }
}

async function handleCommand(username, raw) {
  const m = norm(raw).replace(/^[!./]+/, '');
  const player = bot.players[username]?.entity;
  if (!m) return;
  if (/^(help|madad|commands|command)$/.test(m)) {
    say('Commands: bhai mere paas aa | mere peeche aa | ruk ja | wood jama kar | iron mine kar | armor bana | tools bana | zombie se lad | survival shuru/band');
  } else if (/mere paas aa|idhar aa|come here|follow me/.test(m)) {
    await follow(username);
  } else if (/mere peeche aa|follow|saath chal/.test(m)) {
    await follow(username);
  } else if (/ruk ja|stop|mat aa|follow band/.test(m)) {
    followTarget = null; bot.pathfinder.setGoal(null); bot.pvp.stop(); say('Theek hai, ruk gaya.');
  } else if (/wood|lakdi|tree|ped/.test(m)) {
    await gatherWood();
  } else if (/iron mine|iron jama|loha mine|loha jama/.test(m)) {
    await mineIron();
  } else if (/armor|armour|kavach/.test(m)) {
    await makeArmor();
  } else if (/tools|tool|auzar|basic tools/.test(m)) {
    await makeBasicTools(); say('Basic tools banane ki koshish kar li.');
  } else if (/zombie|mob se lad|fight|maar/.test(m)) {
    await fightNearby();
  } else if (/survival band|auto band|stop survival/.test(m)) {
    cfg.autoSurvival = false; say('Automatic survival pause kar diya.');
  } else if (/survival shuru|auto survival|khud se kaam/.test(m)) {
    cfg.autoSurvival = true; say('Automatic survival shuru. Main resources aur safety par dhyan dunga.');
  } else if (/health|hp|tabiyat/.test(m)) {
    say(`Health ${Math.round(bot.health)}/20, food ${Math.round(bot.food)}/20.`);
  } else if (/inventory|kya hai paas|samaan/.test(m)) {
    const summary = bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', ') || 'inventory khaali';
    say(summary);
  } else if (/hello|hi|salam|namaste|bhai/.test(m)) {
    say('Haan bhai, main yahin hoon! Kaunsa kaam karun?');
  }
}

async function autonomousTick() {
  if (!cfg.autoSurvival || busy || !bot.entity || Date.now() - lastSurvivalTask < 25000) return;
  if (bot.health < 9) {
    say('Meri health kam hai, main safe jagah jaane ki koshish kar raha hoon.');
    bot.pvp.stop(); bot.pathfinder.setGoal(null); lastSurvivalTask = Date.now(); return;
  }
  if (bot.food < 14) {
    const food = bot.inventory.items().find(i => /bread|cooked_beef|cooked_porkchop|cooked_chicken|cooked_mutton|baked_potato|apple|carrot|cooked_cod|cooked_salmon/.test(i.name));
    if (food) {
      try { await bot.equip(food, 'hand'); await bot.consume(); say('Khana kha liya.'); } catch {}
      lastSurvivalTask = Date.now(); return;
    }
  }
  busy = true;
  try {
    if (!bot.inventory.items().some(i => /_log$/.test(i.name)) && !bot.inventory.items().some(i => /_planks$/.test(i.name))) {
      const tree = findBlock(['oak_log','spruce_log','birch_log','jungle_log','acacia_log','dark_oak_log','mangrove_log','cherry_log'], 24);
      if (tree) { await bot.collectBlock.collect(tree); say('Apne liye wood jama kar raha hoon.'); }
    } else if (!has('wooden_pickaxe') && !has('stone_pickaxe') && !has('iron_pickaxe')) {
      await makeBasicTools(); say('Apne tools banane ki koshish kar raha hoon.');
    } else if (!has('cobblestone') && has('wooden_pickaxe')) {
      const stone = findBlock(['stone'], 16);
      if (stone) { await equipBest(['wooden_pickaxe']); await bot.collectBlock.collect(stone); say('Stone collect kar raha hoon.'); }
    }
  } catch (e) {
    console.log('Autonomous task issue:', e.message);
  } finally {
    busy = false;
    lastSurvivalTask = Date.now();
  }
}

bot.once('spawn', () => {
  mcData = mcDataLoader(bot.version);
  movements = new Movements(bot, mcData);
  movements.canDig = true;
  bot.pathfinder.setMovements(movements);
  say('Main aa gaya bhai! Chat mein "help" likho. Main basic autonomous survival bhi try karunga.');
  if (survivalTimer) clearInterval(survivalTimer);
  survivalTimer = setInterval(() => autonomousTick().catch(e => console.log(e.message)), 12000);
});

bot.on('chat', (username, message) => {
  if (username === bot.username) return;
  if (!isAllowed(username)) return;
  handleCommand(username, message).catch(e => {
    console.log('Command error:', e.message);
    say('Bhai, ye kaam nahi ho paaya. Inventory/raasta/material check karna hoga.');
  });
});

bot.on('kicked', reason => console.log('Kicked:', reason));
bot.on('error', err => console.log('Bot error:', err.message));
bot.on('end', () => { if (survivalTimer) clearInterval(survivalTimer); console.log('Bot disconnected.'); });
