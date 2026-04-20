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
  if (!text) return 'No output.';
  if (text.length <= maxOutputLength) return text;
  return `${text.slice(0, maxOutputLength)}\n... output truncated ...`;
}

async function sendLogDm(userId, client, message, attachments = []) {
  try {
    const user = await client.users.fetch(userId);
    await user.send({ content: message, files: attachments });
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
        PYTHONUNBUFFERED: '1',   // ← critical: disables stdout buffering
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let finished = false;
    let stdoutBuffer = '';   // persistent line buffer for stdout
    let stderrBuffer = '';   // persistent line buffer for stderr

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
      stdoutBuffer = lines.pop() || '';   // keep incomplete line
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

      // flush remaining buffered lines
      if (stdoutBuffer && onLog) onLog(stdoutBuffer, 'stdout');
      if (stderrBuffer && onLog) onLog(stderrBuffer, 'stderr');

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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // real‑time logging via DM
    let logBuffer = '';
    let pendingLine = '';          // carry over incomplete line across flushes
    const logFlushInterval = 5000;

    const flushLogs = async () => {
      const allText = pendingLine + logBuffer;
      if (!allText.trim()) return;

      const lines = allText.split(/\r?\n/);
      pendingLine = lines.pop() || '';   // save incomplete line for next time
      const logLines = lines.filter(line => line.startsWith('LOG:'));

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
        content: `🚀 Generation started with **${numberValue}** iterations. Sending logs via DM…\n*Check your DMs for real‑time progress.*`,
      });

      const result = await runPython(numberValue, onLog);

      clearInterval(logInterval);
      await flushLogs();   // final flush

      if (result.code !== 0) {
        await interaction.editReply(
          `⚠️ Python process exited with code ${result.code}${result.signal ? ` (signal: ${result.signal})` : ''}.\nCheck your DMs for complete logs.`
        );
        return;
      }

      // If a credentials file was generated, send it as attachment
      if (result.generatedFile && existsSync(result.generatedFile)) {
        const filePath = path.join(projectRoot, result.generatedFile);
        const fileContent = readFileSync(filePath, 'utf-8');
        const attachment = new AttachmentBuilder(Buffer.from(fileContent), {
          name: path.basename(result.generatedFile),
        });

        await interaction.editReply(`✅ Generation complete with **${numberValue}** iterations. Credentials file sent via DM.`);
        await sendLogDm(userId, client, `Generated credentials file: ${path.basename(result.generatedFile)}`, [attachment]);
        return;
      }

      // Fallback
      await interaction.editReply(`✅ Generation complete with **${numberValue}** iterations.\nCheck your DMs for complete logs.`);
    } catch (error) {
      clearInterval(logInterval);
      await flushLogs();
      await interaction.editReply(`❌ Failed to launch Python process: ${error.message}`);
    }
  },
};