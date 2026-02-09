const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { token, clientId, guildId } = require('./config.json');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  // Skip fichiers invalides (vide / mauvais export)
  if (!command?.data?.toJSON || typeof command.execute !== 'function') {
    console.log(`⏭️  Ignoré (commande invalide) : ${file}`);
    continue;
  }

  commands.push(command.data.toJSON());
  console.log(`✅ Ajoutée : ${command.data.name}`);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('⏳ Enregistrement des commandes slash...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('✅ Commandes enregistrées.');
  } catch (error) {
    console.error(error);
  }
})();
