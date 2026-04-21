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
      
      // Flexible regex: allows optional space after LOG:
      const credsMatch = stdout.match(/LOG:?\s*Credentials saved to (.+)/);
      if (credsMatch && credsMatch[1]) generatedFile = credsMatch[1].trim();
      
      const screenshotMatch = stdout.match(/LOG:?\s*Screenshot saved to (.+)/);
      if (screenshotMatch && screenshotMatch[1]) {
        screenshotFile = screenshotMatch[1].trim();
        console.log(`[DEBUG] Captured screenshot path: ${screenshotFile}`);
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

      let attachments = [];
      let attachmentMsg = [];
      
      // Handle credentials file
      if (result.generatedFile) {
        const filePath = path.isAbsolute(result.generatedFile) 
          ? result.generatedFile 
          : path.join(projectRoot, result.generatedFile);
        console.log(`[DEBUG] Looking for credentials at: ${filePath}`);
        if (existsSync(filePath)) {
          const fileContent = readFileSync(filePath, 'utf-8');
          attachments.push(new AttachmentBuilder(Buffer.from(fileContent), {
            name: path.basename(result.generatedFile),
          }));
          attachmentMsg.push(`credentials file: ${path.basename(result.generatedFile)}`);
        } else {
          console.warn(`[gen.js] Credentials file not found: ${filePath}`);
        }
      }
      
      // Handle screenshot file
      if (result.screenshotFile) {
        let screenshotPath = result.screenshotFile;
        if (!path.isAbsolute(screenshotPath)) {
          screenshotPath = path.join(projectRoot, screenshotPath);
        }
        console.log(`[DEBUG] Looking for screenshot at: ${screenshotPath}`);
        
        if (existsSync(screenshotPath)) {
          const stats = statSync(screenshotPath);
          console.log(`[DEBUG] Screenshot found, size: ${stats.size} bytes`);
          attachments.push(new AttachmentBuilder(screenshotPath));
          attachmentMsg.push(`screenshot: ${path.basename(screenshotPath)}`);
        } else {
          console.error(`[DEBUG] Screenshot file NOT FOUND: ${screenshotPath}`);
          // Try alternative: maybe just the filename in generator folder
          const altPath = path.join(projectRoot, 'generator', path.basename(screenshotPath));
          console.log(`[DEBUG] Trying alternative path: ${altPath}`);
          if (existsSync(altPath)) {
            console.log(`[DEBUG] Found at alternative path!`);
            attachments.push(new AttachmentBuilder(altPath));
            attachmentMsg.push(`screenshot: ${path.basename(altPath)}`);
          } else {
            const genDir = path.join(projectRoot, 'generator');
            if (existsSync(genDir)) {
              const files = readdirSync(genDir);
              console.log(`[DEBUG] Files in generator/: ${files.join(', ')}`);
            }
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
      await interaction.editReply(`❌ Failed to launch Python process: ${error.message}`);
    }
  },
};