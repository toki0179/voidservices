import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCommands } from './lib/commandLoader.js';
import { registerCommands } from './lib/registerCommands.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsDirectory = path.join(__dirname, 'commands');

const { commandJson } = await loadCommands(commandsDirectory);
const result = await registerCommands(commandJson);
console.log(`Registered ${result.count} slash command(s) to ${result.scope}.`);
