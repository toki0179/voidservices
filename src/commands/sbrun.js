import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { hasToken } from '../lib/tokenDb.js';

const LLM_MODELS = [
  { value: 'neural-chat', label: 'Neural Chat', description: 'Fast, conversational, resource-efficient' },
  { value: 'zephyr', label: 'Zephyr', description: 'Humanlike, natural conversations' },
  { value: 'mistral', label: 'Mistral', description: 'Powerful reasoning and analysis' },
  { value: 'openhermes', label: 'OpenHermes', description: 'Helpful and versatile responses' },
  { value: 'dolphin-mixtral', label: 'Dolphin Mixtral', description: 'Advanced reasoning and knowledge' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('sbrun')
    .setDescription('Start a selfbot chatbot in this channel')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel to run the selfbot in')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!hasToken(interaction.user.id)) {
      await interaction.reply({
        content: 'You need to register a token first using `/sbcreate`.',
        ephemeral: true,
      });

      return;
    }

    const channel = interaction.options.getChannel('channel', true);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('llm_model_select')
      .setPlaceholder('Select an LLM model')
      .addOptions(
        LLM_MODELS.map((model) => ({
          label: model.label,
          description: model.description,
          value: model.value,
        })),
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Select LLM Model')
      .setDescription(`Choose which AI model to use for the selfbot in ${channel}`);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },
};
