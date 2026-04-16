import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether V0iD is alive and responsive.'),

  async execute(interaction) {
    const sentAt = Date.now();
    await interaction.reply('Pinging...');
    const roundTripMs = Date.now() - sentAt;

    await interaction.editReply(`Pong. Round-trip time: ${roundTripMs}ms`);
  },
};