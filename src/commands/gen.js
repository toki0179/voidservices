import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttachmentBuilder, MessageFlags, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAccountsByDate } from '../lib/accountsDb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const defaultScript = path.join(projectRoot, 'generator', 'main.py');
const defaultVenvPython = path.join(projectRoot, '.venv', 'bin', 'python');
const executionTimeoutMs = 600000;
const maxOutputLength = 1800;
const DISCORD_MESSAGE_LIMIT = 1900;
const EMBED_DESCRIPTION_LIMIT = 4096;

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

function runPython(iteration, totalIterations, onLog) {
  const pythonScript = resolvePythonScript();
  if (!existsSync(pythonScript)) {
    throw new Error(`Python script not found: ${pythonScript}`);
  }
  const pythonCommand = resolvePythonCommand();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCommand, [pythonScript], {
      cwd: projectRoot,
      env: {
        ...process.env,
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

    // Helper to prefix logs with iteration info
    const prefixLog = (text, streamType) => {
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (line.trim()) {
          onLog(`[Iter ${iteration}/${totalIterations}] ${line}\n`, streamType);
        } else {
          onLog('\n', streamType);
        }
      }
    };

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        prefixLog(line + '\n', 'stdout');
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      stderrBuffer += text;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        prefixLog(line + '\n', 'stderr');
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
      if (stdoutBuffer) prefixLog(stdoutBuffer, 'stdout');
      if (stderrBuffer) prefixLog(stderrBuffer, 'stderr');

      // Collect all credentials and screenshot files (multiple possible per run)
      const generatedFiles = [];
      const screenshotFiles = [];
      
      const credsMatches = stdout.matchAll(/LOG:?\s*Credentials saved to (.+)/g);
      for (const match of credsMatches) {
        if (match[1]) generatedFiles.push(match[1].trim());
      }
      
      const screenshotMatches = stdout.matchAll(/LOG:?\s*Screenshot saved to (.+)/g);
      for (const match of screenshotMatches) {
        if (match[1]) screenshotFiles.push(match[1].trim());
      }
      
      resolve({
        code,
        signal,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        generatedFiles,
        screenshotFiles,
      });
    });
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('gen')
    .setDescription('Run the configured Python generator file multiple times')
    .addNumberOption((option) =>
      option.setName('iterations')
        .setDescription('Number of times to run the generator')
        .setRequired(true)
    ),

  async execute(interaction) {
    const iterations = interaction.options.getNumber('iterations', true);
    const userId = interaction.user.id;
    const client = interaction.client;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Overall status
    let totalSuccess = 0;
    let totalFailed = 0;
    let allGeneratedFiles = [];
    let allScreenshotFiles = [];

    // Set up log embed
    const dmChannel = await client.users.createDM(userId);
    const embed = new EmbedBuilder()
      .setTitle('Generator Logs')
      .setDescription('Waiting for logs...')
      .setColor(0x00AE86)
      .setTimestamp();
    const logMessage = await dmChannel.send({ embeds: [embed] });
    
    let fullLogBuffer = '';
    let embedDescriptionBuffer = '';
    let updateTimeout = null;

    const updateLogEmbed = async () => {
      if (updateTimeout) clearTimeout(updateTimeout);
      updateTimeout = setTimeout(async () => {
        let description = embedDescriptionBuffer;
        if (description.length > EMBED_DESCRIPTION_LIMIT) {
          description = '...(truncated)\n' + description.slice(-(EMBED_DESCRIPTION_LIMIT - 20));
        }
        const updatedEmbed = EmbedBuilder.from(embed).setDescription(description || 'No logs yet.');
        await logMessage.edit({ embeds: [updatedEmbed] }).catch(console.error);
        updateTimeout = null;
      }, 1000);
    };

    const appendLog = (text) => {
      fullLogBuffer += text;
      embedDescriptionBuffer += text;
      if (embedDescriptionBuffer.length > EMBED_DESCRIPTION_LIMIT * 2) {
        embedDescriptionBuffer = embedDescriptionBuffer.slice(-EMBED_DESCRIPTION_LIMIT);
      }
      updateLogEmbed();
    };

    await interaction.editReply({
      content: `🚀 Generator will run **${iterations}** time(s). Sending live logs via embed in DMs…\n*Check your DMs.*`,
    });

    for (let currentIter = 1; currentIter <= iterations; currentIter++) {
      // No separate log buffer per iteration; we use the global embed
      const onLog = (text) => {
        appendLog(text);
      };

      try {
        appendLog(`🔄 Starting iteration ${currentIter}/${iterations}...\n`);

        let result;
        let attempt = 0;
        const maxAttempts = 10;
        do {
          attempt++;
          if (attempt > 1) {
            appendLog(`⚠️ Retrying iteration ${currentIter} (attempt ${attempt}) due to previous failure...\n`);
          }
          result = await runPython(currentIter, iterations, onLog);
        } while (result.code !== 0 && attempt < maxAttempts);

        // Wait a moment for filesystem
        await new Promise(resolve => setTimeout(resolve, 500));

        if (result.code === 0) {
          totalSuccess++;
          if (result.generatedFiles.length) allGeneratedFiles.push(...result.generatedFiles);
          if (result.screenshotFiles.length) allScreenshotFiles.push(...result.screenshotFiles);
          appendLog(`✅ Iteration ${currentIter}/${iterations} completed successfully.\n`);
        } else {
          totalFailed++;
          appendLog(`❌ Iteration ${currentIter}/${iterations} failed after ${attempt} attempts (exit code ${result.code}).\n`);
        }
      } catch (error) {
        totalFailed++;
        appendLog(`💥 Iteration ${currentIter}/${iterations} crashed: ${error.message}\n`);
      }
    }

    // Final update to embed
    const summary = `🏁 Generation finished.\n✅ Successful: ${totalSuccess}\n❌ Failed: ${totalFailed}`;
    appendLog(`\n${summary}\n`);
    if (updateTimeout) clearTimeout(updateTimeout);
    let finalDescription = embedDescriptionBuffer;
    if (finalDescription.length > EMBED_DESCRIPTION_LIMIT) {
      finalDescription = '...(truncated)\n' + finalDescription.slice(-(EMBED_DESCRIPTION_LIMIT - 20));
    }
    const finalEmbed = EmbedBuilder.from(embed).setDescription(finalDescription || 'No logs.').setColor(totalFailed === 0 ? 0x00AE86 : 0xFF0000);
    await logMessage.edit({ embeds: [finalEmbed] }).catch(console.error);

    // Also send a full log file if logs are long
    if (fullLogBuffer.length > 2000) {
      const logFile = Buffer.from(fullLogBuffer, 'utf-8');
      const logAttachment = new AttachmentBuilder(logFile, { name: 'full_logs.txt' });
      await sendLogDm(userId, client, '📄 Full logs attached:', [logAttachment]);
    }

    await interaction.editReply(summary);

    // Send all collected files (credentials and screenshots)
    const attachments = [];
    const attachmentNames = [];

    function findFile(basePath, filename) {
      const candidates = [
        basePath,
        path.join(projectRoot, basePath),
        path.join(projectRoot, 'generator', path.basename(basePath)),
        path.join(projectRoot, path.basename(basePath)),
      ];
      if (filename) {
        candidates.push(path.join(projectRoot, 'generator', filename));
        candidates.push(path.join(projectRoot, filename));
      }
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          return candidate;
        }
      }
      return null;
    }

    for (const filePath of allGeneratedFiles) {
      const found = findFile(filePath, null);
      if (found) {
        const fileContent = readFileSync(found, 'utf-8');
        attachments.push(new AttachmentBuilder(Buffer.from(fileContent), {
          name: path.basename(found),
        }));
        attachmentNames.push(`credentials: ${path.basename(found)}`);
      }
    }

    for (const filePath of allScreenshotFiles) {
      const found = findFile(filePath, null);
      if (found) {
        attachments.push(new AttachmentBuilder(found));
        attachmentNames.push(`screenshot: ${path.basename(found)}`);
      }
    }

    if (attachments.length) {
      await sendLogDm(userId, client, `📎 Attachments from all runs: ${attachmentNames.join(', ')}`, attachments);
    } else {
      await sendLogDm(userId, client, `⚠️ No files were generated in any successful run.`);
    }

    // Fetch accounts from Postgres and send as CSV attachment
    try {
      const today = new Date().toISOString().slice(0, 10);
      const accounts = await getAccountsByDate(today);
      if (accounts && accounts.length) {
        const csvHeader = 'username,email,password\n';
        const csvRows = accounts.map(acc => `${acc.username},${acc.email},${acc.password}`).join('\n');
        const csvContent = csvHeader + csvRows;
        const csvBuffer = Buffer.from(csvContent, 'utf-8');
        const csvAttachment = new AttachmentBuilder(csvBuffer, { name: `accounts_${today}.csv` });
        await sendLogDm(userId, client, `📊 Here are all generated accounts for ${today}:`, [csvAttachment]);
      } else {
        await sendLogDm(userId, client, `📭 No accounts found in the database for ${today}.`);
      }
    } catch (err) {
      console.error('[gen.js] Failed to fetch/send accounts from Postgres:', err);
      await sendLogDm(userId, client, `❌ Failed to fetch accounts from the database: ${err.message}`);
    }
  },
};