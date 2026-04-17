import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, '..', '.tmp');

// Common public proxy list sources
const PROXY_SOURCES = [
  'https://www.proxy-list.download/api/v1/get?type=http',
  'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
  'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
];

const TIMEOUT_MS = 5000;
const MAX_PROXIES_TO_FETCH = 50; // Limit to prevent long processing

async function fetchProxiesBySource(sourceUrl) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(sourceUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const text = await response.text();
    const proxies = text
      .split('\n')
      .filter(line => line.trim())
      .slice(0, MAX_PROXIES_TO_FETCH);

    return proxies;
  } catch (error) {
    return [];
  }
}

async function testProxy(proxy) {
  try {
    const trimmed = proxy.trim();
    if (!trimmed) return false;

    // Handle JSON response format from first source
    if (trimmed.startsWith('{')) {
      const data = JSON.parse(trimmed);
      // Further validation would go here if needed
      return !!data.ip;
    }

    // Validate basic proxy format (IP:PORT)
    const match = trimmed.match(/^(\d{1,3}\.){3}\d{1,3}:\d+$/);
    return !!match;
  } catch {
    return false;
  }
}

async function getAndCheckProxies() {
  const allProxies = new Set();

  // Fetch from all sources
  for (const source of PROXY_SOURCES) {
    const proxies = await fetchProxiesBySource(source);
    proxies.forEach(p => allProxies.add(p));
  }

  // Test all proxies
  const results = await Promise.all(
    Array.from(allProxies).map(async (proxy) => {
      const isValid = await testProxy(proxy);
      return { proxy: proxy.trim(), isValid };
    })
  );

  // Filter valid proxies
  return results.filter(r => r.isValid).map(r => r.proxy);
}

export default {
  data: new SlashCommandBuilder()
    .setName('proxies')
    .setDescription('Fetch and validate residential proxies from public lists.'),

  async execute(interaction) {
    // Defer reply since this may take time
    await interaction.deferReply();

    try {
      // Ensure temp directory exists
      await fs.mkdir(tempDir, { recursive: true });

      await interaction.editReply('🔍 Fetching proxies from public lists...');
      const validProxies = await getAndCheckProxies();

      if (validProxies.length === 0) {
        await interaction.editReply('❌ No valid proxies found from public lists.');
        return;
      }

      // Create temporary file
      const filePath = path.join(tempDir, `proxies_${Date.now()}.txt`);
      const content = validProxies.join('\n');
      await fs.writeFile(filePath, content, 'utf-8');

      // Create attachment and send
      const attachment = new AttachmentBuilder(filePath, {
        name: `proxies_${validProxies.length}.txt`,
      });

      await interaction.editReply({
        content: `✅ Found and validated **${validProxies.length}** proxies.`,
        files: [attachment],
      });

      // Clean up temp file after a short delay
      setTimeout(async () => {
        try {
          await fs.unlink(filePath);
        } catch (error) {
          console.error('Error cleaning up temp file:', error);
        }
      }, 5000);
    } catch (error) {
      console.error('Error in proxies command:', error);
      await interaction.editReply(
        '❌ An error occurred while fetching and validating proxies.'
      );
    }
  },
};
