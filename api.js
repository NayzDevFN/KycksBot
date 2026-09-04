require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Importer le bot
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
      commands: 18,
      status: bot.getCurrentStatus(),
      online: client.isReady()
    });
  } catch (error) {
    res.json({ servers: 0, users: 0, commands: 0, status: 'Hors ligne', online: false });
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
    res.json({ success: true, message: `${member.user.username} a été mute pendant ${duration || 10} minutes` });
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

// ===================== CONFIGURATION DU BOT =====================

// Obtenir la config actuelle
app.get('/api/config', (req, res) => {
  res.json({
    status: bot.getCurrentStatus(),
    prefix: bot.getPrefix(),
    welcomeMessage: bot.getWelcomeMessage(),
    goodbyeMessage: bot.getGoodbyeMessage(),
    logChannel: bot.getLogChannel()
  });
});

// Changer le status du bot
app.post('/api/config/status', (req, res) => {
  try {
    const { status } = req.body;
    bot.setCurrentStatus(status);
    res.json({ success: true, message: `Status changé en: ${status}` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Changer le prefix
app.post('/api/config/prefix', (req, res) => {
  try {
    const { prefix } = req.body;
    bot.setPrefix(prefix);
    res.json({ success: true, message: `Prefix changé en: ${prefix}` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Changer le message d'accueil
app.post('/api/config/welcome', (req, res) => {
  try {
    const { message } = req.body;
    bot.setWelcomeMessage(message);
    res.json({ success: true, message: 'Message d\'accueil mis à jour' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Changer le message d'au revoir
app.post('/api/config/goodbye', (req, res) => {
  try {
    const { message } = req.body;
    bot.setGoodbyeMessage(message);
    res.json({ success: true, message: 'Message d\'au revoir mis à jour' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Changer le salon de logs
app.post('/api/config/logchannel', (req, res) => {
  try {
    const { channelId } = req.body;
    bot.setLogChannel(channelId);
    res.json({ success: true, message: `Salon de logs changé: ${channelId}` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ===================== INFO SERVEUR =====================
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
      channels: channels,
      roles: roles,
      members: members.slice(0, 100) // Limiter à 100 membres
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ===================== ENVOYER UN MESSAGE =====================
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

// ===================== LANCER LE SERVEUR =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 API en ligne sur le port ${PORT}`);
});
