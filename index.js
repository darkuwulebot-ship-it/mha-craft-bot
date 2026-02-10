const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// =======================
// Chargement des commandes
// =======================
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if (!command?.data?.name || typeof command.execute !== 'function') {
    console.log(`⏭️  Commande ignorée (invalide) : ${file}`);
    continue;
  }

  client.commands.set(command.data.name, command);
  console.log(`✅ Commande chargée : ${command.data.name}`);
}

// =======================
// Bot prêt
// =======================
client.once('ready', () => {
  console.log(`🤖 Bot connecté : ${client.user.tag}`);
});

// =======================
// Interactions (autocomplete + slash)
// =======================
client.on('interactionCreate', async interaction => {

  // 🔹 Autocomplete (pour les katanas)
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return;

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error('Erreur autocomplete:', error);
    }
    return;
  }

  // 🔹 Slash commands
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error('Erreur commande:', error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '❌ Erreur lors de la commande.', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ Erreur lors de la commande.', ephemeral: true });
    }
  }
});

// =======================
// Connexion
// =======================
client.login(process.env.DISCORD_TOKEN);



