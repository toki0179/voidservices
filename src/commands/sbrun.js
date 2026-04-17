import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { hasToken } from '../lib/tokenDb.js';

const LLM_MODELS = [
  { value: 'llama3.2:3b', label: 'Llama 3.2 3B', description: "Meta's efficient 3.2B parameter model" },
  { value: 'deepseek-r1:latest', label: 'DeepSeek R1', description: 'Strong reasoning capabilities built on Qwen' },
  { value: 'gpt-oss:20b', label: 'GPT OSS 20B', description: 'Powerful Gemma-based 20B completion model' },
  { value: 'mistral:latest', label: 'Mistral Latest', description: 'High-performance baseline Mistral model' },
  { value: 'mistral-nemo:custom', label: 'Mistral Nemo', description: '12.2B open weights language model' },
  { value: 'bakllava:latest', label: 'BakLLaVA', description: 'Vision and language model' },
  { value: 'smollm2:135m', label: 'SmolLM2 135M', description: 'Extremely lightweight assistant' },
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
