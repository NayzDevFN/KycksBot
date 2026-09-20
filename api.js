require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(__dirname, { index: false }));

// ===================== JSON DATABASE =====================
const DB_PATH = path.join(__dirname, 'settings.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {}
  return { botAvatar: 'assets/avatar/KycksBot-pdp.png' };
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getSetting(key) { return loadDB()[key] || null; }
function setSetting(key, value) {
  const db = loadDB();
  db[key] = value;
  saveDB(db);
}

// ===================== BOT =====================
const bot = require('./bot');
const GUILD_ID = process.env.GUILD_ID;

// ===================== SOCKET.IO =====================
io.on('connection', (socket) => {
  console.log('🔗 Client connecté:', socket.id);

  // Send live stats on connect
  sendLiveStats(socket);

  socket.on('disconnect', () => {
    console.log('❌ Client déconnecté:', socket.id);
  });
});

function sendLiveStats(target) {
  try {
    const client = bot.client;
    if (!client.isReady()) {
      target.emit('botStatus', { online: false });
      return;
    }
    const guilds = client.guilds.cache.size;
    let totalUsers = 0;
    client.guilds.cache.forEach(g => totalUsers += g.memberCount);
    const defaultCfg = bot.getDefaultConfig();
    target.emit('botStatus', { online: true, servers: guilds, users: totalUsers, commands: 85, status: defaultCfg.status });
  } catch (e) {
    target.emit('botStatus', { online: false });
  }
}

// Broadcast live stats every 10 seconds
setInterval(() => sendLiveStats(io), 10000);

// ===================== GUILDS LIST =====================
app.get('/api/guilds', async (req, res) => {
  try {
    const client = bot.client;
    const ready = client.isReady();
    console.log(`[API] /api/guilds - ready: ${ready}, guilds: ${client.guilds.cache.size}`);
    if (!ready) return res.json({ guilds: [], ready: false });
    const guilds = [];
    client.guilds.cache.forEach(g => {
      try {
        guilds.push({
          id: g.id,
          name: g.name,
          icon: g.icon ? g.iconURL({ size: 128 }) : null,
          memberCount: g.memberCount,
          owner: g.ownerId
        });
      } catch (e) {
        console.error(`[API] Guild error ${g.id}:`, e.message);
      }
    });
    console.log(`[API] Returning ${guilds.length} guilds`);
    res.json({ guilds, ready: true });
  } catch (error) {
    console.error('[API] /api/guilds error:', error.message);
    res.json({ guilds: [], ready: false });
  }
});

// ===================== STATS =====================
app.get('/api/stats', async (req, res) => {
  try {
    const client = bot.client;
    if (!client.isReady()) throw new Error('Not ready');
    const guilds = client.guilds.cache.size;
    let totalUsers = 0;
    client.guilds.cache.forEach(g => totalUsers += g.memberCount);
    const defaultCfg = bot.getDefaultConfig();
    res.json({ servers: guilds, users: totalUsers, commands: 85, status: defaultCfg.status, online: true });
  } catch (error) {
    res.json({ servers: 0, users: 0, commands: 0, status: 'Hors ligne', online: false });
  }
});

// ===================== CONFIG =====================
app.get('/api/config', (req, res) => {
  const guildId = req.query.guildId || GUILD_ID;
  if (guildId) {
    res.json(bot.getGuildCfg(guildId));
  } else {
    res.json(bot.getAllGuildConfigs());
  }
});

app.get('/api/configs', (req, res) => res.json(bot.getAllGuildConfigs()));

app.post('/api/config', (req, res) => {
  try {
    const guildId = req.body.guildId || GUILD_ID;
    if (!guildId) return res.json({ success: false, message: 'guildId requis' });
    const existing = bot.getGuildCfg(guildId);
    const updated = { ...existing, ...req.body };
    delete updated.guildId;
    bot.setGuildCfg(guildId, updated);
    bot.client.user.setActivity(updated.status || 'En ligne 🟢');
    io.emit('configUpdated');
    res.json({ success: true, message: 'Configuration mise à jour' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ===================== MODERATION =====================
app.post('/api/clear', async (req, res) => {
  try {
    const { amount, guildId, channelId } = req.body;
    const gid = guildId || GUILD_ID;
    const guild = await bot.client.guilds.fetch(gid);
    const channel = channelId ? await guild.channels.fetch(channelId) : guild.channels.cache.find(c => c.type === 0 && c.name.includes('general'));
    if (!channel) return res.json({ success: false, message: 'Salon introuvable' });
    const deleted = await channel.bulkDelete(Math.min(amount || 10, 100), true);
    io.emit('modAction', { action: 'clear', user: 'Panel', count: deleted.size });
    res.json({ success: true, message: `${deleted.size} messages supprimés` });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

app.post('/api/ban', async (req, res) => {
  try {
    const { userId, reason, guildId } = req.body;
    const gid = guildId || GUILD_ID;
    const guild = await bot.client.guilds.fetch(gid);
    const member = await guild.members.fetch(userId);
    await member.ban({ reason: reason || 'Banni depuis le panel web' });
    io.emit('modAction', { action: 'ban', user: member.user.username });
    res.json({ success: true, message: `${member.user.username} a été banni` });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

app.post('/api/kick', async (req, res) => {
  try {
    const { userId, reason, guildId } = req.body;
    const gid = guildId || GUILD_ID;
    const guild = await bot.client.guilds.fetch(gid);
    const member = await guild.members.fetch(userId);
    await member.kick(reason || 'Expulsé depuis le panel web');
    io.emit('modAction', { action: 'kick', user: member.user.username });
    res.json({ success: true, message: `${member.user.username} a été expulsé` });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

app.post('/api/mute', async (req, res) => {
  try {
    const { userId, duration, guildId } = req.body;
    const gid = guildId || GUILD_ID;
    const guild = await bot.client.guilds.fetch(gid);
    const member = await guild.members.fetch(userId);
    await member.timeout((duration || 10) * 60 * 1000);
    io.emit('modAction', { action: 'mute', user: member.user.username });
    res.json({ success: true, message: `${member.user.username} mute pendant ${duration || 10} minutes` });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

app.post('/api/unmute', async (req, res) => {
  try {
    const { userId, guildId } = req.body;
    const gid = guildId || GUILD_ID;
    const guild = await bot.client.guilds.fetch(gid);
    const member = await guild.members.fetch(userId);
    await member.timeout(null);
    res.json({ success: true, message: `${member.user.username} a été unmute` });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

// ===================== BACKUP =====================
app.post('/api/backup', async (req, res) => {
  try {
    const { name, guildId } = req.body;
    const gid = guildId || GUILD_ID;
    const guild = await bot.client.guilds.fetch(gid);
    const backup = await bot.createBackup(guild, name);
    io.emit('backupCreated', backup);
    res.json({ success: true, backup });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

app.post('/api/restore', async (req, res) => {
  try {
    const { name, guildId } = req.body;
    const gid = guildId || GUILD_ID;
    const guild = await bot.client.guilds.fetch(gid);
    await bot.restoreBackup(guild, name);
    io.emit('serverRestored', { name });
    res.json({ success: true, message: `Serveur restauré depuis ${name}` });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

app.get('/api/backups', (req, res) => {
  try {
    const BACKUPS_PATH = path.join(__dirname, 'backups');
    if (!fs.existsSync(BACKUPS_PATH)) return res.json({ backups: [] });
    const files = fs.readdirSync(BACKUPS_PATH).filter(f => f.endsWith('.json'));
    const backups = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(BACKUPS_PATH, f), 'utf8'));
        const msgCount = data.messages ? Object.values(data.messages).reduce((acc, msgs) => acc + msgs.length, 0) : 0;
        return { name: data.name, createdAt: data.createdAt, guildName: data.guildName, channels: data.channels?.length || 0, messages: msgCount };
      } catch (e) { return { name: f.replace('.json', '') }; }
    });
    res.json({ backups });
  } catch (error) { res.json({ backups: [] }); }
});

// ===================== NUKE =====================
app.post('/api/nuke', async (req, res) => {
  try {
    const client = bot.client;
    if (!client.isReady()) return res.json({ success: false, message: 'Bot pas encore prêt' });
    const gid = req.body.guildId || GUILD_ID;
    const userId = req.body.userId;
    if (!userId) return res.json({ success: false, message: 'userId requis' });
    const guild = await client.guilds.fetch(gid);
    const gCfg = bot.getGuildCfg(gid);
    if (!gCfg.nukeOwnerId) {
      return res.json({ success: false, message: 'Aucun propriétaire configuré dans le panel.' });
    }
    if (userId !== gCfg.nukeOwnerId) {
      return res.json({ success: false, message: 'Seul le propriétaire configuré peut nuker.' });
    }
    await guild.channels.fetch();
    await guild.members.fetch();
    const result = await bot.nukeGuild(guild, true);
    io.emit('serverNuked', { backup: result.backup });
    res.json({ success: true, backup: result.backup });
  } catch (error) {
    fs.writeFileSync(path.join(__dirname, 'nuke-error.log'), error.stack || error.message);
    res.json({ success: false, message: error.message });
  }
});

// ===================== SERVER INFO =====================
app.get('/api/server', async (req, res) => {
  try {
    const gid = req.query.guildId || GUILD_ID;
    const guild = await bot.client.guilds.fetch(gid);
    await guild.channels.fetch();
    await guild.roles.fetch();
    await guild.members.fetch();
    const channels = guild.channels.cache.map(c => ({ id: c.id, name: c.name, type: c.type }));
    const roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
    const members = guild.members.cache.map(m => ({ id: m.id, username: m.user.username, displayName: m.displayName, joinedAt: m.joinedTimestamp }));
    res.json({ name: guild.name, id: guild.id, icon: guild.iconURL(), memberCount: guild.memberCount, channels, roles, members: members.slice(0, 100) });
  } catch (error) { res.json({ error: error.message }); }
});

// ===================== CHANNELS/ROLES =====================
app.get('/api/selectors', async (req, res) => {
  try {
    const gid = req.query.guildId || GUILD_ID;
    const guild = await bot.client.guilds.fetch(gid);
    await guild.channels.fetch();
    await guild.roles.fetch();
    
    // Fetch ALL members (paginated)
    let allMembers = [];
    let lastMemberId = null;
    while (true) {
      const fetchOptions = { limit: 1000 };
      if (lastMemberId) fetchOptions.after = lastMemberId;
      const batch = await guild.members.fetch(fetchOptions);
      allMembers = allMembers.concat(Array.from(batch.values()));
      if (batch.size < 1000) break;
      lastMemberId = batch.last()?.id;
    }
    
    const textChannels = guild.channels.cache.filter(c => c.type === 0).sort((a, b) => a.position - b.position).map(c => ({ id: c.id, name: c.name, category: c.parent?.name || null }));
    const voiceChannels = guild.channels.cache.filter(c => c.type === 2).sort((a, b) => a.position - b.position).map(c => ({ id: c.id, name: c.name, category: c.parent?.name || null }));
    const categories = guild.channels.cache.filter(c => c.type === 4).sort((a, b) => a.position - b.position).map(c => ({ id: c.id, name: c.name }));
    const roles = guild.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name, color: r.hexColor, managed: r.managed }));
    const members = allMembers.filter(m => !m.user.bot).sort((a, b) => a.user.username.localeCompare(b.user.username)).map(m => ({ id: m.id, username: m.user.username, displayName: m.displayName }));
    res.json({ textChannels, voiceChannels, categories, roles, members });
  } catch (error) {
    res.json({ textChannels: [], voiceChannels: [], categories: [], roles: [], members: [] });
  }
});

// ===================== DELETE USER MESSAGES =====================
app.post('/api/deleteusermessages', async (req, res) => {
  try {
    const { userId, guildId } = req.body;
    const gid = guildId || GUILD_ID;
    if (!userId) return res.json({ success: false, message: 'userId requis' });

    const guild = await bot.client.guilds.fetch(gid);
    await guild.channels.fetch();

    const textChannels = guild.channels.cache.filter(c => c.type === 0);
    let totalDeleted = 0;

    for (const [, channel] of textChannels) {
      try {
        const perms = channel.permissionsFor(bot.client.user);
        if (!perms || !perms.has('VIEW_CHANNEL') || !perms.has('READ_MESSAGE_HISTORY') || !perms.has('MANAGE_MESSAGES')) continue;

        let lastId = null;
        let keepFetching = true;

        while (keepFetching) {
          const options = { limit: 100 };
          if (lastId) options.before = lastId;

          const messages = await channel.messages.fetch(options);
          if (messages.size === 0) break;

          const userMessages = messages.filter(m => m.author.id === userId);
          lastId = messages.last()?.id;

          if (userMessages.size > 0) {
            const bulkDeletable = userMessages.filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
            const tooOld = userMessages.filter(m => Date.now() - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);

            if (bulkDeletable.size > 0) {
              const deleted = await channel.bulkDelete(bulkDeletable, true);
              totalDeleted += deleted.size;
            }

            for (const [, msg] of tooOld) {
              try {
                await msg.delete();
                totalDeleted++;
              } catch {}
            }
          }

          if (messages.size < 100) keepFetching = false;
        }
      } catch {}
    }

    io.emit('modAction', { action: 'deleteMessages', user: userId, count: totalDeleted });
    res.json({ success: true, message: `${totalDeleted} message(s) de l'utilisateur ${userId} supprimé(s)` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ===================== SEND MESSAGE =====================
app.post('/api/send', async (req, res) => {
  try {
    const { channelId, message } = req.body;
    const channel = await bot.client.channels.fetch(channelId);
    await channel.send(message);
    res.json({ success: true, message: 'Message envoyé !' });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

// ===================== ECONOMY =====================
app.get('/api/economy', (req, res) => {
  const guildId = req.query.guildId || GUILD_ID;
  if (!guildId) return res.json({ data: {} });
  const guildData = {};
  for (const [key, val] of Object.entries(bot.economyData)) {
    if (key.startsWith(guildId + '_')) {
      const userId = key.split('_')[1];
      guildData[userId] = val;
    }
  }
  res.json({ data: guildData });
});

app.post('/api/economy/edit', (req, res) => {
  try {
    const { guildId, userId, balance, bank } = req.body;
    if (!guildId || !userId) return res.json({ success: false, message: 'guildId et userId requis' });
    const eco = bot.getEconomy(userId, guildId);
    if (balance !== undefined) eco.balance = parseInt(balance) || 0;
    if (bank !== undefined) eco.bank = parseInt(bank) || 0;
    bot.saveEconomy();
    io.emit('configUpdated');
    res.json({ success: true, message: 'Solde mis à jour' });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

app.get('/api/punishments', (req, res) => {
  const guildId = req.query.guildId || GUILD_ID;
  const userId = req.query.userId;
  if (!guildId || !userId) return res.json({ punishments: [] });
  const key = `${guildId}_${userId}`;
  const data = loadJsonFile(path.join(__dirname, 'punishments-data.json'), {});
  res.json({ punishments: data[key] || [] });
});

// ===================== VOICE RECORDING STATUS =====================
app.get('/api/recordings/status', (req, res) => {
  try {
    const recordings = [];
    for (const [guildId, recorder] of bot.activeRecordings) {
      recordings.push({
        guildId,
        voiceChannel: recorder.voiceChannel?.name || 'Inconnu',
        startTime: recorder.startTime,
        isRecording: recorder.isRecording,
        frameCount: recorder.frameCount,
        duration: recorder.isRecording ? Math.floor((Date.now() - recorder.startTime) / 1000) : 0
      });
    }
    res.json({ recordings, enabled: bot.getDefaultConfig().voiceRecordEnabled });
  } catch (error) {
    res.json({ recordings: [], enabled: false });
  }
});

app.post('/api/recordings/stop', async (req, res) => {
  try {
    const { guildId } = req.body;
    const recorder = bot.activeRecordings.get(guildId);
    if (!recorder) return res.json({ success: false, message: 'Aucun enregistrement en cours' });
    bot.activeRecordings.delete(guildId);
    await recorder.stop();
    res.json({ success: true, message: 'Enregistrement arrêté' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ===================== AVATAR =====================
app.get('/api/avatar', (req, res) => res.json({ avatar: getSetting('botAvatar') }));

app.post('/api/avatar/upload', (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image) return res.json({ success: false, message: 'No image provided' });
    const ext = filename ? filename.split('.').pop() : 'png';
    const SafeFilename = `bot-avatar.${ext}`;
    const filepath = path.join(__dirname, 'assets', 'avatar', SafeFilename);
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
    setSetting('botAvatar', `assets/avatar/${SafeFilename}`);
    io.emit('avatarUpdated', { path: `/assets/avatar/${SafeFilename}` });
    res.json({ success: true, message: 'Avatar uploadé', path: `/assets/avatar/${SafeFilename}` });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

// ===================== DISCORD OAUTH2 =====================
const crypto = require('crypto');
const sessions = new Map();

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

// Redirect to Discord OAuth2
app.get('/auth/discord', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirectUri = encodeURIComponent(`http://localhost:${PORT}/auth/discord/callback`);
  const scope = encodeURIComponent('identify guilds');
  const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
  res.redirect(url);
});

// OAuth2 callback
app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');

  try {
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;
    const redirectUri = `http://localhost:${PORT}/auth/discord/callback`;

    // Exchange code for token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) return res.redirect('/?error=token_exchange_failed');

    // Fetch user info
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userData = await userRes.json();

    // Fetch user's guilds
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const guildsData = await guildsRes.json();

    // Create session
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      user: {
        id: userData.id,
        username: userData.username,
        avatar: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : null,
        discriminator: userData.discriminator
      },
      guilds: guildsData.filter(g => g.owner || (parseInt(g.permissions) & 0x20) === 0x20),
      accessToken: tokenData.access_token,
      createdAt: Date.now()
    });

    res.redirect(`/panel?session=${sessionId}`);
  } catch (error) {
    console.error('[OAuth2] Error:', error.message);
    res.redirect('/?error=auth_failed');
  }
});

// Get current session
app.get('/auth/me', (req, res) => {
  const sessionId = req.query.session || req.headers['x-session-id'];
  if (!sessionId || !sessions.has(sessionId)) {
    return res.json({ logged: false });
  }
  const session = sessions.get(sessionId);
  res.json({
    logged: true,
    user: session.user,
    guilds: session.guilds
  });
});

// Logout
app.post('/auth/logout', (req, res) => {
  const sessionId = req.body.session || req.headers['x-session-id'];
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
  }
  res.json({ success: true });
});

// ===================== SERVE HTML =====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'panel.html')));

// ===================== START =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Serveur en ligne sur le port ${PORT}`);
  console.log(`🏠 Site: http://localhost:${PORT}`);
  console.log(`📋 Panel: http://localhost:${PORT}/panel`);
  console.log(`🤖 Bot Discord connecté !`);
  console.log(`📊 Kycks Bot prêt`);
});

// ===================== GRACEFUL SHUTDOWN =====================
function gracefulShutdown(signal) {
  console.log(`\n🛑 Signal ${signal} reçu. Arrêt en cours...`);
  try {
    bot.client.destroy();
    console.log('👋 Bot déconnecté.');
  } catch (e) {}
  server.close(() => {
    console.log('🌐 Serveur web arrêté.');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
