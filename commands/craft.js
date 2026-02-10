const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const resources = require('../data/resources.json');
const plans = require('../data/plans.json');
const recipes = require('../data/recipes.json');
const weapons = require('../data/weapons.json');
const materials = require('../data/materials.json');
const { colors } = require('../utils/rarity');

const SLOTS = ['Plastron', 'Casque', 'Pantalon', 'Bottes', 'Gants'];
const RARITIES = ['Commun', 'Rare', 'Epic', 'Legendaire'];

// =========================
// Utils
// =========================
function normalize(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function findRecipe(slot, rarity) {
  return recipes.find(r => r.slot === slot && r.rarity === rarity);
}

// =========================
// Réponse auto-delete 30s (visible pour tous)
// =========================
async function replyAndDelete(interaction, payload, ms = 30_000) {
  await interaction.reply(payload);
  const msg = await interaction.fetchReply();
  setTimeout(() => {
    msg.delete().catch(() => {});
  }, ms);
}

// =========================
// Rendu lisible en arbre
// =========================
function indent(depth) {
  if (depth <= 0) return '';
  return '│  '.repeat(depth - 1) + '├─ ';
}
function line(depth, text) {
  return `${indent(depth)}${text}`;
}

// =========================
// Résolution récursive (achat/farm/fusion/katana)
// - materials.json avec yields
// - weapons.json comme ingrédients
// ⚠️ PAS DE PLAN POUR LES KATANAS
// =========================
function resolveCost(itemName, qty, stack = [], depth = 0) {
  const key = `${itemName}`;
  if (stack.includes(key)) {
    return { error: `❌ Boucle détectée : ${stack.join(' -> ')} -> ${itemName}` };
  }

  // 1) Ressource de base
  if (Object.prototype.hasOwnProperty.call(resources, itemName)) {
    const unit = resources[itemName];

    if (unit === null) {
      return { cost: 0, lines: [line(depth, `🌿 ${itemName} x${qty} — Farm`)] };
    }

    if (typeof unit === 'number') {
      const sub = unit * qty;
      return { cost: sub, lines: [line(depth, `🛒 ${itemName} x${qty} — ${sub.toLocaleString()}¥`)] };
    }

    return { error: `❌ Valeur invalide dans resources.json pour ${itemName}` };
  }

  // 2) Matériau fusionné
  if (Object.prototype.hasOwnProperty.call(materials, itemName)) {
    const mat = materials[itemName];
    const from = mat?.from;

    if (!from || typeof from !== 'object') {
      return { error: `❌ materials.json: "${itemName}" doit contenir un objet "from".` };
    }

    const yields = Number(mat?.yields ?? 1);
    if (!Number.isFinite(yields) || yields <= 0) {
      return { error: `❌ materials.json: "${itemName}" a un "yields" invalide.` };
    }

    const craftsNeeded = Math.ceil(qty / yields);

    let total = 0;
    let lines = [
      line(depth, `🧩 ${itemName} x${qty} — Fusion (${craftsNeeded} craft${craftsNeeded > 1 ? 's' : ''}, ${yields}/craft)`)
    ];

    for (const [base, baseQty] of Object.entries(from)) {
      const res = resolveCost(base, baseQty * craftsNeeded, [...stack, key], depth + 1);
      if (res.error) return res;
      total += res.cost;
      lines = lines.concat(res.lines);
    }

    return { cost: total, lines };
  }

  // 3) Katana en ingrédient (weapons.json)
  const weapon = weapons.find(w => normalize(w.name) === normalize(itemName));
  if (weapon) {
    if (!weapon.known) {
      return { error: `❌ Recette inconnue : **${weapon.name}** (katana requis mais non craftable).` };
    }

    // Katana en bois = coût 0¥
    const isWoodKatana =
      normalize(weapon.name) === normalize('Katana en Bois') ||
      normalize(weapon.name) === normalize('Katana en bois');

    if (isWoodKatana) {
      return { cost: 0, lines: [line(depth, `⚔️ ${weapon.name} x${qty} — Spécial (0¥)`)] };
    }

    let total = 0;
    let lines = [line(depth, `⚔️ ${weapon.name} x${qty} — Sous-craft`)];
    for (const [ing, ingQty] of Object.entries(weapon.resources || {})) {
      const res = resolveCost(ing, ingQty * qty, [...stack, key], depth + 1);
      if (res.error) return res;
      total += res.cost;
      lines = lines.concat(res.lines);
    }

    // ⚠️ Pas de plan ajouté ici (katanas)
    return { cost: total, lines };
  }

  return { error: `❌ Inconnu : **${itemName}** (ajoute-le dans resources.json, materials.json ou weapons.json).` };
}

function calcTotal(resObj) {
  let total = 0;
  let lines = [];

  for (const [name, qty] of Object.entries(resObj || {})) {
    const r = resolveCost(name, qty, [], 0);
    if (r.error) return { error: r.error };
    total += r.cost;

    if (lines.length > 0) lines.push('');
    lines = lines.concat(r.lines);
  }

  return { total, lines };
}

function toTreeBlock(lines, maxChars = 3600) {
  const joined = lines.join('\n');
  if (joined.length <= maxChars) return '```txt\n' + joined + '\n```';

  const cut = joined.slice(0, maxChars);
  return '```txt\n' + cut + '\n… (coupé)\n```';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Calcule le prix d’un craft (équipement ou katana)')

    .addSubcommand(sc =>
      sc.setName('equipement')
        .setDescription('Craft un équipement')
        .addStringOption(o =>
          o.setName('slot')
            .setDescription('Emplacement')
            .setRequired(true)
            .addChoices(...SLOTS.map(s => ({ name: s, value: s })))
        )
        .addStringOption(o =>
          o.setName('rarity')
            .setDescription('Rareté')
            .setRequired(true)
            .addChoices(...RARITIES.map(r => ({ name: r, value: r })))
        )
    )

    .addSubcommand(sc =>
      sc.setName('katana')
        .setDescription('Craft un katana')
        .addStringOption(o =>
          o.setName('name')
            .setDescription('Nom du katana')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    if (interaction.options.getSubcommand() !== 'katana') return interaction.respond([]);
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'name') return interaction.respond([]);

    const q = normalize(focused.value);
    let list = weapons;
    if (q.length > 0) list = weapons.filter(w => normalize(w.name).includes(q));

    return interaction.respond(
      list.slice(0, 25).map(w => ({
        name: `${w.name} (${w.rarity})`,
        value: w.name
      }))
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // -------- EQUIPEMENT (AVEC PLAN) --------
    if (sub === 'equipement') {
      const slot = interaction.options.getString('slot');
      const rarity = interaction.options.getString('rarity');

      const recipe = findRecipe(slot, rarity);
      if (!recipe) {
        return replyAndDelete(interaction, { content: `❌ Aucune recette trouvée pour **${slot}** en **${rarity}**.` });
      }

      const { total, lines, error } = calcTotal(recipe.resources || {});
      if (error) return replyAndDelete(interaction, { content: error });

      const planPrice = plans[rarity] ?? 0;
      const grandTotal = total + planPrice;

      const embed = new EmbedBuilder()
        .setTitle(`🛠️ Craft — ${slot} (${rarity})`)
        .setColor(colors[rarity] ?? 0xffffff)
        .addFields(
          { name: '🧾 Plan', value: `${planPrice.toLocaleString()}¥`, inline: true },
          { name: '💴 Coût total', value: `**${grandTotal.toLocaleString()}¥**`, inline: true },
          { name: '🧱 Détails', value: toTreeBlock(lines) }
        );

      return replyAndDelete(interaction, { embeds: [embed] });
    }

    // -------- KATANA (SANS PLAN) --------
    if (sub === 'katana') {
      const name = interaction.options.getString('name');
      const katana = weapons.find(w => normalize(w.name) === normalize(name));

      if (!katana) {
        return replyAndDelete(interaction, { content: `❌ Katana introuvable : **${name}**.` });
      }

      if (!katana.known) {
        const embed = new EmbedBuilder()
          .setTitle(`⚔️ ${katana.name}`)
          .setColor(colors[katana.rarity] ?? 0xffffff)
          .addFields({ name: 'Recette', value: '🌫️ **Recette inconnue**' });

        return replyAndDelete(interaction, { embeds: [embed] });
      }

      const isWoodKatana =
        normalize(katana.name) === normalize('Katana en Bois') ||
        normalize(katana.name) === normalize('Katana en bois');

      if (isWoodKatana) {
        const embed = new EmbedBuilder()
          .setTitle(`⚔️ ${katana.name}`)
          .setColor(colors[katana.rarity] ?? 0xffffff)
          .addFields(
            { name: '💴 Coût total', value: '**0¥**', inline: true },
            { name: '🧱 Détails', value: '```txt\n🌿 Bois x40 — Farm\n```' }
          );

        return replyAndDelete(interaction, { embeds: [embed] });
      }

      const { total, lines, error } = calcTotal(katana.resources || {});
      if (error) return replyAndDelete(interaction, { content: error });

      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${katana.name}`)
        .setColor(colors[katana.rarity] ?? 0xffffff)
        .addFields(
          { name: 'Rareté', value: katana.rarity, inline: true },
          { name: '💴 Coût total', value: `**${total.toLocaleString()}¥**`, inline: true },
          { name: '🧱 Détails (lisible)', value: toTreeBlock(lines) }
        );

      return replyAndDelete(interaction, { embeds: [embed] });
    }
  }
};

