import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('showcase')
    .setDescription('Generate a branded demo card for V0iD.')
    .addStringOption((option) => option.setName('title').setDescription('Card title'))
    .addStringOption((option) => option.setName('subtitle').setDescription('Card subtitle')),

  async execute(interaction) {
    const title = interaction.options.getString('title') ?? 'V0iD Demo Card';
    const subtitle = interaction.options.getString('subtitle') ?? 'Slash-command ready and feature friendly.';

    const embed = new EmbedBuilder()
      .setColor(0x111827)
      .setTitle(title)
      .setDescription(subtitle)
      .addFields(
        { name: 'Status', value: 'Ready for future modules', inline: true },
        { name: 'Format', value: 'Discord embed demo', inline: true },
      )
      .setFooter({ text: 'V0iD' });

    await interaction.reply({ embeds: [embed] });
  },
};