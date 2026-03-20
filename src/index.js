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

const games = new Map(); // gameId -> game
const channelGames = new Map(); // channelId -> gameId
const playerGames = new Map(); // userId -> gameId

let CARD_SEQ = 1;

const TEMP_CATEGORY_NAME = "UNO TEMP";
const TEMP_DELETE_DELAY_MS = 15000;

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
    id: "pvp_fighter",
    name: "Competitivo",
    description: "Ganale 5 partidas a otros jugadores.",
    chance: "Media · 45%"
  },
  {
    id: "quick_win",
    name: "Victoria rápida",
    description: "Ganate una partida en 12 turnos o menos.",
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
  }
];

/* =========================================================
   REGISTRO SLASH COMMANDS
========================================================= */

const slashCommands = [
  new SlashCommandBuilder().setName("uno").setDescription("Abrir el menú principal de UNO"),
  new SlashCommandBuilder().setName("reglas").setDescription("Mostrar reglas simples de UNO"),
  new SlashCommandBuilder().setName("top").setDescription("Ver ranking de jugadores"),
  new SlashCommandBuilder().setName("perfil").setDescription("Ver tu perfil de UNO"),
  new SlashCommandBuilder().setName("historial").setDescription("Ver últimas partidas"),
  new SlashCommandBuilder().setName("logros").setDescription("Ver tus logros y los que te faltan")
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
  saveHistory(history.slice(0, 30));
}

/* =========================================================
   STATS Y LOGROS
========================================================= */

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
    achievements: []
  };
}

function getPlayerStats(userId, username = "Jugador") {
  const stats = loadStats();

  if (!stats[userId]) {
    stats[userId] = createDefaultPlayer(username);
    saveStats(stats);
    return stats[userId];
  }

  const defaults = createDefaultPlayer(username);

  stats[userId] = {
    ...defaults,
    ...stats[userId],
    username
  };

  saveStats(stats);
  return stats[userId];
}

function topPlayers(limit = 10) {
  const stats = loadStats();

  return Object.entries(stats)
    .map(([userId, data]) => {
      const safe = {
        ...createDefaultPlayer(data?.username || "Jugador"),
        ...data
      };

      return { userId, ...safe };
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

function evaluateAchievements(stats, userId, context = {}) {
  const player = stats[userId];
  if (!player) return [];

  const unlockedNow = [];

  const tryUnlock = (id, condition) => {
    if (condition && unlockAchievement(stats, userId, id)) {
      unlockedNow.push(ACHIEVEMENTS.find((a) => a.id === id));
    }
  };

  tryUnlock("first_win", player.wins >= 1);
  tryUnlock("bot_hunter", player.vsBotWins >= 3);
  tryUnlock("pvp_fighter", player.pvpWins >= 5);
  tryUnlock("streak_3", player.winStreak >= 3);
  tryUnlock("veteran_20", player.gamesPlayed >= 20);
  tryUnlock("quick_win", context.quickWin === true);
  tryUnlock("uno_master", context.usedUnoAndWon === true);
  tryUnlock("wild4_finisher", context.wonWithWild4 === true);

  return unlockedNow;
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

function getGameByPlayerId(userId) {
  const gameId = playerGames.get(userId);
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
    if (!p.isBot) {
      playerGames.set(p.id, game.id);
    }
  }
}

function refreshPlayerReferences(game) {
  for (const [userId, gameId] of playerGames.entries()) {
    if (gameId === game.id) {
      playerGames.delete(userId);
    }
  }

  for (const p of game.players) {
    if (!p.isBot) {
      playerGames.set(p.id, game.id);
    }
  }
}

function removeGameReferences(game) {
  games.delete(game.id);
  channelGames.delete(game.channelId);

  for (const p of game.players) {
    if (!p.isBot) {
      playerGames.delete(p.id);
    }
  }
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

function createBaseGame(channel, ownerUser, vsBot = false) {
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
    unoCalled: {},
    saidUnoThisGame: {},
    turnNumber: 0,
    createdAt: Date.now(),
    lastPlayedCardType: null,
    tempChannel: vsBot
  };

  if (vsBot) {
    game.players.push({
      id: "UNO_BOT",
      username: "UNO Bot",
      isBot: true
    });
  }

  for (const p of game.players) {
    game.hands[p.id] = [];
    game.unoCalled[p.id] = false;
    game.saidUnoThisGame[p.id] = false;
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

  refreshPlayerReferences(game);
  return { ok: true };
}

/* =========================================================
   EMBEDS
========================================================= */

function menuEmbed(user) {
  return new EmbedBuilder()
    .setColor(EMBED.brand)
    .setTitle("🃏 UNO")
    .setDescription("Elegí una opción para jugar")
    .setThumbnail(user.displayAvatarURL())
    .setFooter({ text: "Simple y rápido" });
}

function helpEmbed() {
  return new EmbedBuilder()
    .setColor(EMBED.brand)
    .setTitle("❓ Cómo jugar")
    .setDescription(
      [
        "• Jugá mismo color, número o tipo",
        "• Si no podés, robás",
        "• Cuando te queda 1 carta, tocá UNO",
        "• Gana el primero que se queda sin cartas"
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

function lobbyEmbed(game) {
  const playersText = game.players
    .map((p) => `${p.isBot ? "🤖" : "👤"} ${p.username}`)
    .join("\n");

  return new EmbedBuilder()
    .setColor(EMBED.purple)
    .setTitle(game.vsBot ? "🤖 Partida vs Bot" : "🎮 Lobby UNO")
    .setDescription(game.vsBot ? "Preparando partida..." : "Esperando jugadores...")
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

  return new EmbedBuilder()
    .setColor(EMBED.dark)
    .setTitle("🃏 UNO")
    .setDescription(
      [
        `**Carta:** ${topCard.label}`,
        `**Color:** ${COLORS[color]} ${getColorName(color)}`,
        `**Turno:** ${currentPlayer.username}`
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
          .map((p, i) => `**${i + 1}.** ${p.username} — ⚡ ${p.elo}`)
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

  return new EmbedBuilder()
    .setColor(EMBED.brand)
    .setTitle(`👤 ${user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .setDescription(
      [
        `⚡ Elo: **${stats.elo ?? 1000}**`,
        `🏆 Victorias: **${stats.wins ?? 0}**`,
        `❌ Derrotas: **${stats.losses ?? 0}**`,
        `🎮 Partidas: **${stats.gamesPlayed ?? 0}**`,
        `🤖 Vs Bot: **${stats.vsBotWins ?? 0}**`,
        `⚔️ PvP: **${stats.pvpWins ?? 0}**`,
        `📈 Posición: **${rank ? `#${rank}` : "Sin rank"}**`,
        `🏅 Logros: **${achievementCount}/${ACHIEVEMENTS.length}**`
      ].join("\n")
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
              `**${i + 1}.** ${h.winner} ganó\n${h.players.join(" vs ")}\nModo: ${h.mode} · Turnos: ${h.turns}`
          )
          .join("\n\n");

  return new EmbedBuilder()
    .setColor(EMBED.gray)
    .setTitle("🕘 Historial")
    .setDescription(text);
}

function achievementsEmbed(user) {
  const stats = getPlayerStats(user.id, user.username);
  const owned = ACHIEVEMENTS.filter((a) => stats.achievements.includes(a.id));
  const missing = ACHIEVEMENTS.filter((a) => !stats.achievements.includes(a.id));

  const unlockedText =
    owned.length === 0
      ? "Todavía no desbloqueaste ninguno."
      : owned
          .map((a) => `✅ **${a.name}**\n${a.description}\nProbabilidad: ${a.chance}`)
          .join("\n\n");

  const missingText =
    missing.length === 0
      ? "Ya tenés todos los logros."
      : missing
          .slice(0, 6)
          .map((a) => `⬜ **${a.name}**\n${a.description}\nProbabilidad: ${a.chance}`)
          .join("\n\n");

  return new EmbedBuilder()
    .setColor(EMBED.brand)
    .setTitle(`🏅 Logros de ${user.username}`)
    .setDescription(`Tenés **${owned.length}/${ACHIEVEMENTS.length}** logros desbloqueados`)
    .addFields(
      { name: "Desbloqueados", value: unlockedText.slice(0, 1024) || "Ninguno" },
      { name: "Te faltan", value: missingText.slice(0, 1024) || "Ninguno" }
    );
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

/* =========================================================
   BOTONES
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
    )
  ];
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
        .setEmoji("🏆")
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
   TURNOS
========================================================= */

async function advanceTurn(channel, game, skipAmount = 1) {
  game.currentPlayerIndex = nextPlayerIndex(game, skipAmount);
  game.turnNumber += 1;
  await sendOrUpdateGameMessage(channel, game);

  const current = getCurrentPlayer(game);
  if (current?.isBot && !game.finished) {
    setTimeout(() => {
      botPlay(channel, game).catch((err) => console.error("Error botPlay:", err));
    }, 1200);
  }
}

async function sendAchievementUnlocks(channel, unlocked) {
  for (const achievement of unlocked) {
    if (!achievement) continue;
    await channel.send({ embeds: [achievementUnlockEmbed(achievement)] }).catch(() => null);
  }
}

async function finishGame(channel, game, winner) {
  game.finished = true;
  game.started = false;

  const stats = loadStats();

  for (const p of game.players) {
    if (!p.isBot) {
      if (!stats[p.id]) stats[p.id] = createDefaultPlayer(p.username);
      stats[p.id].username = p.username;
      stats[p.id].gamesPlayed += 1;
    }
  }

  const losers = game.players.filter((p) => p.id !== winner.id);

  if (!stats[winner.id]) stats[winner.id] = createDefaultPlayer(winner.username);
  stats[winner.id].wins += 1;
  stats[winner.id].winStreak += 1;

  if (game.vsBot) {
    stats[winner.id].vsBotWins += 1;
    stats[winner.id].elo += 12;
  } else if (game.players.length >= 2) {
    stats[winner.id].pvpWins += 1;
    stats[winner.id].elo += game.players.length === 2 ? 16 : 15;
  }

  for (const loser of losers) {
    if (!loser.isBot) {
      if (!stats[loser.id]) stats[loser.id] = createDefaultPlayer(loser.username);
      stats[loser.id].losses += 1;
      stats[loser.id].winStreak = 0;
      stats[loser.id].elo = Math.max(800, stats[loser.id].elo - 6);
    }
  }

  const unlocked = evaluateAchievements(stats, winner.id, {
    quickWin: game.turnNumber <= 12,
    usedUnoAndWon: game.saidUnoThisGame[winner.id] === true,
    wonWithWild4: game.lastPlayedCardType === "wild4"
  });

  saveStats(stats);

  addMatchToHistory({
    winner: winner.username,
    players: game.players.map((p) => p.username),
    mode: game.vsBot ? "Vs Bot" : game.players.length === 2 ? "PvP" : "Multijugador",
    turns: game.turnNumber,
    createdAt: new Date().toISOString()
  });

  const winnerStats = stats[winner.id];

  const endEmbed = new EmbedBuilder()
    .setColor(EMBED.success)
    .setTitle("🏆 Victoria")
    .setDescription(`**${winner.username}** ganó la partida`)
    .addFields(
      {
        name: "Resumen",
        value: `Modo: ${game.vsBot ? "Vs Bot" : "PvP"}\nTurnos: ${game.turnNumber}`
      },
      {
        name: "Nuevo elo",
        value: `⚡ ${winnerStats.elo}`
      }
    );

  await channel.send({ embeds: [endEmbed] });
  await sendAchievementUnlocks(channel, unlocked);

  removeGameReferences(game);

  if (game.tempChannel) {
    await channel.send(`🗑️ Esta sala temporal se eliminará en ${TEMP_DELETE_DELAY_MS / 1000} segundos.`).catch(() => null);

    setTimeout(async () => {
      try {
        await channel.delete("Partida UNO vs Bot terminada");
      } catch (err) {
        console.error("No se pudo borrar el canal temporal:", err);
      }
    }, TEMP_DELETE_DELAY_MS);
  }
}

async function applyPlayedCard(channel, game, player, card, selectedColor = null) {
  game.discard.push(card);
  game.lastPlayedCardType = card.type;

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
  } else if (card.type === "wild") {
    game.lastAction = `${player.username} jugó ${card.label}`;
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

function chooseBotCard(game) {
  const hand = sortHand(game.hands["UNO_BOT"]);
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

function bestBotColor(game) {
  const hand = game.hands["UNO_BOT"] || [];
  const count = { red: 0, blue: 0, green: 0, yellow: 0 };

  for (const c of hand) {
    if (count[c.color] !== undefined) count[c.color]++;
  }

  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || "red";
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
  const playedCard = hand.splice(idx, 1)[0];
  const selectedColor =
    playedCard.type === "wild" || playedCard.type === "wild4" ? bestBotColor(game) : null;

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
        await interaction.reply({ content: "📜 Reglas enviadas al canal.", ephemeral: true });
        await interaction.channel.send({ embeds: [rulesEmbed()] });
        return;
      }

      if (interaction.commandName === "top") {
        await interaction.reply({ embeds: [topEmbed()], ephemeral: true });
        return;
      }

      if (interaction.commandName === "perfil") {
        await interaction.reply({ embeds: [profileEmbed(interaction.user)] });
        return;
      }

      if (interaction.commandName === "historial") {
        await interaction.reply({ embeds: [historyEmbed()], ephemeral: true });
        return;
      }

      if (interaction.commandName === "logros") {
        await interaction.reply({ embeds: [achievementsEmbed(interaction.user)], ephemeral: true });
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
       MENÚ PRINCIPAL
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
      const game = createBaseGame(tempChannel, interaction.user, true);

      setGameReferences(game);
      startGame(game);

      await interaction.reply({
        content: `🤖 Te creé una sala privada para jugar: ${tempChannel}`,
        ephemeral: true
      });

      await tempChannel.send(`🎮 ${interaction.user}, tu partida de UNO vs Bot empezó acá.`);
      await sendOrUpdateGameMessage(tempChannel, game);
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
      await interaction.reply({ embeds: [topEmbed()], ephemeral: true });
      return;
    }

    if (customId === "uno_menu_help") {
      await interaction.reply({ embeds: [helpEmbed()], ephemeral: true });
      return;
    }

    if (customId === "uno_menu_achievements") {
      await interaction.reply({ embeds: [achievementsEmbed(interaction.user)], ephemeral: true });
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
       ACCIONES GENERALES DE PARTIDA
    ========================= */

    if (customId.startsWith("uno_topgame_")) {
      await interaction.reply({ embeds: [topEmbed()], ephemeral: true });
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
        await interaction.reply({ content: "📢 Dijiste UNO.", ephemeral: true });
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
