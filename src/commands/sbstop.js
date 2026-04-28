import {
  SlashCommandBuilder,
  ChannelType,
} from 'discord.js';
import { stopSelfbot, getActiveBots } from '../lib/selfbotManager.js';
import { hasAccess } from '../lib/entitlements.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sbstop')
    .setDescription('Stop a running selfbot')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel where the selfbot is running')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!hasAccess(interaction.user.id, 'selfbot')) {
      await interaction.reply({
        content: 'This feature requires premium access. Run `/subscribe` to unlock!',
        ephemeral: true,
      });
      return;
    }

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
