require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  Events,
  SlashCommandBuilder,
  REST,
  Routes,
  ChannelType,
  PermissionsBitField
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

/* =========================================================
   CONFIG
========================================================= */

const DATA_DIR = path.join(__dirname, "data");
const STATS_PATH = path.join(DATA_DIR, "unoStats.json");
const HISTORY_PATH = path.join(DATA_DIR, "unoHistory.json");

const games = new Map();
const channelGames = new Map();
const playerGames = new Map();
const botTurnTimers = new Map();
const rematchOffers = new Map();
const roomDeleteTimers = new Map();

let CARD_SEQ = 1;

const TEMP_CATEGORY_NAME = "UNO TEMP";
const TEMP_DELETE_DELAY_MS = 15000;
const REMATCH_ROOM_TIMEOUT_MS = 60000;
const BOT_PLAY_DELAY_MS = 1200;
const BOT_FAILSAFE_MS = 5000;
const ACHIEVEMENTS_PER_PAGE = 5;

const COLORS = {
  red: "🔴",
  blue: "🔵",
  green: "🟢",
  yellow: "🟡",
  wild: "⚫"
};

const EMBED = {
  brand: 0x5865f2,
  dark: 0x2b2d31,
  success: 0x57f287,
  warning: 0xfee75c,
  red: 0xed4245,
  blue: 0x3498db,
  green: 0x2ecc71,
  yellow: 0xf1c40f,
  purple: 0x9b59b6,
  gray: 0x95a5a6
};

const BOT_DIFFICULTIES = {
  easy: {
    id: "easy",
    name: "Fácil",
    desc: "Ideal para empezar",
    unlockVsBotWins: 0,
    rewardCoinsWin: 20,
    rewardXpWin: 25,
    rewardCoinsLose: 8,
    rewardXpLose: 12
  },
  normal: {
    id: "normal",
    name: "Normal",
    desc: "Más equilibrado",
    unlockVsBotWins: 3,
    rewardCoinsWin: 30,
    rewardXpWin: 40,
    rewardCoinsLose: 12,
    rewardXpLose: 18
  },
  hard: {
    id: "hard",
    name: "Difícil",
    desc: "Juega mejor y castiga más",
    unlockVsBotWins: 8,
    rewardCoinsWin: 45,
    rewardXpWin: 60,
    rewardCoinsLose: 18,
    rewardXpLose: 25
  },
  insane: {
    id: "insane",
    name: "Extremo",
    desc: "La dificultad más dura",
    unlockVsBotWins: 15,
    rewardCoinsWin: 70,
    rewardXpWin: 90,
    rewardCoinsLose: 25,
    rewardXpLose: 35
  }
};

const BOT_DIFFICULTY_ORDER = ["easy", "normal", "hard", "insane"];

/* =========================================================
   TIENDA
========================================================= */

const STORE_ITEMS = {
  boxes: [
    {
      id: "basic_box",
      name: "Caja básica",
      emoji: "📦",
      price: 100,
      description: "Puede dar monedas, XP, títulos, insignias o boosts"
    },
    {
      id: "rare_box",
      name: "Caja rara",
      emoji: "🎁",
      price: 300,
      description: "Mejores chances de recompensas raras"
    },
    {
      id: "epic_box",
      name: "Caja épica",
      emoji: "💎",
      price: 700,
      description: "Alta chance de recompensas buenas"
    }
  ],
  titles: [
    { id: "rookie", name: "🐣 Novato", price: 50, description: "Tu primer título" },
    { id: "bot_hunter_title", name: "🤖 Cazador de Bots", price: 220, description: "Para fans del PvE" },
    { id: "unstoppable", name: "🔥 Imparable", price: 400, description: "Puro ego" },
    { id: "uno_king", name: "👑 Rey del UNO", price: 900, description: "Status máximo" }
  ],
  badges: [
    { id: "champion_badge", name: "🏆 Campeón", price: 250, description: "Se muestra en tu perfil" },
    { id: "pro_badge", name: "⚡ Pro", price: 350, description: "Para destacar" },
    { id: "tryhard_badge", name: "💀 Tryhard", price: 700, description: "Te lo ganaste" }
  ],
  boosts: [
    {
      id: "xp_boost_3",
      name: "✨ x2 XP (3 partidas)",
      price: 200,
      description: "Duplica el XP ganado durante 3 partidas",
      effect: "xp",
      multiplier: 2,
      uses: 3
    },
    {
      id: "coin_boost_5",
      name: "🪙 +50% monedas (5 partidas)",
      price: 250,
      description: "Más monedas durante 5 partidas",
      effect: "coins",
      multiplier: 1.5,
      uses: 5
    }
  ]
};

function findStoreItemById(itemId) {
  for (const category of Object.values(STORE_ITEMS)) {
    const found = category.find((item) => item.id === itemId);
    if (found) return found;
  }
  return null;
}

/* =========================================================
   LOGROS
========================================================= */

const ACHIEVEMENTS = [
  {
    id: "first_win",
    name: "Primer triunfo",
    description: "Ganá tu primera partida.",
    chance: "Muy alta · 80%"
  },
  {
    id: "bot_hunter",
    name: "Cazador de bots",
    description: "Ganale 3 veces al bot.",
    chance: "Alta · 60%"
  },
  {
    id: "bot_slayer",
    name: "Destructor de IA",
    description: "Ganale 10 veces al bot.",
    chance: "Media · 35%"
  },
  {
    id: "pvp_fighter",
    name: "Competitivo",
    description: "Ganá 5 partidas PvP.",
    chance: "Media · 45%"
  },
  {
    id: "quick_win",
    name: "Victoria rápida",
    description: "Ganá una partida en 12 turnos o menos.",
    chance: "Media · 35%"
  },
  {
    id: "uno_master",
    name: "Maestro del UNO",
    description: "Ganá una partida habiendo dicho UNO a tiempo.",
    chance: "Media · 40%"
  },
  {
    id: "streak_3",
    name: "En racha",
    description: "Ganá 3 partidas seguidas.",
    chance: "Baja · 20%"
  },
  {
    id: "streak_5",
    name: "Imparable",
    description: "Ganá 5 partidas seguidas.",
    chance: "Baja · 12%"
  },
  {
    id: "wild4_finisher",
    name: "Final salvaje",
    description: "Ganá usando un +4 como última carta.",
    chance: "Baja · 15%"
  },
  {
    id: "veteran_20",
    name: "Veterano",
    description: "Jugá 20 partidas.",
    chance: "Alta · 55%"
  },
  {
    id: "veteran_50",
    name: "Ultra veterano",
    description: "Jugá 50 partidas.",
    chance: "Media · 25%"
  },
  {
    id: "comeback_10",
    name: "Remontada épica",
    description: "Ganá una partida después de haber tenido 10 o más cartas.",
    chance: "Baja · 15%"
  },
  {
    id: "normal_unlock",
    name: "Subiendo el nivel",
    description: "Desbloqueá la dificultad Normal.",
    chance: "Alta · 55%"
  },
  {
    id: "hard_unlock",
    name: "Sin miedo",
    description: "Desbloqueá la dificultad Difícil.",
    chance: "Media · 30%"
  },
  {
    id: "insane_unlock",
    name: "Tocando el infierno",
    description: "Desbloqueá la dificultad Extremo.",
    chance: "Baja · 10%"
  }
];

/* =========================================================
   MISIONES DIARIAS
========================================================= */

const DAILY_MISSION_POOL = [
  {
    id: "play_games",
    name: "Jugador del día",
    description: "Jugá 2 partidas",
    target: 2,
    rewardXp: 25,
    rewardCoins: 20
  },
  {
    id: "win_games",
    name: "Victoria diaria",
    description: "Ganá 1 partida",
    target: 1,
    rewardXp: 35,
    rewardCoins: 30
  },
  {
    id: "say_uno",
    name: "No te olvides",
    description: "Decí UNO 2 veces",
    target: 2,
    rewardXp: 20,
    rewardCoins: 15
  },
  {
    id: "win_vs_bot",
    name: "Cazador del día",
    description: "Ganale 1 vez al bot",
    target: 1,
    rewardXp: 30,
    rewardCoins: 25
  }
];

/* =========================================================
   REGISTRO SLASH COMMANDS
========================================================= */

const slashCommands = [
  new SlashCommandBuilder().setName("uno").setDescription("Abrir el menú principal de UNO"),
  new SlashCommandBuilder().setName("reglas").setDescription("Mostrar reglas simples de UNO"),
  new SlashCommandBuilder().setName("ayuda").setDescription("Ver ayuda y comandos"),
  new SlashCommandBuilder().setName("top").setDescription("Ver ranking de jugadores"),
  new SlashCommandBuilder().setName("tienda").setDescription("Abrir la tienda de UNO"),
  new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Ver perfil de UNO")
    .addUserOption((o) =>
      o.setName("usuario").setDescription("Jugador a consultar").setRequired(false)
    ),
  new SlashCommandBuilder().setName("historial").setDescription("Ver últimas partidas"),
  new SlashCommandBuilder().setName("logros").setDescription("Ver logros"),
  new SlashCommandBuilder().setName("misiones").setDescription("Ver tus misiones diarias")
].map((c) => c.toJSON());

async function registerSlashCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    console.log("⚠️ Faltan DISCORD_TOKEN, CLIENT_ID o GUILD_ID en el .env");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: slashCommands
    });
    console.log("✅ Slash commands registrados");
  } catch (error) {
    console.error("❌ Error registrando slash commands:", error);
  }
}

/* =========================================================
   ARCHIVOS
========================================================= */

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATS_PATH)) fs.writeFileSync(STATS_PATH, JSON.stringify({}, null, 2));
  if (!fs.existsSync(HISTORY_PATH)) fs.writeFileSync(HISTORY_PATH, JSON.stringify([], null, 2));
}

function loadStats() {
  ensureDataFiles();
  try {
    return JSON.parse(fs.readFileSync(STATS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveStats(stats) {
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
}

function loadHistory() {
  ensureDataFiles();
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function addMatchToHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  saveHistory(history.slice(0, 50));
}

/* =========================================================
   STATS / XP / LEVEL / INVENTARIO
========================================================= */

function xpRequiredForLevel(level) {
  return level * 100;
}

function computeLevelFromXp(xp) {
  let level = 1;
  let remainingXp = xp;

  while (remainingXp >= xpRequiredForLevel(level)) {
    remainingXp -= xpRequiredForLevel(level);
    level += 1;
  }

  return { level, currentXp: remainingXp, nextLevelXp: xpRequiredForLevel(level) };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function createDailyMissionEntry(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    target: template.target,
    progress: 0,
    completed: false,
    claimed: false,
    rewardXp: template.rewardXp,
    rewardCoins: template.rewardCoins
  };
}

function createDefaultPlayer(username = "Jugador") {
  return {
    username,
    wins: 0,
    losses: 0,
    elo: 1000,
    gamesPlayed: 0,
    vsBotWins: 0,
    pvpWins: 0,
    winStreak: 0,
    bestWinStreak: 0,
    achievements: [],
    xp: 0,
    coins: 0,
    cardsPlayed: 0,
    unoCalls: 0,
    unoFails: 0,
    fastWins: 0,
    highestHandRecovered: 7,
    ownedTitles: [],
    equippedTitle: null,
    ownedBadges: [],
    equippedBadge: null,
    activeBoosts: [],
    dailyMissions: {
      date: todayKey(),
      missions: DAILY_MISSION_POOL.map(createDailyMissionEntry)
    }
  };
}

function ensureDailyMissions(player) {
  const currentDate = todayKey();

  if (!player.dailyMissions || player.dailyMissions.date !== currentDate) {
    player.dailyMissions = {
      date: currentDate,
      missions: DAILY_MISSION_POOL.map(createDailyMissionEntry)
    };
  }

  return player.dailyMissions;
}

function normalizePlayer(player) {
  const defaults = createDefaultPlayer(player?.username || "Jugador");
  const normalized = { ...defaults, ...player };
  ensureDailyMissions(normalized);

  if (!Array.isArray(normalized.ownedTitles)) normalized.ownedTitles = [];
  if (!Array.isArray(normalized.ownedBadges)) normalized.ownedBadges = [];
  if (!Array.isArray(normalized.activeBoosts)) normalized.activeBoosts = [];

  return normalized;
}

function getPlayerStats(userId, username = "Jugador") {
  const stats = loadStats();

  if (!stats[userId]) {
    stats[userId] = createDefaultPlayer(username);
    saveStats(stats);
    return stats[userId];
  }

  stats[userId] = normalizePlayer({
    ...stats[userId],
    username
  });

  saveStats(stats);
  return stats[userId];
}

function saveSinglePlayer(userId, player) {
  const stats = loadStats();
  stats[userId] = normalizePlayer(player);
  saveStats(stats);
}

function getEquippedTitle(player) {
  return player.equippedTitle || "Sin título";
}

function getEquippedBadge(player) {
  return player.equippedBadge || "Sin insignia";
}

function getActiveBoostText(player) {
  if (!player.activeBoosts?.length) return "Ninguno";
  return player.activeBoosts
    .map((b) => `${b.name} (${b.usesLeft} partidas)`)
    .join("\n");
}

function addRewards(player, xp, coins) {
  player.xp += xp;
  player.coins += coins;
}

function applyBoostsToRewards(player, baseXp, baseCoins) {
  let xp = baseXp;
  let coins = baseCoins;

  for (const boost of player.activeBoosts || []) {
    if (boost.usesLeft <= 0) continue;

    if (boost.effect === "xp") {
      xp = Math.round(xp * boost.multiplier);
    }

    if (boost.effect === "coins") {
      coins = Math.round(coins * boost.multiplier);
    }
  }

  return { xp, coins };
}

function consumeBoostUses(player) {
  if (!Array.isArray(player.activeBoosts)) return;

  for (const boost of player.activeBoosts) {
    if (boost.usesLeft > 0) boost.usesLeft -= 1;
  }

  player.activeBoosts = player.activeBoosts.filter((b) => b.usesLeft > 0);
}

function topPlayers(limit = 10) {
  const stats = loadStats();

  return Object.entries(stats)
    .map(([userId, data]) => {
      const safe = normalizePlayer({
        ...data,
        username: data?.username || "Jugador"
      });
      const lvl = computeLevelFromXp(safe.xp || 0);

      return { userId, ...safe, level: lvl.level };
    })
    .sort((a, b) => (b.elo || 0) - (a.elo || 0) || (b.wins || 0) - (a.wins || 0))
    .slice(0, limit);
}

function getPlayerRank(userId) {
  const ranking = topPlayers(9999);
  const index = ranking.findIndex((p) => p.userId === userId);
  return index === -1 ? null : index + 1;
}

function unlockAchievement(stats, userId, achievementId) {
  const player = stats[userId];
  if (!player) return false;
  if (!player.achievements.includes(achievementId)) {
    player.achievements.push(achievementId);
    return true;
  }
  return false;
}

function getUnlockedDifficulties(player) {
  const vsBotWins = player?.vsBotWins || 0;
  return BOT_DIFFICULTY_ORDER.filter(
    (id) => vsBotWins >= BOT_DIFFICULTIES[id].unlockVsBotWins
  );
}

function getHighestUnlockedDifficulty(player) {
  const unlocked = getUnlockedDifficulties(player);
  return unlocked[unlocked.length - 1] || "easy";
}

function evaluateAchievements(stats, userId, context = {}) {
  const player = stats[userId];
  if (!player) return [];

  const unlockedNow = [];

  const tryUnlock = (id, condition) => {
    if (condition && unlockAchievement(stats, userId, id)) {
      unlockedNow.push(ACHIEVEMENTS.find((a) => a.id === id));
    }
  };

  const highestUnlocked = getHighestUnlockedDifficulty(player);

  tryUnlock("first_win", player.wins >= 1);
  tryUnlock("bot_hunter", player.vsBotWins >= 3);
  tryUnlock("bot_slayer", player.vsBotWins >= 10);
  tryUnlock("pvp_fighter", player.pvpWins >= 5);
  tryUnlock("streak_3", player.winStreak >= 3);
  tryUnlock("streak_5", player.winStreak >= 5);
  tryUnlock("veteran_20", player.gamesPlayed >= 20);
  tryUnlock("veteran_50", player.gamesPlayed >= 50);
  tryUnlock("quick_win", context.quickWin === true);
  tryUnlock("uno_master", context.usedUnoAndWon === true);
  tryUnlock("wild4_finisher", context.wonWithWild4 === true);
  tryUnlock("comeback_10", context.maxHandRecovered >= 10);
  tryUnlock("normal_unlock", ["normal", "hard", "insane"].includes(highestUnlocked));
  tryUnlock("hard_unlock", ["hard", "insane"].includes(highestUnlocked));
  tryUnlock("insane_unlock", highestUnlocked === "insane");

  return unlockedNow;
}

/* =========================================================
   MISIONES
========================================================= */

function updateMissionProgress(userId, username, missionId, amount = 1) {
  const stats = loadStats();
  if (!stats[userId]) stats[userId] = createDefaultPlayer(username);

  stats[userId] = normalizePlayer({
    ...stats[userId],
    username
  });

  const player = stats[userId];
  const daily = ensureDailyMissions(player);

  const rewards = [];
  for (const mission of daily.missions) {
    if (mission.id !== missionId) continue;
    if (mission.claimed) continue;

    mission.progress = Math.min(mission.target, (mission.progress || 0) + amount);

    if (mission.progress >= mission.target && !mission.claimed) {
      mission.completed = true;
      mission.claimed = true;
      addRewards(player, mission.rewardXp, mission.rewardCoins);
      rewards.push(mission);
    }
  }

  saveStats(stats);
  return rewards;
}

function missionsSummaryText(user) {
  const stats = getPlayerStats(user.id, user.username);
  const daily = ensureDailyMissions(stats);

  return daily.missions
    .map((m) => {
      const emoji = m.claimed ? "✅" : "⬜";
      return `${emoji} ${m.name}: ${m.progress}/${m.target}`;
    })
    .join("\n");
}

function missionStatusText(mission) {
  const emoji = mission.claimed ? "✅" : "⬜";
  return `${emoji} **${mission.name}**\n${mission.description}\nProgreso: **${mission.progress}/${mission.target}** · Recompensa: 🪙 ${mission.rewardCoins} · ✨ ${mission.rewardXp}`;
}

/* =========================================================
   UTILIDADES GENERALES
========================================================= */

function cleanChannelName(text) {
  return String(text || "jugador")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20) || "jugador";
}

function getGameByChannelId(channelId) {
  const gameId = channelGames.get(channelId);
  if (!gameId) return null;
  return games.get(gameId) || null;
}

function getGameById(gameId) {
  return games.get(gameId) || null;
}

function setGameReferences(game) {
  games.set(game.id, game);
  channelGames.set(game.channelId, game.id);

  for (const p of game.players) {
    if (!p.isBot) playerGames.set(p.id, game.id);
  }
}

function refreshPlayerReferences(game) {
  for (const [userId, gameId] of playerGames.entries()) {
    if (gameId === game.id) playerGames.delete(userId);
  }

  for (const p of game.players) {
    if (!p.isBot) playerGames.set(p.id, game.id);
  }
}

function clearBotTurnTimers(gameId) {
  const timers = botTurnTimers.get(gameId);
  if (!timers) return;
  if (timers.playTimer) clearTimeout(timers.playTimer);
  if (timers.failSafeTimer) clearTimeout(timers.failSafeTimer);
  botTurnTimers.delete(gameId);
}

function clearRoomDeleteTimer(channelId) {
  const timer = roomDeleteTimers.get(channelId);
  if (timer) clearTimeout(timer);
  roomDeleteTimers.delete(channelId);
}

function removeGameReferences(game) {
  clearBotTurnTimers(game.id);
  games.delete(game.id);
  channelGames.delete(game.channelId);

  for (const p of game.players) {
    if (!p.isBot) playerGames.delete(p.id);
  }
}

function humanPlayers(game) {
  return game.players.filter((p) => !p.isBot);
}

function winRate(player) {
  const gp = player.gamesPlayed || 0;
  if (!gp) return 0;
  return Math.round(((player.wins || 0) / gp) * 100);
}

function difficultyText(player) {
  const unlocked = getUnlockedDifficulties(player);
  return unlocked.map((id) => BOT_DIFFICULTIES[id].name).join(", ");
}

function nextDifficultyGoal(player) {
  const vsBotWins = player?.vsBotWins || 0;

  for (const id of BOT_DIFFICULTY_ORDER) {
    const needed = BOT_DIFFICULTIES[id].unlockVsBotWins;
    if (vsBotWins < needed) {
      return `${BOT_DIFFICULTIES[id].name}: ${vsBotWins}/${needed} victorias vs bot`;
    }
  }

  return "Todas las dificultades desbloqueadas";
}

function createMatchStatEntry() {
  return {
    cardsPlayed: 0,
    unoCalls: 0,
    unoFails: 0,
    maxHand: 7
  };
}

/* =========================================================
   CANALES TEMPORALES
========================================================= */

async function getOrCreateTempCategory(guild) {
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === TEMP_CATEGORY_NAME
  );

  if (category) return category;

  category = await guild.channels.create({
    name: TEMP_CATEGORY_NAME,
    type: ChannelType.GuildCategory
  });

  return category;
}

async function createTempUnoChannel(guild, user) {
  const category = await getOrCreateTempCategory(guild);
  const safeName = cleanChannelName(user.username);

  const channel = await guild.channels.create({
    name: `uno-${safeName}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageMessages
        ]
      }
    ]
  });

  return channel;
}

/* =========================================================
   CARTAS
========================================================= */

function createCard(color, value, type) {
  return {
    id: `c${CARD_SEQ++}`,
    color,
    value,
    type,
    label:
      type === "number"
        ? `${COLORS[color]} ${value}`
        : type === "wild"
        ? "⚫ Comodín"
        : type === "wild4"
        ? "⚫ +4"
        : type === "skip"
        ? `${COLORS[color]} Salto`
        : type === "reverse"
        ? `${COLORS[color]} Reversa`
        : `${COLORS[color]} +2`
  };
}

function buildDeck() {
  const deck = [];
  const colors = ["red", "blue", "green", "yellow"];

  for (const color of colors) {
    deck.push(createCard(color, 0, "number"));

    for (let n = 1; n <= 9; n++) {
      deck.push(createCard(color, n, "number"));
      deck.push(createCard(color, n, "number"));
    }

    for (let i = 0; i < 2; i++) {
      deck.push(createCard(color, "skip", "skip"));
      deck.push(createCard(color, "reverse", "reverse"));
      deck.push(createCard(color, "+2", "draw2"));
    }
  }

  for (let i = 0; i < 4; i++) {
    deck.push(createCard("wild", "wild", "wild"));
    deck.push(createCard("wild", "wild4", "wild4"));
  }

  return shuffle(deck);
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCards(game, playerId, amount) {
  for (let i = 0; i < amount; i++) {
    if (game.deck.length === 0) refillDeck(game);
    if (game.deck.length === 0) return;
    game.hands[playerId].push(game.deck.pop());

    if (game.matchStats[playerId]) {
      game.matchStats[playerId].maxHand = Math.max(
        game.matchStats[playerId].maxHand,
        game.hands[playerId].length
      );
    }
  }
}

function refillDeck(game) {
  if (game.discard.length <= 1) return;
  const top = game.discard.pop();
  game.deck = shuffle(game.discard);
  game.discard = [top];
}

function getTopCard(game) {
  return game.discard[game.discard.length - 1];
}

function getCurrentColor(game) {
  return game.currentColor || getTopCard(game).color;
}

function canPlay(card, game) {
  const top = getTopCard(game);
  const currentColor = getCurrentColor(game);

  if (card.type === "wild" || card.type === "wild4") return true;
  if (card.color === currentColor) return true;
  if (card.type === top.type && card.type !== "number") return true;
  if (card.type === "number" && top.type === "number" && card.value === top.value) return true;

  return false;
}

function nextPlayerIndex(game, offset = 1) {
  const len = game.players.length;
  return ((game.currentPlayerIndex + offset * game.direction) % len + len) % len;
}

function getCurrentPlayer(game) {
  return game.players[game.currentPlayerIndex];
}

function getNextPlayer(game) {
  return game.players[nextPlayerIndex(game, 1)];
}

function cardSortValue(card) {
  const order = {
    number: 1,
    skip: 2,
    reverse: 3,
    draw2: 4,
    wild: 5,
    wild4: 6
  };
  return order[card.type] || 99;
}

function sortHand(hand) {
  return [...hand].sort((a, b) => {
    if (a.color !== b.color) return a.color.localeCompare(b.color);
    if (a.type !== b.type) return cardSortValue(a) - cardSortValue(b);
    return String(a.value).localeCompare(String(b.value));
  });
}

function handText(hand) {
  if (!hand.length) return "Sin cartas.";
  return sortHand(hand)
    .map((c, i) => `**${i + 1}.** ${c.label}`)
    .join("\n");
}

function getColorName(color) {
  return {
    red: "Rojo",
    blue: "Azul",
    green: "Verde",
    yellow: "Amarillo",
    wild: "Comodín"
  }[color] || color;
}

/* =========================================================
   PARTIDAS
========================================================= */

function createBaseGame(channel, ownerUser, vsBot = false, botDifficulty = "easy") {
  const gameId = `${channel.id}_${Date.now()}`;

  const game = {
    id: gameId,
    channelId: channel.id,
    guildId: channel.guild?.id || null,
    started: false,
    finished: false,
    ownerId: ownerUser.id,
    players: [
      {
        id: ownerUser.id,
        username: ownerUser.username,
        isBot: false
      }
    ],
    hands: {},
    deck: [],
    discard: [],
    currentPlayerIndex: 0,
    direction: 1,
    currentColor: null,
    messageId: null,
    lastAction: "Lobby creado.",
    vsBot,
    botDifficulty,
    unoCalled: {},
    saidUnoThisGame: {},
    turnNumber: 0,
    createdAt: Date.now(),
    lastPlayedCardType: null,
    tempChannel: vsBot,
    matchStats: {}
  };

  if (vsBot) {
    game.players.push({
      id: "UNO_BOT",
      username: `UNO Bot (${BOT_DIFFICULTIES[botDifficulty]?.name || "Fácil"})`,
      isBot: true
    });
  }

  for (const p of game.players) {
    game.hands[p.id] = [];
    game.unoCalled[p.id] = false;
    game.saidUnoThisGame[p.id] = false;
    game.matchStats[p.id] = createMatchStatEntry();
  }

  return game;
}

function startGame(game) {
  game.started = true;
  game.finished = false;
  game.deck = buildDeck();
  game.discard = [];
  game.direction = 1;
  game.turnNumber = 1;
  game.lastPlayedCardType = null;

  for (const p of game.players) {
    game.hands[p.id] = [];
    game.unoCalled[p.id] = false;
    game.saidUnoThisGame[p.id] = false;
    game.matchStats[p.id] = createMatchStatEntry();
  }

  for (let i = 0; i < 7; i++) {
    for (const p of game.players) {
      drawCards(game, p.id, 1);
    }
  }

  let firstCard = null;
  while (game.deck.length > 0) {
    const card = game.deck.pop();
    if (card.type !== "wild4") {
      firstCard = card;
      break;
    } else {
      game.deck.unshift(card);
      game.deck = shuffle(game.deck);
    }
  }

  if (!firstCard) firstCard = createCard("red", 0, "number");

  game.discard.push(firstCard);
  game.currentColor = firstCard.color === "wild" ? "red" : firstCard.color;
  game.currentPlayerIndex = 0;
  game.lastAction = `Empezó la partida · Carta inicial ${firstCard.label}`;

  if (firstCard.type === "skip") {
    game.currentPlayerIndex = nextPlayerIndex(game, 1);
    game.lastAction += " · Primer turno saltado";
  } else if (firstCard.type === "reverse" && game.players.length === 2) {
    game.currentPlayerIndex = nextPlayerIndex(game, 2);
    game.lastAction += " · Reversa actúa como salto";
  } else if (firstCard.type === "reverse") {
    game.direction *= -1;
    game.lastAction += " · Cambió el sentido";
  } else if (firstCard.type === "draw2") {
    const next = game.players[nextPlayerIndex(game, 1)];
    drawCards(game, next.id, 2);
    game.currentPlayerIndex = nextPlayerIndex(game, 2);
    game.lastAction += ` · ${next.username} robó 2`;
  }
}

function tryJoinLobby(game, user) {
  if (!game) return { ok: false, reason: "No hay lobby." };
  if (game.started) return { ok: false, reason: "La partida ya comenzó." };
  if (game.vsBot) return { ok: false, reason: "Esa partida es contra el bot." };
  if (game.players.find((p) => p.id === user.id)) return { ok: false, reason: "Ya estás en el lobby." };
  if (game.players.length >= 4) return { ok: false, reason: "El lobby está lleno." };
  if (playerGames.has(user.id)) return { ok: false, reason: "Ya estás en otra partida o lobby." };

  game.players.push({
    id: user.id,
    username: user.username,
    isBot: false
  });
  game.hands[user.id] = [];
  game.unoCalled[user.id] = false;
  game.saidUnoThisGame[user.id] = false;
  game.matchStats[user.id] = createMatchStatEntry();

  refreshPlayerReferences(game);
  return { ok: true };
}

/* =========================================================
   REMATCH
========================================================= */

function createRematchOfferFromGame(game) {
  return {
    channelId: game.channelId,
    guildId: game.guildId,
    ownerId: game.ownerId,
    players: humanPlayers(game).map((p) => ({
      id: p.id,
      username: p.username,
      isBot: false
    })),
    vsBot: game.vsBot,
    botDifficulty: game.botDifficulty || "easy",
    accepted: [],
    createdAt: Date.now(),
    tempChannel: game.tempChannel
  };
}

function rematchAcceptedCount(offer) {
  return offer.accepted.length;
}

function rematchAllAccepted(offer) {
  return offer.players.every((p) => offer.accepted.includes(p.id));
}

function setRematchOffer(offer) {
  rematchOffers.set(offer.channelId, offer);
}

function clearRematchOffer(channelId) {
  rematchOffers.delete(channelId);
}

async function startRematchFromOffer(channel, offer) {
  clearRematchOffer(channel.id);
  clearRoomDeleteTimer(channel.id);

  const owner = offer.players.find((p) => p.id === offer.ownerId) || offer.players[0];
  const game = createBaseGame(channel, owner, offer.vsBot, offer.botDifficulty);

  if (!offer.vsBot) {
    game.players = offer.players.map((p) => ({
      id: p.id,
      username: p.username,
      isBot: false
    }));

    game.hands = {};
    game.unoCalled = {};
    game.saidUnoThisGame = {};
    game.matchStats = {};

    for (const p of game.players) {
      game.hands[p.id] = [];
      game.unoCalled[p.id] = false;
      game.saidUnoThisGame[p.id] = false;
      game.matchStats[p.id] = createMatchStatEntry();
    }
  }

  setGameReferences(game);
  startGame(game);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(EMBED.brand)
        .setTitle("🔁 Revancha iniciada")
        .setDescription(
          offer.vsBot
            ? `Nueva partida vs bot en dificultad **${BOT_DIFFICULTIES[offer.botDifficulty].name}**`
            : "Nueva partida con los mismos jugadores"
        )
    ]
  });

  await sendOrUpdateGameMessage(channel, game);

  if (getCurrentPlayer(game)?.isBot) {
    scheduleBotTurn(channel, game);
  }
}

function scheduleTempRoomDeletion(channel, ms, reason) {
  clearRoomDeleteTimer(channel.id);

  const timer = setTimeout(async () => {
    try {
      await channel.delete(reason);
    } catch (err) {
      console.error("No se pudo borrar la sala temporal:", err);
    } finally {
      clearRoomDeleteTimer(channel.id);
      clearRematchOffer(channel.id);
    }
  }, ms);

  roomDeleteTimers.set(channel.id, timer);
}

/* =========================================================
   TIENDA - LOGICA
========================================================= */

function openBasicBox(player) {
  const roll = Math.random();

  if (roll < 0.45) {
    const coins = 60 + Math.floor(Math.random() * 91);
    player.coins += coins;
    return { title: "📦 Caja básica", description: `Ganaste **🪙 ${coins} monedas**.` };
  }

  if (roll < 0.75) {
    const xp = 25 + Math.floor(Math.random() * 31);
    player.xp += xp;
    return { title: "📦 Caja básica", description: `Ganaste **✨ ${xp} XP**.` };
  }

  if (roll < 0.9) {
    const titleReward = STORE_ITEMS.titles[Math.floor(Math.random() * STORE_ITEMS.titles.length)];
    if (!player.ownedTitles.includes(titleReward.name)) {
      player.ownedTitles.push(titleReward.name);
      return { title: "📦 Caja básica", description: `Desbloqueaste el título **${titleReward.name}**.` };
    }

    const coins = 120;
    player.coins += coins;
    return { title: "📦 Caja básica", description: `Título repetido. Recibiste **🪙 ${coins} monedas**.` };
  }

  const badgeReward = STORE_ITEMS.badges[Math.floor(Math.random() * STORE_ITEMS.badges.length)];
  if (!player.ownedBadges.includes(badgeReward.name)) {
    player.ownedBadges.push(badgeReward.name);
    return { title: "📦 Caja básica", description: `Desbloqueaste la insignia **${badgeReward.name}**.` };
  }

  player.coins += 140;
  return { title: "📦 Caja básica", description: `Insignia repetida. Recibiste **🪙 140 monedas**.` };
}

function openRareBox(player) {
  const roll = Math.random();

  if (roll < 0.35) {
    const coins = 180 + Math.floor(Math.random() * 121);
    player.coins += coins;
    return { title: "🎁 Caja rara", description: `Ganaste **🪙 ${coins} monedas**.` };
  }

  if (roll < 0.62) {
    const xp = 80 + Math.floor(Math.random() * 61);
    player.xp += xp;
    return { title: "🎁 Caja rara", description: `Ganaste **✨ ${xp} XP**.` };
  }

  if (roll < 0.8) {
    const titleReward = STORE_ITEMS.titles[Math.floor(Math.random() * STORE_ITEMS.titles.length)];
    if (!player.ownedTitles.includes(titleReward.name)) {
      player.ownedTitles.push(titleReward.name);
      return { title: "🎁 Caja rara", description: `Desbloqueaste el título **${titleReward.name}**.` };
    }

    player.coins += 220;
    return { title: "🎁 Caja rara", description: `Título repetido. Recibiste **🪙 220 monedas**.` };
  }

  if (roll < 0.93) {
    const badgeReward = STORE_ITEMS.badges[Math.floor(Math.random() * STORE_ITEMS.badges.length)];
    if (!player.ownedBadges.includes(badgeReward.name)) {
      player.ownedBadges.push(badgeReward.name);
      return { title: "🎁 Caja rara", description: `Desbloqueaste la insignia **${badgeReward.name}**.` };
    }

    player.coins += 260;
    return { title: "🎁 Caja rara", description: `Insignia repetida. Recibiste **🪙 260 monedas**.` };
  }

  const boost = STORE_ITEMS.boosts[Math.floor(Math.random() * STORE_ITEMS.boosts.length)];
  player.activeBoosts.push({
    id: `${boost.id}_${Date.now()}`,
    name: boost.name,
    effect: boost.effect,
    multiplier: boost.multiplier,
    usesLeft: boost.uses
  });

  return { title: "🎁 Caja rara", description: `Ganaste el boost **${boost.name}**.` };
}

function openEpicBox(player) {
  const roll = Math.random();

  if (roll < 0.25) {
    const coins = 450 + Math.floor(Math.random() * 251);
    player.coins += coins;
    return { title: "💎 Caja épica", description: `Ganaste **🪙 ${coins} monedas**.` };
  }

  if (roll < 0.45) {
    const xp = 180 + Math.floor(Math.random() * 121);
    player.xp += xp;
    return { title: "💎 Caja épica", description: `Ganaste **✨ ${xp} XP**.` };
  }

  if (roll < 0.7) {
    const titleReward = STORE_ITEMS.titles[Math.floor(Math.random() * STORE_ITEMS.titles.length)];
    if (!player.ownedTitles.includes(titleReward.name)) {
      player.ownedTitles.push(titleReward.name);
      return { title: "💎 Caja épica", description: `Desbloqueaste el título **${titleReward.name}**.` };
    }

    player.coins += 500;
    return { title: "💎 Caja épica", description: `Título repetido. Recibiste **🪙 500 monedas**.` };
  }

  if (roll < 0.9) {
    const badgeReward = STORE_ITEMS.badges[Math.floor(Math.random() * STORE_ITEMS.badges.length)];
    if (!player.ownedBadges.includes(badgeReward.name)) {
      player.ownedBadges.push(badgeReward.name);
      return { title: "💎 Caja épica", description: `Desbloqueaste la insignia **${badgeReward.name}**.` };
    }

    player.coins += 520;
    return { title: "💎 Caja épica", description: `Insignia repetida. Recibiste **🪙 520 monedas**.` };
  }

  const boost = STORE_ITEMS.boosts[Math.floor(Math.random() * STORE_ITEMS.boosts.length)];
  player.activeBoosts.push({
    id: `${boost.id}_${Date.now()}`,
    name: boost.name,
    effect: boost.effect,
    multiplier: boost.multiplier,
    usesLeft: boost.uses + 2
  });

  return { title: "💎 Caja épica", description: `Ganaste el boost mejorado **${boost.name}**.` };
}

function openBox(player, itemId) {
  if (itemId === "basic_box") return openBasicBox(player);
  if (itemId === "rare_box") return openRareBox(player);
  if (itemId === "epic_box") return openEpicBox(player);
  return { title: "Caja", description: "No pasó nada." };
}

function buyStoreItem(userId, username, itemId) {
  const stats = loadStats();
  if (!stats[userId]) stats[userId] = createDefaultPlayer(username);

  const player = normalizePlayer({
    ...stats[userId],
    username
  });

  const item = findStoreItemById(itemId);
  if (!item) {
    return { ok: false, reason: "Ese objeto no existe." };
  }

  if ((player.coins || 0) < item.price) {
    return { ok: false, reason: `No te alcanza. Tenés ${player.coins || 0} monedas.` };
  }

  player.coins -= item.price;

  let resultText = "";
  let autoEquip = false;

  if (STORE_ITEMS.boxes.some((x) => x.id === itemId)) {
    const result = openBox(player, itemId);
    resultText = result.description;
  } else if (STORE_ITEMS.titles.some((x) => x.id === itemId)) {
    if (player.ownedTitles.includes(item.name)) {
      player.coins += item.price;
      return { ok: false, reason: "Ya tenés ese título." };
    }
    player.ownedTitles.push(item.name);
    player.equippedTitle = item.name;
    resultText = `Compraste y equipaste el título **${item.name}**.`;
    autoEquip = true;
  } else if (STORE_ITEMS.badges.some((x) => x.id === itemId)) {
    if (player.ownedBadges.includes(item.name)) {
      player.coins += item.price;
      return { ok: false, reason: "Ya tenés esa insignia." };
    }
    player.ownedBadges.push(item.name);
    player.equippedBadge = item.name;
    resultText = `Compraste y equipaste la insignia **${item.name}**.`;
    autoEquip = true;
  } else if (STORE_ITEMS.boosts.some((x) => x.id === itemId)) {
    player.activeBoosts.push({
      id: `${item.id}_${Date.now()}`,
      name: item.name,
      effect: item.effect,
      multiplier: item.multiplier,
      usesLeft: item.uses
    });
    resultText = `Compraste el boost **${item.name}**.`;
  }

  stats[userId] = player;
  saveStats(stats);

  return {
    ok: true,
    item,
    resultText,
    autoEquip,
    newCoins: player.coins
  };
}

/* =========================================================
   EMBEDS
========================================================= */

function menuEmbed(user) {
  const stats = getPlayerStats(user.id, user.username);
  const lvl = computeLevelFromXp(stats.xp || 0);

  return new EmbedBuilder()
    .setColor(EMBED.brand)
    .setTitle("🃏 UNO")
    .setDescription("Elegí una opción para jugar")
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      {
        name: "Tu progreso",
        value: [
          `⚡ Elo: **${stats.elo}**`,
          `🆙 Nivel: **${lvl.level}**`,
          `🪙 Monedas: **${stats.coins || 0}**`,
          `🏷️ Título: **${getEquippedTitle(stats)}**`,
          `🎖️ Insignia: **${getEquippedBadge(stats)}**`
        ].join("\n")
      },
      {
        name: "Misiones diarias",
        value: missionsSummaryText(user).slice(0, 1024) || "Sin misiones"
      }
    )
    .setFooter({ text: "UNO Bot" });
}

function helpEmbed() {
  return new EmbedBuilder()
    .setColor(EMBED.brand)
    .setTitle("❓ Ayuda de UNO")
    .setDescription(
      [
        "• Jugá mismo color, número o tipo",
        "• Si no podés jugar, robás",
        "• Cuando te queda 1 carta, tocá UNO",
        "• Gana el primero que se queda sin cartas",
        "",
        "**Comandos**",
        "`/uno` → menú principal",
        "`/ayuda` → ayuda y comandos",
        "`/reglas` → reglas del juego",
        "`/top` → ranking global",
        "`/tienda` → abrir la tienda",
        "`/perfil [usuario]` → ver perfil",
        "`/historial` → últimas partidas",
        "`/logros` → logros con páginas",
        "`/misiones` → ver misiones diarias",
        "",
        "Ganando contra el bot desbloqueás dificultades nuevas."
      ].join("\n")
    );
}

function rulesEmbed() {
  return new EmbedBuilder()
    .setColor(EMBED.warning)
    .setTitle("📜 Reglas de UNO")
    .setDescription(
      [
        "• Mismo color, número o tipo",
        "• Si no podés jugar, robás",
        "• Salto: pierde turno el siguiente",
        "• Reversa: cambia el sentido",
        "• +2: el siguiente roba 2",
        "• Comodín: elegís color",
        "• +4: elegís color y el siguiente roba 4",
        "• Con 1 carta, decí UNO",
        "• Gana quien se quede sin cartas"
      ].join("\n")
    );
}

function difficultySelectEmbed(user) {
  const stats = getPlayerStats(user.id, user.username);
  const unlocked = getUnlockedDifficulties(stats);

  const text = BOT_DIFFICULTY_ORDER.map((id) => {
    const diff = BOT_DIFFICULTIES[id];
    const ok = unlocked.includes(id);
    return `${ok ? "✅" : "🔒"} **${diff.name}** — ${diff.desc} ${
      ok ? "" : `(se desbloquea con ${diff.unlockVsBotWins} victorias vs bot)`
    }`;
  }).join("\n");

  return new EmbedBuilder()
    .setColor(EMBED.purple)
    .setTitle("🤖 Elegí dificultad")
    .setDescription(text);
}

function lobbyEmbed(game) {
  const playersText = game.players
    .map((p) => `${p.isBot ? "🤖" : "👤"} ${p.username}`)
    .join("\n");

  return new EmbedBuilder()
    .setColor(EMBED.purple)
    .setTitle(game.vsBot ? "🤖 Partida vs Bot" : "🎮 Lobby UNO")
    .setDescription(
      game.vsBot
        ? `Preparando partida...\nDificultad: **${BOT_DIFFICULTIES[game.botDifficulty].name}**`
        : "Esperando jugadores..."
    )
    .addFields({
      name: "Jugadores",
      value: playersText || "Sin jugadores"
    });
}

function gameEmbed(game) {
  const topCard = getTopCard(game);
  const currentPlayer = getCurrentPlayer(game);
  const color = getCurrentColor(game);

  const playersText = game.players
    .map((p, idx) => {
      const marker = idx === game.currentPlayerIndex ? "👉" : "•";
      const uno = game.hands[p.id].length === 1 ? " | UNO" : "";
      return `${marker} ${p.username} — ${game.hands[p.id].length} 🃏${uno}`;
    })
    .join("\n");

  const extra = game.vsBot
    ? `\n**Bot:** ${BOT_DIFFICULTIES[game.botDifficulty].name}`
    : "";

  return new EmbedBuilder()
    .setColor(EMBED.dark)
    .setTitle("🃏 UNO")
    .setDescription(
      [
        `**Carta:** ${topCard.label}`,
        `**Color:** ${COLORS[color]} ${getColorName(color)}`,
        `**Turno:** ${currentPlayer.username}${extra}`
      ].join("\n")
    )
    .addFields(
      { name: "Jugadores", value: playersText || "Sin jugadores" },
      { name: "Última", value: game.lastAction || "Sin jugadas" }
    )
    .setFooter({ text: `Turno ${game.turnNumber}` });
}

function topEmbed() {
  const ranking = topPlayers(10);
  const text =
    ranking.length === 0
      ? "Todavía no hay jugadores."
      : ranking
          .map(
            (p, i) =>
              `**${i + 1}.** ${p.username} — ⚡ ${p.elo} · 🆙 Nivel ${p.level}`
          )
          .join("\n");

  return new EmbedBuilder()
    .setColor(EMBED.warning)
    .setTitle("🏆 Top UNO")
    .setDescription(text);
}

function profileEmbed(user) {
  const stats = getPlayerStats(user.id, user.username);
  const rank = getPlayerRank(user.id);
  const achievementCount = Array.isArray(stats.achievements) ? stats.achievements.length : 0;
  const lvl = computeLevelFromXp(stats.xp || 0);
  const highestDiff = BOT_DIFFICULTIES[getHighestUnlockedDifficulty(stats)].name;

  return new EmbedBuilder()
    .setColor(EMBED.brand)
    .setTitle(`👤 ${user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .setDescription(
      [
        `🏷️ Título: **${getEquippedTitle(stats)}**`,
        `🎖️ Insignia: **${getEquippedBadge(stats)}**`,
        `⚡ Elo: **${stats.elo}**`,
        `🆙 Nivel: **${lvl.level}**`,
        `✨ XP: **${lvl.currentXp}/${lvl.nextLevelXp}**`,
        `🪙 Monedas: **${stats.coins || 0}**`,
        `🏆 Victorias: **${stats.wins}**`,
        `❌ Derrotas: **${stats.losses}**`,
        `📊 Winrate: **${winRate(stats)}%**`,
        `🎮 Partidas: **${stats.gamesPlayed}**`,
        `🤖 Vs Bot: **${stats.vsBotWins}**`,
        `⚔️ PvP: **${stats.pvpWins}**`,
        `🔥 Racha actual: **${stats.winStreak}**`,
        `🚀 Mejor racha: **${stats.bestWinStreak || 0}**`,
        `📢 UNO dicho: **${stats.unoCalls || 0}**`,
        `💥 UNO olvidado: **${stats.unoFails || 0}**`,
        `🃏 Cartas jugadas: **${stats.cardsPlayed || 0}**`,
        `⚡ Victorias rápidas: **${stats.fastWins || 0}**`,
        `🤖 Máxima dificultad: **${highestDiff}**`,
        `📈 Posición: **${rank ? `#${rank}` : "Sin rank"}**`,
        `🏅 Logros: **${achievementCount}/${ACHIEVEMENTS.length}**`
      ].join("\n")
    )
    .addFields(
      {
        name: "Dificultades desbloqueadas",
        value: difficultyText(stats) || "Fácil"
      },
      {
        name: "Boosts activos",
        value: getActiveBoostText(stats).slice(0, 1024) || "Ninguno"
      },
      {
        name: "Siguiente meta",
        value: nextDifficultyGoal(stats)
      }
    );
}

function historyEmbed() {
  const history = loadHistory().slice(0, 10);

  const text =
    history.length === 0
      ? "Todavía no hay partidas registradas."
      : history
          .map(
            (h, i) =>
              `**${i + 1}.** ${h.winner} ganó\n${h.players.join(" vs ")}\nModo: ${h.mode}${
                h.difficulty ? ` · Dif: ${h.difficulty}` : ""
              } · Turnos: ${h.turns}`
          )
          .join("\n\n");

  return new EmbedBuilder()
    .setColor(EMBED.gray)
    .setTitle("🕘 Historial")
    .setDescription(text);
}

function buildAchievementsData(user) {
  const stats = getPlayerStats(user.id, user.username);

  return ACHIEVEMENTS.map((a) => ({
    unlocked: stats.achievements.includes(a.id),
    name: a.name,
    description: a.description,
    chance: a.chance
  }));
}

function achievementsEmbed(user, page = 0) {
  const stats = getPlayerStats(user.id, user.username);
  const all = buildAchievementsData(user);
  const totalPages = Math.max(1, Math.ceil(all.length / ACHIEVEMENTS_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * ACHIEVEMENTS_PER_PAGE;
  const current = all.slice(start, start + ACHIEVEMENTS_PER_PAGE);

  const unlockedCount = ACHIEVEMENTS.filter((a) => stats.achievements.includes(a.id)).length;

  const text =
    current.length === 0
      ? "No hay logros para mostrar."
      : current
          .map(
            (a) =>
              `${a.unlocked ? "✅" : "⬜"} **${a.name}**\n${a.description}\nProbabilidad: ${a.chance}`
          )
          .join("\n\n");

  return new EmbedBuilder()
    .setColor(EMBED.brand)
    .setTitle(`🏅 Logros de ${user.username}`)
    .setDescription(`Tenés **${unlockedCount}/${ACHIEVEMENTS.length}** logros desbloqueados`)
    .addFields({
      name: `Página ${safePage + 1}/${totalPages}`,
      value: text.slice(0, 1024) || "Sin contenido"
    });
}

function missionsEmbed(user) {
  const stats = getPlayerStats(user.id, user.username);
  const daily = ensureDailyMissions(stats);

  const text = daily.missions.map(missionStatusText).join("\n\n");

  return new EmbedBuilder()
    .setColor(EMBED.green)
    .setTitle(`📅 Misiones diarias de ${user.username}`)
    .setDescription(`Fecha: **${daily.date}**`)
    .addFields({
      name: "Tus misiones",
      value: text.slice(0, 1024) || "Sin misiones"
    });
}

function shopMainEmbed(user) {
  const stats = getPlayerStats(user.id, user.username);

  return new EmbedBuilder()
    .setColor(EMBED.purple)
    .setTitle("🛒 Tienda UNO")
    .setDescription(
      [
        `🪙 Tus monedas: **${stats.coins || 0}**`,
        "",
        "Elegí una categoría:",
        "📦 Cajas",
        "🏷️ Títulos",
        "🎖️ Insignias",
        "🚀 Boosts"
      ].join("\n")
    );
}

function shopCategoryEmbed(user, categoryId) {
  const stats = getPlayerStats(user.id, user.username);
  const items = STORE_ITEMS[categoryId] || [];

  const text =
    items.length === 0
      ? "No hay objetos."
      : items
          .map((item) => {
            let ownedText = "";

            if (categoryId === "titles" && stats.ownedTitles.includes(item.name)) {
              ownedText = " · ✅ Ya lo tenés";
            }

            if (categoryId === "badges" && stats.ownedBadges.includes(item.name)) {
              ownedText = " · ✅ Ya la tenés";
            }

            return `${item.emoji || "🛍️"} **${item.name}** — 🪙 ${item.price}${ownedText}\n${item.description}`;
          })
          .join("\n\n");

  const titleMap = {
    boxes: "📦 Cajas",
    titles: "🏷️ Títulos",
    badges: "🎖️ Insignias",
    boosts: "🚀 Boosts"
  };

  return new EmbedBuilder()
    .setColor(EMBED.purple)
    .setTitle(`🛒 ${titleMap[categoryId] || "Tienda"}`)
    .setDescription(`Tus monedas: **${stats.coins || 0}**`)
    .addFields({
      name: "Objetos",
      value: text.slice(0, 1024) || "Sin contenido"
    });
}

function shopPurchaseEmbed(result) {
  return new EmbedBuilder()
    .setColor(EMBED.success)
    .setTitle("✅ Compra realizada")
    .setDescription(result.resultText)
    .addFields({
      name: "Monedas restantes",
      value: `🪙 ${result.newCoins}`
    });
}

function playerPanelEmbed(game, user) {
  const hand = sortHand(game.hands[user.id] || []);
  const topCard = getTopCard(game);
  const currentColor = getCurrentColor(game);
  const isTurn = getCurrentPlayer(game).id === user.id;

  return new EmbedBuilder()
    .setColor(EMBED.dark)
    .setTitle("🃏 Mi mano")
    .setDescription(
      [
        `**Carta en mesa:** ${topCard.label}`,
        `**Color activo:** ${COLORS[currentColor]} ${getColorName(currentColor)}`,
        `**Tu turno:** ${isTurn ? "Sí" : "No"}`,
        `**Cartas:** ${hand.length}`
      ].join("\n")
    )
    .addFields({
      name: "Tus cartas",
      value: handText(hand).slice(0, 1024) || "Sin cartas"
    });
}

function achievementUnlockEmbed(achievement) {
  return new EmbedBuilder()
    .setColor(EMBED.success)
    .setTitle("🏅 Logro desbloqueado")
    .setDescription(`**${achievement.name}**\n${achievement.description}`);
}

function rematchEmbed(offer) {
  return new EmbedBuilder()
    .setColor(EMBED.purple)
    .setTitle("🔁 Revancha disponible")
    .setDescription(
      offer.vsBot
        ? `Presioná **Revancha** para jugar otra partida contra el bot en dificultad **${BOT_DIFFICULTIES[offer.botDifficulty].name}**.`
        : `Aceptaciones: **${rematchAcceptedCount(offer)}/${offer.players.length}**`
    );
}

function missionsCompletedEmbeds(missions) {
  return missions.map((m) =>
    new EmbedBuilder()
      .setColor(EMBED.success)
      .setTitle("✅ Misión diaria completada")
      .setDescription(`**${m.name}**\nGanaste 🪙 ${m.rewardCoins} y ✨ ${m.rewardXp}`)
  );
}

/* =========================================================
   COMPONENTES
========================================================= */

function menuComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("uno_menu_find")
        .setLabel("Buscar partida")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎮"),
      new ButtonBuilder()
        .setCustomId("uno_menu_bot")
        .setLabel("Jugar vs Bot")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🤖"),
      new ButtonBuilder()
        .setCustomId("uno_menu_hand")
        .setLabel("Mi mano")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🃏")
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("uno_menu_top")
        .setLabel("Top")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🏆"),
      new ButtonBuilder()
        .setCustomId("uno_menu_help")
        .setLabel("Ayuda")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❓"),
      new ButtonBuilder()
        .setCustomId("uno_menu_achievements")
        .setLabel("Logros")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🏅")
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("uno_menu_missions")
        .setLabel("Misiones")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📅"),
      new ButtonBuilder()
        .setCustomId("uno_menu_shop")
        .setLabel("Tienda")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🛒")
    )
  ];
}

function achievementsComponents(userId, page = 0) {
  const totalPages = Math.max(1, Math.ceil(ACHIEVEMENTS.length / ACHIEVEMENTS_PER_PAGE));

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`uno_ach_prev_${userId}_${page}`)
        .setLabel("⬅️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(`uno_ach_next_${userId}_${page}`)
        .setLabel("➡️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    )
  ];
}

function shopMainComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("uno_shop_boxes")
        .setLabel("Cajas")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📦"),
      new ButtonBuilder()
        .setCustomId("uno_shop_titles")
        .setLabel("Títulos")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🏷️"),
      new ButtonBuilder()
        .setCustomId("uno_shop_badges")
        .setLabel("Insignias")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎖️"),
      new ButtonBuilder()
        .setCustomId("uno_shop_boosts")
        .setLabel("Boosts")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🚀")
    )
  ];
}

function shopCategoryComponents(categoryId) {
  const items = STORE_ITEMS[categoryId] || [];
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  items.forEach((item, index) => {
    const btn = new ButtonBuilder()
      .setCustomId(`uno_buy_${item.id}`)
      .setLabel(item.name.slice(0, 80))
      .setStyle(ButtonStyle.Success);

    if (index < 3) row1.addComponents(btn);
    else row2.addComponents(btn);
  });

  const rows = [];
  if (row1.components.length) rows.push(row1);
  if (row2.components.length) rows.push(row2);

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("uno_shop_back")
        .setLabel("Volver")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⬅️")
    )
  );

  return rows;
}

function difficultyComponents(user) {
  const stats = getPlayerStats(user.id, user.username);
  const unlocked = getUnlockedDifficulties(stats);

  const buttons = BOT_DIFFICULTY_ORDER.map((id) => {
    const diff = BOT_DIFFICULTIES[id];
    const enabled = unlocked.includes(id);

    return new ButtonBuilder()
      .setCustomId(`uno_botdiff_${id}`)
      .setLabel(diff.name)
      .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!enabled);
  });

  return [new ActionRowBuilder().addComponents(buttons.slice(0, 4))];
}

function lobbyComponents(game) {
  if (game.vsBot) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`uno_join_${game.id}`)
        .setLabel("Unirme")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`uno_start_${game.id}`)
        .setLabel("Empezar")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🚀"),
      new ButtonBuilder()
        .setCustomId(`uno_leave_${game.id}`)
        .setLabel("Salir")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌")
    )
  ];
}

function gameComponents(game) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`uno_open_${game.id}`)
        .setLabel("Mi mano")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🃏"),
      new ButtonBuilder()
        .setCustomId(`uno_refresh_${game.id}`)
        .setLabel("Actualizar")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔄"),
      new ButtonBuilder()
        .setCustomId(`uno_topgame_${game.id}`)
        .setLabel("Top")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🏆"),
      new ButtonBuilder()
        .setCustomId(`uno_close_${game.id}`)
        .setLabel("Cerrar sala")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️")
    )
  ];
}

function panelComponents(game, userId) {
  const hand = sortHand(game.hands[userId] || []);
  const playable = hand.filter((c) => canPlay(c, game));

  const options = hand.slice(0, 25).map((card) => ({
    label: card.label.slice(0, 100),
    description: canPlay(card, game) ? "Podés jugarla" : "No podés jugarla",
    value: card.id,
    emoji:
      card.color === "red"
        ? "🔴"
        : card.color === "blue"
        ? "🔵"
        : card.color === "green"
        ? "🟢"
        : card.color === "yellow"
        ? "🟡"
        : "⚫"
  }));

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`uno_play_${game.id}`)
        .setPlaceholder(
          hand.length
            ? playable.length
              ? "Elegí una carta"
              : "No tenés jugables, podés robar"
            : "No tenés cartas"
        )
        .setDisabled(!hand.length)
        .addOptions(
          options.length
            ? options
            : [{ label: "Sin cartas", description: "No hay cartas", value: "none" }]
        )
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`uno_draw_${game.id}`)
        .setLabel("Robar")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("➕"),
      new ButtonBuilder()
        .setCustomId(`uno_uno_${game.id}`)
        .setLabel("UNO")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📢"),
      new ButtonBuilder()
        .setCustomId(`uno_panelrefresh_${game.id}`)
        .setLabel("Actualizar")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔄")
    )
  ];
}

function wildColorComponents(game, card) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`uno_color_${game.id}_${card.id}_red`)
        .setLabel("Rojo")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔴"),
      new ButtonBuilder()
        .setCustomId(`uno_color_${game.id}_${card.id}_blue`)
        .setLabel("Azul")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔵"),
      new ButtonBuilder()
        .setCustomId(`uno_color_${game.id}_${card.id}_green`)
        .setLabel("Verde")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🟢"),
      new ButtonBuilder()
        .setCustomId(`uno_color_${game.id}_${card.id}_yellow`)
        .setLabel("Amarillo")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🟡")
    )
  ];
}

function rematchComponents(channelId, includeCloseRoom = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`uno_rematch_${channelId}`)
      .setLabel("Revancha")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔁")
  );

  if (includeCloseRoom) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`uno_closeroom_${channelId}`)
        .setLabel("Cerrar sala")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️")
    );
  }

  return [row];
}

/* =========================================================
   RESPUESTAS
========================================================= */

async function safeReply(interaction, payload) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload);
  }
  return interaction.reply(payload);
}

async function openPlayerPanel(interaction, game) {
  await safeReply(interaction, {
    embeds: [playerPanelEmbed(game, interaction.user)],
    components: panelComponents(game, interaction.user.id),
    ephemeral: true
  });
}

async function sendOrUpdateGameMessage(channel, game) {
  const embed = game.started ? gameEmbed(game) : lobbyEmbed(game);
  const components = game.started ? gameComponents(game) : lobbyComponents(game);

  try {
    if (game.messageId) {
      const oldMsg = await channel.messages.fetch(game.messageId).catch(() => null);
      if (oldMsg) await oldMsg.delete().catch(() => null);
    }

    const newMsg = await channel.send({
      embeds: [embed],
      components
    });

    game.messageId = newMsg.id;
  } catch (err) {
    console.error("Error enviando mensaje de partida:", err);
  }
}

/* =========================================================
   TURNOS Y ANTI-FREEZE
========================================================= */

function scheduleBotTurn(channel, game) {
  clearBotTurnTimers(game.id);

  const playTimer = setTimeout(async () => {
    try {
      if (game.finished) return;
      const current = getCurrentPlayer(game);
      if (!current?.isBot) return;
      await botPlay(channel, game);
    } catch (err) {
      console.error("Error en botPlay:", err);
    }
  }, BOT_PLAY_DELAY_MS);

  const failSafeTimer = setTimeout(async () => {
    try {
      if (game.finished) return;
      const current = getCurrentPlayer(game);
      if (!current?.isBot) return;

      const card = chooseBotCard(game);

      if (card) {
        const hand = game.hands["UNO_BOT"];
        const idx = hand.findIndex((c) => c.id === card.id);

        if (idx !== -1) {
          const playedCard = hand.splice(idx, 1)[0];
          const selectedColor =
            playedCard.type === "wild" || playedCard.type === "wild4"
              ? bestBotColor(game)
              : null;

          if (hand.length === 1) {
            game.unoCalled["UNO_BOT"] = true;
            game.saidUnoThisGame["UNO_BOT"] = true;
          }

          game.lastAction = `UNO Bot jugó ${playedCard.label} · recuperación automática`;
          await applyPlayedCard(channel, game, current, playedCard, selectedColor);
          return;
        }
      }

      drawCards(game, "UNO_BOT", 1);
      const drawn = game.hands["UNO_BOT"][game.hands["UNO_BOT"].length - 1];

      if (drawn && canPlay(drawn, game)) {
        const hand = game.hands["UNO_BOT"];
        const idx = hand.findIndex((c) => c.id === drawn.id);

        if (idx !== -1) {
          const playedCard = hand.splice(idx, 1)[0];
          const selectedColor =
            playedCard.type === "wild" || playedCard.type === "wild4"
              ? bestBotColor(game)
              : null;

          game.lastAction = `UNO Bot robó y jugó ${playedCard.label} · recuperación automática`;
          await applyPlayedCard(channel, game, current, playedCard, selectedColor);
          return;
        }
      }

      game.lastAction = "UNO Bot robó y pasó · recuperación automática";
      await advanceTurn(channel, game, 1);
    } catch (err) {
      console.error("Error anti-freeze:", err);
    }
  }, BOT_FAILSAFE_MS);

  botTurnTimers.set(game.id, { playTimer, failSafeTimer });
}

async function advanceTurn(channel, game, skipAmount = 1) {
  clearBotTurnTimers(game.id);

  game.currentPlayerIndex = nextPlayerIndex(game, skipAmount);
  game.turnNumber += 1;

  const current = getCurrentPlayer(game);
  await sendOrUpdateGameMessage(channel, game);

  if (current?.isBot && !game.finished) {
    scheduleBotTurn(channel, game);
  }
}

async function sendAchievementUnlocks(channel, unlocked) {
  for (const achievement of unlocked) {
    if (!achievement) continue;
    await channel.send({ embeds: [achievementUnlockEmbed(achievement)] }).catch(() => null);
  }
}

async function sendMissionRewards(channel, rewards) {
  if (!rewards.length) return;
  const embeds = missionsCompletedEmbeds(rewards);
  for (const embed of embeds) {
    await channel.send({ embeds: [embed] }).catch(() => null);
  }
}

async function finishGame(channel, game, winner) {
  game.finished = true;
  game.started = false;
  clearBotTurnTimers(game.id);

  const stats = loadStats();
  const humans = humanPlayers(game);

  for (const p of humans) {
    if (!stats[p.id]) stats[p.id] = createDefaultPlayer(p.username);
    stats[p.id] = normalizePlayer({
      ...stats[p.id],
      username: p.username
    });

    stats[p.id].gamesPlayed += 1;

    const match = game.matchStats[p.id] || createMatchStatEntry();
    stats[p.id].cardsPlayed += match.cardsPlayed;
    stats[p.id].unoCalls += match.unoCalls;
    stats[p.id].unoFails += match.unoFails;
    stats[p.id].highestHandRecovered = Math.max(
      stats[p.id].highestHandRecovered || 7,
      match.maxHand || 7
    );
  }

  let unlockedEmbeds = [];
  let missionRewards = [];

  for (const p of humans) {
    const playerStats = stats[p.id];
    const won = winner.id === p.id;
    const match = game.matchStats[p.id] || createMatchStatEntry();

    // jugar partida
    for (const mission of playerStats.dailyMissions.missions) {
      if (mission.id === "play_games" && !mission.claimed) {
        mission.progress = Math.min(mission.target, mission.progress + 1);
        if (mission.progress >= mission.target) {
          mission.completed = true;
          mission.claimed = true;
          addRewards(playerStats, mission.rewardXp, mission.rewardCoins);
          missionRewards.push({ ...mission });
        }
      }
    }

    if (won) {
      playerStats.wins += 1;
      playerStats.winStreak += 1;
      playerStats.bestWinStreak = Math.max(playerStats.bestWinStreak || 0, playerStats.winStreak);

      if (game.turnNumber <= 12) playerStats.fastWins += 1;

      if (game.vsBot) {
        playerStats.vsBotWins += 1;
      } else {
        playerStats.pvpWins += 1;
      }

      let baseXp;
      let baseCoins;

      if (game.vsBot) {
        baseXp = BOT_DIFFICULTIES[game.botDifficulty].rewardXpWin;
        baseCoins = BOT_DIFFICULTIES[game.botDifficulty].rewardCoinsWin;
        playerStats.elo += 12;
      } else {
        baseXp = 35;
        baseCoins = 25;
        playerStats.elo += game.players.length === 2 ? 16 : 15;
      }

      const boosted = applyBoostsToRewards(playerStats, baseXp, baseCoins);
      addRewards(playerStats, boosted.xp, boosted.coins);
      consumeBoostUses(playerStats);

      for (const mission of playerStats.dailyMissions.missions) {
        if (mission.claimed) continue;

        if (mission.id === "win_games") {
          mission.progress = Math.min(mission.target, mission.progress + 1);
        }

        if (mission.id === "win_vs_bot" && game.vsBot) {
          mission.progress = Math.min(mission.target, mission.progress + 1);
        }

        if (mission.progress >= mission.target) {
          mission.completed = true;
          mission.claimed = true;
          addRewards(playerStats, mission.rewardXp, mission.rewardCoins);
          missionRewards.push({ ...mission });
        }
      }

      const unlocked = evaluateAchievements(stats, p.id, {
        quickWin: game.turnNumber <= 12,
        usedUnoAndWon: game.saidUnoThisGame[p.id] === true,
        wonWithWild4: game.lastPlayedCardType === "wild4",
        maxHandRecovered: match.maxHand || 7
      });

      unlockedEmbeds.push(...unlocked);
    } else {
      playerStats.losses += 1;
      playerStats.winStreak = 0;

      let baseXp;
      let baseCoins;

      if (game.vsBot) {
        baseXp = BOT_DIFFICULTIES[game.botDifficulty].rewardXpLose;
        baseCoins = BOT_DIFFICULTIES[game.botDifficulty].rewardCoinsLose;
        playerStats.elo = Math.max(800, playerStats.elo - 5);
      } else {
        baseXp = 15;
        baseCoins = 10;
        playerStats.elo = Math.max(800, playerStats.elo - 6);
      }

      const boosted = applyBoostsToRewards(playerStats, baseXp, baseCoins);
      addRewards(playerStats, boosted.xp, boosted.coins);
      consumeBoostUses(playerStats);

      evaluateAchievements(stats, p.id, {});
    }
  }

  saveStats(stats);

  addMatchToHistory({
    winner: winner.username,
    players: game.players.map((p) => p.username),
    mode: game.vsBot ? "Vs Bot" : game.players.length === 2 ? "PvP" : "Multijugador",
    difficulty: game.vsBot ? BOT_DIFFICULTIES[game.botDifficulty].name : null,
    turns: game.turnNumber,
    createdAt: new Date().toISOString()
  });

  const rewardText = humans
    .map((p) => {
      const st = stats[p.id];
      const lvl = computeLevelFromXp(st.xp);
      return `**${p.username}** — 🪙 ${st.coins} · 🆙 ${lvl.level} · ⚡ ${st.elo}`;
    })
    .join("\n");

  const endEmbed = new EmbedBuilder()
    .setColor(EMBED.success)
    .setTitle("🏆 Fin de partida")
    .setDescription(`**${winner.username}** ganó la partida`)
    .addFields(
      {
        name: "Resumen",
        value: `Modo: ${game.vsBot ? "Vs Bot" : "PvP"}${
          game.vsBot ? `\nDificultad: ${BOT_DIFFICULTIES[game.botDifficulty].name}` : ""
        }\nTurnos: ${game.turnNumber}`
      },
      {
        name: "Estado de jugadores",
        value: rewardText || "Sin datos"
      }
    );

  await channel.send({ embeds: [endEmbed] });
  await sendAchievementUnlocks(channel, unlockedEmbeds);
  await sendMissionRewards(channel, missionRewards);

  removeGameReferences(game);

  const offer = createRematchOfferFromGame(game);
  setRematchOffer(offer);

  await channel.send({
    embeds: [rematchEmbed(offer)],
    components: rematchComponents(channel.id, game.tempChannel)
  });

  if (game.tempChannel) {
    await channel
      .send(`🗑️ La sala temporal se eliminará en ${REMATCH_ROOM_TIMEOUT_MS / 1000} segundos si nadie pide revancha.`)
      .catch(() => null);

    scheduleTempRoomDeletion(channel, REMATCH_ROOM_TIMEOUT_MS, "Sala UNO inactiva tras fin de partida");
  }
}

async function applyPlayedCard(channel, game, player, card, selectedColor = null) {
  clearBotTurnTimers(game.id);

  game.discard.push(card);
  game.lastPlayedCardType = card.type;

  if (game.matchStats[player.id]) {
    game.matchStats[player.id].cardsPlayed += 1;
  }

  if (card.type === "wild" || card.type === "wild4") {
    game.currentColor = selectedColor || "red";
  } else {
    game.currentColor = card.color;
  }

  let skipAmount = 1;

  if (card.type === "skip") {
    skipAmount = 2;
    game.lastAction = `${player.username} jugó ${card.label} · turno saltado`;
  } else if (card.type === "reverse") {
    if (game.players.length === 2) {
      skipAmount = 2;
      game.lastAction = `${player.username} jugó ${card.label} · salto`;
    } else {
      game.direction *= -1;
      game.lastAction = `${player.username} jugó ${card.label} · cambió sentido`;
    }
  } else if (card.type === "draw2") {
    const next = getNextPlayer(game);
    drawCards(game, next.id, 2);
    skipAmount = 2;
    game.lastAction = `${player.username} jugó ${card.label} · ${next.username} roba 2`;
  } else if (card.type === "wild4") {
    const next = getNextPlayer(game);
    drawCards(game, next.id, 4);
    skipAmount = 2;
    game.lastAction = `${player.username} jugó ${card.label} · ${next.username} roba 4`;
  } else {
    game.lastAction = `${player.username} jugó ${card.label}`;
  }

  if (game.hands[player.id].length === 1) {
    if (game.unoCalled[player.id]) {
      game.lastAction += " · dijo UNO";
      game.saidUnoThisGame[player.id] = true;
    } else {
      drawCards(game, player.id, 2);
      game.lastAction += " · olvidó UNO y robó 2";

      if (game.matchStats[player.id]) {
        game.matchStats[player.id].unoFails += 1;
      }
    }
  }

  game.unoCalled[player.id] = false;

  if (game.hands[player.id].length === 0) {
    await finishGame(channel, game, player);
    return;
  }

  await advanceTurn(channel, game, skipAmount);
}

/* =========================================================
   IA BOT
========================================================= */

function countColorsInHand(hand) {
  const count = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const c of hand) {
    if (count[c.color] !== undefined) count[c.color]++;
  }
  return count;
}

function bestBotColor(game) {
  const hand = game.hands["UNO_BOT"] || [];
  const count = countColorsInHand(hand);
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || "red";
}

function chooseBotCardEasy(game) {
  const hand = sortHand(game.hands["UNO_BOT"] || []);
  const playable = hand.filter((card) => canPlay(card, game));
  if (!playable.length) return null;

  const numbers = playable.filter((c) => c.type === "number");
  if (numbers.length) return numbers[Math.floor(Math.random() * numbers.length)];

  return playable[Math.floor(Math.random() * playable.length)];
}

function chooseBotCardNormal(game) {
  const hand = sortHand(game.hands["UNO_BOT"] || []);
  const playable = hand.filter((card) => canPlay(card, game));
  if (!playable.length) return null;

  const priority = {
    wild4: 6,
    draw2: 5,
    skip: 4,
    reverse: 3,
    wild: 2,
    number: 1
  };

  playable.sort((a, b) => (priority[b.type] || 0) - (priority[a.type] || 0));
  return playable[0];
}

function chooseBotCardHard(game) {
  const hand = sortHand(game.hands["UNO_BOT"] || []);
  const playable = hand.filter((card) => canPlay(card, game));
  if (!playable.length) return null;

  const next = getNextPlayer(game);
  const nextCards = game.hands[next.id]?.length || 99;

  if (hand.length <= 2) return playable[0];

  if (nextCards <= 2) {
    const attacks = playable.filter((c) => ["draw2", "wild4", "skip"].includes(c.type));
    if (attacks.length) return attacks[0];
  }

  const nonWild = playable.filter((c) => c.type !== "wild" && c.type !== "wild4");
  if (nonWild.length) {
    const colors = countColorsInHand(hand);
    nonWild.sort((a, b) => (colors[b.color] || 0) - (colors[a.color] || 0));
    return nonWild[0];
  }

  return playable[0];
}

function chooseBotCardInsane(game) {
  const hand = sortHand(game.hands["UNO_BOT"] || []);
  const playable = hand.filter((card) => canPlay(card, game));
  if (!playable.length) return null;

  const next = getNextPlayer(game);
  const nextCards = game.hands[next.id]?.length || 99;

  if (hand.length <= 2) {
    const finisher = playable.find((c) =>
      ["number", "skip", "draw2", "wild4", "wild"].includes(c.type)
    );
    if (finisher) return finisher;
  }

  if (nextCards <= 2) {
    const punish = playable.find((c) => ["wild4", "draw2", "skip"].includes(c.type));
    if (punish) return punish;
  }

  const topColor = getCurrentColor(game);
  const sameColor = playable.filter((c) => c.color === topColor && !["wild", "wild4"].includes(c.type));
  if (sameColor.length) {
    sameColor.sort((a, b) => cardSortValue(b) - cardSortValue(a));
    return sameColor[0];
  }

  const useful = playable.filter((c) => !["wild", "wild4"].includes(c.type));
  if (useful.length) {
    useful.sort((a, b) => cardSortValue(b) - cardSortValue(a));
    return useful[0];
  }

  return playable[0];
}

function chooseBotCard(game) {
  const diff = game.botDifficulty || "easy";
  if (diff === "easy") return chooseBotCardEasy(game);
  if (diff === "normal") return chooseBotCardNormal(game);
  if (diff === "hard") return chooseBotCardHard(game);
  return chooseBotCardInsane(game);
}

async function botPlay(channel, game) {
  if (game.finished) return;

  const current = getCurrentPlayer(game);
  if (!current || !current.isBot) return;

  const card = chooseBotCard(game);

  if (!card) {
    drawCards(game, "UNO_BOT", 1);
    const drawn = game.hands["UNO_BOT"][game.hands["UNO_BOT"].length - 1];

    if (drawn && canPlay(drawn, game)) {
      const hand = game.hands["UNO_BOT"];
      const idx = hand.findIndex((c) => c.id === drawn.id);
      if (idx === -1) return;

      const playedCard = hand.splice(idx, 1)[0];
      const color =
        playedCard.type === "wild" || playedCard.type === "wild4"
          ? bestBotColor(game)
          : null;

      game.lastAction = `UNO Bot robó y jugó ${playedCard.label}`;
      await applyPlayedCard(channel, game, current, playedCard, color);
      return;
    }

    game.lastAction = "UNO Bot robó y pasó";
    await advanceTurn(channel, game, 1);
    return;
  }

  const hand = game.hands["UNO_BOT"];
  const idx = hand.findIndex((c) => c.id === card.id);
  if (idx === -1) return;

  const playedCard = hand.splice(idx, 1)[0];
  const selectedColor =
    playedCard.type === "wild" || playedCard.type === "wild4"
      ? bestBotColor(game)
      : null;

  if (hand.length === 1) {
    game.unoCalled["UNO_BOT"] = true;
    game.saidUnoThisGame["UNO_BOT"] = true;
  }

  await applyPlayedCard(channel, game, current, playedCard, selectedColor);
}

/* =========================================================
   INTERACTIONS
========================================================= */

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const currentGame = getGameByChannelId(interaction.channel.id);

      if (interaction.commandName === "uno") {
        await interaction.reply({
          embeds: [menuEmbed(interaction.user)],
          components: menuComponents()
        });
        return;
      }

      if (interaction.commandName === "reglas") {
        await interaction.reply({ embeds: [rulesEmbed()] });
        return;
      }

      if (interaction.commandName === "ayuda") {
        await interaction.reply({ embeds: [helpEmbed()] });
        return;
      }

      if (interaction.commandName === "top") {
        await interaction.reply({ embeds: [topEmbed()] });
        return;
      }

      if (interaction.commandName === "tienda") {
        await interaction.reply({
          embeds: [shopMainEmbed(interaction.user)],
          components: shopMainComponents(),
          ephemeral: true
        });
        return;
      }

      if (interaction.commandName === "perfil") {
        const target = interaction.options.getUser("usuario") || interaction.user;
        await interaction.reply({ embeds: [profileEmbed(target)] });
        return;
      }

      if (interaction.commandName === "historial") {
        await interaction.reply({ embeds: [historyEmbed()] });
        return;
      }

      if (interaction.commandName === "logros") {
        await interaction.reply({
          embeds: [achievementsEmbed(interaction.user, 0)],
          components: achievementsComponents(interaction.user.id, 0)
        });
        return;
      }

      if (interaction.commandName === "misiones") {
        await interaction.reply({ embeds: [missionsEmbed(interaction.user)] });
        return;
      }

      if (currentGame && currentGame.started && interaction.commandName === "uno-panel") {
        await openPlayerPanel(interaction, currentGame);
        return;
      }
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const customId = interaction.customId;

    /* =========================
       PAGINAS LOGROS
    ========================= */

    if (customId.startsWith("uno_ach_prev_") || customId.startsWith("uno_ach_next_")) {
      const parts = customId.split("_");
      const direction = parts[2];
      const targetUserId = parts[3];
      const currentPage = Number(parts[4] || 0);

      let newPage = currentPage;
      if (direction === "prev") newPage -= 1;
      if (direction === "next") newPage += 1;

      const totalPages = Math.max(1, Math.ceil(ACHIEVEMENTS.length / ACHIEVEMENTS_PER_PAGE));
      newPage = Math.max(0, Math.min(newPage, totalPages - 1));

      const targetUser =
        interaction.client.users.cache.get(targetUserId) || interaction.user;

      await interaction.update({
        embeds: [achievementsEmbed(targetUser, newPage)],
        components: achievementsComponents(targetUserId, newPage)
      });
      return;
    }

    /* =========================
       TIENDA
    ========================= */

    if (customId === "uno_menu_shop") {
      await interaction.reply({
        embeds: [shopMainEmbed(interaction.user)],
        components: shopMainComponents(),
        ephemeral: true
      });
      return;
    }

    if (
      customId === "uno_shop_boxes" ||
      customId === "uno_shop_titles" ||
      customId === "uno_shop_badges" ||
      customId === "uno_shop_boosts"
    ) {
      const categoryId = customId.replace("uno_shop_", "");
      await interaction.update({
        embeds: [shopCategoryEmbed(interaction.user, categoryId)],
        components: shopCategoryComponents(categoryId)
      });
      return;
    }

    if (customId === "uno_shop_back") {
      await interaction.update({
        embeds: [shopMainEmbed(interaction.user)],
        components: shopMainComponents()
      });
      return;
    }

    if (customId.startsWith("uno_buy_")) {
      const itemId = customId.replace("uno_buy_", "");
      const result = buyStoreItem(interaction.user.id, interaction.user.username, itemId);

      if (!result.ok) {
        await interaction.reply({
          content: `⚠️ ${result.reason}`,
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        embeds: [shopPurchaseEmbed(result)],
        ephemeral: true
      });
      return;
    }

    /* =========================
       MENU PRINCIPAL
    ========================= */

    if (customId === "uno_menu_find") {
      const existing = getGameByChannelId(interaction.channel.id);

      if (playerGames.has(interaction.user.id)) {
        await interaction.reply({
          content: "⚠️ Ya estás en una partida o lobby.",
          ephemeral: true
        });
        return;
      }

      if (!existing) {
        const game = createBaseGame(interaction.channel, interaction.user, false);
        setGameReferences(game);

        await interaction.reply({
          content: "🎮 Se creó un lobby.",
          ephemeral: true
        });

        await sendOrUpdateGameMessage(interaction.channel, game);
        return;
      }

      const join = tryJoinLobby(existing, interaction.user);

      if (!join.ok) {
        await interaction.reply({
          content: `⚠️ ${join.reason}`,
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: "✅ Te uniste al lobby.",
        ephemeral: true
      });

      await sendOrUpdateGameMessage(interaction.channel, existing);
      return;
    }

    if (customId === "uno_menu_bot") {
      await interaction.reply({
        embeds: [difficultySelectEmbed(interaction.user)],
        components: difficultyComponents(interaction.user),
        ephemeral: true
      });
      return;
    }

    if (customId === "uno_menu_hand") {
      const game = getGameByChannelId(interaction.channel.id);

      if (!game || !game.started) {
        await interaction.reply({
          content: "⚠️ No hay una partida en curso en este canal.",
          ephemeral: true
        });
        return;
      }

      if (!game.players.find((p) => p.id === interaction.user.id)) {
        await interaction.reply({
          content: "⚠️ No estás en esta partida.",
          ephemeral: true
        });
        return;
      }

      await openPlayerPanel(interaction, game);
      return;
    }

    if (customId === "uno_menu_top") {
      await interaction.reply({ embeds: [topEmbed()] });
      return;
    }

    if (customId === "uno_menu_help") {
      await interaction.reply({ embeds: [helpEmbed()], ephemeral: true });
      return;
    }

    if (customId === "uno_menu_achievements") {
      await interaction.reply({
        embeds: [achievementsEmbed(interaction.user, 0)],
        components: achievementsComponents(interaction.user.id, 0)
      });
      return;
    }

    if (customId === "uno_menu_missions") {
      await interaction.reply({ embeds: [missionsEmbed(interaction.user)] });
      return;
    }

    /* =========================
       DIFICULTAD BOT
    ========================= */

    if (customId.startsWith("uno_botdiff_")) {
      const diffId = customId.replace("uno_botdiff_", "");
      const stats = getPlayerStats(interaction.user.id, interaction.user.username);
      const unlocked = getUnlockedDifficulties(stats);

      if (!unlocked.includes(diffId)) {
        await interaction.reply({
          content: `⚠️ No tenés desbloqueada la dificultad ${BOT_DIFFICULTIES[diffId]?.name || diffId}.`,
          ephemeral: true
        });
        return;
      }

      if (!interaction.guild) {
        await interaction.reply({
          content: "⚠️ Esto solo funciona dentro de un servidor.",
          ephemeral: true
        });
        return;
      }

      if (playerGames.has(interaction.user.id)) {
        await interaction.reply({
          content: "⚠️ Ya estás en una partida o lobby.",
          ephemeral: true
        });
        return;
      }

      const tempChannel = await createTempUnoChannel(interaction.guild, interaction.user);
      const game = createBaseGame(tempChannel, interaction.user, true, diffId);

      setGameReferences(game);
      startGame(game);

      await interaction.reply({
        content: `🤖 Te creé una sala privada para jugar en **${BOT_DIFFICULTIES[diffId].name}**: ${tempChannel}`,
        ephemeral: true
      });

      await tempChannel.send(`🎮 ${interaction.user}, tu partida de UNO vs Bot empezó acá.`);
      await sendOrUpdateGameMessage(tempChannel, game);

      if (getCurrentPlayer(game)?.isBot) {
        scheduleBotTurn(tempChannel, game);
      }

      return;
    }

    /* =========================
       REMATCH
    ========================= */

    if (customId.startsWith("uno_rematch_")) {
      const channelId = customId.replace("uno_rematch_", "");
      const offer = rematchOffers.get(channelId);

      if (!offer) {
        await interaction.reply({
          content: "⚠️ La revancha ya no está disponible.",
          ephemeral: true
        });
        return;
      }

      const allowed = offer.players.find((p) => p.id === interaction.user.id);
      if (!allowed) {
        await interaction.reply({
          content: "⚠️ No formaste parte de esa partida.",
          ephemeral: true
        });
        return;
      }

      if (!offer.accepted.includes(interaction.user.id)) {
        offer.accepted.push(interaction.user.id);
      }

      if (offer.vsBot) {
        await interaction.reply({
          content: "🔁 Revancha aceptada. Arrancando otra partida...",
          ephemeral: true
        });

        await startRematchFromOffer(interaction.channel, offer);
        return;
      }

      await interaction.reply({
        content: `✅ Revancha aceptada (${rematchAcceptedCount(offer)}/${offer.players.length}).`,
        ephemeral: true
      });

      await interaction.channel.send({
        embeds: [rematchEmbed(offer)],
        components: rematchComponents(interaction.channel.id, offer.tempChannel)
      });

      if (rematchAllAccepted(offer)) {
        await startRematchFromOffer(interaction.channel, offer);
      }

      return;
    }

    if (customId.startsWith("uno_closeroom_")) {
      const channelId = customId.replace("uno_closeroom_", "");
      const offer = rematchOffers.get(channelId);

      if (offer && offer.ownerId !== interaction.user.id) {
        await interaction.reply({
          content: "⚠️ Solo el creador puede cerrar la sala.",
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: "🗑️ Cerrando sala...",
        ephemeral: true
      });

      clearRematchOffer(channelId);
      clearRoomDeleteTimer(channelId);

      setTimeout(async () => {
        try {
          await interaction.channel.delete("Cierre manual de sala post-partida");
        } catch (err) {
          console.error("Error borrando sala post-partida:", err);
        }
      }, 2000);

      return;
    }

    /* =========================
       COLOR WILD
    ========================= */

    if (customId.startsWith("uno_color_")) {
      const parts = customId.split("_");
      const gameId = `${parts[2]}_${parts[3]}`;
      const cardId = parts[4];
      const selectedColor = parts[5];

      const game = getGameById(gameId);

      if (!game) {
        await interaction.reply({ content: "⚠️ La partida ya no existe.", ephemeral: true });
        return;
      }

      const player = game.players.find((p) => p.id === interaction.user.id);
      if (!player) {
        await interaction.reply({ content: "⚠️ No pertenecés a esta partida.", ephemeral: true });
        return;
      }

      if (getCurrentPlayer(game).id !== player.id) {
        await interaction.reply({ content: "⚠️ No es tu turno.", ephemeral: true });
        return;
      }

      const hand = game.hands[player.id];
      const idx = hand.findIndex((c) => c.id === cardId);

      if (idx === -1) {
        await interaction.reply({ content: "⚠️ Esa carta ya no está en tu mano.", ephemeral: true });
        return;
      }

      const card = hand[idx];
      hand.splice(idx, 1);

      await interaction.reply({
        content: `✅ Jugaste ${card.label} y elegiste ${getColorName(selectedColor)}.`,
        ephemeral: true
      });

      await applyPlayedCard(interaction.channel, game, player, card, selectedColor);

      if (!game.finished) {
        await interaction.followUp({
          embeds: [playerPanelEmbed(game, interaction.user)],
          components: panelComponents(game, interaction.user.id),
          ephemeral: true
        }).catch(() => null);
      }

      return;
    }

    /* =========================
       ACCIONES GENERALES
    ========================= */

    if (customId.startsWith("uno_topgame_")) {
      await interaction.reply({ embeds: [topEmbed()] });
      return;
    }

    const parts = customId.split("_");
    const action = parts[1];
    const gameId = parts.slice(2).join("_");
    const game = getGameById(gameId);

    if (!game) {
      await interaction.reply({
        content: "⚠️ Esta partida o lobby ya no existe.",
        ephemeral: true
      });
      return;
    }

    if (action === "join") {
      const join = tryJoinLobby(game, interaction.user);
      if (!join.ok) {
        await interaction.reply({ content: `⚠️ ${join.reason}`, ephemeral: true });
        return;
      }

      await interaction.reply({ content: "✅ Te uniste al lobby.", ephemeral: true });
      await sendOrUpdateGameMessage(interaction.channel, game);
      return;
    }

    if (action === "leave") {
      if (game.started) {
        await interaction.reply({ content: "⚠️ La partida ya empezó.", ephemeral: true });
        return;
      }

      const idx = game.players.findIndex((p) => p.id === interaction.user.id);
      if (idx === -1) {
        await interaction.reply({ content: "⚠️ No estás en el lobby.", ephemeral: true });
        return;
      }

      game.players.splice(idx, 1);
      delete game.hands[interaction.user.id];
      delete game.unoCalled[interaction.user.id];
      delete game.saidUnoThisGame[interaction.user.id];
      delete game.matchStats[interaction.user.id];
      playerGames.delete(interaction.user.id);

      if (!game.players.length) {
        removeGameReferences(game);
        await interaction.reply({ content: "🗑️ El lobby fue eliminado.", ephemeral: true });
        return;
      }

      if (game.ownerId === interaction.user.id) {
        game.ownerId = game.players[0].id;
      }

      refreshPlayerReferences(game);

      await interaction.reply({ content: "✅ Saliste del lobby.", ephemeral: true });
      await sendOrUpdateGameMessage(interaction.channel, game);
      return;
    }

    if (action === "start") {
      if (game.started) {
        await interaction.reply({ content: "⚠️ La partida ya comenzó.", ephemeral: true });
        return;
      }

      if (game.ownerId !== interaction.user.id) {
        await interaction.reply({
          content: "⚠️ Solo el creador puede empezar.",
          ephemeral: true
        });
        return;
      }

      if (game.players.length < 2) {
        await interaction.reply({
          content: "⚠️ Necesitás al menos 2 jugadores.",
          ephemeral: true
        });
        return;
      }

      startGame(game);
      refreshPlayerReferences(game);

      await interaction.reply({ content: "🚀 La partida comenzó.", ephemeral: true });
      await sendOrUpdateGameMessage(interaction.channel, game);

      if (getCurrentPlayer(game)?.isBot) {
        scheduleBotTurn(interaction.channel, game);
      }

      return;
    }

    if (action === "refresh") {
      await sendOrUpdateGameMessage(interaction.channel, game);
      await interaction.reply({ content: "✅ Mesa actualizada.", ephemeral: true });
      return;
    }

    if (action === "open") {
      const player = game.players.find((p) => p.id === interaction.user.id);
      if (!player) {
        await interaction.reply({ content: "⚠️ No estás en esta partida.", ephemeral: true });
        return;
      }

      await openPlayerPanel(interaction, game);
      return;
    }

    if (action === "panelrefresh") {
      const player = game.players.find((p) => p.id === interaction.user.id);
      if (!player) {
        await interaction.reply({ content: "⚠️ No estás en esta partida.", ephemeral: true });
        return;
      }

      await interaction.reply({
        embeds: [playerPanelEmbed(game, interaction.user)],
        components: panelComponents(game, interaction.user.id),
        ephemeral: true
      });
      return;
    }

    if (action === "close") {
      const player = game.players.find((p) => p.id === interaction.user.id);

      if (!player) {
        await interaction.reply({
          content: "⚠️ No pertenecés a esta partida.",
          ephemeral: true
        });
        return;
      }

      if (game.ownerId !== interaction.user.id) {
        await interaction.reply({
          content: "⚠️ Solo el creador puede cerrar la sala.",
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: "🗑️ Cerrando sala...",
        ephemeral: true
      });

      removeGameReferences(game);
      clearRematchOffer(interaction.channel.id);
      clearRoomDeleteTimer(interaction.channel.id);

      try {
        await interaction.channel.send("🗑️ Sala cerrada manualmente.");
      } catch {}

      if (game.tempChannel) {
        setTimeout(async () => {
          try {
            await interaction.channel.delete("Cierre manual de partida UNO");
          } catch (err) {
            console.error("Error borrando canal:", err);
          }
        }, 3000);
      }

      return;
    }

    const player = game.players.find((p) => p.id === interaction.user.id);
    if (!player) {
      await interaction.reply({ content: "⚠️ Ese panel no es tuyo.", ephemeral: true });
      return;
    }

    const current = getCurrentPlayer(game);

    if (action === "uno") {
      if (game.hands[player.id].length <= 2) {
        game.unoCalled[player.id] = true;
        game.saidUnoThisGame[player.id] = true;

        if (game.matchStats[player.id]) {
          game.matchStats[player.id].unoCalls += 1;
        }

        await interaction.reply({ content: "📢 Dijiste UNO.", ephemeral: true });

        const rewards = updateMissionProgress(
          interaction.user.id,
          interaction.user.username,
          "say_uno",
          1
        );
        await sendMissionRewards(interaction.channel, rewards);
      } else {
        await interaction.reply({
          content: "⚠️ Usá UNO cuando te quedan 2 o menos cartas.",
          ephemeral: true
        });
      }
      return;
    }

    if (action === "draw") {
      if (current.id !== player.id) {
        await interaction.reply({ content: "⚠️ No es tu turno.", ephemeral: true });
        return;
      }

      drawCards(game, player.id, 1);
      const drawn = game.hands[player.id][game.hands[player.id].length - 1];

      if (drawn && canPlay(drawn, game)) {
        game.lastAction = `${player.username} robó una carta`;
        await sendOrUpdateGameMessage(interaction.channel, game);

        await interaction.reply({
          embeds: [playerPanelEmbed(game, interaction.user)],
          components: panelComponents(game, interaction.user.id),
          ephemeral: true
        });
      } else {
        game.lastAction = `${player.username} robó y pasó`;
        await interaction.reply({
          content: `➕ Robaste ${drawn ? drawn.label : "una carta"} y pasaste turno.`,
          ephemeral: true
        });
        await advanceTurn(interaction.channel, game, 1);
      }
      return;
    }

    if (interaction.isStringSelectMenu() && action === "play") {
      if (current.id !== player.id) {
        await interaction.reply({ content: "⚠️ No es tu turno.", ephemeral: true });
        return;
      }

      const cardId = interaction.values[0];
      if (cardId === "none") {
        await interaction.reply({ content: "⚠️ No hay carta seleccionable.", ephemeral: true });
        return;
      }

      const hand = game.hands[player.id];
      const idx = hand.findIndex((c) => c.id === cardId);

      if (idx === -1) {
        await interaction.reply({ content: "⚠️ Esa carta ya no está en tu mano.", ephemeral: true });
        return;
      }

      const card = hand[idx];
      if (!canPlay(card, game)) {
        await interaction.reply({
          content: `⚠️ No podés jugar ${card.label} ahora.`,
          ephemeral: true
        });
        return;
      }

      if (card.type === "wild" || card.type === "wild4") {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(EMBED.purple)
              .setTitle("🎨 Elegí un color")
              .setDescription(`Seleccionaste ${card.label}`)
          ],
          components: wildColorComponents(game, card),
          ephemeral: true
        });
        return;
      }

      hand.splice(idx, 1);

      await interaction.reply({
        content: `✅ Jugaste ${card.label}.`,
        ephemeral: true
      });

      await applyPlayedCard(interaction.channel, game, player, card, null);

      if (!game.finished) {
        await interaction.followUp({
          embeds: [playerPanelEmbed(game, interaction.user)],
          components: panelComponents(game, interaction.user.id),
          ephemeral: true
        }).catch(() => null);
      }

      return;
    }
  } catch (err) {
    console.error("Error en interacción:", err);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "❌ Ocurrió un error.",
        ephemeral: true
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: "❌ Ocurrió un error.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

/* =========================================================
   READY
========================================================= */

client.once(Events.ClientReady, async (c) => {
  ensureDataFiles();
  console.log(`✅ Bot conectado como ${c.user.tag}`);
  await registerSlashCommands();
});

client.login(process.env.DISCORD_TOKEN);
