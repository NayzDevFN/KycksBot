require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const bot = require('./bot');

const GUILD_ID = process.env.GUILD_ID;

// ===================== STATS =====================
app.get('/api/stats', async (req, res) => {
  try {
    const client = bot.client;
    const guilds = client.guilds.cache.size;
    let totalUsers = 0;
    client.guilds.cache.forEach(g => totalUsers += g.memberCount);
    
    res.json({ 
      servers: guilds, 
      users: totalUsers, 
      commands: 70,
      status: bot.config.status,
      online: client.isReady()
    });
  } catch (error) {
    res.json({ servers: 0, users: 0, commands: 0, status: 'Hors ligne', online: false });
  }
});

// ===================== CONFIG GET =====================
app.get('/api/config', (req, res) => {
  res.json(bot.config);
});

// ===================== CONFIG SET (GENENERAL) =====================
app.post('/api/config', (req, res) => {
  try {
    const updates = req.body;
    Object.assign(bot.config, updates);
    bot.saveConfig(bot.config);
    bot.client.user.setActivity(bot.config.status);
    res.json({ success: true, message: 'Configuration mise à jour' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ===================== MODERATION =====================
app.post('/api/ban', async (req, res) => {
  try {
    const { userId, reason } = req.body;
    const client = bot.client;
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    await member.ban({ reason: reason || 'Banni depuis le panel web' });
    res.json({ success: true, message: `${member.user.username} a été banni` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/kick', async (req, res) => {
  try {
    const { userId, reason } = req.body;
    const client = bot.client;
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    await member.kick(reason || 'Expulsé depuis le panel web');
    res.json({ success: true, message: `${member.user.username} a été expulsé` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/mute', async (req, res) => {
  try {
    const { userId, duration } = req.body;
    const client = bot.client;
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    await member.timeout((duration || 10) * 60 * 1000);
    res.json({ success: true, message: `${member.user.username} mute pendant ${duration || 10} minutes` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/unmute', async (req, res) => {
  try {
    const { userId } = req.body;
    const client = bot.client;
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    await member.timeout(null);
    res.json({ success: true, message: `${member.user.username} a été unmute` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ===================== BACKUP =====================
app.post('/api/backup', async (req, res) => {
  try {
    const { name } = req.body;
    const client = bot.client;
    const guild = await client.guilds.fetch(GUILD_ID);
    const backup = await bot.createBackup(guild, name);
    res.json({ success: true, backup });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/restore', async (req, res) => {
  try {
    const { name } = req.body;
    const client = bot.client;
    const guild = await client.guilds.fetch(GUILD_ID);
    await bot.restoreBackup(guild, name);
    res.json({ success: true, message: `Serveur restauré depuis ${name}` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.get('/api/backups', (req, res) => {
  try {
    const BACKUPS_PATH = path.join(__dirname, 'backups');
    if (!fs.existsSync(BACKUPS_PATH)) return res.json({ backups: [] });
    
    const files = fs.readdirSync(BACKUPS_PATH).filter(f => f.endsWith('.json'));
    const backups = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(BACKUPS_PATH, f), 'utf8'));
        return { name: data.name, createdAt: data.createdAt, guildName: data.guildName };
      } catch (e) {
        return { name: f.replace('.json', '') };
      }
    });
    res.json({ backups });
  } catch (error) {
    res.json({ backups: [] });
  }
});

// ===================== NUKE =====================
app.post('/api/nuke', async (req, res) => {
  try {
    const client = bot.client;
    const guild = await client.guilds.fetch(GUILD_ID);
    const result = await bot.nukeGuild(guild, true);
    res.json({ success: true, backup: result.backup });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ===================== SERVER INFO =====================
app.get('/api/server', async (req, res) => {
  try {
    const client = bot.client;
    const guild = await client.guilds.fetch(GUILD_ID);
    
    const channels = guild.channels.cache.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type
    }));
    
    const roles = guild.roles.cache.map(r => ({
      id: r.id,
      name: r.name,
      color: r.hexColor
    }));
    
    const members = guild.members.cache.map(m => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName,
      joinedAt: m.joinedTimestamp
    }));
    
    res.json({
      name: guild.name,
      id: guild.id,
      icon: guild.iconURL(),
      memberCount: guild.memberCount,
      channels,
      roles,
      members: members.slice(0, 100)
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ===================== SEND MESSAGE =====================
app.post('/api/send', async (req, res) => {
  try {
    const { channelId, message } = req.body;
    const client = bot.client;
    const channel = await client.channels.fetch(channelId);
    await channel.send(message);
    res.json({ success: true, message: 'Message envoyé !' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ===================== CHANNELS/ROLES LIST =====================
app.get('/api/channels', async (req, res) => {
  try {
    const client = bot.client;
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = guild.channels.cache
      .filter(c => c.type === 0 || c.type === 2 || c.type === 4)
      .map(c => ({ id: c.id, name: c.name, type: c.type }));
    res.json({ channels });
  } catch (error) {
    res.json({ channels: [] });
  }
});

app.get('/api/roles', async (req, res) => {
  try {
    const client = bot.client;
    const guild = await client.guilds.fetch(GUILD_ID);
    const roles = guild.roles.cache
      .filter(r => r.name !== '@everyone' && !r.managed)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
    res.json({ roles });
  } catch (error) {
    res.json({ roles: [] });
  }
});

// ===================== TRANSCRIPTS =====================
app.get('/api/transcripts', (req, res) => {
  try {
    const BACKUPS_PATH = path.join(__dirname, 'backups');
    if (!fs.existsSync(BACKUPS_PATH)) return res.json({ transcripts: [] });
    
    const files = fs.readdirSync(BACKUPS_PATH).filter(f => f.startsWith('transcript_'));
    const transcripts = files.map(f => ({
      name: f.replace('.txt', ''),
      size: fs.statSync(path.join(BACKUPS_PATH, f)).size
    }));
    res.json({ transcripts });
  } catch (error) {
    res.json({ transcripts: [] });
  }
});

// ===================== LANCER LE SERVEUR =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 API en ligne sur le port ${PORT}`);
});
