import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function readCommandFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await readCommandFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }

  return files;
}

export async function loadCommands(commandsDirectory) {
  const commandFiles = await readCommandFiles(commandsDirectory);
  const commands = new Map();

  for (const filePath of commandFiles) {
    const loadedModule = await import(pathToFileURL(filePath).href);
    const command = loadedModule.default;

    if (!command?.data?.name || typeof command.execute !== 'function') {
      throw new Error(`Invalid command module: ${filePath}`);
    }

    commands.set(command.data.name, command);
  }

  return {
    commands,
    commandJson: [...commands.values()].map((command) => command.data.toJSON()),
  };
}
