require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  REST, 
  Routes,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { OpusDecoder } = require('opusscript');
const { execSync } = require('child_process');

// ===================== CONFIG FILE (PER-GUILD) =====================
const CONFIG_PATH = path.join(__dirname, 'bot-config.json');
const GUILDS_DIR = path.join(__dirname, 'guilds');
if (!fs.existsSync(GUILDS_DIR)) fs.mkdirSync(GUILDS_DIR, { recursive: true });

function getDefaultConfig() {
  return {
    status: 'En ligne 🟢',
    prefix: '!',
    welcomeMessage: 'Bienvenue {user} sur {server} !',
    goodbyeMessage: '{user} a quitté le serveur.',
    welcomeChannel: null,
    welcomeImage: null,
    goodbyeChannel: null,
    logChannel: null,
    modRole: null,
    autoRole: null,
    autoRoleDelay: 0,
    antiSpam: true,
    antiLink: false,
    antiRaid: true,
    antiRaidThreshold: 5,
    antiRaidTime: 10,
    badWords: [],
    maxMessageLength: 2000,
    warnLimit: 3,
    warnAction: 'kick',
    ticketEnabled: false,
    ticketCategory: null,
    ticketLogChannel: null,
    ticketMessage: 'Un staff va vous répondre.',
    ticketMaxPerUser: 3,
    ticketTranscript: true,
    ticketCloseMessage: 'Ticket fermé.',
    levelEnabled: false,
    xpPerMessage: 15,
    xpCooldown: 60,
    levelUpChannel: null,
    levelUpMessage: '{user} a atteint le niveau {level} !',
    roleRewards: {},
    ignoredChannels: [],
    musicEnabled: false,
    musicVolume: 80,
    musicAutoPlay: false,
    musicLoop: false,
    customCommands: [],
    welcomeDM: false,
    welcomeDMMessage: 'Bienvenue sur {server} !',
    autoroleVerify: false,
    logsMessages: true,
    logsMembers: true,
    logsModeration: true,
    logsVoice: false,
    logsServer: true,
    embedColor: '#7289da',
    language: 'fr',
    adminOnly: false,
    automodEnabled: false,
    automodCapsFilter: false,
    automodCapsLimit: 70,
    automodSpamLimit: 5,
    automodSpamTime: 5,
    automodInviteBlock: false,
    automodWordFilter: false,
    automodLinkWhitelist: [],
    starboardChannel: null,
    starboardThreshold: 5,
    reactionRoleMessage: null,
    reactionRoles: {},
    reminderEnabled: false,
    pollEnabled: false,
    translateEnabled: false,
    translateChannel: null,
    backupEnabled: true,
    nukeEnabled: true,
    nukeConfirm: true,
    voiceRecordEnabled: false,
    voiceRecordChannel: null,
    voiceRecordAdminRole: null,
    nukeOwnerId: null,
    economyEnabled: false,
    economyCurrency: '💰 Coins',
    economyDailyAmount: 100,
    economyWorkAmount: 50,
    economyShopItems: []
  };
}

function getGuildConfigPath(guildId) {
  return path.join(GUILDS_DIR, `${guildId}.json`);
}

function loadGuildConfig(guildId) {
  try {
    const p = getGuildConfigPath(guildId);
    if (fs.existsSync(p)) {
      const saved = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { ...getDefaultConfig(), ...saved };
    }
  } catch (e) {}
  return getDefaultConfig();
}

function saveGuildConfig(guildId, config) {
  fs.writeFileSync(getGuildConfigPath(guildId), JSON.stringify(config, null, 2));
}

function getAllGuildConfigs() {
  const configs = {};
  try {
    const files = fs.readdirSync(GUILDS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const guildId = f.replace('.json', '');
      configs[guildId] = loadGuildConfig(guildId);
    }
  } catch (e) {}
  return configs;
}

// Legacy: load old bot-config.json for first guild migration
function migrateOldConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const old = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (old && typeof old === 'object') {
        const files = fs.readdirSync(GUILDS_DIR).filter(f => f.endsWith('.json'));
        if (files.length === 0) {
          console.log('📦 Migration de l\'ancien config vers le système multi-serveurs...');
        }
      }
    }
  } catch (e) {}
}

// ===================== ECONOMY SYSTEM =====================
const ECONOMY_DATA_PATH = path.join(__dirname, 'economy-data.json');
let economyData = loadJsonFile(ECONOMY_DATA_PATH, {});

function getEconomy(userId, guildId) {
  const key = `${guildId}_${userId}`;
  if (!economyData[key]) economyData[key] = { balance: 0, bank: 0, lastDaily: 0, lastWork: 0, inventory: [] };
  return economyData[key];
}

function saveEconomy() { saveJsonFile(ECONOMY_DATA_PATH, economyData); }

// ===================== PUNISHMENT HISTORY =====================
const PUNISHMENTS_PATH = path.join(__dirname, 'punishments-data.json');
let punishmentsData = loadJsonFile(PUNISHMENTS_PATH, {});

function addPunishment(guildId, userId, type, moderator, reason) {
  const key = `${guildId}_${userId}`;
  if (!punishmentsData[key]) punishmentsData[key] = [];
  punishmentsData[key].push({ type, moderator, reason, date: new Date().toISOString() });
  saveJsonFile(PUNISHMENTS_PATH, punishmentsData);
}

function getPunishments(guildId, userId) {
  return punishmentsData[`${guildId}_${userId}`] || [];
}

// ===================== AFK SYSTEM =====================
const afkUsers = new Map();

// ===================== TEMPBAN PERSISTENCE =====================
const TEMPBANS_PATH = path.join(__dirname, 'tempbans-data.json');
let tempbansData = loadJsonFile(TEMPBANS_PATH, {});

function addTempban(guildId, userId, expiresAt) {
  tempbansData[`${guildId}_${userId}`] = { expiresAt };
  saveJsonFile(TEMPBANS_PATH, tempbansData);
}

function removeTempban(guildId, userId) {
  delete tempbansData[`${guildId}_${userId}`];
  saveJsonFile(TEMPBANS_PATH, tempbansData);
}

// ===================== ANTI-RAID =====================
const raidTracker = new Map();

function checkRaid(guildId) {
  const gCfg = loadGuildConfig(guildId);
  if (!gCfg.antiRaid) return false;
  const key = guildId;
  if (!raidTracker.has(key)) raidTracker.set(key, []);
  const now = Date.now();
  const joins = raidTracker.get(key).filter(t => now - t < (gCfg.antiRaidTime || 10) * 1000);
  raidTracker.set(key, joins);
  return joins.length >= (gCfg.antiRaidThreshold || 5);
}

function addJoinToRaidTracker(guildId) {
  const key = guildId;
  if (!raidTracker.has(key)) raidTracker.set(key, []);
  raidTracker.get(key).push(Date.now());
}

// ===================== HELPER: hasModPermission =====================
function hasModPermission(member, gCfg) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (gCfg.modRole && member.roles.cache.has(gCfg.modRole)) return true;
  return false;
}

// Default config for legacy references
let config = getDefaultConfig();

function getGuildCfg(guildId) {
  return loadGuildConfig(guildId);
}

function setGuildCfg(guildId, newCfg) {
  saveGuildConfig(guildId, newCfg);
}

// For backwards compatibility in bot events
function cfg(guildId) {
  if (guildId) return getGuildCfg(guildId);
  return config;
}

// ===================== CLIENT (OPTIMISE 315MB) =====================
const { Options, Collection } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions
  ],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 50,
    GuildMemberManager: {
      maxSize: 100,
      keepOverLimit: (member) => member.id === client.user?.id,
    },
    GuildBanManager: 50,
    PresenceManager: 0,
    GuildEmojiManager: 25,
    ReactionManager: 0,
    ReactionUserManager: 0,
    VoiceStateManager: 25,
    StageInstanceManager: 0,
    GuildScheduledEventManager: 0,
    PollManager: 0,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    clients: { interval: 300, lifetime: 600 },
    guildMembers: {
      interval: 300,
      lifetime: 600,
      filter: () => (member) => member.id !== member.client.user?.id,
    },
    messages: { interval: 300, lifetime: 180 },
  },
});

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// ===================== BACKUP SYSTEM =====================
const BACKUPS_PATH = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUPS_PATH)) fs.mkdirSync(BACKUPS_PATH, { recursive: true });

async function createBackup(guild, name) {
  await guild.channels.fetch();
  await guild.roles.fetch();
  
  const backup = {
    name: name || `backup_${Date.now()}`,
    createdAt: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name,
    channels: [],
    roles: [],
    categories: [],
    messages: {}
  };

  // Sauvegarder les catégories
  guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).forEach(cat => {
    const overwrites = cat.permissionOverwrites ? cat.permissionOverwrites.cache : [];
    backup.categories.push({
      id: cat.id,
      name: cat.name,
      position: cat.position,
      permissionOverwrites: overwrites.map(p => ({
        id: p.id,
        type: p.type,
        allow: p.allow.toString(),
        deny: p.deny.toString()
      }))
    });
  });

  // Sauvegarder les salons texte + messages (jusqu'à 500 par salon)
  const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
  
  for (const ch of textChannels) {
    const overwrites = ch.permissionOverwrites ? ch.permissionOverwrites.cache : [];
    const channelData = {
      id: ch.id,
      name: ch.name,
      type: ch.type,
      topic: ch.topic,
      position: ch.position,
      nsfw: ch.nsfw,
      parent: ch.parent?.id || null,
      permissionOverwrites: overwrites.map(p => ({
        id: p.id,
        type: p.type,
        allow: p.allow.toString(),
        deny: p.deny.toString()
      }))
    };
    backup.channels.push(channelData);
    
    // Sauvegarder les messages (TOUS les messages du salon)
    try {
      const perms = guild.members.me.permissionsIn(ch);
      if (!perms || !perms.has('ViewChannel') || !perms.has('ReadMessageHistory')) {
        console.log(`⏭️ [Backup] Skip ${ch.name}: permissions insuffisantes`);
        continue;
      }

      let allMessages = [];
      let lastId = null;
      
      while (true) {
        const fetchOptions = { limit: 100 };
        if (lastId) fetchOptions.before = lastId;
        
        const messages = await ch.messages.fetch(fetchOptions);
        if (messages.size === 0) break;
        
        for (const [, msg] of messages) {
          allMessages.push({
            id: msg.id,
            author: msg.author.username,
            authorId: msg.author.id,
            avatar: msg.author.displayAvatarURL({ extension: 'png', size: 128 }),
            content: msg.content || '',
            timestamp: msg.createdTimestamp,
            editedTimestamp: msg.editedTimestamp,
            attachments: msg.attachments.map(a => ({ url: a.url, name: a.name, size: a.size })),
            embeds: msg.embeds.length > 0 ? msg.embeds.map(e => ({ title: e.title, description: e.description, url: e.url })) : [],
            replyTo: msg.reference?.messageId || null
          });
        }
        
        lastId = messages.last()?.id;
      }
      
      if (allMessages.length > 0) {
        backup.messages[ch.id] = allMessages.reverse();
        console.log(`💬 [Backup] ${ch.name}: ${allMessages.length} message(s) sauvegardé(s)`);
      }
    } catch (e) {
      console.error(`❌ [Backup] Erreur messages ${ch.name}:`, e.message);
    }
  }

  // Sauvegarder les autres types de salons (vocaux, etc)
  guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory && c.type !== ChannelType.GuildText).forEach(ch => {
    const overwrites = ch.permissionOverwrites ? ch.permissionOverwrites.cache : [];
    backup.channels.push({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      position: ch.position,
      bitrate: ch.bitrate,
      userLimit: ch.userLimit,
      parent: ch.parent?.id || null,
      permissionOverwrites: overwrites.map(p => ({
        id: p.id,
        type: p.type,
        allow: p.allow.toString(),
        deny: p.deny.toString()
      }))
    });
  });

  // Sauvegarder les rôles
  guild.roles.cache.forEach(role => {
    if (role.name === '@everyone') return;
    if (role.managed) return;
    backup.roles.push({
      id: role.id,
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      position: role.position,
      permissions: role.permissions.toString()
    });
  });

  const filePath = path.join(BACKUPS_PATH, `${backup.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));
  return backup;
}

async function restoreBackup(guild, backupName) {
  const filePath = path.join(BACKUPS_PATH, `${backupName}.json`);
  if (!fs.existsSync(filePath)) throw new Error('Backup introuvable');
  
  const backup = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // Supprimer tous les salons sauf le général
  for (const [id, channel] of guild.channels.cache) {
    try {
      if (channel.name === 'général' || channel.name === 'general') continue;
      await channel.delete(`Restore: ${backupName}`);
    } catch (e) {}
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Créer les catégories
  const categoryMap = {};
  for (const cat of backup.categories) {
    try {
      const newCat = await guild.channels.create({
        name: cat.name,
        type: ChannelType.GuildCategory,
        position: cat.position
      });
      categoryMap[cat.id] = newCat.id;
    } catch (e) {}
  }
  
  await new Promise(r => setTimeout(r, 500));
  
  // Créer les salons + restaurer les messages
  const channelMap = {};
  for (const ch of backup.channels) {
    try {
      const options = {
        name: ch.name,
        type: ch.type,
        topic: ch.topic,
        position: ch.position,
        nsfw: ch.nsfw
      };
      if (ch.bitrate) options.bitrate = ch.bitrate;
      if (ch.userLimit) options.userLimit = ch.userLimit;
      if (ch.parent && categoryMap[ch.parent]) options.parent = categoryMap[ch.parent];
      
      const newChannel = await guild.channels.create(options);
      channelMap[ch.id] = newChannel.id;
      
      // Restaurer les messages si c'est un salon texte
      if (ch.type === ChannelType.GuildText && backup.messages && backup.messages[ch.id]) {
        const messages = backup.messages[ch.id];
        
        if (messages.length > 0) {
          // Créer un webhook pour restaurer les messages avec le vrai nom
          let webhook;
          try {
            webhook = await newChannel.createWebhook({ name: 'Historique restauré' });
          } catch (e) {}
          
          // Envoyer un embed d'en-tête
          const headerEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('📋 Historique restauré')
            .setDescription(`${messages.length} message(s) restauré(s) depuis **${backupName}**`)
            .setTimestamp();
          await newChannel.send({ embeds: [headerEmbed] }).catch(() => {});
          await new Promise(r => setTimeout(r, 500));
          
          // Restaurer les messages via webhook (avec le vrai nom et avatar)
          for (const msg of messages) {
            try {
              // Construire le contenu
              let content = msg.content || '';
              
              // Ajouter les pièces jointes
              if (msg.attachments && msg.attachments.length > 0) {
                const attStr = msg.attachments.map(a => a.url).join('\n');
                content += (content ? '\n' : '') + attStr;
              }
              
              if (webhook) {
                // Utiliser le webhook pour envoyer avec le vrai nom/avatar
                await webhook.send({
                  content: content || '*message vide*',
                  username: msg.author,
                  avatarURL: msg.avatar || `https://cdn.discordapp.com/embed/avatars/${(parseInt(msg.authorId) >> 22) % 6}.png`
                }).catch(() => {});
              } else {
                // Fallback : envoyer en embed
                const embed = new EmbedBuilder()
                  .setColor('#7289da')
                  .setAuthor({ name: msg.author })
                  .setDescription(content || '*message vide*')
                  .setTimestamp(msg.timestamp);
                await newChannel.send({ embeds: [embed] }).catch(() => {});
              }
              
              // Petit délai pour ne pas spammer
              await new Promise(r => setTimeout(r, 500));
            } catch (e) {}
          }
          
          // Supprimer le webhook après restauration
          if (webhook) {
            try { await webhook.delete(); } catch (e) {}
          }
        }
      }
    } catch (e) {}
  }
  
  return backup;
}

async function nukeGuild(guild, confirm = true) {
  if (confirm) {
    await guild.channels.fetch();
    const backup = await createBackup(guild, `pre_nuke_${Date.now()}`);
    
    // Supprimer tous les salons
    const channelsList = [...guild.channels.cache.values()];
    for (const channel of channelsList) {
      try {
        await channel.delete('Nuke');
      } catch (e) {}
    }
    
    // Recréer un salon général
    await guild.channels.create({
      name: 'général',
      type: ChannelType.GuildText
    });
    
    return { success: true, backup: backup.name };
  }
  return { success: false };
}

// ===================== PERSISTENCE (DATA FILES) =====================
const XP_DATA_PATH = path.join(__dirname, 'xp-data.json');
const WARNS_DATA_PATH = path.join(__dirname, 'warns-data.json');
const TICKETS_DATA_PATH = path.join(__dirname, 'tickets-data.json');

function loadJsonFile(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {}
  return fallback;
}

function saveJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {}
}

// ===================== XP SYSTEM =====================
let xpData = loadJsonFile(XP_DATA_PATH, {});

function getXp(userId, guildId) {
  const key = `${guildId}_${userId}`;
  return xpData[key] || { xp: 0, level: 0, lastXp: 0 };
}

function addXp(userId, guildId) {
  const key = `${guildId}_${userId}`;
  if (!xpData[key]) xpData[key] = { xp: 0, level: 0, lastXp: 0 };
  
  const gCfg = loadGuildConfig(guildId);
  const now = Date.now();
  if (now - xpData[key].lastXp < gCfg.xpCooldown * 1000) return null;
  
  xpData[key].xp += gCfg.xpPerMessage;
  xpData[key].lastXp = now;
  
  const newLevel = Math.floor(0.1 * Math.sqrt(xpData[key].xp));
  if (newLevel > xpData[key].level) {
    xpData[key].level = newLevel;
    saveJsonFile(XP_DATA_PATH, xpData);
    return newLevel;
  }
  saveJsonFile(XP_DATA_PATH, xpData);
  return null;
}

// ===================== WARN SYSTEM =====================
let warns = loadJsonFile(WARNS_DATA_PATH, {});

function addWarn(userId, guildId, reason, moderator) {
  const key = `${guildId}_${userId}`;
  if (!warns[key]) warns[key] = [];
  warns[key].push({ reason, moderator, date: new Date().toISOString() });
  saveJsonFile(WARNS_DATA_PATH, warns);
  return warns[key].length;
}

function getWarns(userId, guildId) {
  return warns[`${guildId}_${userId}`] || [];
}

function clearWarns(userId, guildId) {
  warns[`${guildId}_${userId}`] = [];
  saveJsonFile(WARNS_DATA_PATH, warns);
}

// ===================== TICKET SYSTEM =====================
let tickets = new Map(loadJsonFile(TICKETS_DATA_PATH, []));

function saveTickets() {
  const arr = Array.from(tickets.entries());
  saveJsonFile(TICKETS_DATA_PATH, arr);
}

// ===================== ANTI-SPAM =====================
const spamTracker = new Map();

function checkSpam(userId, guildId) {
  const key = `${guildId}_${userId}`;
  if (!spamTracker.has(key)) spamTracker.set(key, []);
  
  const gCfg = loadGuildConfig(guildId);
  const now = Date.now();
  const messages = spamTracker.get(key).filter(t => now - t < gCfg.automodSpamTime * 1000);
  messages.push(now);
  spamTracker.set(key, messages);
  
  return messages.length > gCfg.automodSpamLimit;
}

// ===================== VOICE RECORDING =====================
const RECORDINGS_PATH = path.join(__dirname, 'recordings');
if (!fs.existsSync(RECORDINGS_PATH)) fs.mkdirSync(RECORDINGS_PATH, { recursive: true });

const BEEP_PATH = path.join(__dirname, 'beep.wav');
if (!fs.existsSync(BEEP_PATH)) {
  try {
    execSync(`ffmpeg -f lavfi -i "sine=frequency=880:duration=0.15" -af "afade=t=in:st=0:d=0.01,afade=t=out:st=0.1:d=0.05" "${BEEP_PATH}" -y`, { stdio: 'pipe' });
  } catch {}
}

const activeRecordings = new Map();

const RECORDING_SAMPLE_RATE = 48000;
const RECORDING_CHANNELS = 2;
const RECORDING_BITS = 16;
const MAX_RECORDING_DURATION = 60 * 60 * 1000;

class VoiceRecorder {
  constructor(guild, voiceChannel, logChannel, dmUser = null) {
    this.guild = guild;
    this.voiceChannel = voiceChannel;
    this.logChannel = logChannel;
    this.dmUser = dmUser;
    this.connection = null;
    this.decoder = null;
    this.isRecording = false;
    this.startTime = null;
    this.activeStreams = new Map();
    this.filePath = null;
    this.writeStream = null;
    this.frameCount = 0;
    this.timeout = null;
  }

  start() {
    this.connection = joinVoiceChannel({
      channelId: this.voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    this.decoder = new OpusDecoder(RECORDING_SAMPLE_RATE, RECORDING_CHANNELS);
    this.startTime = Date.now();
    this.isRecording = true;

    this.filePath = path.join(RECORDINGS_PATH, `rec-${this.guild.id}-${Date.now()}.pcm`);
    this.writeStream = fs.createWriteStream(this.filePath);

    this.connection.receiver.speaking.on('start', (userId) => {
      this._subscribeToUser(userId);
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await entersState(this.connection, VoiceConnectionStatus.Disconnected, 5000);
        this.stop();
      } catch {}
    });

    this.timeout = setTimeout(() => { this.stop(); }, MAX_RECORDING_DURATION);

    return this;
  }

  _subscribeToUser(userId) {
    if (this.activeStreams.has(userId)) return;
    const stream = this.connection.receiver.subscribe(userId);
    this.activeStreams.set(userId, stream);

    stream.on('data', (opusPacket) => {
      if (!this.isRecording) return;
      try {
        const pcm = this.decoder.decode(opusPacket);
        this.writeStream.write(pcm);
        this.frameCount++;
      } catch {}
    });

    stream.on('end', () => { this.activeStreams.delete(userId); });
  }

  async stop() {
    if (!this.isRecording) return null;
    this.isRecording = false;

    if (this.timeout) clearTimeout(this.timeout);

    for (const [, stream] of this.activeStreams) { try { stream.destroy(); } catch {} }
    this.activeStreams.clear();

    if (this.writeStream) {
      this.writeStream.end();
      await new Promise(resolve => this.writeStream.on('finish', resolve));
    }

    try { this.connection?.destroy(); } catch {}

    const result = await this._convertAndSend();

    try { fs.unlinkSync(this.filePath); } catch {}

    return result;
  }

  async _convertAndSend() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return null;

    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let sendPath = null;
    let ext = 'ogg';

    try {
      const oggPath = this.filePath.replace('.pcm', '.ogg');
      execSync(
        `ffmpeg -f s16le -ar ${RECORDING_SAMPLE_RATE} -ac ${RECORDING_CHANNELS} -i "${this.filePath}" -c:a libopus -b:a 64k "${oggPath}" -y`,
        { timeout: 60000, stdio: 'pipe' }
      );
      const stat = fs.statSync(oggPath);
      if (stat.size > 25 * 1024 * 1024) {
        execSync(
          `ffmpeg -f s16le -ar ${RECORDING_SAMPLE_RATE} -ac ${RECORDING_CHANNELS} -i "${this.filePath}" -c:a libopus -b:a 32k "${oggPath}" -y`,
          { timeout: 60000, stdio: 'pipe' }
        );
      }
      sendPath = oggPath;
    } catch {
      try {
        const pcmData = fs.readFileSync(this.filePath);
        const wavPath = this.filePath.replace('.pcm', '.wav');
        fs.writeFileSync(wavPath, this._createWav(pcmData));
        sendPath = wavPath;
        ext = 'wav';
      } catch { return null; }
    }

    if (!sendPath) return null;

    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const embed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle('🎙️ Enregistrement vocal terminé')
      .addFields(
        { name: '📍 Salon vocal', value: this.voiceChannel.name, inline: true },
        { name: '⏱️ Durée', value: `${mins}m ${secs}s`, inline: true },
        { name: '📊 Frames', value: this.frameCount.toString(), inline: true }
      )
      .setTimestamp();

    const file = { attachment: sendPath, name: `enregistrement-${date}.${ext}` };

    try {
      if (this.dmUser) {
        await this.dmUser.send({ embeds: [embed], files: [file] });
      } else if (this.logChannel) {
        await this.logChannel.send({ embeds: [embed], files: [file] });
      }
    } catch {}

    try { fs.unlinkSync(sendPath); } catch {}
    return { duration, frameCount: this.frameCount };
  }

  _createWav(pcmData) {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmData.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(RECORDING_CHANNELS, 22);
    header.writeUInt32LE(RECORDING_SAMPLE_RATE, 24);
    header.writeUInt32LE(RECORDING_SAMPLE_RATE * RECORDING_CHANNELS * (RECORDING_BITS / 8), 28);
    header.writeUInt16LE(RECORDING_CHANNELS * (RECORDING_BITS / 8), 32);
    header.writeUInt16LE(RECORDING_BITS, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmData.length, 40);
    return Buffer.concat([header, pcmData]);
  }
}

// ===================== COMMANDES SLASH =====================
const commands = [
  new SlashCommandBuilder().setName('help').setDescription('Affiche la liste des commandes'),
  new SlashCommandBuilder().setName('ping').setDescription('Vérifie la latence du bot'),
  
  new SlashCommandBuilder()
    .setName('ban').setDescription('Bannir un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('banid').setDescription('Bannir un membre via son ID')
    .addStringOption(o => o.setName('userid').setDescription('L\'ID Discord de l\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),

  new SlashCommandBuilder()
    .setName('kick').setDescription('Expulser un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('mute').setDescription('Mute un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addIntegerOption(o => o.setName('duree').setDescription('Durée en minutes').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('unmute').setDescription('Unmute un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('clear').setDescription('Supprimer des messages')
    .addIntegerOption(o => o.setName('nombre').setDescription('Nombre (1-100)').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('warn').setDescription('Avertir un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('unwarn').setDescription('Retirer un warn')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('warns').setDescription('Voir les warns d\'un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('tempban').setDescription('Ban temporaire')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addIntegerOption(o => o.setName('duree').setDescription('Durée en jours').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('softban').setDescription('Softban (ban + unban)')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('nick').setDescription('Changer le pseudo d\'un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('pseudo').setDescription('Nouveau pseudo').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('slowmode').setDescription('Activer le slowmode')
    .addIntegerOption(o => o.setName('secondes').setDescription('Secondes de slowmode (0=off)').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('lock').setDescription('Verrouiller un salon'),
  
  new SlashCommandBuilder()
    .setName('unlock').setDescription('Déverrouiller un salon'),
  
  new SlashCommandBuilder()
    .setName('nuke').setDescription('Supprimer tous les salons (AVEC CONFIRMATION)'),
  
  new SlashCommandBuilder()
    .setName('backup').setDescription('Créer une sauvegarde du serveur'),
  
  new SlashCommandBuilder()
    .setName('restore').setDescription('Restaurer une sauvegarde')
    .addStringOption(o => o.setName('nom').setDescription('Nom de la backup').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('backups').setDescription('Lister les sauvegardes'),
  
  new SlashCommandBuilder()
    .setName('slowmodemsg').setDescription('Slowmode sur un salon spécifique')
    .addChannelOption(o => o.setName('salon').setDescription('Le salon').setRequired(true))
    .addIntegerOption(o => o.setName('secondes').setDescription('Secondes').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('hide').setDescription('Cacher un salon'),
  
  new SlashCommandBuilder()
    .setName('unhide').setDescription('Rendre un salon visible'),
  
  new SlashCommandBuilder()
    .setName('clone').setDescription('Cloner un salon')
    .addChannelOption(o => o.setName('salon').setDescription('Salon à cloner').setRequired(true)),
  
  new SlashCommandBuilder().setName('userinfo').setDescription('Infos d\'un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(false)),
  
  new SlashCommandBuilder().setName('serverinfo').setDescription('Infos du serveur'),
  
  new SlashCommandBuilder().setName('avatar').setDescription('Avatar d\'un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('roleinfo').setDescription('Infos d\'un rôle')
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('roles').setDescription('Liste des rôles du serveur'),
  
  new SlashCommandBuilder()
    .setName('members').setDescription('Nombre de membres par rôle'),
  
  new SlashCommandBuilder()
    .setName('boosters').setDescription('Liste des boosters'),
  
  new SlashCommandBuilder()
    .setName('emojis').setDescription('Liste des emojis'),
  
  new SlashCommandBuilder()
    .setName('invites').setDescription('Nombre d\'invitations'),
  
  new SlashCommandBuilder()
    .setName('say').setDescription('Le bot dit un message')
    .addStringOption(o => o.setName('message').setDescription('Le message').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('embed').setDescription('Créer un embed custom')
    .addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true))
    .addStringOption(o => o.setName('couleur').setDescription('Couleur hex').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('poll').setDescription('Créer un sondage')
    .addStringOption(o => o.setName('question').setDescription('La question').setRequired(true))
    .addStringOption(o => o.setName('options').setDescription('Options séparées par ;').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('remind').setDescription('Rappeler quelque chose')
    .addStringOption(o => o.setName('message').setDescription('Le message').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Minutes avant le rappel').setRequired(true)),
  
  new SlashCommandBuilder().setName('8ball').setDescription('Magic 8-ball')
    .addStringOption(o => o.setName('question').setDescription('Ta question').setRequired(true)),
  
  new SlashCommandBuilder().setName('meme').setDescription('Mème aléatoire'),
  
  new SlashCommandBuilder().setName('coinflip').setDescription('Pile ou face'),
  
  new SlashCommandBuilder().setName('roll').setDescription('Lancer un dé')
    .addIntegerOption(o => o.setName('faces').setDescription('Nombre de faces (défaut: 6)').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('rank').setDescription('Voir ton niveau'),
  
  new SlashCommandBuilder()
    .setName('leaderboard').setDescription('Classement XP'),
  
  new SlashCommandBuilder()
    .setName('setlevel').setDescription('Définir le niveau d\'un membre (Admin)')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addIntegerOption(o => o.setName('niveau').setDescription('Le niveau').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('ticket').setDescription('Créer un ticket support'),
  
  new SlashCommandBuilder()
    .setName('close').setDescription('Fermer le ticket actuel'),
  
  new SlashCommandBuilder()
    .setName('add').setDescription('Ajouter un membre au ticket')
    .addUserOption(o => o.setName('utilisateur').setDescription('Le membre').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('remove').setDescription('Retirer un membre du ticket')
    .addUserOption(o => o.setName('utilisateur').setDescription('Le membre').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('status').setDescription('Changer le status du bot')
    .addStringOption(o => o.setName('statut').setDescription('Nouveau status').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('reloadconfig').setDescription('Recharger la configuration'),
  
  new SlashCommandBuilder()
    .setName('setwelcomechannel').setDescription('Définir le salon de bienvenue')
    .addChannelOption(o => o.setName('salon').setDescription('Le salon').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('setlogchannel').setDescription('Définir le salon de logs')
    .addChannelOption(o => o.setName('salon').setDescription('Le salon').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('setautorole').setDescription('Définir l\'autorôle')
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('setmodrole').setDescription('Définir le rôle modérateur')
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('giverole').setDescription('Donner un rôle à un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('removerole').setDescription('Retirer un rôle à un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('massrole').setDescription('Donner un rôle à tous les membres')
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('pollresults').setDescription('Résultats d\'un sondage'),
  
  new SlashCommandBuilder()
    .setName('covid').setDescription('Stats COVID-19'),
  
  new SlashCommandBuilder()
    .setName('weather').setDescription('Météo d\'une ville')
    .addStringOption(o => o.setName('ville').setDescription('La ville').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('translate').setDescription('Traduire un texte')
    .addStringOption(o => o.setName('texte').setDescription('Le texte').setRequired(true))
    .addStringOption(o => o.setName('langue').setDescription('Langue cible').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('stoprecord').setDescription('Arrêter l\'enregistrement vocal en cours'),
  
  new SlashCommandBuilder()
    .setName('joinbot').setDescription('Rejoindre ton salon vocal et enregistrer'),
  
  new SlashCommandBuilder()
    .setName('stopbot').setDescription('Arrêter l\'enregistrement et recevoir le fichier en DM'),
  
  new SlashCommandBuilder()
    .setName('panel').setDescription('Ouvrir le panel de contrôle du bot'),

  // ECONOMY
  new SlashCommandBuilder()
    .setName('balance').setDescription('Voir ton solde'),
  new SlashCommandBuilder()
    .setName('daily').setDescription('Récompense quotidienne'),
  new SlashCommandBuilder()
    .setName('work').setDescription('Travailler pour gagner des coins'),
  new SlashCommandBuilder()
    .setName('deposit').setDescription('Déposer des coins en banque')
    .addIntegerOption(o => o.setName('montant').setDescription('Montant à déposer').setRequired(true)),
  new SlashCommandBuilder()
    .setName('withdraw').setDescription('Retirer des coins de la banque')
    .addIntegerOption(o => o.setName('montant').setDescription('Montant à retirer').setRequired(true)),
  new SlashCommandBuilder()
    .setName('pay').setDescription('Envoyer des coins à un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('Le destinataire').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true)),
  new SlashCommandBuilder()
    .setName('economyleaderboard').setDescription('Classement économique'),

  // AFK (enhanced)
  new SlashCommandBuilder()
    .setName('afk').setDescription('Se mettre AFK')
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),

  // PUNISHMENT HISTORY
  new SlashCommandBuilder()
    .setName('history').setDescription('Historique des sanctions d\'un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(false)),

  // STARBOARD (manual)
  new SlashCommandBuilder()
    .setName('starboard').setDescription('Voir les messages étoilés'),

  // REACTION ROLE SETUP
  new SlashCommandBuilder()
    .setName('setupreactionrole').setDescription('Setup un reaction role')
    .addStringOption(o => o.setName('emoji').setDescription('L\'emoji').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Le rôle à donner').setRequired(true)),

  // SHOP
  new SlashCommandBuilder()
    .setName('shop').setDescription('Voir la boutique')
];

// ===================== ENREGISTREMENT =====================
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('📝 Enregistrement des slash commands...');
    if (GUILD_ID) {
      try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('✅ Commandes enregistrées pour le serveur de test');
      } catch (guildErr) {
        console.warn('⚠️ Échec guild, enregistrement global...', guildErr.message);
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commandes enregistrées globalement');
      }
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ Commandes enregistrées globalement');
    }
  } catch (error) {
    console.error('❌ Erreur enregistrement:', error.message);
  }
}

// ===================== EVENTS =====================
client.on('ready', async () => {
  console.log(`🤖 ${client.user.tag} est en ligne !`);
  client.user.setPresence({ status: 'online' });
  client.user.setActivity('En ligne 🟢');
  await registerCommands();

  // Auto-create config for each guild the bot is already in
  client.guilds.cache.forEach(g => {
    const p = getGuildConfigPath(g.id);
    if (!fs.existsSync(p)) {
      saveGuildConfig(g.id, getDefaultConfig());
      console.log(`📁 Config auto-créée pour ${g.name} (${g.id})`);
    }
  });
  
  // Reload persistent tempbans
  const now = Date.now();
  for (const [key, data] of Object.entries(tempbansData)) {
    if (data.expiresAt && data.expiresAt > now) {
      const [guildId, userId] = key.split('_');
      const remaining = data.expiresAt - now;
      setTimeout(async () => {
        try {
          const guild = await client.guilds.fetch(guildId);
          await guild.members.unban(userId);
          removeTempban(guildId, userId);
        } catch (e) {
          removeTempban(guildId, userId);
        }
      }, remaining);
    } else if (data.expiresAt && data.expiresAt <= now) {
      const [guildId, userId] = key.split('_');
      try {
        const guild = await client.guilds.fetch(guildId);
        await guild.members.unban(userId);
      } catch (e) {}
      removeTempban(guildId, userId);
    }
  }
  console.log(`📋 ${Object.keys(tempbansData).length} tempban(s) rechargé(s)`);
});

// ===================== GUILD CREATE (auto-config) =====================
client.on('guildCreate', (guild) => {
  console.log(`🆕 Bot ajouté au serveur: ${guild.name} (${guild.id})`);
  const p = getGuildConfigPath(guild.id);
  if (!fs.existsSync(p)) {
    saveGuildConfig(guild.id, getDefaultConfig());
    console.log(`📁 Config auto-créée pour ${guild.name} (${guild.id})`);
  }
});

// ===================== GUILD DELETE (cleanup) =====================
client.on('guildDelete', (guild) => {
  console.log(`🗑️ Bot retiré du serveur: ${guild.name} (${guild.id})`);
});

// WELCOME
client.on('guildMemberAdd', async (member) => {
  try {
    const gCfg = cfg(member.guild.id);
    
    // Anti-raid check
    addJoinToRaidTracker(member.guild.id);
    if (checkRaid(member.guild.id)) {
      if (gCfg.logChannel) {
        const logCh = member.guild.channels.cache.get(gCfg.logChannel);
        if (logCh) {
          const embed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('🚨 ALERTE RAID')
            .setDescription(`Plusieurs membres ont rejoint en peu de temps !\nSeuil: ${gCfg.antiRaidThreshold || 5} membres en ${gCfg.antiRaidTime || 10}s`)
            .setTimestamp();
          logCh.send({ embeds: [embed] }).catch(() => {});
        }
      }
      // Try to lock down the server
      try {
        for (const [, ch] of member.guild.channels.cache) {
          if (ch.type === ChannelType.GuildText) {
            await ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => {});
          }
        }
        if (gCfg.logChannel) {
          const logCh = member.guild.channels.cache.get(gCfg.logChannel);
          if (logCh) logCh.send('🔒 **Serveur verrouillé automatiquement** — Anti-raid activé').catch(() => {});
        }
      } catch (e) {}
      return;
    }
    
    // Welcome message
    if (gCfg.welcomeChannel) {
      const ch = member.guild.channels.cache.get(gCfg.welcomeChannel);
      if (ch) {
        let msg = gCfg.welcomeMessage
          .replace('{user}', member.toString())
          .replace('{server}', member.guild.name)
          .replace('{count}', member.guild.memberCount.toString());
        
        if (gCfg.welcomeImage) {
          const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle(`Bienvenue ${member.user.username} !`)
            .setDescription(msg)
            .setImage(gCfg.welcomeImage)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();
          await ch.send({ embeds: [embed] });
        } else {
          await ch.send(msg);
        }
      }
    }
    
    // Welcome DM
    if (gCfg.welcomeDM) {
      try {
        let dmMsg = gCfg.welcomeDMMessage
          .replace('{user}', member.user.username)
          .replace('{server}', member.guild.name);
        await member.send(dmMsg);
      } catch (e) {}
    }
    
    // Auto role
    if (gCfg.autoRole) {
      setTimeout(async () => {
        try {
          const role = member.guild.roles.cache.get(gCfg.autoRole);
          if (role && !gCfg.autoroleVerify) {
            await member.roles.add(role);
          } else if (role && gCfg.autoroleVerify && member.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuild)) {
            if (member.pending === false) {
              await member.roles.add(role);
            }
          }
        } catch (e) {}
      }, (gCfg.autoRoleDelay || 0) * 1000);
    }
    
    // Log
    if (gCfg.logChannel && gCfg.logsMembers) {
      const ch = member.guild.channels.cache.get(gCfg.logChannel);
      if (ch) {
        const embed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('📥 Membre rejoint')
          .addFields(
            { name: 'Membre', value: `${member.user.username} (${member.id})`, inline: true },
            { name: 'Compte créé', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Membres', value: member.guild.memberCount.toString(), inline: true }
          )
          .setThumbnail(member.user.displayAvatarURL())
          .setTimestamp();
        await ch.send({ embeds: [embed] });
      }
    }
  } catch (e) {}
});

// GOODBYE
client.on('guildMemberRemove', async (member) => {
  try {
    const gCfg = cfg(member.guild.id);
    if (gCfg.goodbyeChannel) {
      const ch = member.guild.channels.cache.get(gCfg.goodbyeChannel);
      if (ch) {
        const msg = gCfg.goodbyeMessage
          .replace('{user}', member.user.username)
          .replace('{server}', member.guild.name)
          .replace('{count}', member.guild.memberCount.toString());
        await ch.send(msg);
      }
    }
    
    if (gCfg.logChannel && gCfg.logsMembers) {
      const ch = member.guild.channels.cache.get(gCfg.logChannel);
      if (ch) {
        const embed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('📤 Membre parti')
          .addFields(
            { name: 'Membre', value: `${member.user.username} (${member.id})`, inline: true },
            { name: 'Membres', value: member.guild.memberCount.toString(), inline: true }
          )
          .setThumbnail(member.user.displayAvatarURL())
          .setTimestamp();
        await ch.send({ embeds: [embed] });
      }
    }
  } catch (e) {}
});

// MESSAGE EVENTS (automod, xp, etc)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  
  const gCfg = cfg(message.guild.id);
  
  // AFK detection - remove AFK when user sends a message
  const afkKey = `${message.guild.id}_${message.author.id}`;
  if (afkUsers.has(afkKey)) {
    afkUsers.delete(afkKey);
    await message.reply(`👋 **${message.author.username}** n'est plus AFK !`).then(msg => {
      setTimeout(() => msg.delete().catch(() => {}), 5000);
    }).catch(() => {});
  }
  
  // AFK detection - notify when mentioning AFK users
  if (message.mentions.users.size > 0) {
    for (const [, mentionedUser] of message.mentions.users) {
      const mentionedAfkKey = `${message.guild.id}_${mentionedUser.id}`;
      if (afkUsers.has(mentionedAfkKey)) {
        const afkData = afkUsers.get(mentionedAfkKey);
        const duration = Math.floor((Date.now() - afkData.since) / 60000);
        await message.reply(`😴 **${mentionedUser.username}** est AFK depuis ${duration} minute(s) : ${afkData.reason}`).catch(() => {});
      }
    }
  }
  
  // Automod
  if (gCfg.automodEnabled) {
    const member = message.member;
    if (!member) return;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return;
    
    // Anti-spam
    if (gCfg.antiSpam && checkSpam(message.author.id, message.guild.id)) {
      try {
        await message.delete();
        await message.member.timeout(60000, 'Anti-spam');
        const ch = message.guild.channels.cache.get(gCfg.logChannel);
        if (ch) {
          await ch.send(`🔇 **${message.author.username}** muté (anti-spam)`);
        }
        return;
      } catch (e) {}
    }
    
    // Anti-link
    if (gCfg.antiLink) {
      const linkRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;
      if (linkRegex.test(message.content)) {
        if (!gCfg.automodLinkWhitelist.some(domain => message.content.includes(domain))) {
          try {
            await message.delete();
            const ch = message.guild.channels.cache.get(gCfg.logChannel);
            if (ch) {
              await ch.send(`🔗 **${message.author.username}** - Lien supprimé`);
            }
            return;
          } catch (e) {}
        }
      }
    }
    
    // Bad words
    if (gCfg.automodWordFilter && gCfg.badWords.length > 0) {
      const lower = message.content.toLowerCase();
      if (gCfg.badWords.some(word => lower.includes(word.toLowerCase()))) {
        try {
          await message.delete();
          const ch = message.guild.channels.cache.get(gCfg.logChannel);
          if (ch) {
            await ch.send(`🤐 **${message.author.username}** - Mot interdit supprimé`);
          }
          return;
        } catch (e) {}
      }
    }
    
    // Caps filter
    if (gCfg.automodCapsFilter) {
      const upper = message.content.replace(/[^A-Z]/g, '').length;
      const total = message.content.replace(/[^a-zA-Z]/g, '').length;
      if (total > 10 && (upper / total * 100) > gCfg.automodCapsLimit) {
        try {
          await message.delete();
          return;
        } catch (e) {}
      }
    }
    
    // Max length
    if (message.content.length > gCfg.maxMessageLength) {
      try {
        await message.delete();
        return;
      } catch (e) {}
    }
  }
  
  // XP
  if (gCfg.levelEnabled && !gCfg.ignoredChannels.includes(message.channel.id)) {
    const levelUp = addXp(message.author.id, message.guild.id);
    if (levelUp && gCfg.levelUpChannel) {
      const ch = message.guild.channels.cache.get(gCfg.levelUpChannel);
      if (ch) {
        const msg = gCfg.levelUpMessage
          .replace('{user}', message.author.toString())
          .replace('{level}', levelUp.toString());
        await ch.send(msg);
      }
      
      // Role rewards
      if (gCfg.roleRewards[levelUp]) {
        try {
          const role = message.guild.roles.cache.get(gCfg.roleRewards[levelUp]);
          if (role) await message.member.roles.add(role);
        } catch (e) {}
      }
    }
  }
  
  // Custom commands
  if (gCfg.customCommands) {
    const customCmd = gCfg.customCommands.find(c => message.content.toLowerCase() === `${gCfg.prefix}${c.name.toLowerCase()}`);
    if (customCmd) {
      await message.channel.send(customCmd.response);
    }
  }
});

// VOICE STATE (logs + recording)
client.on('voiceStateUpdate', async (oldState, newState) => {
  const gCfg = cfg(oldState.guild.id);

  // Logs vocaux
  if (gCfg.logChannel && gCfg.logsVoice) {
    const ch = oldState.guild.channels.cache.get(gCfg.logChannel);
    if (ch) {
      if (!oldState.channel && newState.channel) {
        const embed = new EmbedBuilder()
          .setColor('#3498db')
          .setTitle('🔊 Voice Join')
          .addFields(
            { name: 'Membre', value: `${oldState.member.user.username}`, inline: true },
            { name: 'Salon', value: newState.channel.name, inline: true }
          )
          .setTimestamp();
        await ch.send({ embeds: [embed] });
      } else if (oldState.channel && !newState.channel) {
        const embed = new EmbedBuilder()
          .setColor('#e67e22')
          .setTitle('🔇 Voice Leave')
          .addFields(
            { name: 'Membre', value: `${oldState.member.user.username}`, inline: true },
            { name: 'Salon', value: oldState.channel.name, inline: true }
          )
          .setTimestamp();
        await ch.send({ embeds: [embed] });
      }
    }
  }

  // Voice recording auto-join
  if (gCfg.voiceRecordEnabled && gCfg.voiceRecordChannel) {
    const guild = oldState.guild;

    // User joined a voice channel
    if (!oldState.channel && newState.channel) {
      if (newState.id === client.user.id) return;

      if (!activeRecordings.has(guild.id)) {
        const logChannel = guild.channels.cache.get(gCfg.voiceRecordChannel);
        if (logChannel) {
          try {
            const recorder = new VoiceRecorder(guild, newState.channel, logChannel);
            recorder.start();
            activeRecordings.set(guild.id, recorder);
          } catch {}
        }
      }
    }

    // User left a voice channel
    if (oldState.channel && !newState.channel) {
      const recorder = activeRecordings.get(guild.id);
      if (recorder && recorder.voiceChannel.id === oldState.channel.id) {
        const membersInChannel = oldState.channel.members.filter(m => !m.user.bot);
        if (membersInChannel.size === 0) {
          activeRecordings.delete(guild.id);
          recorder.stop();
        }
      }
    }
  }
});

// CHANNEL DELETE (logs)
client.on('channelDelete', async (channel) => {
  const gCfg = cfg(channel.guild.id);
  if (!gCfg.logChannel || !gCfg.logsServer) return;
  const ch = channel.guild.channels.cache.get(gCfg.logChannel);
  if (!ch) return;
  
  const embed = new EmbedBuilder()
    .setColor('#e74c3c')
    .setTitle('🗑️ Salon supprimé')
    .addFields(
      { name: 'Salon', value: channel.name, inline: true },
      { name: 'Type', value: channel.type.toString(), inline: true }
    )
    .setTimestamp();
  await ch.send({ embeds: [embed] });
});

// CHANNEL CREATE (logs)
client.on('channelCreate', async (channel) => {
  const gCfg = cfg(channel.guild.id);
  if (!gCfg.logChannel || !gCfg.logsServer) return;
  const ch = channel.guild.channels.cache.get(gCfg.logChannel);
  if (!ch) return;
  
  const embed = new EmbedBuilder()
    .setColor('#2ecc71')
    .setTitle('➕ Salon créé')
    .addFields(
      { name: 'Salon', value: channel.name, inline: true },
      { name: 'Type', value: channel.type.toString(), inline: true }
    )
    .setTimestamp();
  await ch.send({ embeds: [embed] });
});

// MESSAGE DELETE (logs)
client.on('messageDelete', async (message) => {
  if (!message.guild) return;
  const gCfg = cfg(message.guild.id);
  if (!gCfg.logChannel || !gCfg.logsMessages) return;
  if (message.author?.bot) return;
  const ch = message.guild.channels.cache.get(gCfg.logChannel);
  if (!ch) return;
  
  const embed = new EmbedBuilder()
    .setColor('#e74c3c')
    .setTitle('🗑️ Message supprimé')
    .addFields(
      { name: 'Auteur', value: message.author?.username || 'Inconnu', inline: true },
      { name: 'Salon', value: message.channel.name, inline: true },
      { name: 'Contenu', value: message.content?.substring(0, 1000) || 'Vide', inline: false }
    )
    .setTimestamp();
  await ch.send({ embeds: [embed] });
});

// MESSAGE EDIT (logs)
client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!oldMessage.guild) return;
  if (oldMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  const gCfg = cfg(oldMessage.guild.id);
  if (!gCfg.logChannel || !gCfg.logsMessages) return;
  const ch = oldMessage.guild.channels.cache.get(gCfg.logChannel);
  if (!ch) return;
  
  const embed = new EmbedBuilder()
    .setColor('#f39c12')
    .setTitle('📝 Message modifié')
    .addFields(
      { name: 'Auteur', value: oldMessage.author?.username || 'Inconnu', inline: true },
      { name: 'Salon', value: oldMessage.channel.name, inline: true },
      { name: 'Avant', value: oldMessage.content?.substring(0, 500) || 'Vide', inline: false },
      { name: 'Après', value: newMessage.content?.substring(0, 500) || 'Vide', inline: false }
    )
    .setTimestamp();
  await ch.send({ embeds: [embed] });
});

// ===================== COMMANDES =====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName } = interaction;
  const gCfg = interaction.guild ? cfg(interaction.guild.id) : getDefaultConfig();
  
  // PANEL
  if (commandName === 'panel') {
    const panelUrl = process.env.PANEL_URL || `http://localhost:${process.env.PORT || 3000}/panel`;
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle('📋 Panel de Contrôle')
      .setDescription('Gère ton serveur directement depuis le panel web.')
      .addFields(
        { name: '🌐 Accès au panel', value: `[Clique ici pour ouvrir le panel](${panelUrl})`, inline: false },
        { name: '⚙️ Fonctionnalités', value: '• Configuration générale\n• Automodération\n• Modération\n• Tickets\n• Niveaux\n• Musique\n• Logs\n• Backup & Nuke', inline: false }
      )
      .setThumbnail(interaction.client.user.displayAvatarURL())
      .setTimestamp();
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('📋 Ouvrir le Panel')
          .setURL(panelUrl)
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel('➕ Inviter le Bot')
          .setURL('https://discord.com/oauth2/authorize?client_id=1544851212187340881&scope=bot+applications.commands&permissions=8')
          .setStyle(ButtonStyle.Link)
      );
    
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
  
  // HELP
  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle('📖 Liste des commandes')
      .setDescription('Voici toutes les commandes disponibles :')
      .addFields(
        { name: '🔧 Utilitaires', value: '`/help` `/ping` `/avatar` `/userinfo` `/serverinfo` `/roleinfo` `/roles` `/members` `/boosters` `/emojis` `/invites`', inline: false },
        { name: '🛡️ Modération', value: '`/ban` `/banid` `/kick` `/mute` `/unmute` `/clear` `/warn` `/unwarn` `/warns` `/tempban` `/softban` `/nick` `/slowmode` `/lock` `/unlock` `/hide` `/unhide` `/clone` `/giverole` `/removerole` `/massrole` `/history`', inline: false },
        { name: '💰 Économie', value: '`/balance` `/daily` `/work` `/deposit` `/withdraw` `/pay` `/economyleaderboard` `/shop`', inline: false },
        { name: '📈 Niveaux', value: '`/rank` `/leaderboard` `/setlevel`', inline: false },
        { name: '🎫 Tickets', value: '`/ticket` `/close` `/add` `/remove`', inline: false },
        { name: '⭐ Social', value: '`/starboard` `/setupreactionrole` `/afk`', inline: false },
        { name: '🎮 Fun', value: '`/meme` `/8ball` `/poll` `/coinflip` `/roll`', inline: false },
        { name: '⏰ Utilitaires', value: '`/remind`', inline: false },
        { name: '⚙️ Admin', value: '`/nuke` `/backup` `/restore` `/backups` `/say` `/embed` `/status` `/reloadconfig` `/setwelcomechannel` `/setlogchannel` `/setautorole` `/setmodrole` `/setlevel` `/stoprecord`', inline: false }
      )
      .setFooter({ text: 'Kycks Bot • Fait avec ❤️' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // PING
  if (commandName === 'ping') {
    await interaction.reply(`🏓 Pong ! Latence: ${client.ws.ping}ms`);
  }
  
  // BAN
  if (commandName === 'ban') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison') || 'Banni depuis Kycks';
    try {
      const member = await interaction.guild.members.fetch(user.id);
      if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Tu ne peux pas bannir quelqu\'un avec un rôle égal ou supérieur.', ephemeral: true });
      }
      await member.ban({ reason });
      addPunishment(interaction.guild.id, user.id, 'ban', interaction.user.username, reason);
      if (gCfg.logChannel && gCfg.logsModeration) {
        const logCh = interaction.guild.channels.cache.get(gCfg.logChannel);
        if (logCh) {
          const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🔨 Ban').addFields(
            { name: 'Utilisateur', value: `${user.username} (${user.id})`, inline: true },
            { name: 'Modérateur', value: interaction.user.username, inline: true },
            { name: 'Raison', value: reason, inline: false }
          ).setTimestamp();
          logCh.send({ embeds: [embed] }).catch(() => {});
        }
      }
      await interaction.reply(`🔨 **${user.username}** a été banni. Raison: ${reason}`);
    } catch (error) {
      await interaction.reply(`❌ Je ne peux pas bannir cet utilisateur.`);
    }
  }
  
  // BANID
  if (commandName === 'banid') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const userId = interaction.options.getString('userid');
    const reason = interaction.options.getString('raison') || 'Banni depuis Kycks';
    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply('❌ ID invalide. Doit être un ID Discord valide (17-20 chiffres).');
    }
    try {
      await interaction.guild.members.ban(userId, { reason });
      addPunishment(interaction.guild.id, userId, 'ban', interaction.user.username, reason);
      await interaction.reply(`🔨 L'utilisateur avec l'ID **${userId}** a été banni. Raison: ${reason}`);
    } catch (error) {
      await interaction.reply(`❌ Impossible de bannir cet utilisateur. Vérifie l'ID et tes permissions.`);
    }
  }
  
  // KICK
  if (commandName === 'kick') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison') || 'Expulsé depuis Kycks';
    try {
      const member = await interaction.guild.members.fetch(user.id);
      if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Tu ne peux pas expulser quelqu\'un avec un rôle égal ou supérieur.', ephemeral: true });
      }
      await member.kick(reason);
      addPunishment(interaction.guild.id, user.id, 'kick', interaction.user.username, reason);
      if (gCfg.logChannel && gCfg.logsModeration) {
        const logCh = interaction.guild.channels.cache.get(gCfg.logChannel);
        if (logCh) {
          const embed = new EmbedBuilder().setColor('#e67e22').setTitle('👢 Kick').addFields(
            { name: 'Utilisateur', value: `${user.username} (${user.id})`, inline: true },
            { name: 'Modérateur', value: interaction.user.username, inline: true },
            { name: 'Raison', value: reason, inline: false }
          ).setTimestamp();
          logCh.send({ embeds: [embed] }).catch(() => {});
        }
      }
      await interaction.reply(`👢 **${user.username}** a été expulsé. Raison: ${reason}`);
    } catch (error) {
      await interaction.reply(`❌ Je ne peux pas expulser cet utilisateur.`);
    }
  }
  
  // MUTE
  if (commandName === 'mute') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    const duration = interaction.options.getInteger('duree') || 10;
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.timeout(duration * 60 * 1000, `Mute par ${interaction.user.username}`);
      addPunishment(interaction.guild.id, user.id, 'mute', interaction.user.username, `${duration} min`);
      if (gCfg.logChannel && gCfg.logsModeration) {
        const logCh = interaction.guild.channels.cache.get(gCfg.logChannel);
        if (logCh) {
          const embed = new EmbedBuilder().setColor('#3498db').setTitle('🔇 Mute').addFields(
            { name: 'Utilisateur', value: `${user.username} (${user.id})`, inline: true },
            { name: 'Modérateur', value: interaction.user.username, inline: true },
            { name: 'Durée', value: `${duration} minutes`, inline: true }
          ).setTimestamp();
          logCh.send({ embeds: [embed] }).catch(() => {});
        }
      }
      await interaction.reply(`🔇 **${user.username}** mute pendant ${duration} minutes.`);
    } catch (error) {
      await interaction.reply(`❌ Je ne peux pas mute cet utilisateur.`);
    }
  }
  
  // UNMUTE
  if (commandName === 'unmute') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.timeout(null);
      await interaction.reply(`🔊 **${user.username}** a été unmute.`);
    } catch (error) {
      await interaction.reply(`❌ Je ne peux pas unmute cet utilisateur.`);
    }
  }
  
  // CLEAR
  if (commandName === 'clear') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const amount = interaction.options.getInteger('nombre');
    if (amount < 1 || amount > 100) return interaction.reply('❌ Nombre invalide (1-100)');
    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);
      if (gCfg.logChannel && gCfg.logsModeration) {
        const logCh = interaction.guild.channels.cache.get(gCfg.logChannel);
        if (logCh) {
          const embed = new EmbedBuilder().setColor('#9b59b6').setTitle('🗑️ Clear').addFields(
            { name: 'Salon', value: interaction.channel.name, inline: true },
            { name: 'Modérateur', value: interaction.user.username, inline: true },
            { name: 'Messages supprimés', value: deleted.size.toString(), inline: true }
          ).setTimestamp();
          logCh.send({ embeds: [embed] }).catch(() => {});
        }
      }
      await interaction.reply(`🗑️ ${deleted.size} messages supprimés.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible de supprimer les messages.`);
    }
  }
  
  // WARN
  if (commandName === 'warn') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison') || 'Aucune raison';
    const count = addWarn(user.id, interaction.guild.id, reason, interaction.user.username);
    addPunishment(interaction.guild.id, user.id, 'warn', interaction.user.username, reason);
    
    if (gCfg.logChannel && gCfg.logsModeration) {
      const logCh = interaction.guild.channels.cache.get(gCfg.logChannel);
      if (logCh) {
        const embed = new EmbedBuilder().setColor('#f39c12').setTitle('⚠️ Warn').addFields(
          { name: 'Utilisateur', value: `${user.username} (${user.id})`, inline: true },
          { name: 'Modérateur', value: interaction.user.username, inline: true },
          { name: 'Raison', value: reason, inline: true },
          { name: 'Total', value: `${count}/${gCfg.warnLimit}`, inline: true }
        ).setTimestamp();
        logCh.send({ embeds: [embed] }).catch(() => {});
      }
    }
    
    await interaction.reply(`⚠️ **${user.username}** a été warn. (${count}/${gCfg.warnLimit} warns)`);
    
    if (count >= gCfg.warnLimit) {
      try {
        const member = await interaction.guild.members.fetch(user.id);
        if (gCfg.warnAction === 'ban') {
          await member.ban({ reason: `${gCfg.warnLimit} warns atteints` });
          addPunishment(interaction.guild.id, user.id, 'ban', 'Système', `${gCfg.warnLimit} warns`);
          await interaction.followUp(`🔨 **${user.username}** a été banni (${gCfg.warnLimit} warns)`);
        } else if (gCfg.warnAction === 'kick') {
          await member.kick(`${gCfg.warnLimit} warns atteints`);
          addPunishment(interaction.guild.id, user.id, 'kick', 'Système', `${gCfg.warnLimit} warns`);
          await interaction.followUp(`👢 **${user.username}** a été expulsé (${gCfg.warnLimit} warns)`);
        } else if (gCfg.warnAction === 'mute') {
          await member.timeout(60 * 60 * 1000, `${gCfg.warnLimit} warns atteints`);
          addPunishment(interaction.guild.id, user.id, 'mute', 'Système', `${gCfg.warnLimit} warns`);
          await interaction.followUp(`🔇 **${user.username}** a été mute (${gCfg.warnLimit} warns)`);
        }
        clearWarns(user.id, interaction.guild.id);
      } catch (e) {}
    }
  }
  
  // UNWARN
  if (commandName === 'unwarn') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    clearWarns(user.id, interaction.guild.id);
    await interaction.reply(`✅ Warns de **${user.username}** supprimés.`);
  }
  
  // WARNS
  if (commandName === 'warns') {
    const user = interaction.options.getUser('utilisateur') || interaction.user;
    const userWarns = getWarns(user.id, interaction.guild.id);
    
    const embed = new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle(`⚠️ Warns de ${user.username}`)
      .setDescription(userWarns.length === 0 ? 'Aucun warn.' : userWarns.map((w, i) => `**${i+1}.** ${w.reason} (par ${w.moderator})`).join('\n'))
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
  
  // TEMPBAN
  if (commandName === 'tempban') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    const duration = interaction.options.getInteger('duree');
    const reason = interaction.options.getString('raison') || 'Tempban';
    try {
      const member = await interaction.guild.members.fetch(user.id);
      if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Tu ne peux pas bannir quelqu\'un avec un rôle égal ou supérieur.', ephemeral: true });
      }
      await member.ban({ reason });
      const expiresAt = Date.now() + (duration * 24 * 60 * 60 * 1000);
      addTempban(interaction.guild.id, user.id, expiresAt);
      addPunishment(interaction.guild.id, user.id, 'tempban', interaction.user.username, `${duration}j - ${reason}`);
      if (gCfg.logChannel && gCfg.logsModeration) {
        const logCh = interaction.guild.channels.cache.get(gCfg.logChannel);
        if (logCh) {
          const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🔨 Tempban').addFields(
            { name: 'Utilisateur', value: `${user.username} (${user.id})`, inline: true },
            { name: 'Modérateur', value: interaction.user.username, inline: true },
            { name: 'Durée', value: `${duration} jour(s)`, inline: true },
            { name: 'Raison', value: reason, inline: false }
          ).setTimestamp();
          logCh.send({ embeds: [embed] }).catch(() => {});
        }
      }
      await interaction.reply(`🔨 **${user.username}** banni pendant ${duration} jour(s).`);
    } catch (error) {
      await interaction.reply(`❌ Impossible de bannir.`);
    }
  }
  
  // SOFTBAN
  if (commandName === 'softban') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison') || 'Softban';
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.ban({ reason, deleteMessageDays: 7 });
      await interaction.guild.members.unban(user.id);
      addPunishment(interaction.guild.id, user.id, 'softban', interaction.user.username, reason);
      await interaction.reply(`🔨 **${user.username}** softbanni.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // NICK
  if (commandName === 'nick') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    const nick = interaction.options.getString('pseudo');
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.setNickname(nick);
      await interaction.reply(`✅ Pseudo changé en **${nick}**.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible de changer le pseudo.`);
    }
  }
  
  // SLOWMODE
  if (commandName === 'slowmode') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const seconds = interaction.options.getInteger('secondes');
    try {
      await interaction.channel.setRateLimitPerUser(seconds);
      await interaction.reply(`⏱️ Slowmode: ${seconds === 0 ? 'désactivé' : seconds + ' secondes'}.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // LOCK
  if (commandName === 'lock') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      await interaction.reply(`🔒 Salon verrouillé.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // UNLOCK
  if (commandName === 'unlock') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: true });
      await interaction.reply(`🔓 Salon déverrouillé.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // HIDE
  if (commandName === 'hide') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
      await interaction.reply(`🙈 Salon caché.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // UNHIDE
  if (commandName === 'unhide') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: true });
      await interaction.reply(`👁️ Salon visible.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // CLONE
  if (commandName === 'clone') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('salon');
    try {
      const cloned = await channel.clone({ reason: `Cloné par ${interaction.user.username}` });
      await cloned.setPosition(channel.position + 1);
      await interaction.reply(`📋 Salon **${channel.name}** cloné en **${cloned.name}**.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible de cloner.`);
    }
  }
  
  // NUKE
  if (commandName === 'nuke') {
    if (!gCfg.nukeEnabled) {
      return interaction.reply('❌ La commande nuke est désactivée.');
    }

    if (!gCfg.nukeOwnerId) {
      return interaction.reply('❌ Aucun propriétaire configuré. Configure l\'ID du propriétaire (👑) dans le panel.');
    }

    if (interaction.user.id !== gCfg.nukeOwnerId) {
      return interaction.reply('❌ Seul le propriétaire du serveur (👑) peut nuker.');
    }
    
    const confirmRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('nuke_confirm')
          .setLabel('⚠️ OUI, NUKE LE SERVEUR')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('nuke_cancel')
          .setLabel('❌ Annuler')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await interaction.reply({
      content: '⚠️ **ATTENTION** : Cette action va supprimer TOUS les salons du serveur !\nUne sauvegarde sera créée automatiquement.\n\nÊtes-vous sûr ?',
      components: [confirmRow],
      ephemeral: false
    });
  }
  
  // BACKUP
  if (commandName === 'backup') {
    try {
      await interaction.deferReply();
      const backup = await createBackup(interaction.guild);
      await interaction.editReply(`✅ Sauvegarde créée: **${backup.name}**\n📁 ${backup.channels.length} salons, ${backup.roles.length} rôles sauvegardés.`);
    } catch (error) {
      await interaction.editReply(`❌ Erreur: ${error.message}`);
    }
  }
  
  // RESTORE
  if (commandName === 'restore') {
    const name = interaction.options.getString('nom');
    try {
      await interaction.deferReply();
      await restoreBackup(interaction.guild, name);
      await interaction.editReply(`✅ Serveur restauré depuis **${name}**.`);
    } catch (error) {
      await interaction.editReply(`❌ Erreur: ${error.message}`);
    }
  }
  
  // BACKUPS
  if (commandName === 'backups') {
    const files = fs.readdirSync(BACKUPS_PATH).filter(f => f.endsWith('.json'));
    const list = files.map(f => f.replace('.json', '')).join('\n') || 'Aucune sauvegarde.';
    
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle('📁 Sauvegardes')
      .setDescription(list)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
  
  // USERINFO
  if (commandName === 'userinfo') {
    const user = interaction.options.getUser('utilisateur') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id);
    
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle(`👤 Info: ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'pseudo', value: user.username, inline: true },
        { name: 'ID', value: user.id, inline: true },
        { name: 'Compte créé', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'A rejoint', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: 'Rôles', value: member.roles.cache.map(r => r.toString()).join(' ') || 'Aucun', inline: false }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
  
  // SERVERINFO
  if (commandName === 'serverinfo') {
    const guild = interaction.guild;
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle(`🏰 ${guild.name}`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: 'Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Membres', value: guild.memberCount.toString(), inline: true },
        { name: 'Salons', value: guild.channels.cache.size.toString(), inline: true },
        { name: 'Rôles', value: guild.roles.cache.size.toString(), inline: true },
        { name: 'Créé le', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Boost', value: guild.premiumSubscriptionCount?.toString() || '0', inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // AVATAR
  if (commandName === 'avatar') {
    const user = interaction.options.getUser('utilisateur') || interaction.user;
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle(`🖼️ Avatar de ${user.username}`)
      .setImage(user.displayAvatarURL({ size: 1024 }))
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // ROLEINFO
  if (commandName === 'roleinfo') {
    const role = interaction.options.getRole('role');
    const embed = new EmbedBuilder()
      .setColor(role.hexColor)
      .setTitle(`🏷️ Rôle: ${role.name}`)
      .addFields(
        { name: 'ID', value: role.id, inline: true },
        { name: 'Couleur', value: role.hexColor, inline: true },
        { name: 'Membres', value: role.members.size.toString(), inline: true },
        { name: 'Mentionnable', value: role.mentionable ? 'Oui' : 'Non', inline: true },
        { name: 'Affiché séparément', value: role.hoist ? 'Oui' : 'Non', inline: true },
        { name: 'Créé le', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // ROLES
  if (commandName === 'roles') {
    const roles = interaction.guild.roles.cache
      .filter(r => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(r => `${r} (${r.members.size})`)
      .join('\n');
    
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle('🏷️ Rôles du serveur')
      .setDescription(roles || 'Aucun rôle')
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // MEMBERS
  if (commandName === 'members') {
    const roles = interaction.guild.roles.cache
      .filter(r => r.name !== '@everyone' && r.members.size > 0)
      .sort((a, b) => b.members.size - a.members.size)
      .map(r => `${r.name}: ${r.members.size}`)
      .join('\n');
    
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle('👥 Membres par rôle')
      .setDescription(roles || 'Aucun')
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // BOOSTERS
  if (commandName === 'boosters') {
    const boosters = interaction.guild.members.cache
      .filter(m => m.premiumSince)
      .map(m => `${m.user.username} - depuis <t:${Math.floor(m.premiumSinceTimestamp / 1000)}:R>`)
      .join('\n') || 'Aucun booster.';
    
    const embed = new EmbedBuilder()
      .setColor('#f47fff')
      .setTitle('💎 Boosters')
      .setDescription(boosters)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // EMOJIS
  if (commandName === 'emojis') {
    const emojis = interaction.guild.emojis.cache.map(e => `${e} \`:${e.name}:\``).join(' ') || 'Aucun emoji.';
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle('😀 Emojis')
      .setDescription(emojis)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // INVITES
  if (commandName === 'invites') {
    const invites = await interaction.guild.invites.fetch();
    const total = invites.reduce((acc, inv) => acc + inv.uses, 0);
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle('📨 Invitations')
      .setDescription(`Total: **${total}** invitations\nSalons: **${invites.size}** liens actifs`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // POLL
  if (commandName === 'poll') {
    if (!gCfg.pollEnabled) {
      return interaction.reply({ content: '❌ Sondages désactivés.', ephemeral: true });
    }
    const question = interaction.options.getString('question');
    const optionsStr = interaction.options.getString('options');
    
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle(`📊 ${question}`)
      .setTimestamp();
    
    if (optionsStr) {
      const options = optionsStr.split(';').map(o => o.trim());
      const reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      let description = '';
      options.forEach((opt, i) => {
        if (i < reactions.length) description += `${reactions[i]} ${opt}\n`;
      });
      embed.setDescription(description);
      
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      for (let i = 0; i < options.length && i < reactions.length; i++) {
        await msg.react(reactions[i]);
      }
    } else {
      embed.setDescription('✅ Oui\n❌ Non');
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      await msg.react('✅');
      await msg.react('❌');
    }
  }
  
  // REMIND
  if (commandName === 'remind') {
    if (!gCfg.reminderEnabled) {
      return interaction.reply({ content: '❌ Rappels désactivés.', ephemeral: true });
    }
    const message = interaction.options.getString('message');
    const minutes = interaction.options.getInteger('minutes');
    
    await interaction.reply(`⏰ Rappel dans ${minutes} minute(s).`);
    
    setTimeout(async () => {
      try {
        await interaction.user.send(`⏰ Rappel: ${message}`);
      } catch (e) {
        await interaction.channel.send(`${interaction.user.toString()} ⏰ Rappel: ${message}`);
      }
    }, minutes * 60 * 1000);
  }
  
  // 8BALL
  if (commandName === '8ball') {
    const question = interaction.options.getString('question');
    const responses = [
      '🎱 Oui !', '🎱 Non.', '🎱 Peut-être...', '🎱 Je ne sais pas.',
      '🎱 Certainement !', '🎱 Pas du tout.', '🎱 Demande-moi plus tard.',
      '🎱 C\'est probable.', '🎱 Je doute.', '🎱 Absolument !'
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];
    
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle('🎱 Magic 8-Ball')
      .addFields(
        { name: 'Question', value: question, inline: false },
        { name: 'Réponse', value: response, inline: false }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // MEME
  if (commandName === 'meme') {
    const memes = [
      'https://i.imgur.com/3dYtO0D.jpg', 'https://i.imgur.com/L4GFq6p.jpg',
      'https://i.imgur.com/0zWvJ0X.jpg'
    ];
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle('😂 Mème aléatoire')
      .setImage(memes[Math.floor(Math.random() * memes.length)])
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // COINFLIP
  if (commandName === 'coinflip') {
    const result = Math.random() < 0.5 ? '🪙 Pile' : '🪙 Face';
    await interaction.reply(result);
  }
  
  // ROLL
  if (commandName === 'roll') {
    const faces = interaction.options.getInteger('faces') || 6;
    const result = Math.floor(Math.random() * faces) + 1;
    await interaction.reply(`🎲 ${result}`);
  }
  
  // RANK
  if (commandName === 'rank') {
    if (!gCfg.levelEnabled) {
      return interaction.reply({ content: '❌ Système de niveaux désactivé.', ephemeral: true });
    }
    const userData = getXp(interaction.user.id, interaction.guild.id);
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle(`📈 Niveau de ${interaction.user.username}`)
      .addFields(
        { name: 'Niveau', value: userData.level.toString(), inline: true },
        { name: 'XP', value: userData.xp.toString(), inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // LEADERBOARD
  if (commandName === 'leaderboard') {
    if (!gCfg.levelEnabled) {
      return interaction.reply({ content: '❌ Système de niveaux désactivé.', ephemeral: true });
    }
    const guildData = Object.entries(xpData)
      .filter(([key]) => key.startsWith(interaction.guild.id + '_'))
      .map(([key, val]) => ({
        userId: key.split('_')[1],
        ...val
      }))
      .sort((a, b) => b.level - a.level || b.xp - a.xp)
      .slice(0, 10);
    
    const description = guildData.map((d, i) => 
      `**${i+1}.** <@${d.userId}> - Niveau ${d.level} (${d.xp} XP)`
    ).join('\n') || 'Aucune donnée.';
    
    const embed = new EmbedBuilder()
      .setColor(gCfg.embedColor)
      .setTitle('🏆 Classement')
      .setDescription(description)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // SETLEVEL
  if (commandName === 'setlevel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin uniquement.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    const level = interaction.options.getInteger('niveau');
    const key = `${interaction.guild.id}_${user.id}`;
    if (!xpData[key]) xpData[key] = { xp: 0, level: 0, lastXp: 0 };
    xpData[key].level = level;
    xpData[key].xp = level * level * 100;
    saveJsonFile(XP_DATA_PATH, xpData);
    await interaction.reply(`✅ Niveau de **${user.username}** mis à jour: ${level}`);
  }
  
  // SAY
  if (commandName === 'say') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions.', ephemeral: true });
    }
    const message = interaction.options.getString('message');
    await interaction.channel.send(message);
    await interaction.reply({ content: '✅ Message envoyé !', ephemeral: true });
  }
  
  // EMBED
  if (commandName === 'embed') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions.', ephemeral: true });
    }
    const titre = interaction.options.getString('titre');
    const message = interaction.options.getString('message');
    const couleur = interaction.options.getString('couleur') || gCfg.embedColor;
    
    const embed = new EmbedBuilder()
      .setColor(couleur)
      .setTitle(titre)
      .setDescription(message)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // STATUS
  if (commandName === 'status') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin uniquement.', ephemeral: true });
    }
    const newStatus = interaction.options.getString('statut');
    gCfg.status = newStatus;
    setGuildCfg(interaction.guild.id, gCfg);
    client.user.setActivity(newStatus);
    await interaction.reply(`✅ Status: **${newStatus}**`);
  }
  
  // AFK (enhanced)
  if (commandName === 'afk') {
    const reason = interaction.options.getString('raison') || 'AFK';
    afkUsers.set(`${interaction.guild.id}_${interaction.user.id}`, {
      reason,
      since: Date.now()
    });
    await interaction.reply(`😴 **${interaction.user.username}** est AFK: ${reason}`);
  }
  
  // HISTORY
  if (commandName === 'history') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions de modération.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur') || interaction.user;
    const history = getPunishments(interaction.guild.id, user.id);
    
    const embed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle(`📋 Historique de ${user.username}`)
      .setDescription(history.length === 0 ? 'Aucune sanction.' : history.map((p, i) => {
        const icons = { ban: '🔨', kick: '👢', mute: '🔇', warn: '⚠️', tempban: '🔨', softban: '🔨' };
        return `**${i+1}.** ${icons[p.type] || '❓'} ${p.type} par **${p.moderator}** — ${p.reason} (<t:${Math.floor(new Date(p.date).getTime() / 1000)}:R>)`;
      }).join('\n'))
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
  
  // ECONOMY COMMANDS
  if (commandName === 'balance') {
    if (!gCfg.economyEnabled) {
      return interaction.reply({ content: '❌ Système économique désactivé.', ephemeral: true });
    }
    const eco = getEconomy(interaction.user.id, interaction.guild.id);
    const embed = new EmbedBuilder()
      .setColor('#f1c40f')
      .setTitle(`💰 Solde de ${interaction.user.username}`)
      .addFields(
        { name: '💵 Portefeuille', value: `${eco.balance} ${gCfg.economyCurrency || '💰 Coins'}`, inline: true },
        { name: '🏦 Banque', value: `${eco.bank} ${gCfg.economyCurrency || '💰 Coins'}`, inline: true },
        { name: '📊 Total', value: `${eco.balance + eco.bank} ${gCfg.economyCurrency || '💰 Coins'}`, inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  if (commandName === 'daily') {
    if (!gCfg.economyEnabled) {
      return interaction.reply({ content: '❌ Système économique désactivé.', ephemeral: true });
    }
    const eco = getEconomy(interaction.user.id, interaction.guild.id);
    const now = Date.now();
    if (now - eco.lastDaily < 24 * 60 * 60 * 1000) {
      const remaining = 24 * 60 * 60 * 1000 - (now - eco.lastDaily);
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
      return interaction.reply({ content: `⏰ Tu dois attendre encore ${hours}h ${mins}min.`, ephemeral: true });
    }
    const amount = gCfg.economyDailyAmount || 100;
    eco.balance += amount;
    eco.lastDaily = now;
    saveEconomy();
    await interaction.reply(`💰 Tu as reçu **${amount} ${gCfg.economyCurrency || '💰 Coins'}** !`);
  }
  
  if (commandName === 'work') {
    if (!gCfg.economyEnabled) {
      return interaction.reply({ content: '❌ Système économique désactivé.', ephemeral: true });
    }
    const eco = getEconomy(interaction.user.id, interaction.guild.id);
    const now = Date.now();
    if (now - eco.lastWork < 30 * 60 * 1000) {
      const remaining = 30 * 60 * 1000 - (now - eco.lastWork);
      const mins = Math.floor(remaining / (60 * 1000));
      return interaction.reply({ content: `⏰ Tu dois attendre encore ${mins} minute(s).`, ephemeral: true });
    }
    const baseAmount = gCfg.economyWorkAmount || 50;
    const amount = Math.floor(baseAmount * (0.5 + Math.random()));
    eco.balance += amount;
    eco.lastWork = now;
    saveEconomy();
    const jobs = ['développeur', 'boulanger', 'pompier', 'médecin', 'professeur', 'artiste', 'cuisinier', 'livreur'];
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    await interaction.reply(`🔨 Tu as travaillé comme **${job}** et gagné **${amount} ${gCfg.economyCurrency || '💰 Coins'}** !`);
  }
  
  if (commandName === 'deposit') {
    if (!gCfg.economyEnabled) {
      return interaction.reply({ content: '❌ Système économique désactivé.', ephemeral: true });
    }
    const eco = getEconomy(interaction.user.id, interaction.guild.id);
    const amount = interaction.options.getInteger('montant');
    if (amount <= 0) return interaction.reply({ content: '❌ Montant invalide.', ephemeral: true });
    if (amount > eco.balance) return interaction.reply({ content: '❌ Tu n\'as pas assez.', ephemeral: true });
    eco.balance -= amount;
    eco.bank += amount;
    saveEconomy();
    await interaction.reply(`🏦 **${amount}** déposés en banque.`);
  }
  
  if (commandName === 'withdraw') {
    if (!gCfg.economyEnabled) {
      return interaction.reply({ content: '❌ Système économique désactivé.', ephemeral: true });
    }
    const eco = getEconomy(interaction.user.id, interaction.guild.id);
    const amount = interaction.options.getInteger('montant');
    if (amount <= 0) return interaction.reply({ content: '❌ Montant invalide.', ephemeral: true });
    if (amount > eco.bank) return interaction.reply({ content: '❌ Pas assez en banque.', ephemeral: true });
    eco.bank -= amount;
    eco.balance += amount;
    saveEconomy();
    await interaction.reply(`💵 **${amount}** retirés de la banque.`);
  }
  
  if (commandName === 'pay') {
    if (!gCfg.economyEnabled) {
      return interaction.reply({ content: '❌ Système économique désactivé.', ephemeral: true });
    }
    const target = interaction.options.getUser('utilisateur');
    const amount = interaction.options.getInteger('montant');
    if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Tu ne peux pas te payer à toi-même.', ephemeral: true });
    if (target.bot) return interaction.reply({ content: '❌ Tu ne peux pas payer un bot.', ephemeral: true });
    const eco = getEconomy(interaction.user.id, interaction.guild.id);
    if (amount <= 0) return interaction.reply({ content: '❌ Montant invalide.', ephemeral: true });
    if (amount > eco.balance) return interaction.reply({ content: '❌ Tu n\'as pas assez.', ephemeral: true });
    const targetEco = getEconomy(target.id, interaction.guild.id);
    eco.balance -= amount;
    targetEco.balance += amount;
    saveEconomy();
    await interaction.reply(`💸 **${interaction.user.username}** a payé **${amount} ${gCfg.economyCurrency || '💰 Coins'}** à **${target.username}** !`);
  }
  
  if (commandName === 'economyleaderboard') {
    if (!gCfg.economyEnabled) {
      return interaction.reply({ content: '❌ Système économique désactivé.', ephemeral: true });
    }
    const guildData = Object.entries(economyData)
      .filter(([key]) => key.startsWith(interaction.guild.id + '_'))
      .map(([key, val]) => ({ userId: key.split('_')[1], total: (val.balance || 0) + (val.bank || 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    
    const description = guildData.map((d, i) =>
      `**${i+1}.** <@${d.userId}> — ${d.total} ${gCfg.economyCurrency || '💰 Coins'}`
    ).join('\n') || 'Aucune donnée.';
    
    const embed = new EmbedBuilder()
      .setColor('#f1c40f')
      .setTitle('🏆 Classement Économie')
      .setDescription(description)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  if (commandName === 'shop') {
    if (!gCfg.economyEnabled) {
      return interaction.reply({ content: '❌ Système économique désactivé.', ephemeral: true });
    }
    const items = gCfg.economyShopItems || [];
    if (items.length === 0) {
      return interaction.reply({ content: '🏪 La boutique est vide. Configure-la dans le panel.', ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setColor('#f1c40f')
      .setTitle('🏪 Boutique')
      .setDescription(items.map((item, i) => `**${i+1}.** ${item.name} — ${item.price} ${gCfg.economyCurrency || '💰 Coins'}`).join('\n'))
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // TICKET (enhanced version with mod role + log channel)
  if (commandName === 'ticket') {
    if (!gCfg.ticketEnabled) {
      return interaction.reply({ content: '❌ Tickets désactivés.', ephemeral: true });
    }
    
    const userTickets = Array.from(tickets.values()).filter(
      t => t.userId === interaction.user.id && t.guildId === interaction.guild.id && t.open
    ).length;
    
    if (userTickets >= gCfg.ticketMaxPerUser) {
      return interaction.reply({ content: `❌ Tu as déjà ${gCfg.ticketMaxPerUser} ticket(s) ouvert(s).`, ephemeral: true });
    }
    
    try {
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: gCfg.ticketCategory || null,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          ...(gCfg.modRole ? [{ id: gCfg.modRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
        ]
      });
      
      tickets.set(ticketChannel.id, {
        channelId: ticketChannel.id,
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        open: true,
        createdAt: new Date().toISOString()
      });
      saveTickets();
      
      if (gCfg.ticketLogChannel) {
        const logCh = interaction.guild.channels.cache.get(gCfg.ticketLogChannel);
        if (logCh) {
          const logEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🎫 Ticket ouvert')
            .addFields(
              { name: 'Utilisateur', value: `${interaction.user.username} (${interaction.user.id})`, inline: true },
              { name: 'Salon', value: ticketChannel.toString(), inline: true }
            )
            .setTimestamp();
          logCh.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }
      
      const closeRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('🔒 Fermer le ticket')
            .setStyle(ButtonStyle.Danger)
        );
      
      await ticketChannel.send({
        content: `${interaction.user.toString()} ${gCfg.ticketMessage}`,
        components: [closeRow]
      });
      
      await interaction.reply({ content: `🎫 Ticket créé: ${ticketChannel.toString()}`, ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: `❌ Erreur: ${error.message}`, ephemeral: true });
    }
  }
  
  // SETWELCOMECHANNEL
  if (commandName === 'setwelcomechannel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin uniquement.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('salon');
    gCfg.welcomeChannel = channel.id;
    setGuildCfg(interaction.guild.id, gCfg);
    await interaction.reply(`✅ Salon de bienvenue: ${channel}`);
  }
  
  // SETLOGCHANNEL
  if (commandName === 'setlogchannel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin uniquement.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('salon');
    gCfg.logChannel = channel.id;
    setGuildCfg(interaction.guild.id, gCfg);
    await interaction.reply(`✅ Salon de logs: ${channel}`);
  }
  
  // SETAUTOROLE
  if (commandName === 'setautorole') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin uniquement.', ephemeral: true });
    }
    const role = interaction.options.getRole('role');
    gCfg.autoRole = role.id;
    setGuildCfg(interaction.guild.id, gCfg);
    await interaction.reply(`✅ Auto-rôle: ${role}`);
  }
  
  // SETMODROLE
  if (commandName === 'setmodrole') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin uniquement.', ephemeral: true });
    }
    const role = interaction.options.getRole('role');
    gCfg.modRole = role.id;
    setGuildCfg(interaction.guild.id, gCfg);
    await interaction.reply(`✅ Rôle modérateur: ${role}`);
  }
  
  // GIVEROLE
  if (commandName === 'giverole') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    const role = interaction.options.getRole('role');
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.roles.add(role);
      await interaction.reply(`✅ Rôle **${role.name}** donné à **${user.username}**.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // REMOVEROLE
  if (commandName === 'removerole') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions.', ephemeral: true });
    }
    const user = interaction.options.getUser('utilisateur');
    const role = interaction.options.getRole('role');
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.roles.remove(role);
      await interaction.reply(`✅ Rôle **${role.name}** retiré à **${user.username}**.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // MASSROLE
  if (commandName === 'massrole') {
    if (!hasModPermission(interaction.member, gCfg)) {
      return interaction.reply({ content: '❌ Tu n\'as pas les permissions.', ephemeral: true });
    }
    const role = interaction.options.getRole('role');
    await interaction.deferReply();
    let count = 0;
    try {
      let lastId = null;
      while (true) {
        const fetchOptions = { limit: 1000 };
        if (lastId) fetchOptions.after = lastId;
        const batch = await interaction.guild.members.fetch(fetchOptions);
        for (const [, member] of batch) {
          try {
            if (!member.user.bot) {
              await member.roles.add(role);
              count++;
            }
          } catch (e) {}
        }
        if (batch.size < 1000) break;
        lastId = batch.last()?.id;
      }
    } catch (e) {}
    await interaction.editReply(`✅ Rôle **${role.name}** donné à **${count}** membres.`);
  }
  
  // CLOSE
  if (commandName === 'close') {
    const ticket = tickets.get(interaction.channel.id);
    if (!ticket || !ticket.open) {
      return interaction.reply({ content: '❌ Ce n\'est pas un ticket ouvert.', ephemeral: true });
    }
    
    ticket.open = false;
    saveTickets();
    await interaction.reply(`🔒 Ticket fermé par ${interaction.user.username}.`);
    
    if (gCfg.ticketLogChannel) {
      const logCh = interaction.guild.channels.cache.get(gCfg.ticketLogChannel);
      if (logCh) {
        const embed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('🔒 Ticket fermé')
          .addFields(
            { name: 'Fermé par', value: interaction.user.username, inline: true },
            { name: 'Ticket', value: interaction.channel.name, inline: true }
          )
          .setTimestamp();
        logCh.send({ embeds: [embed] }).catch(() => {});
      }
    }
    
    if (gCfg.ticketTranscript) {
      const messages = await interaction.channel.messages.fetch();
      const transcript = messages.reverse().map(m => `[${m.author.username}] ${m.content}`).join('\n');
      const transcriptPath = path.join(BACKUPS_PATH, `transcript_${interaction.channel.id}.txt`);
      fs.writeFileSync(transcriptPath, transcript);
    }
    
    setTimeout(() => {
      try { interaction.channel.delete(); } catch (e) {}
    }, 5000);
  }
  
  // ADD
  if (commandName === 'add') {
    const ticket = tickets.get(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Ce n\'est pas un ticket.', ephemeral: true });
    
    const user = interaction.options.getUser('utilisateur');
    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
    await interaction.reply(`✅ ${user.username} ajouté au ticket.`);
  }
  
  // REMOVE
  if (commandName === 'remove') {
    const ticket = tickets.get(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Ce n\'est pas un ticket.', ephemeral: true });
    
    const user = interaction.options.getUser('utilisateur');
    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
    await interaction.reply(`✅ ${user.username} retiré du ticket.`);
  }
  
  // STARBOARD
  if (commandName === 'starboard') {
    if (!gCfg.starboardChannel) {
      return interaction.reply({ content: '❌ Starboard non configuré.', ephemeral: true });
    }
    const starChannel = interaction.guild.channels.cache.get(gCfg.starboardChannel);
    if (!starChannel) {
      return interaction.reply({ content: '❌ Salon starboard introuvable.', ephemeral: true });
    }
    const messages = await starChannel.messages.fetch({ limit: 10 });
    if (messages.size === 0) {
      return interaction.reply({ content: '⭐ Aucun message dans le starboard.', ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setColor('#f1c40f')
      .setTitle('⭐ Starboard')
      .setDescription(messages.map(m => `> ${m.content?.substring(0, 100) || '*embed*'}\n  — ${m.author.toString()}`).join('\n\n'))
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // SETUPREACTIONROLE
  if (commandName === 'setupreactionrole') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin uniquement.', ephemeral: true });
    }
    const emoji = interaction.options.getString('emoji');
    const role = interaction.options.getRole('role');
    
    if (!gCfg.reactionRoles) gCfg.reactionRoles = {};
    gCfg.reactionRoles[emoji] = role.id;
    setGuildCfg(interaction.guild.id, gCfg);
    
    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🎭 Reaction Role configuré')
      .setDescription(`Réagis avec ${emoji} pour obtenir le rôle ${role}`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // REACTION ROLE SETUP (placeholder)
  if (commandName === 'pollresults') {
    await interaction.reply({ content: '📊 Système de résultats de sondage - Coming soon!', ephemeral: true });
  }
  
  if (commandName === 'covid') {
    await interaction.reply({ content: '📊 Données COVID non disponibles pour le moment.', ephemeral: true });
  }
  
  if (commandName === 'weather') {
    const ville = interaction.options.getString('ville');
    await interaction.reply({ content: `🌤️ Météo pour ${ville} - API non configurée.`, ephemeral: true });
  }
  
  if (commandName === 'translate') {
    if (!gCfg.translateEnabled) {
      return interaction.reply({ content: '❌ Traduction désactivée.', ephemeral: true });
    }
    const texte = interaction.options.getString('texte');
    const langue = interaction.options.getString('langue') || 'en';
    await interaction.reply({ content: `🌐 Traduction (${langue}): ${texte}\n⚠️ API de traduction non configurée.`, ephemeral: true });
  }

  // STOPRECORD
  if (commandName === 'stoprecord') {
    const recorder = activeRecordings.get(interaction.guild.id);
    if (!recorder) {
      return interaction.reply({ content: '❌ Aucun enregistrement en cours.', ephemeral: true });
    }
    await interaction.reply({ content: '⏹️ Arrêt de l\'enregistrement...', ephemeral: true });
    activeRecordings.delete(interaction.guild.id);
    const result = await recorder.stop();
    if (result) {
      const mins = Math.floor(result.duration / 60);
      const secs = result.duration % 60;
      await interaction.editReply(`✅ Enregistrement arrêté. Durée: ${mins}m ${secs}s. Envoi en cours...`);
    } else {
      await interaction.editReply('✅ Enregistrement arrêté.');
    }
  }

  // JOINBOT - Enregistrer le salon vocal de l'utilisateur
  if (commandName === 'joinbot') {
    const member = interaction.member;
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: '❌ Tu dois être dans un salon vocal.', ephemeral: true });
    }

    if (activeRecordings.has(interaction.guild.id)) {
      return interaction.reply({ content: '❌ Un enregistrement est déjà en cours.', ephemeral: true });
    }

    const recorder = new VoiceRecorder(interaction.guild, voiceChannel, null, interaction.user);
    recorder.start();
    activeRecordings.set(interaction.guild.id, recorder);

    // Jouer un bip sonore
    try {
      if (fs.existsSync(BEEP_PATH) && recorder.connection) {
        const player = createAudioPlayer();
        const resource = createAudioResource(BEEP_PATH);
        recorder.connection.subscribe(player);
        player.play(resource);
      }
    } catch {}

    await interaction.reply({ content: `🎙️ Enregistrement démarré dans **${voiceChannel.name}**.\nUtilise \`/stopbot\` pour arrêter et recevoir le fichier en DM.`, ephemeral: true });
  }

  // STOPBOT - Arrêter l'enregistrement et envoyer en DM
  if (commandName === 'stopbot') {
    const recorder = activeRecordings.get(interaction.guild.id);
    if (!recorder) {
      return interaction.reply({ content: '❌ Aucun enregistrement en cours.', ephemeral: true });
    }

    await interaction.reply({ content: '⏹️ Arrêt de l\'enregistrement...', ephemeral: true });
    activeRecordings.delete(interaction.guild.id);
    const result = await recorder.stop();

    if (result) {
      const mins = Math.floor(result.duration / 60);
      const secs = result.duration % 60;
      await interaction.editReply(`✅ Enregistrement arrêté (${mins}m ${secs}s). Le fichier t'a été envoyé en DM.`);
    } else {
      await interaction.editReply('✅ Enregistrement arrêté. Envoi du fichier en DM...');
    }
  }
});

// STARBOARD REACTION HANDLER
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (!reaction.message.guild) return;
  const gCfg = cfg(reaction.message.guild.id);
  
  // Starboard
  if (gCfg.starboardChannel && reaction.emoji.name === '⭐') {
    if (reaction.count >= (gCfg.starboardThreshold || 5)) {
      const starChannel = reaction.message.guild.channels.cache.get(gCfg.starboardChannel);
      if (starChannel) {
        const existing = await starChannel.messages.fetch({ limit: 100 });
        const alreadyStarred = existing.find(m => m.embeds[0]?.footer?.text === reaction.message.id);
        if (!alreadyStarred) {
          const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('⭐ Message Étoilé')
            .setDescription(reaction.message.content || '*Pas de contenu*')
            .addFields(
              { name: 'Auteur', value: reaction.message.author.toString(), inline: true },
              { name: 'Salon', value: reaction.message.channel.toString(), inline: true },
              { name: '⭐', value: reaction.count.toString(), inline: true }
            )
            .setFooter({ text: reaction.message.id })
            .setTimestamp();
          if (reaction.message.content && reaction.message.content.length > 0) {
            embed.setAuthor({ name: reaction.message.author.username, iconURL: reaction.message.author.displayAvatarURL() });
          }
          starChannel.send({ embeds: [embed] }).catch(() => {});
        }
      }
    }
  }
  
  // Reaction roles
  if (gCfg.reactionRoles && Object.keys(gCfg.reactionRoles).length > 0) {
    const emoji = reaction.emoji.name;
    if (gCfg.reactionRoles[emoji]) {
      try {
        const member = await reaction.message.guild.members.fetch(user.id);
        const role = reaction.message.guild.roles.cache.get(gCfg.reactionRoles[emoji]);
        if (role) {
          await member.roles.add(role);
        }
      } catch (e) {}
    }
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (!reaction.message.guild) return;
  const gCfg = cfg(reaction.message.guild.id);
  
  // Reaction roles - remove role on unreact
  if (gCfg.reactionRoles && Object.keys(gCfg.reactionRoles).length > 0) {
    const emoji = reaction.emoji.name;
    if (gCfg.reactionRoles[emoji]) {
      try {
        const member = await reaction.message.guild.members.fetch(user.id);
        const role = reaction.message.guild.roles.cache.get(gCfg.reactionRoles[emoji]);
        if (role) {
          await member.roles.remove(role);
        }
      } catch (e) {}
    }
  }
});

// ===================== BUTTON INTERACTIONS =====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  // NUKE CONFIRM
  if (interaction.customId === 'nuke_confirm') {
    const gCfg = cfg(interaction.guild.id);
    if (!gCfg.nukeOwnerId) {
      return interaction.reply({ content: '❌ Aucun propriétaire configuré. Configure l\'ID du propriétaire dans le panel.', ephemeral: true });
    }
    if (interaction.user.id !== gCfg.nukeOwnerId) {
      return interaction.reply({ content: '❌ Seul le propriétaire du serveur (👑) peut nuker.', ephemeral: true });
    }
    
    await interaction.reply({ content: '⏳ Nuke en cours...', ephemeral: true });
    
    try {
      const result = await nukeGuild(interaction.guild, true);
      if (result.success) {
        await interaction.editReply(`✅ Serveur nuké ! Sauvegarde: **${result.backup}**`);
      }
    } catch (error) {
      await interaction.editReply(`❌ Erreur: ${error.message}`);
    }
  }
  
  if (interaction.customId === 'nuke_cancel') {
    await interaction.reply({ content: '✅ Annulé.', ephemeral: true });
  }
  
  // TICKET CLOSE
  if (interaction.customId === 'ticket_close') {
    const ticket = tickets.get(interaction.channel.id);
    if (!ticket || !ticket.open) return;
    
    const gCfg = cfg(interaction.guild.id);
    ticket.open = false;
    saveTickets();
    await interaction.reply(`🔒 Ticket fermé.`);
    
    if (gCfg.ticketTranscript) {
      const messages = await interaction.channel.messages.fetch();
      const transcript = messages.reverse().map(m => `[${m.author.username}] ${m.content}`).join('\n');
      fs.writeFileSync(path.join(BACKUPS_PATH, `transcript_${interaction.channel.id}.txt`), transcript);
    }
    
    setTimeout(() => {
      try { interaction.channel.delete(); } catch (e) {}
    }, 5000);
  }
});

// ===================== EXPORTS =====================
module.exports = { 
  client, 
  config,
  getDefaultConfig,
  getGuildCfg,
  setGuildCfg,
  getAllGuildConfigs,
  createBackup,
  restoreBackup,
  nukeGuild,
  activeRecordings,
  VoiceRecorder,
  economyData,
  saveEconomy,
  getEconomy
};

// ===================== GRACEFUL SHUTDOWN =====================
function gracefulShutdown(signal) {
  console.log(`\n🛑 Signal ${signal} reçu. Arrêt en cours...`);
  try {
    saveJsonFile(XP_DATA_PATH, xpData);
    saveJsonFile(WARNS_DATA_PATH, warns);
    saveTickets();
    saveEconomy();
    saveJsonFile(PUNISHMENTS_PATH, punishmentsData);
    saveJsonFile(TEMPBANS_PATH, tempbansData);
    console.log('💾 Données sauvegardées.');
  } catch (e) {
    console.error('❌ Erreur sauvegarde:', e);
  }
  try {
    client.destroy();
    console.log('👋 Bot déconnecté.');
  } catch (e) {}
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (error) => {
  console.error('❌ Promesse non gérée:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exception non capturée:', error);
  gracefulShutdown('uncaughtException');
});

// ===================== CONNEXION =====================
client.login(DISCORD_TOKEN);
