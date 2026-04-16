import { ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, ActionRowBuilder } from 'discord.js';
import { saveToken, hasToken } from '../lib/tokenDb.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sbcreate')
    .setDescription('Register a Discord selfbot token for later use'),

  async execute(interaction) {
    if (hasToken(interaction.user.id)) {
      await interaction.reply({
        content: 'You already have a registered selfbot token. Use `/sbdelete` to remove it first.',
        ephemeral: true,
      });

      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('sbtoken_modal')
      .setTitle('Register Selfbot Token');

    const tokenInput = new TextInputBuilder()
      .setCustomId('token_input')
      .setLabel('Discord Account Token')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Paste your Discord selfbot token here')
      .setRequired(true);

    const warningInput = new TextInputBuilder()
      .setCustomId('warning_acknowledgement')
      .setLabel('Type "I understand the risks"')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('I understand the risks')
      .setRequired(true);

    const row1 = new ActionRowBuilder().addComponents(tokenInput);
    const row2 = new ActionRowBuilder().addComponents(warningInput);

    modal.addComponents(row1, row2);

    await interaction.showModal(modal);
  },
};
