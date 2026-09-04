require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ===================== DATABASE =====================
const DB_PATH = path.join(__dirname, 'bot.db');
const db = new Database(DB_PATH);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

// Initialize default settings
const defaultSettings = {
  botAvatar: 'assets/avatar/KycksBot-pdp.png'
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

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
        const msgCount = data.messages ? Object.values(data.messages).reduce((acc, msgs) => acc + msgs.length, 0) : 0;
        return { name: data.name, createdAt: data.createdAt, guildName: data.guildName, channels: data.channels?.length || 0, messages: msgCount };
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
    
    // Fetch explicitement
    await guild.channels.fetch();
    await guild.roles.fetch();
    await guild.members.fetch();
    
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
      .filter(c => c.type === 0 || c.type === 2 || c.type === 4 || c.type === 5)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, name: c.name, type: c.type, category: c.parent?.name || null }));
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
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
    res.json({ roles });
  } catch (error) {
    res.json({ roles: [] });
  }
});

app.get('/api/selectors', async (req, res) => {
  try {
    const client = bot.client;
    const guild = await client.guilds.fetch(GUILD_ID);
    
    // Fetch explicitement les salons, rôles et membres (pas juste le cache)
    await guild.channels.fetch();
    await guild.members.fetch();
    await guild.roles.fetch();
    
    const textChannels = guild.channels.cache
      .filter(c => c.type === 0)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, name: c.name, category: c.parent?.name || null }));
    
    const voiceChannels = guild.channels.cache
      .filter(c => c.type === 2)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, name: c.name, category: c.parent?.name || null }));
    
    const categories = guild.channels.cache
      .filter(c => c.type === 4)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, name: c.name }));
    
    const roles = guild.roles.cache
      .filter(r => r.name !== '@everyone' && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
    
    const members = guild.members.cache
      .filter(m => !m.user.bot)
      .sort((a, b) => a.user.username.localeCompare(b.user.username))
      .map(m => ({ id: m.id, username: m.user.username, displayName: m.displayName }));
    
    res.json({ textChannels, voiceChannels, categories, roles, members });
  } catch (error) {
    console.error('Erreur selectors:', error.message);
    res.json({ textChannels: [], voiceChannels: [], categories: [], roles: [], members: [] });
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

// ===================== AVATAR API =====================
app.get('/api/avatar', (req, res) => {
  const avatar = getSetting('botAvatar');
  res.json({ avatar });
});

app.post('/api/avatar', (req, res) => {
  try {
    const { avatar } = req.body;
    setSetting('botAvatar', avatar);
    res.json({ success: true, message: 'Avatar mis à jour' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/avatar/upload', (req, res) => {
  try {
    // Handle multipart form data manually or use multer
    // For simplicity, we'll expect base64
    const { image, filename } = req.body;
    if (!image) return res.json({ success: false, message: 'No image provided' });
    
    const ext = filename ? filename.split('.').pop() : 'png';
    const SafeFilename = `bot-avatar.${ext}`;
    const filepath = path.join(__dirname, 'assets', 'avatar', SafeFilename);
    
    // Remove data:image/xxx;base64, prefix
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    fs.writeFileSync(filepath, buffer);
    setSetting('botAvatar', `assets/avatar/${SafeFilename}`);
    res.json({ success: true, message: 'Avatar uploadé', path: `assets/avatar/${SafeFilename}` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
