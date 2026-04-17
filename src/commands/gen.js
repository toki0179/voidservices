import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageFlags, SlashCommandBuilder } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const defaultScript = path.join(projectRoot, 'generator', 'main.py');
const defaultVenvPython = path.join(projectRoot, '.venv', 'bin', 'python');
const executionTimeoutMs = 30000;
const maxOutputLength = 1800;

function resolvePythonCommand() {
  const configured = process.env.GEN_PYTHON;

  if (configured && existsSync(configured)) {
    return configured;
  }

  if (existsSync(defaultVenvPython)) {
    return defaultVenvPython;
  }

  return 'python3';
}

function resolvePythonScript() {
  const configured = process.env.GEN_SCRIPT;

  if (configured && existsSync(configured)) {
    return configured;
  }

  return defaultScript;
}

function trimOutput(value) {
  const text = String(value || '').trim();
  if (!text) {
    return 'No output.';
  }

  if (text.length <= maxOutputLength) {
    return text;
  }

  return `${text.slice(0, maxOutputLength)}\n... output truncated ...`;
}

function runPython(numberValue) {
  const pythonScript = resolvePythonScript();

  if (!existsSync(pythonScript)) {
    throw new Error(`Python script not found: ${pythonScript}`);
  }

  const pythonCommand = resolvePythonCommand();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCommand, [pythonScript, String(numberValue)], {
      cwd: projectRoot,
      env: {
        ...process.env,
        GEN_NUMBER: String(numberValue),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) {
        return;
      }

      finished = true;
      child.kill('SIGTERM');
      reject(new Error(`Python process timed out after ${executionTimeoutMs / 1000}s`));
    }, executionTimeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timeout);
      resolve({
        code,
        signal,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
      });
    });
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('gen')
    .setDescription('Run the configured Python generator file with a number input')
    .addNumberOption((option) =>
      option
        .setName('number')
        .setDescription('Required number to pass into the Python process')
        .setRequired(true),
    ),

  async execute(interaction) {
    const numberValue = interaction.options.getNumber('number', true);

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const result = await runPython(numberValue);

      if (result.code !== 0) {
        await interaction.editReply(
          [
            `Python process exited with code ${result.code}${result.signal ? ` (signal: ${result.signal})` : ''}.`,
            `stderr:\n\`\`\`${result.stderr}\`\`\``,
            `stdout:\n\`\`\`${result.stdout}\`\`\``,
          ].join('\n\n'),
        );
        return;
      }

      await interaction.editReply(
        [
          `Started Python file successfully with number: ${numberValue}.`,
          `stdout:\n\`\`\`${result.stdout}\`\`\``,
        ].join('\n\n'),
      );
    } catch (error) {
      await interaction.editReply(`Failed to launch Python process: ${error.message}`);
    }
  },
};