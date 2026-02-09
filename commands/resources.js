const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const resources = require('../data/resources.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resources')
    .setDescription('Affiche toutes les ressources (achat ou farm)'),

  async execute(interaction) {
    const lines = Object.entries(resources)
      .map(([name, price]) => {
        if (price === null) return `• **${name}** → 🌿 Farm`;
        return `• **${name}** → ${Number(price).toLocaleString()}¥`;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🧺 Ressources')
      .setDescription(lines)
      .setColor(0x2ecc71);

    await interaction.reply({ embeds: [embed] });
  }
};
