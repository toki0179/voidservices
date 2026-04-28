import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { hasToken } from '../lib/tokenDb.js';
import { hasAccess } from '../lib/entitlements.js';

export const LLM_MODELS = [
  { value: 'llama3.2:3b', label: 'Llama 3.2 3B', description: "Meta's efficient 3.2B parameter model" },
  { value: 'deepseek-r1:latest', label: 'DeepSeek R1', description: 'Strong reasoning capabilities built on Qwen' },
  { value: 'gpt-oss:20b', label: 'GPT OSS 20B', description: 'Powerful Gemma-based 20B completion model' },
  { value: 'mistral:latest', label: 'Mistral Latest', description: 'High-performance baseline Mistral model' },
  { value: 'mistral-nemo:custom', label: 'Mistral Nemo', description: '12.2B open weights language model' },
  { value: 'bakllava:latest', label: 'BakLLaVA', description: 'Vision and language model' },
  { value: 'smollm2:135m', label: 'SmolLM2 135M', description: 'Extremely lightweight assistant' },
];

export const PROMPT_PRESETS = [
  {
    value: 'helpful-assistant',
    label: 'Helpful Assistant',
    description: 'Friendly and concise everyday assistant',
    prompt: 'You are a helpful assistant. Keep responses clear, practical, and brief unless asked for more detail.',
  },
  {
    value: 'reasoning-mode',
    label: 'Reasoning Mode',
    description: 'Structured reasoning with clear steps',
    prompt: 'Think through problems in clear steps, then provide a concise final answer.',
  },
  {
    value: 'social-replies',
    label: 'Social Replies',
    description: 'Natural conversation for chat channels',
    prompt: 'Reply naturally like a real person in chat. Be short, warm, and avoid sounding robotic.',
  },
  {
    value: 'strict-facts',
    label: 'Strict Facts',
    description: 'Prioritize accuracy and uncertainty',
    prompt: 'Prioritize factual accuracy. If uncertain, say so clearly and avoid making up details.',
  },
  {
    value: 'creative-brainstorm',
    label: 'Creative Brainstorm',
    description: 'Idea generation with varied options',
    prompt: 'Generate creative options and alternatives. Include at least three distinct ideas when appropriate.',
  },
];

export function getDefaultSbRunConfig() {
  return {
    model: LLM_MODELS[0]?.value ?? 'mistral:latest',
    preset: 'none',
    customPrompt: '',
    listenToDms: true,
  };
}

function getSelectedPromptPreset(presetValue) {
  return PROMPT_PRESETS.find((preset) => preset.value === presetValue) ?? null;
}

export function resolveBasePrompt(config) {
  const preset = getSelectedPromptPreset(config.preset);
  const presetPrompt = preset?.prompt?.trim() ?? '';
  const customPrompt = (config.customPrompt ?? '').trim();

  if (presetPrompt && customPrompt) {
    return `${presetPrompt}\n\n${customPrompt}`;
  }
  return customPrompt || presetPrompt || '';
}

export function buildSbRunSetupUi(channelRef, config) {
  const selectedPreset = getSelectedPromptPreset(config.preset);
  const selectedPromptLabel = selectedPreset ? selectedPreset.label : 'No preset';
  const hasCustomPrompt = Boolean((config.customPrompt ?? '').trim());
  const dmListeningLabel = config.listenToDms ? 'On' : 'Off';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Selfbot Setup')
    .setDescription(`Configure your selfbot for ${channelRef} before starting.`)
    .addFields(
      { name: 'Model', value: config.model, inline: true },
      { name: 'Prompt Preset', value: selectedPromptLabel, inline: true },
      { name: 'Custom Prompt', value: hasCustomPrompt ? 'Configured' : 'Not set', inline: true },
      { name: 'Listen to DMs', value: dmListeningLabel, inline: true },
    );

  const modelMenu = new StringSelectMenuBuilder()
    .setCustomId(`sbrun:model:${channelRef.replace(/\D/g, '')}`)
    .setPlaceholder('Choose model')
    .addOptions(
      LLM_MODELS.map((model) => ({
        label: model.label,
        description: model.description,
        value: model.value,
        default: model.value === config.model,
      })),
    );

  const promptPresetMenu = new StringSelectMenuBuilder()
    .setCustomId(`sbrun:preset:${channelRef.replace(/\D/g, '')}`)
    .setPlaceholder('Choose prompt preset (optional)')
    .addOptions([
      {
        label: 'No Preset',
        description: 'Run without a predefined prompt',
        value: 'none',
        default: config.preset === 'none',
      },
      ...PROMPT_PRESETS.map((preset) => ({
        label: preset.label,
        description: preset.description,
        value: preset.value,
        default: preset.value === config.preset,
      })),
    ]);

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sbrun:dms:${channelRef.replace(/\D/g, '')}`)
      .setLabel(`DMs: ${dmListeningLabel}`)
      .setStyle(config.listenToDms ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`sbrun:prompt:${channelRef.replace(/\D/g, '')}`)
      .setLabel('Set Custom Prompt')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`sbrun:start:${channelRef.replace(/\D/g, '')}`)
      .setLabel('Start Selfbot')
      .setStyle(ButtonStyle.Success),
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(modelMenu),
      new ActionRowBuilder().addComponents(promptPresetMenu),
      buttonRow,
    ],
  };
}

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
    if (!(await hasAccess(interaction.user.id, 'selfbot'))) {
      await interaction.reply({
        content: 'This feature requires premium access. Run `/subscribe` to unlock!',
        ephemeral: true,
      });

      return;
    }

    if (!await hasToken(interaction.user.id)) {
      await interaction.reply({
        content: 'You need to register a token first using `/sbcreate`.',
        ephemeral: true,
      });

      return;
    }

    const channel = interaction.options.getChannel('channel', true);
    const config = getDefaultSbRunConfig();
    const ui = buildSbRunSetupUi(channel.toString(), config);

    await interaction.reply({
      embeds: ui.embeds,
      components: ui.components,
      ephemeral: true,
    });
  },
};
