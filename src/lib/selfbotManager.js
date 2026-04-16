import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const defaultVenvPython = '/opt/selfbot-venv/bin/python';

function resolvePythonCommand() {
  const configured = process.env.SELFBOT_PYTHON;

  if (configured && existsSync(configured)) {
    return configured;
  }

  if (existsSync(defaultVenvPython)) {
    return defaultVenvPython;
  }

  return 'python3';
}

const activeBots = new Map();

export function startSelfbot(userId, token, channelId, llmModel, creatorUserId) {
  const botKey = `${userId}_${channelId}`;

  if (activeBots.has(botKey)) {
    return { success: false, error: 'Bot already running in this channel' };
  }

  const pythonScript = path.join(projectRoot, 'selfbot', 'bot.py');
  const pythonCommand = resolvePythonCommand();

  try {
    const botProcess = spawn(pythonCommand, [pythonScript], {
      env: {
        ...process.env,
        DISCORD_TOKEN: token,
        CHANNEL_ID: channelId,
        USER_ID: userId,
        CREATOR_USER_ID: creatorUserId,
        LLM_MODEL: llmModel,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let outputBuffer = '';
    let errorBuffer = '';

    botProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
      console.log(`[Selfbot ${botKey}] ${data}`);
    });

    botProcess.stderr.on('data', (data) => {
      errorBuffer += data.toString();
      console.error(`[Selfbot ${botKey}] ERROR: ${data}`);
    });

    botProcess.on('close', (code) => {
      console.log(`[Selfbot ${botKey}] Process exited with code ${code}`);
      activeBots.delete(botKey);
    });

    botProcess.on('error', (err) => {
      console.error(`[Selfbot ${botKey}] Error:`, err);
      activeBots.delete(botKey);
    });

    activeBots.set(botKey, {
      process: botProcess,
      userId,
      channelId,
      llmModel,
      creatorUserId,
      startTime: Date.now(),
    });

    return {
      success: true,
      message: `Selfbot started for channel ${channelId} with model ${llmModel}`,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to start selfbot: ${err.message}`,
    };
  }
}

export function stopSelfbot(userId, channelId) {
  const botKey = `${userId}_${channelId}`;
  const botData = activeBots.get(botKey);

  if (!botData) {
    return { success: false, error: 'No bot running in this channel' };
  }

  botData.process.kill();
  activeBots.delete(botKey);

  return { success: true, message: 'Selfbot stopped' };
}

export function getActiveBots(userId) {
  const userBots = [];

  for (const [key, data] of activeBots.entries()) {
    if (data.userId === userId) {
      userBots.push({
        key,
        channelId: data.channelId,
        llmModel: data.llmModel,
        uptime: Date.now() - data.startTime,
      });
    }
  }

  return userBots;
}
