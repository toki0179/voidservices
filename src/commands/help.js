import { MessageFlags, SlashCommandBuilder } from 'discord.js';

const commandSummaries = [
  ['ping', 'Checks bot responsiveness.'],
  ['help', 'Lists the built-in commands.'],
  ['gen', 'Runs the configured Python generator with a required number input.'],
  ['showcase', 'Generates a branded demo card.'],
  ['classic', 'Creates a clearly fictional Nitro Classic parody card.'],
  ['boost', 'Creates a fictional Nitro-style proof card from slash command inputs.'],
];

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show the built-in V0iD commands.'),

  async execute(interaction) {
    const commandList = commandSummaries
      .map(([name, description]) => `/${name} - ${description}`)
      .join('\n');

    await interaction.reply({
      content: `Here are the built-in V0iD commands:\n${commandList}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};