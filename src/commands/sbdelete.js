import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { deleteToken, hasToken } from '../lib/tokenDb.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sbdelete')
    .setDescription('Delete your registered selfbot token'),

  async execute(interaction) {
    if (!hasToken(interaction.user.id)) {
      await interaction.reply({
        content: 'You do not have a registered token.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      deleteToken(interaction.user.id);
      await interaction.reply({
        content: '✅ Token deleted successfully.',
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Token delete error:', error);
      await interaction.reply({
        content: 'Failed to delete token. Please try again.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
