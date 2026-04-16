import {
  SlashCommandBuilder,
  ChannelType,
} from 'discord.js';
import { stopSelfbot, getActiveBots } from '../lib/selfbotManager.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sbstop')
    .setDescription('Stop a running selfbot')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel where the selfbot is running')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel', true);

    const result = stopSelfbot(interaction.user.id, channel.id);

    if (result.success) {
      await interaction.reply({
        content: `⏹️ ${result.message}`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `❌ ${result.error}`,
        ephemeral: true,
      });
    }
  },
};
