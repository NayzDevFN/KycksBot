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
    target.emit('botStatus', { online: true, servers: guilds, users: totalUsers, commands: 70, status: bot.config.status });
  } catch (e) {
    target.emit('botStatus', { online: false });
  }
}

// Broadcast live stats every 10 seconds
setInterval(() => sendLiveStats(io), 10000);

// ===================== STATS =====================
app.get('/api/stats', async (req, res) => {
  try {
    const client = bot.client;
    if (!client.isReady()) throw new Error('Not ready');
    const guilds = client.guilds.cache.size;
    let totalUsers = 0;
    client.guilds.cache.forEach(g => totalUsers += g.memberCount);
    res.json({ servers: guilds, users: totalUsers, commands: 70, status: bot.config.status, online: true });
  } catch (error) {
    res.json({ servers: 0, users: 0, commands: 0, status: 'Hors ligne', online: false });
  }
});

// ===================== CONFIG =====================
app.get('/api/config', (req, res) => res.json(bot.config));

app.post('/api/config', (req, res) => {
  try {
    Object.assign(bot.config, req.body);
    bot.saveConfig(bot.config);
    bot.client.user.setActivity(bot.config.status);
    io.emit('configUpdated');
    res.json({ success: true, message: 'Configuration mise à jour' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ===================== MODERATION =====================
app.post('/api/ban', async (req, res) => {
  try {
    const { userId, reason } = req.body;
    const guild = await bot.client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    await member.ban({ reason: reason || 'Banni depuis le panel web' });
    io.emit('modAction', { action: 'ban', user: member.user.username });
    res.json({ success: true, message: `${member.user.username} a été banni` });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

app.post('/api/kick', async (req, res) => {
  try {
    const { userId, reason } = req.body;
    const guild = await bot.client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    await member.kick(reason || 'Expulsé depuis le panel web');
    io.emit('modAction', { action: 'kick', user: member.user.username });
    res.json({ success: true, message: `${member.user.username} a été expulsé` });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

app.post('/api/mute', async (req, res) => {
  try {
    const { userId, duration } = req.body;
    const guild = await bot.client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    await member.timeout((duration || 10) * 60 * 1000);
    io.emit('modAction', { action: 'mute', user: member.user.username });
    res.json({ success: true, message: `${member.user.username} mute pendant ${duration || 10} minutes` });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

app.post('/api/unmute', async (req, res) => {
  try {
    const { userId } = req.body;
    const guild = await bot.client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    await member.timeout(null);
    res.json({ success: true, message: `${member.user.username} a été unmute` });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

// ===================== BACKUP =====================
app.post('/api/backup', async (req, res) => {
  try {
    const { name } = req.body;
    const guild = await bot.client.guilds.fetch(GUILD_ID);
    const backup = await bot.createBackup(guild, name);
    io.emit('backupCreated', backup);
    res.json({ success: true, backup });
  } catch (error) { res.json({ success: false, message: error.message }); }
});

app.post('/api/restore', async (req, res) => {
  try {
    const { name } = req.body;
    const guild = await bot.client.guilds.fetch(GUILD_ID);
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
    const guild = await client.guilds.fetch(GUILD_ID);
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
    const guild = await bot.client.guilds.fetch(GUILD_ID);
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
    const guild = await bot.client.guilds.fetch(GUILD_ID);
    await guild.channels.fetch();
    await guild.members.fetch();
    await guild.roles.fetch();
    const textChannels = guild.channels.cache.filter(c => c.type === 0).sort((a, b) => a.position - b.position).map(c => ({ id: c.id, name: c.name, category: c.parent?.name || null }));
    const voiceChannels = guild.channels.cache.filter(c => c.type === 2).sort((a, b) => a.position - b.position).map(c => ({ id: c.id, name: c.name, category: c.parent?.name || null }));
    const categories = guild.channels.cache.filter(c => c.type === 4).sort((a, b) => a.position - b.position).map(c => ({ id: c.id, name: c.name }));
    const roles = guild.roles.cache.filter(r => r.name !== '@everyone' && !r.managed).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
    const members = guild.members.cache.filter(m => !m.user.bot).sort((a, b) => a.user.username.localeCompare(b.user.username)).map(m => ({ id: m.id, username: m.user.username, displayName: m.displayName }));
    res.json({ textChannels, voiceChannels, categories, roles, members });
  } catch (error) {
    res.json({ textChannels: [], voiceChannels: [], categories: [], roles: [], members: [] });
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

// ===================== SERVE HTML =====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'panel.html')));

// ===================== START =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Serveur en ligne sur le port ${PORT}`);
  console.log(`🏠 Site: http://localhost:${PORT}`);
  console.log(`📋 Panel: http://localhost:${PORT}/panel`);
});
