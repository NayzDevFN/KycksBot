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

// ===================== CONFIG FILE =====================
const CONFIG_PATH = path.join(__dirname, 'bot-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {}
  return getDefaultConfig();
}

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
    ticketEnabled: true,
    ticketCategory: null,
    ticketLogChannel: null,
    ticketMessage: 'Un staff va vous répondre.',
    ticketMaxPerUser: 3,
    ticketTranscript: true,
    ticketCloseMessage: 'Ticket fermé.',
    levelEnabled: true,
    xpPerMessage: 15,
    xpCooldown: 60,
    levelUpChannel: null,
    levelUpMessage: '{user} a atteint le niveau {level} !',
    roleRewards: {},
    ignoredChannels: [],
    musicEnabled: true,
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
    automodEnabled: true,
    automodCapsFilter: false,
    automodCapsLimit: 70,
    automodSpamLimit: 5,
    automodSpamTime: 5,
    automodInviteBlock: true,
    automodWordFilter: true,
    automodLinkWhitelist: [],
    starboardChannel: null,
    starboardThreshold: 5,
    reactionRoleMessage: null,
    reactionRoles: {},
    reminderEnabled: true,
    pollEnabled: true,
    translateEnabled: false,
    translateChannel: null,
    backupEnabled: true,
    nukeEnabled: true,
    nukeConfirm: true
  };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

let config = loadConfig();

// ===================== CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions
  ]
});

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// ===================== BACKUP SYSTEM =====================
const BACKUPS_PATH = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUPS_PATH)) fs.mkdirSync(BACKUPS_PATH, { recursive: true });

async function createBackup(guild, name) {
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
    backup.categories.push({
      id: cat.id,
      name: cat.name,
      position: cat.position,
      permissionOverwrites: cat.permissionOverwrites.cache.map(p => ({
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
    const channelData = {
      id: ch.id,
      name: ch.name,
      type: ch.type,
      topic: ch.topic,
      position: ch.position,
      nsfw: ch.nsfw,
      parent: ch.parent?.id || null,
      permissionOverwrites: ch.permissionOverwrites.cache.map(p => ({
        id: p.id,
        type: p.type,
        allow: p.allow.toString(),
        deny: p.deny.toString()
      }))
    };
    backup.channels.push(channelData);
    
    // Sauvegarder les messages (1000 derniers par salon)
    try {
      let allMessages = [];
      let lastId = null;
      const maxMessages = 1000;
      
      while (allMessages.length < maxMessages) {
        const fetchOptions = { limit: Math.min(maxMessages - allMessages.length, 100) };
        if (lastId) fetchOptions.before = lastId;
        
        const messages = await ch.messages.fetch(fetchOptions);
        if (messages.size === 0) break;
        
        for (const [id, msg] of messages) {
          if (!msg.author.bot) {
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
        }
        
        lastId = messages.last()?.id;
      }
      
      if (allMessages.length > 0) {
        backup.messages[ch.id] = allMessages.reverse();
      }
    } catch (e) {}
  }

  // Sauvegarder les autres types de salons (vocaux, etc)
  guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory && c.type !== ChannelType.GuildText).forEach(ch => {
    backup.channels.push({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      position: ch.position,
      bitrate: ch.bitrate,
      userLimit: ch.userLimit,
      parent: ch.parent?.id || null,
      permissionOverwrites: ch.permissionOverwrites.cache.map(p => ({
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
    const channels = [...guild.channels.cache.values()];
    for (const channel of channels) {
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

// ===================== XP SYSTEM =====================
const xpData = {};

function getXp(userId, guildId) {
  const key = `${guildId}_${userId}`;
  return xpData[key] || { xp: 0, level: 0, lastXp: 0 };
}

function addXp(userId, guildId) {
  const key = `${guildId}_${userId}`;
  if (!xpData[key]) xpData[key] = { xp: 0, level: 0, lastXp: 0 };
  
  const now = Date.now();
  if (now - xpData[key].lastXp < config.xpCooldown * 1000) return null;
  
  xpData[key].xp += config.xpPerMessage;
  xpData[key].lastXp = now;
  
  const newLevel = Math.floor(0.1 * Math.sqrt(xpData[key].xp));
  if (newLevel > xpData[key].level) {
    xpData[key].level = newLevel;
    return newLevel;
  }
  return null;
}

// ===================== WARN SYSTEM =====================
const warns = {};

function addWarn(userId, guildId, reason, moderator) {
  const key = `${guildId}_${userId}`;
  if (!warns[key]) warns[key] = [];
  warns[key].push({ reason, moderator, date: new Date().toISOString() });
  return warns[key].length;
}

function getWarns(userId, guildId) {
  return warns[`${guildId}_${userId}`] || [];
}

function clearWarns(userId, guildId) {
  warns[`${guildId}_${userId}`] = [];
}

// ===================== TICKET SYSTEM =====================
const tickets = new Map();

// ===================== ANTI-SPAM =====================
const spamTracker = new Map();

function checkSpam(userId, guildId) {
  const key = `${guildId}_${userId}`;
  if (!spamTracker.has(key)) spamTracker.set(key, []);
  
  const now = Date.now();
  const messages = spamTracker.get(key).filter(t => now - t < config.automodSpamTime * 1000);
  messages.push(now);
  spamTracker.set(key, messages);
  
  return messages.length > config.automodSpamLimit;
}

// ===================== COMMANDES SLASH =====================
const commands = [
  new SlashCommandBuilder().setName('help').setDescription('Affiche la liste des commandes'),
  new SlashCommandBuilder().setName('ping').setDescription('Vérifie la latence du bot'),
  
  new SlashCommandBuilder()
    .setName('ban').setDescription('Bannir un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
  
  new SlashCommandBuilder()
    .setName('kick').setDescription('Expulser un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),
  
  new SlashCommandBuilder()
    .setName('mute').setDescription('Mute un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addIntegerOption(o => o.setName('duree').setDescription('Durée en minutes').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  
  new SlashCommandBuilder()
    .setName('unmute').setDescription('Unmute un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  
  new SlashCommandBuilder()
    .setName('clear').setDescription('Supprimer des messages')
    .addIntegerOption(o => o.setName('nombre').setDescription('Nombre (1-100)').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
  
  new SlashCommandBuilder()
    .setName('warn').setDescription('Avertir un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  
  new SlashCommandBuilder()
    .setName('unwarn').setDescription('Retirer un warn')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  
  new SlashCommandBuilder()
    .setName('warns').setDescription('Voir les warns d\'un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('tempban').setDescription('Ban temporaire')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addIntegerOption(o => o.setName('duree').setDescription('Durée en jours').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
  
  new SlashCommandBuilder()
    .setName('softban').setDescription('Softban (ban + unban)')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
  
  new SlashCommandBuilder()
    .setName('nick').setDescription('Changer le pseudo d\'un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('pseudo').setDescription('Nouveau pseudo').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageNicknames),
  
  new SlashCommandBuilder()
    .setName('slowmode').setDescription('Activer le slowmode')
    .addIntegerOption(o => o.setName('secondes').setDescription('Secondes de slowmode (0=off)').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  
  new SlashCommandBuilder()
    .setName('lock').setDescription('Verrouiller un salon')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  
  new SlashCommandBuilder()
    .setName('unlock').setDescription('Déverrouiller un salon')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  
  new SlashCommandBuilder()
    .setName('nuke').setDescription('Supprimer tous les salons (AVEC CONFIRMATION)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  new SlashCommandBuilder()
    .setName('backup').setDescription('Créer une sauvegarde du serveur')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  new SlashCommandBuilder()
    .setName('restore').setDescription('Restaurer une sauvegarde')
    .addStringOption(o => o.setName('nom').setDescription('Nom de la backup').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  new SlashCommandBuilder()
    .setName('backups').setDescription('Lister les sauvegardes'),
  
  new SlashCommandBuilder()
    .setName('slowmodemsg').setDescription('Slowmode sur un salon spécifique')
    .addChannelOption(o => o.setName('salon').setDescription('Le salon').setRequired(true))
    .addIntegerOption(o => o.setName('secondes').setDescription('Secondes').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  
  new SlashCommandBuilder()
    .setName('hide').setDescription('Cacher un salon')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  
  new SlashCommandBuilder()
    .setName('unhide').setDescription('Rendre un salon visible')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  
  new SlashCommandBuilder()
    .setName('clone').setDescription('Cloner un salon')
    .addChannelOption(o => o.setName('salon').setDescription('Salon à cloner').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  
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
    .addStringOption(o => o.setName('message').setDescription('Le message').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  new SlashCommandBuilder()
    .setName('embed').setDescription('Créer un embed custom')
    .addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true))
    .addStringOption(o => o.setName('couleur').setDescription('Couleur hex').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
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
    .addIntegerOption(o => o.setName('niveau').setDescription('Le niveau').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
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
    .addStringOption(o => o.setName('statut').setDescription('Nouveau status').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  new SlashCommandBuilder()
    .setName('reloadconfig').setDescription('Recharger la configuration')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  new SlashCommandBuilder()
    .setName('setwelcomechannel').setDescription('Définir le salon de bienvenue')
    .addChannelOption(o => o.setName('salon').setDescription('Le salon').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  new SlashCommandBuilder()
    .setName('setlogchannel').setDescription('Définir le salon de logs')
    .addChannelOption(o => o.setName('salon').setDescription('Le salon').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  new SlashCommandBuilder()
    .setName('setautorole').setDescription('Définir l\'autorôle')
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  new SlashCommandBuilder()
    .setName('setmodrole').setDescription('Définir le rôle modérateur')
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  new SlashCommandBuilder()
    .setName('giverole').setDescription('Donner un rôle à un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),
  
  new SlashCommandBuilder()
    .setName('removerole').setDescription('Retirer un rôle à un membre')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),
  
  new SlashCommandBuilder()
    .setName('massrole').setDescription('Donner un rôle à tous les membres')
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  new SlashCommandBuilder()
    .setName('pollresults').setDescription('Résultats d\'un sondage'),
  
  new SlashCommandBuilder()
    .setName('afk').setDescription('Se mettre AFK')
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('covid').setDescription('Stats COVID-19'),
  
  new SlashCommandBuilder()
    .setName('weather').setDescription('Météo d\'une ville')
    .addStringOption(o => o.setName('ville').setDescription('La ville').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('translate').setDescription('Traduire un texte')
    .addStringOption(o => o.setName('texte').setDescription('Le texte').setRequired(true))
    .addStringOption(o => o.setName('langue').setDescription('Langue cible').setRequired(false))
];

// ===================== ENREGISTREMENT =====================
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('📝 Enregistrement des slash commands...');
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('✅ Commandes enregistrées pour le serveur de test');
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ Commandes enregistrées globalement');
    }
  } catch (error) {
    console.error('❌ Erreur enregistrement:', error);
  }
}

// ===================== EVENTS =====================
client.on('ready', async () => {
  console.log(`🤖 ${client.user.tag} est en ligne !`);
  client.user.setActivity(config.status);
  await registerCommands();
});

// WELCOME
client.on('guildMemberAdd', async (member) => {
  try {
    // Welcome message
    if (config.welcomeChannel) {
      const ch = member.guild.channels.cache.get(config.welcomeChannel);
      if (ch) {
        let msg = config.welcomeMessage
          .replace('{user}', member.toString())
          .replace('{server}', member.guild.name)
          .replace('{count}', member.guild.memberCount.toString());
        
        if (config.welcomeImage) {
          const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle(`Bienvenue ${member.user.username} !`)
            .setDescription(msg)
            .setImage(config.welcomeImage)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();
          await ch.send({ embeds: [embed] });
        } else {
          await ch.send(msg);
        }
      }
    }
    
    // Welcome DM
    if (config.welcomeDM) {
      try {
        let dmMsg = config.welcomeDMMessage
          .replace('{user}', member.user.username)
          .replace('{server}', member.guild.name);
        await member.send(dmMsg);
      } catch (e) {}
    }
    
    // Auto role
    if (config.autoRole) {
      setTimeout(async () => {
        try {
          const role = member.guild.roles.cache.get(config.autoRole);
          if (role && !config.autoroleVerify) {
            await member.roles.add(role);
          } else if (role && config.autoroleVerify && member.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuild)) {
            if (member.pending === false) {
              await member.roles.add(role);
            }
          }
        } catch (e) {}
      }, (config.autoRoleDelay || 0) * 1000);
    }
    
    // Log
    if (config.logChannel && config.logsMembers) {
      const ch = member.guild.channels.cache.get(config.logChannel);
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
    if (config.goodbyeChannel) {
      const ch = member.guild.channels.cache.get(config.goodbyeChannel);
      if (ch) {
        const msg = config.goodbyeMessage
          .replace('{user}', member.user.username)
          .replace('{server}', member.guild.name)
          .replace('{count}', member.guild.memberCount.toString());
        await ch.send(msg);
      }
    }
    
    if (config.logChannel && config.logsMembers) {
      const ch = member.guild.channels.cache.get(config.logChannel);
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
  
  // Automod
  if (config.automodEnabled) {
    const member = message.member;
    if (!member) return;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return;
    
    // Anti-spam
    if (config.antiSpam && checkSpam(message.author.id, message.guild.id)) {
      try {
        await message.delete();
        await message.member.timeout(60000, 'Anti-spam');
        const ch = message.guild.channels.cache.get(config.logChannel);
        if (ch) {
          await ch.send(`🔇 **${message.author.username}** muté (anti-spam)`);
        }
        return;
      } catch (e) {}
    }
    
    // Anti-link
    if (config.antiLink) {
      const linkRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;
      if (linkRegex.test(message.content)) {
        if (!config.automodLinkWhitelist.some(domain => message.content.includes(domain))) {
          try {
            await message.delete();
            const ch = message.guild.channels.cache.get(config.logChannel);
            if (ch) {
              await ch.send(`🔗 **${message.author.username}** - Lien supprimé`);
            }
            return;
          } catch (e) {}
        }
      }
    }
    
    // Bad words
    if (config.automodWordFilter && config.badWords.length > 0) {
      const lower = message.content.toLowerCase();
      if (config.badWords.some(word => lower.includes(word.toLowerCase()))) {
        try {
          await message.delete();
          const ch = message.guild.channels.cache.get(config.logChannel);
          if (ch) {
            await ch.send(`🤐 **${message.author.username}** - Mot interdit supprimé`);
          }
          return;
        } catch (e) {}
      }
    }
    
    // Caps filter
    if (config.automodCapsFilter) {
      const upper = message.content.replace(/[^A-Z]/g, '').length;
      const total = message.content.replace(/[^a-zA-Z]/g, '').length;
      if (total > 10 && (upper / total * 100) > config.automodCapsLimit) {
        try {
          await message.delete();
          return;
        } catch (e) {}
      }
    }
    
    // Max length
    if (message.content.length > config.maxMessageLength) {
      try {
        await message.delete();
        return;
      } catch (e) {}
    }
  }
  
  // XP
  if (config.levelEnabled && !config.ignoredChannels.includes(message.channel.id)) {
    const levelUp = addXp(message.author.id, message.guild.id);
    if (levelUp && config.levelUpChannel) {
      const ch = message.guild.channels.cache.get(config.levelUpChannel);
      if (ch) {
        const msg = config.levelUpMessage
          .replace('{user}', message.author.toString())
          .replace('{level}', levelUp.toString());
        await ch.send(msg);
      }
      
      // Role rewards
      if (config.roleRewards[levelUp]) {
        try {
          const role = message.guild.roles.cache.get(config.roleRewards[levelUp]);
          if (role) await message.member.roles.add(role);
        } catch (e) {}
      }
    }
  }
  
  // Custom commands
  if (config.customCommands) {
    const customCmd = config.customCommands.find(c => message.content.toLowerCase() === `${config.prefix}${c.name.toLowerCase()}`);
    if (customCmd) {
      await message.channel.send(customCmd.response);
    }
  }
});

// VOICE STATE (logs)
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!config.logChannel || !config.logsVoice) return;
  const ch = oldState.guild.channels.cache.get(config.logChannel);
  if (!ch) return;
  
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
});

// CHANNEL DELETE (logs)
client.on('channelDelete', async (channel) => {
  if (!config.logChannel || !config.logsServer) return;
  const ch = channel.guild.channels.cache.get(config.logChannel);
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
  if (!config.logChannel || !config.logsServer) return;
  const ch = channel.guild.channels.cache.get(config.logChannel);
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
  if (!config.logChannel || !config.logsMessages) return;
  if (message.author?.bot) return;
  const ch = message.guild.channels.cache.get(config.logChannel);
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

// ===================== COMMANDES =====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName } = interaction;
  
  // HELP
  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle('📖 Liste des commandes')
      .setDescription('Voici toutes les commandes disponibles :')
      .addFields(
        { name: '🔧 Utilitaires', value: '`/help` `/ping` `/avatar` `/userinfo` `/serverinfo` `/roleinfo` `/roles` `/members` `/boosters` `/emojis` `/invites`', inline: false },
        { name: '🛡️ Modération', value: '`/ban` `/kick` `/mute` `/unmute` `/clear` `/warn` `/unwarn` `/warns` `/tempban` `/softban` `/nick` `/slowmode` `/lock` `/unlock` `/hide` `/unhide` `/clone` `/giverole` `/removerole` `/massrole`', inline: false },
        { name: '⚙️ Admin', value: '`/nuke` `/backup` `/restore` `/backups` `/say` `/embed` `/status` `/reloadconfig` `/setwelcomechannel` `/setlogchannel` `/setautorole` `/setmodrole` `/setlevel`', inline: false },
        { name: '🎫 Tickets', value: '`/ticket` `/close` `/add` `/remove`', inline: false },
        { name: '📈 Niveaux', value: '`/rank` `/leaderboard`', inline: false },
        { name: '🎮 Fun', value: '`/meme` `/8ball` `/poll` `/coinflip` `/roll`', inline: false },
        { name: '⏰ Utilitaires', value: '`/remind` `/afk`', inline: false }
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
    const user = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison') || 'Banni depuis Kycks';
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.ban({ reason });
      await interaction.reply(`🔨 **${user.username}** a été banni. Raison: ${reason}`);
    } catch (error) {
      await interaction.reply(`❌ Je ne peux pas bannir cet utilisateur.`);
    }
  }
  
  // KICK
  if (commandName === 'kick') {
    const user = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison') || 'Expulsé depuis Kycks';
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.kick(reason);
      await interaction.reply(`👢 **${user.username}** a été expulsé. Raison: ${reason}`);
    } catch (error) {
      await interaction.reply(`❌ Je ne peux pas expulser cet utilisateur.`);
    }
  }
  
  // MUTE
  if (commandName === 'mute') {
    const user = interaction.options.getUser('utilisateur');
    const duration = interaction.options.getInteger('duree') || 10;
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.timeout(duration * 60 * 1000);
      await interaction.reply(`🔇 **${user.username}** mute pendant ${duration} minutes.`);
    } catch (error) {
      await interaction.reply(`❌ Je ne peux pas mute cet utilisateur.`);
    }
  }
  
  // UNMUTE
  if (commandName === 'unmute') {
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
    const amount = interaction.options.getInteger('nombre');
    if (amount < 1 || amount > 100) return interaction.reply('❌ Nombre invalide (1-100)');
    try {
      await interaction.channel.bulkDelete(amount);
      await interaction.reply(`🗑️ ${amount} messages supprimés.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible de supprimer les messages.`);
    }
  }
  
  // WARN
  if (commandName === 'warn') {
    const user = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison') || 'Aucune raison';
    const count = addWarn(user.id, interaction.guild.id, reason, interaction.user.username);
    
    await interaction.reply(`⚠️ **${user.username}** a été warn. (${count}/${config.warnLimit} warns)`);
    
    if (count >= config.warnLimit) {
      try {
        const member = await interaction.guild.members.fetch(user.id);
        if (config.warnAction === 'ban') {
          await member.ban({ reason: `${config.warnLimit} warns atteints` });
          await interaction.followUp(`🔨 **${user.username}** a été banni (${config.warnLimit} warns)`);
        } else if (config.warnAction === 'kick') {
          await member.kick(`${config.warnLimit} warns atteints`);
          await interaction.followUp(`👢 **${user.username}** a été expulsé (${config.warnLimit} warns)`);
        }
        clearWarns(user.id, interaction.guild.id);
      } catch (e) {}
    }
  }
  
  // UNWARN
  if (commandName === 'unwarn') {
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
    const user = interaction.options.getUser('utilisateur');
    const duration = interaction.options.getInteger('duree');
    const reason = interaction.options.getString('raison') || 'Tempban';
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.ban({ reason });
      setTimeout(async () => {
        try { await interaction.guild.members.unban(user.id); } catch (e) {}
      }, duration * 24 * 60 * 60 * 1000);
      await interaction.reply(`🔨 **${user.username}** banni pendant ${duration} jour(s).`);
    } catch (error) {
      await interaction.reply(`❌ Impossible de bannir.`);
    }
  }
  
  // SOFTBAN
  if (commandName === 'softban') {
    const user = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison') || 'Softban';
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.ban({ reason, deleteMessageDays: 7 });
      await interaction.guild.members.unban(user.id);
      await interaction.reply(`🔨 **${user.username}** softbanni.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // NICK
  if (commandName === 'nick') {
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
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      await interaction.reply(`🔒 Salon verrouillé.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // UNLOCK
  if (commandName === 'unlock') {
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: true });
      await interaction.reply(`🔓 Salon déverrouillé.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // HIDE
  if (commandName === 'hide') {
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
      await interaction.reply(`🙈 Salon caché.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // UNHIDE
  if (commandName === 'unhide') {
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: true });
      await interaction.reply(`👁️ Salon visible.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible.`);
    }
  }
  
  // CLONE
  if (commandName === 'clone') {
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
    if (!config.nukeEnabled) {
      return interaction.reply('❌ La commande nuke est désactivée.');
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
      .setColor(config.embedColor)
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
      .setColor(config.embedColor)
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
      .setColor(config.embedColor)
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
      .setColor(config.embedColor)
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
      .setColor(config.embedColor)
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
      .setColor(config.embedColor)
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
      .setColor(config.embedColor)
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
      .setColor(config.embedColor)
      .setTitle('📨 Invitations')
      .setDescription(`Total: **${total}** invitations\nSalons: **${invites.size}** liens actifs`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // SAY
  if (commandName === 'say') {
    const message = interaction.options.getString('message');
    await interaction.channel.send(message);
    await interaction.reply({ content: '✅ Message envoyé !', ephemeral: true });
  }
  
  // EMBED
  if (commandName === 'embed') {
    const titre = interaction.options.getString('titre');
    const message = interaction.options.getString('message');
    const couleur = interaction.options.getString('couleur') || config.embedColor;
    
    const embed = new EmbedBuilder()
      .setColor(couleur)
      .setTitle(titre)
      .setDescription(message)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // POLL
  if (commandName === 'poll') {
    const question = interaction.options.getString('question');
    const optionsStr = interaction.options.getString('options');
    
    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
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
      .setColor(config.embedColor)
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
      .setColor(config.embedColor)
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
    const userData = getXp(interaction.user.id, interaction.guild.id);
    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
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
      .setColor(config.embedColor)
      .setTitle('🏆 Classement')
      .setDescription(description)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  
  // SETLEVEL
  if (commandName === 'setlevel') {
    const user = interaction.options.getUser('utilisateur');
    const level = interaction.options.getInteger('niveau');
    const key = `${interaction.guild.id}_${user.id}`;
    if (!xpData[key]) xpData[key] = { xp: 0, level: 0, lastXp: 0 };
    xpData[key].level = level;
    xpData[key].xp = level * level * 100;
    await interaction.reply(`✅ Niveau de **${user.username}** mis à jour: ${level}`);
  }
  
  // TICKET
  if (commandName === 'ticket') {
    if (!config.ticketEnabled) {
      return interaction.reply({ content: '❌ Tickets désactivés.', ephemeral: true });
    }
    
    const userTickets = Array.from(tickets.values()).filter(
      t => t.userId === interaction.user.id && t.guildId === interaction.guild.id && t.open
    ).length;
    
    if (userTickets >= config.ticketMaxPerUser) {
      return interaction.reply({ content: `❌ Tu as déjà ${config.ticketMaxPerUser} ticket(s) ouvert(s).`, ephemeral: true });
    }
    
    try {
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: config.ticketCategory || null,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      });
      
      tickets.set(ticketChannel.id, {
        channelId: ticketChannel.id,
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        open: true,
        createdAt: new Date().toISOString()
      });
      
      const closeRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('🔒 Fermer le ticket')
            .setStyle(ButtonStyle.Danger)
        );
      
      await ticketChannel.send({
        content: `${interaction.user.toString()} ${config.ticketMessage}`,
        components: [closeRow]
      });
      
      await interaction.reply({ content: `🎫 Ticket créé: ${ticketChannel.toString()}`, ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: `❌ Erreur: ${error.message}`, ephemeral: true });
    }
  }
  
  // CLOSE
  if (commandName === 'close') {
    const ticket = tickets.get(interaction.channel.id);
    if (!ticket || !ticket.open) {
      return interaction.reply({ content: '❌ Ce n\'est pas un ticket ouvert.', ephemeral: true });
    }
    
    ticket.open = false;
    await interaction.reply(`🔒 Ticket fermé par ${interaction.user.username}.`);
    
    if (config.ticketTranscript) {
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
  
  // STATUS
  if (commandName === 'status') {
    const newStatus = interaction.options.getString('statut');
    config.status = newStatus;
    saveConfig(config);
    client.user.setActivity(newStatus);
    await interaction.reply(`✅ Status: **${newStatus}**`);
  }
  
  // RELOADCONFIG
  if (commandName === 'reloadconfig') {
    config = loadConfig();
    client.user.setActivity(config.status);
    await interaction.reply('✅ Configuration rechargée !');
  }
  
  // SETWELCOMECHANNEL
  if (commandName === 'setwelcomechannel') {
    const channel = interaction.options.getChannel('salon');
    config.welcomeChannel = channel.id;
    saveConfig(config);
    await interaction.reply(`✅ Salon de bienvenue: ${channel}`);
  }
  
  // SETLOGCHANNEL
  if (commandName === 'setlogchannel') {
    const channel = interaction.options.getChannel('salon');
    config.logChannel = channel.id;
    saveConfig(config);
    await interaction.reply(`✅ Salon de logs: ${channel}`);
  }
  
  // SETAUTOROLE
  if (commandName === 'setautorole') {
    const role = interaction.options.getRole('role');
    config.autoRole = role.id;
    saveConfig(config);
    await interaction.reply(`✅ Auto-rôle: ${role}`);
  }
  
  // SETMODROLE
  if (commandName === 'setmodrole') {
    const role = interaction.options.getRole('role');
    config.modRole = role.id;
    saveConfig(config);
    await interaction.reply(`✅ Rôle modérateur: ${role}`);
  }
  
  // GIVEROLE
  if (commandName === 'giverole') {
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
    const role = interaction.options.getRole('role');
    await interaction.deferReply();
    let count = 0;
    for (const [id, member] of interaction.guild.members.cache) {
      try {
        if (!member.user.bot) {
          await member.roles.add(role);
          count++;
        }
      } catch (e) {}
    }
    await interaction.editReply(`✅ Rôle **${role.name}** donné à **${count}** membres.`);
  }
  
  // AFK
  if (commandName === 'afk') {
    const reason = interaction.options.getString('raison') || 'AFK';
    await interaction.reply(`😴 **${interaction.user.username}** est AFK: ${reason}`);
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
    const texte = interaction.options.getString('texte');
    const langue = interaction.options.getString('langue') || 'en';
    await interaction.reply({ content: `🌐 Traduction (${langue}): ${texte}\n⚠️ API de traduction non configurée.`, ephemeral: true });
  }
});

// ===================== BUTTON INTERACTIONS =====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  // NUKE CONFIRM
  if (interaction.customId === 'nuke_confirm') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin seulement.', ephemeral: true });
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
    
    ticket.open = false;
    await interaction.reply(`🔒 Ticket fermé.`);
    
    if (config.ticketTranscript) {
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
  loadConfig,
  saveConfig,
  createBackup,
  restoreBackup,
  nukeGuild
};

// ===================== CONNEXION =====================
client.login(DISCORD_TOKEN);
