import { REST, Routes } from 'discord.js';
import { config } from '../config.js';

export async function registerCommands(commandJson) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body: commandJson });

  const scope = config.guildId ? `guild ${config.guildId}` : 'global';
  return { scope, count: commandJson.length };
}