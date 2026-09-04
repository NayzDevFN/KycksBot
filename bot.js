require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  REST, 
  Routes,
  EmbedBuilder,
  PermissionsBitField 
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// ===================== COMMANDES SLASH =====================
const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Affiche la liste des commandes'),
    
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Vérifie la latence du bot'),
    
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannir un membre')
    .addUserOption(option => 
      option.setName('utilisateur').setDescription('L\'utilisateur à bannir').setRequired(true))
    .addStringOption(option => 
      option.setName('raison').setDescription('Raison du ban').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
    
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulser un membre')
    .addUserOption(option => 
      option.setName('utilisateur').setDescription('L\'utilisateur à expulser').setRequired(true))
    .addStringOption(option => 
      option.setName('raison').setDescription('Raison du kick').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),
    
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute un membre')
    .addUserOption(option => 
      option.setName('utilisateur').setDescription('L\'utilisateur à mute').setRequired(true))
    .addIntegerOption(option => 
      option.setName('duree').setDescription('Durée en minutes').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute un membre')
    .addUserOption(option => 
      option.setName('utilisateur').setDescription('L\'utilisateur à unmute').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprimer des messages')
    .addIntegerOption(option => 
      option.setName('nombre').setDescription('Nombre de messages à supprimer (1-100)').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Affiche les infos d\'un membre')
    .addUserOption(option => 
      option.setName('utilisateur').setDescription('L\'utilisateur').setRequired(false)),
    
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Affiche les infos du serveur'),
    
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Affiche l\'avatar d\'un membre')
    .addUserOption(option => 
      option.setName('utilisateur').setDescription('L\'utilisateur').setRequired(false)),
    
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Le bot dit un message')
    .addStringOption(option => 
      option.setName('message').setDescription('Le message').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Créer un embed custom')
    .addStringOption(option => 
      option.setName('titre').setDescription('Titre de l\'embed').setRequired(true))
    .addStringOption(option => 
      option.setName('message').setDescription('Message de l\'embed').setRequired(true))
    .addStringOption(option => 
      option.setName('couleur').setDescription('Couleur hex (ex: #ff0000)').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    
  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Créer un sondage')
    .addStringOption(option => 
      option.setName('question').setDescription('La question').setRequired(true))
    .addStringOption(option => 
      option.setName('options').setDescription('Options séparées par un point-virgule').setRequired(false)),
    
  new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Magic 8-ball - Pose une question !')
    .addStringOption(option => 
      option.setName('question').setDescription('Ta question').setRequired(true)),
    
  new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Envoie un mème aléatoire'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Changer le status du bot')
    .addStringOption(option => 
      option.setName('statut').setDescription('Nouveau status').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
];

// ===================== ENREGISTREMENT DES COMMANDES =====================
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('📝 Enregistrement des slash commands...');
    
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('✅ Commandes enregistrées pour le serveur de test');
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ Commandes enregistrées globalement (peut prendre 1h)');
    }
  } catch (error) {
    console.error('❌ Erreur enregistrement:', error);
  }
}

// ===================== HÉBERGEMENT =====================
let currentStatus = 'En ligne 🟢';
let botPrefix = '!';
let welcomeMessage = 'Bienvenue {user} sur {server} !';
let goodbyeMessage = '{user} a quitté le serveur.';
let logChannelId = null;

// ===================== EVENTS =====================
client.on('ready', async () => {
  console.log(`🤖 ${client.user.tag} est en ligne !`);
  client.user.setActivity(currentStatus);
  
  await registerCommands();
});

client.on('guildMemberAdd', async (member) => {
  const channel = member.guild.systemChannel;
  if (channel) {
    const msg = welcomeMessage
      .replace('{user}', member.toString())
      .replace('{server}', member.guild.name);
    channel.send(msg);
  }
});

client.on('guildMemberRemove', async (member) => {
  const channel = member.guild.systemChannel;
  if (channel) {
    const msg = goodbyeMessage
      .replace('{user}', member.user.username)
      .replace('{server}', member.guild.name);
    channel.send(msg);
  }
});

// ===================== COMMANDES =====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName } = interaction;
  
  // HELP
  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#7289da')
      .setTitle('📖 Liste des commandes')
      .setDescription('Voici toutes les commandes disponibles :')
      .addFields(
        { name: '🔧 Utilitaires', value: '`/help` `/ping` `/avatar` `/userinfo` `/serverinfo`', inline: false },
        { name: '🛡️ Modération', value: '`/ban` `/kick` `/mute` `/unmute` `/clear`', inline: false },
        { name: '🎮 Fun', value: '`/meme` `/8ball` `/poll`', inline: false },
        { name: '📝 Admin', value: '`/say` `/embed` `/status`', inline: false }
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
    const reason = interaction.options.getString('raison') || 'Aucune raison';
    
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
    const reason = interaction.options.getString('raison') || 'Aucune raison';
    
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
      await interaction.reply(`🔇 **${user.username}** a été mute pendant ${duration} minutes.`);
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
    
    if (amount < 1 || amount > 100) {
      return interaction.reply('❌ Nombre invalide (1-100)');
    }
    
    try {
      await interaction.channel.bulkDelete(amount);
      await interaction.reply(`🗑️ ${amount} messages supprimés.`);
    } catch (error) {
      await interaction.reply(`❌ Impossible de supprimer les messages.`);
    }
  }
  
  // USERINFO
  if (commandName === 'userinfo') {
    const user = interaction.options.getUser('utilisateur') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id);
    
    const embed = new EmbedBuilder()
      .setColor('#7289da')
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
      .setColor('#7289da')
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
      .setColor('#7289da')
      .setTitle(`🖼️ Avatar de ${user.username}`)
      .setImage(user.displayAvatarURL({ size: 1024 }))
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
    const couleur = interaction.options.getString('couleur') || '#7289da';
    
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
      .setColor('#7289da')
      .setTitle(`📊 ${question}`)
      .setTimestamp();
    
    if (optionsStr) {
      const options = optionsStr.split(';').map(o => o.trim());
      const reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      
      let description = '';
      options.forEach((opt, i) => {
        if (i < reactions.length) {
          description += `${reactions[i]} ${opt}\n`;
        }
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
      .setColor('#7289da')
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
      'https://i.imgur.com/3dYtO0D.jpg',
      'https://i.imgur.com/L4GFq6p.jpg',
      'https://i.imgur.com/0zWvJ0X.jpg'
    ];
    
    const embed = new EmbedBuilder()
      .setColor('#7289da')
      .setTitle('😂 Mème aléatoire')
      .setImage(memes[Math.floor(Math.random() * memes.length)])
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
  
  // STATUS
  if (commandName === 'status') {
    const newStatus = interaction.options.getString('statut');
    currentStatus = newStatus;
    client.user.setActivity(newStatus);
    await interaction.reply(`✅ Status changé en: **${newStatus}**`);
  }
});

// ===================== EXPORTS POUR L'API =====================
module.exports = { 
  client, 
  getCurrentStatus: () => currentStatus,
  setCurrentStatus: (status) => { currentStatus = status; client.user.setActivity(status); },
  getPrefix: () => botPrefix,
  setPrefix: (prefix) => { botPrefix = prefix; },
  getWelcomeMessage: () => welcomeMessage,
  setWelcomeMessage: (msg) => { welcomeMessage = msg; },
  getGoodbyeMessage: () => goodbyeMessage,
  setGoodbyeMessage: (msg) => { goodbyeMessage = msg; },
  getLogChannel: () => logChannelId,
  setLogChannel: (id) => { logChannelId = id; }
};

// ===================== CONNEXION =====================
client.login(DISCORD_TOKEN);
