import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
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
const DISCORD_MESSAGE_LIMIT = 1900;

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

  let finalMessage = message;
  if (finalMessage.length > DISCORD_MESSAGE_LIMIT) {
    finalMessage = finalMessage.slice(0, DISCORD_MESSAGE_LIMIT - 50) + '\n... (truncated)';
  }

  try {
    const user = await client.users.fetch(userId);
    await user.send({ content: finalMessage, files: attachments });
    console.log(`[sendLogDm] Sent DM to ${userId} with ${attachments.length} attachment(s)`);
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
      let screenshotFile = null;
      
      // Flexible regex for credentials
      const credsMatch = stdout.match(/LOG:?\s*Credentials saved to (.+)/);
      if (credsMatch && credsMatch[1]) generatedFile = credsMatch[1].trim();
      
      // Flexible regex for screenshot
      const screenshotMatch = stdout.match(/LOG:?\s*Screenshot saved to (.+)/);
      if (screenshotMatch && screenshotMatch[1]) {
        screenshotFile = screenshotMatch[1].trim();
        console.log(`[DEBUG] Captured screenshot path: ${screenshotFile}`);
      } else {
        console.log(`[DEBUG] No screenshot path found in stdout`);
      }
      
      resolve({
        code,
        signal,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        generatedFile,
        screenshotFile,
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

      let result;
      let attempt = 0;
      const maxAttempts = 10;
      do {
        attempt++;
        if (attempt > 1) {
          await sendLogDm(userId, client, `Retrying iteration (attempt ${attempt}) due to previous failure...`);
        }
        result = await runPython(numberValue, onLog);
      } while (result.code !== 0 && attempt < maxAttempts);

      clearInterval(logInterval);
      await flushLogs();

      if (result.code !== 0) {
        await interaction.editReply(
          `⚠️ Python process exited with code ${result.code}${result.signal ? ` (signal: ${result.signal})` : ''} after ${attempt} attempts.\nCheck your DMs for complete logs.`
        );
        return;
      }

      // Give the filesystem a moment to fully flush (especially important in containers)
      await new Promise(resolve => setTimeout(resolve, 500));

      let attachments = [];
      let attachmentMsg = [];
      
      // Helper to find a file by trying multiple possible paths
      function findFile(basePath, filename) {
        const candidates = [
          basePath,                                          // exact as given
          path.join(projectRoot, basePath),                  // relative to project root
          path.join(projectRoot, 'generator', path.basename(basePath)), // inside generator/ folder
          path.join(projectRoot, path.basename(basePath)),   // just filename in project root
        ];
        // Also try with the filename only
        if (filename) {
          candidates.push(path.join(projectRoot, 'generator', filename));
          candidates.push(path.join(projectRoot, filename));
        }
        for (const candidate of candidates) {
          console.log(`[DEBUG] Trying path: ${candidate}`);
          if (existsSync(candidate)) {
            console.log(`[DEBUG] Found at: ${candidate}`);
            return candidate;
          }
        }
        return null;
      }
      
      // Handle credentials file
      if (result.generatedFile) {
        const found = findFile(result.generatedFile, null);
        if (found) {
          const fileContent = readFileSync(found, 'utf-8');
          attachments.push(new AttachmentBuilder(Buffer.from(fileContent), {
            name: path.basename(found),
          }));
          attachmentMsg.push(`credentials file: ${path.basename(found)}`);
        } else {
          console.warn(`[gen.js] Credentials file not found: ${result.generatedFile}`);
        }
      }
      
      // Handle screenshot file
      if (result.screenshotFile) {
        const filename = path.basename(result.screenshotFile);
        const found = findFile(result.screenshotFile, filename);
        if (found) {
          const stats = statSync(found);
          console.log(`[DEBUG] Screenshot size: ${stats.size} bytes`);
          attachments.push(new AttachmentBuilder(found));
          attachmentMsg.push(`screenshot: ${path.basename(found)}`);
        } else {
          console.error(`[DEBUG] Screenshot file NOT FOUND after trying all candidates`);
          // List contents of generator folder for debugging
          const genDir = path.join(projectRoot, 'generator');
          if (existsSync(genDir)) {
            const files = readdirSync(genDir);
            console.log(`[DEBUG] Files in generator/: ${files.join(', ')}`);
          }
        }
      }
      
      if (attachments.length) {
        await interaction.editReply(`✅ Generation complete with **${numberValue}** iterations. ${attachmentMsg.join(' and ')} sent via DM.`);
        await sendLogDm(userId, client, `Generated ${attachmentMsg.join(' and ')}`, attachments);
        return;
      }
      await interaction.editReply(`✅ Generation complete with **${numberValue}** iterations.\nCheck your DMs for complete logs.`);
    } catch (error) {
      clearInterval(logInterval);
      await flushLogs();
      console.error(`[gen.js] Error:`, error);
      await interaction.editReply(`❌ Failed to launch Python process: ${error.message}`);
    }
  },
};