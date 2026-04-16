import { SlashCommandBuilder } from 'discord.js';
import { renderParodyCard } from '../lib/renderParodyCard.js';

export default {
  data: new SlashCommandBuilder()
    .setName('classic')
    .setDescription('Create a fictional Nitro Classic parody card (not proof).')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Display name for the parody card')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('note')
        .setDescription('Optional note to include on the card')
        .setMaxLength(120),
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name', true);
    const note = interaction.options.getString('note') ?? 'Built for fun. Not a receipt or proof.';

    const image = await renderParodyCard({
      plan: 'Nitro Classic',
      name,
      detail: 'Monthly mock subscription',
      note,
    });

    await interaction.reply({
      content: 'Generated a parody card image. This is fictional and not valid proof.',
      files: [image],
    });
  },
};