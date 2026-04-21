import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getAccountsByDate } from '../lib/accountsDb.js';
import { getAllResidentialProxies } from '../lib/proxyDb.js';
import fetch from 'node-fetch';
import { fileURLToPath } from 'node:url';
import { AttachmentBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const defaultScript = path.join(projectRoot, 'generator', 'main.py');
const defaultVenvPython = path.join(projectRoot, '.venv', 'bin', 'python');
const executionTimeoutMs = 600000;
const maxOutputLength = 1800;
const DISCORD_MESSAGE_LIMIT = 1900; // leave room for backticks and iteration header

function resolvePythonCommand() {
  const configured = process.env.GEN_PYTHON;
  if (configured && existsSync(configured)) return configured;
  if (existsSync(defaultVenvPython)) return defaultVenvPython;
  return 'python3';
}

function resolvePythonScript() {
  const configured = process.env.GEN_SCRIPT;
  if (configured && existsSync(configured)) return configured;
  return defaultScript;
}

function trimOutput(value) {
  const text = String(value || '').trim();
  if (!text) return 'No output.';
  if (text.length <= maxOutputLength) return text;
  return `${text.slice(0, maxOutputLength)}\n... output truncated ...`;
}

async function sendLogDm(userId, client, message, attachments = []) {
  if (!message || typeof message !== 'string') {
    console.error(`[sendLogDm] Invalid message: ${message}`);
    return;
  }

  // Truncate message to Discord limit
  let finalMessage = message;
  if (finalMessage.length > DISCORD_MESSAGE_LIMIT) {
    finalMessage = finalMessage.slice(0, DISCORD_MESSAGE_LIMIT - 50) + '\n... (truncated)';
  }

  try {
    const user = await client.users.fetch(userId);
    await user.send({ content: finalMessage, files: attachments });
  } catch (error) {
    console.error(`[sendLogDm] Failed to send DM to ${userId}:`, error);
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
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let finished = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGTERM');
      reject(new Error(`Python process timed out after ${executionTimeoutMs / 1000}s`));
    }, executionTimeoutMs);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (onLog) onLog(line + '\n', 'stdout');
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      stderrBuffer += text;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        if (onLog) onLog(line + '\n', 'stderr');
      }
    });

    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (stdoutBuffer && onLog) onLog(stdoutBuffer, 'stdout');
      if (stderrBuffer && onLog) onLog(stderrBuffer, 'stderr');

      let generatedFile = null;
      // look for a log that looks like LOG: Credentials saved to {credentials_filename}
      
      const credsMatch = stdout.match(/LOG:Credentials saved to (.+)/);
      if (credsMatch && credsMatch[1]) generatedFile = credsMatch[1].trim();
      // If 2 groups, the second is the filename, but we should combine them for with / if needed
      const credsMatch2 = stdout.match(/LOG:Credentials saved to (.+)\/(.+)/);
      if (credsMatch2 && credsMatch2[1] && credsMatch2[2]) {
        generatedFile = path.join(credsMatch2[1].trim(), credsMatch2[2].trim());
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
      option.setName('number').setDescription('Number of iterations').setRequired(true)
    ),

  async execute(interaction) {
    const numberValue = interaction.options.getNumber('number', true);
    const userId = interaction.user.id;
    const client = interaction.client;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let logBuffer = '';
    let pendingLine = '';
    const logFlushInterval = 5000;

    const flushLogs = async () => {
      const allText = pendingLine + logBuffer;
      if (!allText.trim()) return;

      const lines = allText.split(/\r?\n/);
      pendingLine = lines.pop() || '';
      const logLines = lines.filter(line => line.startsWith('LOG:'));

      if (logLines.length) {
        let message = `\`\`\`[Iteration: ${numberValue}]\n${logLines.join('\n')}\`\`\``;
        // Truncate if too long
        if (message.length > DISCORD_MESSAGE_LIMIT) {
          const available = DISCORD_MESSAGE_LIMIT - `\`\`\`[Iteration: ${numberValue}]\n...\`\`\``.length - 10;
          const truncatedContent = logLines.join('\n').slice(0, available) + '\n... (truncated)';
          message = `\`\`\`[Iteration: ${numberValue}]\n${truncatedContent}\`\`\``;
        }
        await sendLogDm(userId, client, message);
      }
      logBuffer = '';
    };

    const logInterval = setInterval(async () => {
      await flushLogs();
    }, logFlushInterval);

    const onLog = (text) => {
      logBuffer += text;
    };

    try {
      await interaction.editReply({
        content: `🚀 Generation started with **${numberValue}** iterations. Sending logs via DM…\n*Check your DMs for real‑time progress.*`,
      });

      // --- Run Python child process for each iteration with working proxy ---
      const results = [];
      for (let i = 0; i < numberValue; i++) {
        // Pass proxy to child process via env
        await new Promise((resolve, reject) => {
          const pythonScript = resolvePythonScript();
          const pythonCommand = resolvePythonCommand();
          const child = spawn(pythonCommand, [pythonScript, String(1)], {
            cwd: projectRoot,
            env: {
              ...process.env,
              GEN_NUMBER: '1',
              PYTHONUNBUFFERED: '1',
              GEN_PROXY: proxy,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
          child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
          child.on('close', (code) => {
            results.push({ code, stdout, stderr });
            resolve();
          });
          child.on('error', reject);
        });
      }

      // --- After all iterations, send today's accounts as .txt ---
      const today = new Date().toISOString().slice(0, 10);
      const accounts = getAccountsByDate(today);
      if (accounts.length) {
        const lines = accounts.map(a => `${a.username}:${a.email}:${a.password}`).join('\n');
        const attachment = new AttachmentBuilder(Buffer.from(lines, 'utf-8'), {
          name: `accounts_${today}.txt`,
        });
        await interaction.editReply(`✅ Generation complete with **${accounts.length}** accounts. File sent via DM.`);
        await sendLogDm(userId, client, `Generated accounts for ${today}:`, [attachment]);
      } else {
        await interaction.editReply(`✅ Generation complete but no accounts were created today.`);
      }
    } catch (error) {
      clearInterval(logInterval);
      await flushLogs();
      await interaction.editReply(`❌ Failed to launch Python process: ${error.message}`);
    }
  },
};