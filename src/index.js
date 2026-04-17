import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRowBuilder,
  Client,
  Collection,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './lib/commandLoader.js';
import { registerCommands } from './lib/registerCommands.js';
import { saveToken, getToken } from './lib/tokenDb.js';
import { startSelfbot } from './lib/selfbotManager.js';
import { startResidentialProxySyncJob } from './lib/proxySync.js';
import {
  buildSbRunSetupUi,
  getDefaultSbRunConfig,
  resolveBasePrompt,
} from './commands/sbrun.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsDirectory = path.join(__dirname, 'commands');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const { commands, commandJson } = await loadCommands(commandsDirectory);
client.commands = new Collection(commands);

const deployment = await registerCommands(commandJson);
console.log(`Registered ${deployment.count} slash command(s) to ${deployment.scope}.`);

const proxyStatusChannelId = '1494340219535753558';

const sbRunSetupState = new Map();
const setupTtlMs = 15 * 60 * 1000;

function makeSetupKey(userId, channelId) {
  return `${userId}:${channelId}`;
}

function parseSetupCustomId(customId, expectedAction) {
  const parts = String(customId || '').split(':');
  if (parts.length !== 3) {
    return null;
  }
  if (parts[0] !== 'sbrun' || parts[1] !== expectedAction) {
    return null;
  }
  return parts[2] || null;
}

function pruneSetupState() {
  const now = Date.now();
  for (const [key, value] of sbRunSetupState.entries()) {
    if (now - value.updatedAt > setupTtlMs) {
      sbRunSetupState.delete(key);
    }
  }
}

function getSetupState(userId, channelId) {
  const key = makeSetupKey(userId, channelId);
  const existing = sbRunSetupState.get(key);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }

  const fresh = {
    ...getDefaultSbRunConfig(),
    updatedAt: Date.now(),
  };
  sbRunSetupState.set(key, fresh);
  return fresh;
}

function setSetupState(userId, channelId, nextState) {
  sbRunSetupState.set(makeSetupKey(userId, channelId), {
    ...nextState,
    updatedAt: Date.now(),
  });
}

function clearSetupState(userId, channelId) {
  sbRunSetupState.delete(makeSetupKey(userId, channelId));
}

async function sendUserDm(userId, content) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(content);
  } catch (error) {
    console.error('Failed to send user DM:', error);
  }
}

async function sendCreatorLog(content) {
  if (!config.creatorId) {
    return;
  }

  try {
    const creator = await client.users.fetch(config.creatorId);
    await creator.send(content);
  } catch (error) {
    console.error('Failed to send creator log DM:', error);
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  startResidentialProxySyncJob({
    onRunCompleted: async (result) => {
      try {
        const channel = await client.channels.fetch(proxyStatusChannelId);
        if (!channel || !channel.isTextBased()) {
          console.error(`[proxy-sync] Channel ${proxyStatusChannelId} is unavailable or not text-based.`);
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('Residential Proxy Sync Complete')
          .setColor(0x2b8a3e)
          .addFields(
            { name: 'Restocked', value: String(result.restocked), inline: true },
            { name: 'Active', value: String(result.active), inline: true },
            { name: 'Removed', value: String(result.removed), inline: true },
            { name: 'Candidates Checked', value: String(result.candidates), inline: true }
          )
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      } catch (error) {
        console.error('[proxy-sync] Failed to send status embed:', error);
      }
    },
  });
  console.log('Started residential proxy sync job (startup + daily).');
});

client.on(Events.InteractionCreate, async (interaction) => {
  pruneSetupState();

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'sbtoken_modal') {
      const token = interaction.fields.getTextInputValue('token_input');
      const acknowledgement = interaction.fields.getTextInputValue('warning_acknowledgement');

      if (acknowledgement.toLowerCase() !== 'i understand the risks') {
        await interaction.reply({
          content: 'You must acknowledge the risks to register a token.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        saveToken(interaction.user.id, token);
        await interaction.reply({
          content: '✅ Token registered successfully! You can now use `/sbrun` to start a selfbot.',
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        console.error('Token save error:', error);
        await interaction.reply({
          content: 'Failed to save token. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const promptChannelId = parseSetupCustomId(interaction.customId, 'promptModal');
    if (promptChannelId) {
      const setupState = getSetupState(interaction.user.id, promptChannelId);
      const customPrompt = interaction.fields.getTextInputValue('sbrun_custom_prompt') || '';
      setSetupState(interaction.user.id, promptChannelId, {
        ...setupState,
        customPrompt,
      });

      await interaction.reply({
        content: `Custom prompt saved for <#${promptChannelId}>. Press Start Selfbot when ready.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const modelChannelId = parseSetupCustomId(interaction.customId, 'model');
    if (modelChannelId) {
      const setupState = getSetupState(interaction.user.id, modelChannelId);
      const updatedState = {
        ...setupState,
        model: interaction.values[0],
      };
      setSetupState(interaction.user.id, modelChannelId, updatedState);

      await interaction.update(buildSbRunSetupUi(`<#${modelChannelId}>`, updatedState));
      return;
    }

    const dmChannelId = parseSetupCustomId(interaction.customId, 'dms');
    if (dmChannelId) {
      const setupState = getSetupState(interaction.user.id, dmChannelId);
      const updatedState = {
        ...setupState,
        listenToDms: !setupState.listenToDms,
      };
      setSetupState(interaction.user.id, dmChannelId, updatedState);

      await interaction.update(buildSbRunSetupUi(`<#${dmChannelId}>`, updatedState));
      return;
    }

    const presetChannelId = parseSetupCustomId(interaction.customId, 'preset');
    if (presetChannelId) {
      const setupState = getSetupState(interaction.user.id, presetChannelId);
      const updatedState = {
        ...setupState,
        preset: interaction.values[0],
      };
      setSetupState(interaction.user.id, presetChannelId, updatedState);

      await interaction.update(buildSbRunSetupUi(`<#${presetChannelId}>`, updatedState));
      return;
    }
    return;
  }

  if (interaction.isButton()) {
    const dmChannelId = parseSetupCustomId(interaction.customId, 'dms');
    if (dmChannelId) {
      const setupState = getSetupState(interaction.user.id, dmChannelId);
      const updatedState = {
        ...setupState,
        listenToDms: !setupState.listenToDms,
      };
      setSetupState(interaction.user.id, dmChannelId, updatedState);

      await interaction.update(buildSbRunSetupUi(`<#${dmChannelId}>`, updatedState));
      return;
    }

    const promptChannelId = parseSetupCustomId(interaction.customId, 'prompt');
    if (promptChannelId) {
      const setupState = getSetupState(interaction.user.id, promptChannelId);
      const modal = new ModalBuilder()
        .setCustomId(`sbrun:promptModal:${promptChannelId}`)
        .setTitle('Custom Selfbot Prompt');

      const promptInput = new TextInputBuilder()
        .setCustomId('sbrun_custom_prompt')
        .setLabel('Optional prompt to apply to every reply')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Example: Be concise and avoid slang.')
        .setMaxLength(1200);

      const existingPrompt = (setupState.customPrompt || '').trim();
      if (existingPrompt) {
        promptInput.setValue(existingPrompt.slice(0, 1200));
      }

      modal.addComponents(new ActionRowBuilder().addComponents(promptInput));
      await interaction.showModal(modal);
      return;
    }

    const startChannelId = parseSetupCustomId(interaction.customId, 'start');
    if (startChannelId) {
      try {
        const token = getToken(interaction.user.id);

        if (!token) {
          await interaction.reply({
            content: 'Token not found. Please use /sbcreate first.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const setupState = getSetupState(interaction.user.id, startChannelId);
        const basePrompt = resolveBasePrompt(setupState);
        const result = startSelfbot(
          interaction.user.id,
          token,
          startChannelId,
          setupState.model,
          {
            basePrompt,
            listenToDms: setupState.listenToDms,
            notify: (content) => sendUserDm(interaction.user.id, content),
            notifyError: (content) => sendCreatorLog(content),
            notifyCaptcha: (content) => sendUserDm(interaction.user.id, content),
          },
        );

        if (result.success) {
          clearSetupState(interaction.user.id, startChannelId);
          await interaction.reply({
            content: `✅ ${result.message}`,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: `❌ ${result.error}`,
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (error) {
        console.error('Selfbot start error:', error);
        await interaction.reply({
          content: `Failed to start selfbot: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    await interaction.reply({
      content: 'That command is not available right now.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Command failed: ${interaction.commandName}`, error);

    const payload = {
      content: 'Something went wrong while running that command.',
      flags: MessageFlags.Ephemeral,
    };

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
        return;
      }

      await interaction.reply(payload);
    } catch (responseError) {
      console.error('Failed to send command error response:', responseError);
    }
  }
});

await client.login(config.token);
