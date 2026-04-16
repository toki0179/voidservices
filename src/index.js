import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './lib/commandLoader.js';
import { registerCommands } from './lib/registerCommands.js';
import { saveToken, getToken } from './lib/tokenDb.js';
import { startSelfbot } from './lib/selfbotManager.js';

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

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
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
    return;
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'llm_model_select') {
      const selectedModel = interaction.values[0];
      const channelIdMatch = interaction.message.embeds[0]?.description?.match(/\d+/);
      const channelId = channelIdMatch ? channelIdMatch[0] : null;

      if (!channelId) {
        await interaction.reply({
          content: 'Error: Could not determine target channel.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        const token = getToken(interaction.user.id);

        if (!token) {
          await interaction.reply({
            content: 'Token not found. Please use `/sbcreate` first.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const result = startSelfbot(
          interaction.user.id,
          token,
          channelId,
          selectedModel,
          interaction.user.id,
        );

        if (result.success) {
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
    }
    return;
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
