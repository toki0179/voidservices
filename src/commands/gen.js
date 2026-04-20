import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttachmentBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const defaultScript = path.join(projectRoot, 'generator', 'main.py');
const defaultVenvPython = path.join(projectRoot, '.venv', 'bin', 'python');
const executionTimeoutMs = 600000;
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

async function sendLogDm(userId, client, message, attachments = []) {
  try {
    const user = await client.users.fetch(userId);
    await user.send({ content: message });
  } catch (error) {
    console.error('Failed to send log DM:', error);
  }
}

function runPython(numberValue, onLog) {
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
      const text = chunk.toString();
      stdout += text;
      if (onLog) {
        onLog(text, 'stdout');
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onLog) {
        onLog(text, 'stderr');
      }
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

      // Parse GENERATED_FILE from stdout if present
      let generatedFile = null;
      const fileMatch = stdout.match(/GENERATED_FILE:(.+)/);
      if (fileMatch && fileMatch[1]) {
        generatedFile = fileMatch[1].trim();
      }

      resolve({
        code,
        signal,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        generatedFile,
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
    const userId = interaction.user.id;
    const client = interaction.client;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    // Set up real-time logging via DM (only LOG: lines, no screenshots)
    let logBuffer = '';
    const logFlushInterval = 5000; // Send DM every 5 seconds
    const flushLogs = async () => {
      if (!logBuffer.trim()) return;
      const logLines = logBuffer.split(/\r?\n/).filter(line => line.startsWith('LOG:'));
      if (logLines.length) {
          await sendLogDm(userId, client, `\`\`\`[Iteration: ${numberValue}]\n${logLines.join('\n')}\`\`\``);
      }
      logBuffer = '';
    };

    const logInterval = setInterval(async () => {
      await flushLogs();
    }, logFlushInterval);

    const onLog = (text, type) => {
      logBuffer += text;
    };

    try {
      await interaction.editReply({
        content: `🚀 Generation started with ${numberValue} iterations. Sending logs via DM...\n**Check your DMs for real-time progress logs.**`,
      });

      const result = await runPython(numberValue, onLog);

      // Flush remaining logs
      clearInterval(logInterval);
      await flushLogs();

      if (result.code !== 0) {
        await interaction.editReply(
          [
            `⚠️ Python process exited with code ${result.code}${result.signal ? ` (signal: ${result.signal})` : ''}.`,
            `Check your DMs for complete process logs.`,
          ].join('\n'),
        );
        return;
      }

      // If a credentials file was generated, send it as attachment
      if (result.generatedFile && existsSync(result.generatedFile)) {
        try {
          const filePath = path.join(projectRoot, result.generatedFile);
          const fileContent = readFileSync(filePath, 'utf-8');
          const attachment = new AttachmentBuilder(Buffer.from(fileContent), {
            name: path.basename(result.generatedFile),
          });

          await interaction.editReply({
            content: `✅ Generation complete with ${numberValue} iterations. Credentials file sent via DM.`,
          });

          // Send the file via DM
          await sendLogDm(userId, client, `Generated credentials file: ${path.basename(result.generatedFile)}`);
          const user = await client.users.fetch(userId);
          await user.send({
            files: [attachment],
          });
        } catch (fileError) {
          await interaction.editReply(
            `Generated file path found (${result.generatedFile}) but failed to read it: ${fileError.message}`,
          );
        }
        return;
      }

      // Fallback: send normal output
      await interaction.editReply(
        [
          `✅ Generation complete with ${numberValue} iterations.`,
          `Check your DMs for complete process logs.`,
        ].join('\n'),
      );
    } catch (error) {
      clearInterval(logInterval);
      await flushLogs();
      await interaction.editReply(`❌ Failed to launch Python process: ${error.message}`);
    }
  },
};