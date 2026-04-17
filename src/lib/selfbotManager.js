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

function buildStartupMessage({ userId, channelId, llmModel, hasBasePrompt, listenToDms }) {
  const promptSummary = hasBasePrompt ? ' Prompt mode: custom.' : ' Prompt mode: default.';
  const dmSummary = listenToDms ? ' DM listening: on.' : ' DM listening: off.';
  return `✅ Selfbot started for <@${userId}> in <#${channelId}> with model ${llmModel}.${promptSummary}${dmSummary}`;
}

function buildShutdownMessage({ userId, channelId, llmModel, code }) {
  const base = `⏹️ Selfbot stopped for <@${userId}> in <#${channelId}> with model ${llmModel}.`;

  if (typeof code === 'number') {
    return `${base} Exit code: ${code}.`;
  }

  return base;
}

function buildErrorMessage({ userId, channelId, llmModel, source, detail }) {
  const truncated = (detail || '').trim().slice(0, 1500) || 'No details available.';
  return [
    `🚨 Selfbot error for <@${userId}> in <#${channelId}> with model ${llmModel}.`,
    `Source: ${source}`,
    `\`\`\`${truncated}\`\`\``,
  ].join('\n');
}

function buildCriticalErrorMessage({ userId, channelId, llmModel, detail, kind }) {
  const truncated = (detail || '').trim().slice(0, 1800) || 'No details available.';
  return [
    `🚨 Critical selfbot LLM error for <@${userId}> in <#${channelId}> with model ${llmModel}.`,
    `Type: ${kind}`,
    `\`\`\`${truncated}\`\`\``,
  ].join('\n');
}

function isImportantLlmError(text) {
  const lowered = String(text || '').toLowerCase();
  return (
    lowered.includes('llm api error') ||
    lowered.includes('all servers failed for model') ||
    lowered.includes('timed out') ||
    lowered.includes('no servers available for model') ||
    lowered.includes('connection error')
  );
}

function buildCaptchaMessage({ userId, channelId, llmModel, payload }) {
  const source = payload?.source || 'unknown';
  const details = payload?.details || {};
  const author = details.author ? `Author: ${details.author}` : null;
  const excerpt = details.content || details.error || details.prompt_excerpt || 'No details provided.';
  const trimmedExcerpt = String(excerpt).slice(0, 1000);

  return [
    `⚠️ CAPTCHA signal detected for your selfbot in <#${channelId}> (model ${llmModel}).`,
    `Source: ${source}`,
    author,
    `\`\`\`${trimmedExcerpt}\`\`\``,
    'Please solve verification manually before continuing.',
  ].filter(Boolean).join('\n');
}

function extractCaptchaEvents(text) {
  const events = [];
  const lines = String(text || '').split('\n');

  for (const line of lines) {
    const markerIndex = line.indexOf('CAPTCHA_EVENT::');
    if (markerIndex === -1) {
      continue;
    }

    const raw = line.slice(markerIndex + 'CAPTCHA_EVENT::'.length).trim();
    if (!raw) {
      continue;
    }

    try {
      events.push(JSON.parse(raw));
    } catch {
      // Ignore malformed event lines from child process output.
    }
  }

  return events;
}

export function startSelfbot(userId, token, channelId, llmModel, options = {}) {
  const botKey = `${userId}_${channelId}`;

  if (activeBots.has(botKey)) {
    return { success: false, error: 'Bot already running in this channel' };
  }

  const pythonScript = path.join(projectRoot, 'selfbot', 'bot.py');
  const pythonCommand = resolvePythonCommand();
  const notify = typeof options.notify === 'function' ? options.notify : null;
  const notifyError = typeof options.notifyError === 'function' ? options.notifyError : null;
  const notifyCaptcha = typeof options.notifyCaptcha === 'function' ? options.notifyCaptcha : null;
  const basePrompt = typeof options.basePrompt === 'string' ? options.basePrompt.trim() : '';
  const listenToDms = options.listenToDms !== false;

  try {
    const botProcess = spawn(pythonCommand, [pythonScript], {
      env: {
        ...process.env,
        DISCORD_TOKEN: token,
        CHANNEL_ID: channelId,
        USER_ID: userId,
        LLM_MODEL: llmModel,
        BASE_PROMPT: basePrompt,
        LISTEN_TO_DMS: listenToDms ? 'true' : 'false',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let outputBuffer = '';
    let errorBuffer = '';
    let lastErrorNotification = 0;
    let lastCriticalErrorNotification = 0;
    let lastCaptchaNotification = 0;

    const maybeNotifyError = (source, detail) => {
      if (!notifyError) {
        return;
      }

      const now = Date.now();
      if (now - lastErrorNotification < 5000) {
        return;
      }

      lastErrorNotification = now;
      notifyError(buildErrorMessage({ userId, channelId, llmModel, source, detail }));
    };

    const maybeNotifyCriticalError = (kind, detail) => {
      if (!notifyError) {
        return;
      }

      const now = Date.now();
      if (now - lastCriticalErrorNotification < 1500) {
        return;
      }

      lastCriticalErrorNotification = now;
      notifyError(buildCriticalErrorMessage({ userId, channelId, llmModel, kind, detail }));
    };

    const maybeNotifyCaptcha = (payload) => {
      if (!notifyCaptcha) {
        return;
      }

      const now = Date.now();
      if (now - lastCaptchaNotification < 3000) {
        return;
      }

      lastCaptchaNotification = now;
      notifyCaptcha(buildCaptchaMessage({ userId, channelId, llmModel, payload }));
    };

    botProcess.stdout.on('data', (data) => {
      const text = data.toString();
      outputBuffer += text;
      console.log(`[Selfbot ${botKey}] ${text}`);

      for (const event of extractCaptchaEvents(text)) {
        maybeNotifyCaptcha(event);
      }
    });

    botProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorBuffer += text;
      console.error(`[Selfbot ${botKey}] ERROR: ${text}`);

      for (const event of extractCaptchaEvents(text)) {
        maybeNotifyCaptcha(event);
      }

      maybeNotifyError('stderr', text);
      if (isImportantLlmError(text)) {
        maybeNotifyCriticalError('llm-timeout-or-server-failure', text);
      }
    });

    botProcess.on('close', (code) => {
      console.log(`[Selfbot ${botKey}] Process exited with code ${code}`);
      const botData = activeBots.get(botKey);

      if (code && code !== 0) {
        maybeNotifyError('process-close', `Exited with code ${code}. ${errorBuffer.slice(-600)}`);
      }

      if (botData && botData.notify && !botData.shutdownNotified) {
        botData.notify(buildShutdownMessage({
          userId: botData.userId,
          channelId: botData.channelId,
          llmModel: botData.llmModel,
          code,
        }));
      }

      activeBots.delete(botKey);
    });

    botProcess.on('error', (err) => {
      console.error(`[Selfbot ${botKey}] Error:`, err);
      maybeNotifyError('process-error', err?.message || String(err));
      activeBots.delete(botKey);
    });

    activeBots.set(botKey, {
      process: botProcess,
      userId,
      channelId,
      llmModel,
      notify,
      shutdownNotified: false,
      startTime: Date.now(),
    });

    if (notify) {
      notify(buildStartupMessage({
        userId,
        channelId,
        llmModel,
        hasBasePrompt: Boolean(basePrompt),
        listenToDms,
      }));
    }

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

  botData.shutdownNotified = true;
  if (botData.notify) {
    botData.notify(buildShutdownMessage({
      userId: botData.userId,
      channelId: botData.channelId,
      llmModel: botData.llmModel,
    }));
  }

  botData.process.kill();

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
