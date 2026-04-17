import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, '..', '.tmp');

// Residential proxy list sources (ISP/datacenter residential proxies)
const RESIDENTIAL_PROXY_SOURCES = [
  'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
  'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
  'https://raw.githubusercontent.com/opsxcq/proxy-list/master/list.txt',
  'https://www.proxy-list.download/api/v1/get?type=http',
];

const TIMEOUT_MS = 5000;
const MAX_PROXIES_TO_FETCH = 100; // Limit to prevent long processing
const MAX_CANDIDATE_PROXIES = 120;
const LOOKUP_CONCURRENCY = 8;

const DATACENTER_KEYWORDS = [
  'amazon',
  'aws',
  'google',
  'gcp',
  'microsoft',
  'azure',
  'digitalocean',
  'linode',
  'ovh',
  'hetzner',
  'leaseweb',
  'vultr',
  'choopa',
  'contabo',
  'oracle cloud',
  'ibm cloud',
  'datacenter',
  'colo',
  'hosting',
  'vps',
];

const residentialLookupCache = new Map();

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

function parseProxyEndpoint(proxy) {
  const trimmed = String(proxy || '').trim();
  const match = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);

  if (!match) {
    return null;
  }

  const [ip, portStr] = [match[1], match[2]];
  const octets = ip.split('.').map(Number);
  const port = Number(portStr);

  const validIp = octets.length === 4 && octets.every(part => part >= 0 && part <= 255);
  const validPort = Number.isInteger(port) && port > 0 && port <= 65535;

  if (!validIp || !validPort) {
    return null;
  }

  return { raw: trimmed, ip, port };
}

function includesDatacenterKeywords(value) {
  const normalized = String(value || '').toLowerCase();
  return DATACENTER_KEYWORDS.some(keyword => normalized.includes(keyword));
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function isLikelyResidentialIp(ip) {
  if (residentialLookupCache.has(ip)) {
    return residentialLookupCache.get(ip);
  }

  // ip-api provides useful hosting/mobile/proxy flags without requiring a key.
  const ipApi = await fetchJsonWithTimeout(
    `http://ip-api.com/json/${ip}?fields=status,message,hosting,mobile,proxy,isp,org,as`
  );

  let isResidential = false;

  if (ipApi && ipApi.status === 'success') {
    const flaggedAsDatacenter =
      ipApi.hosting === true
      || includesDatacenterKeywords(ipApi.as)
      || includesDatacenterKeywords(ipApi.org)
      || includesDatacenterKeywords(ipApi.isp);

    isResidential = !flaggedAsDatacenter;
  }

  if (!isResidential) {
    const ipWho = await fetchJsonWithTimeout(`https://ipwho.is/${ip}`);
    if (ipWho && ipWho.success !== false) {
      const connection = ipWho.connection || {};
      const flaggedAsDatacenter =
        includesDatacenterKeywords(connection.org)
        || includesDatacenterKeywords(connection.isp)
        || includesDatacenterKeywords(connection.domain);

      isResidential = !flaggedAsDatacenter;
    }
  }

  residentialLookupCache.set(ip, isResidential);
  return isResidential;
}

async function isResidentialProxy(proxy) {
  try {
    const parsed = parseProxyEndpoint(proxy);
    if (!parsed) {
      return false;
    }

    return await isLikelyResidentialIp(parsed.ip);
  } catch {
    return false;
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const output = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      output[current] = await mapper(items[current], current);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return output;
}

async function getAndCheckProxies() {
  const allProxies = new Set();

  // Fetch from all residential sources
  for (const source of RESIDENTIAL_PROXY_SOURCES) {
    const proxies = await fetchProxiesBySource(source);
    proxies.forEach(p => allProxies.add(p));
  }

  const candidates = Array.from(allProxies)
    .map(parseProxyEndpoint)
    .filter(Boolean)
    .slice(0, MAX_CANDIDATE_PROXIES)
    .map(({ raw }) => raw);

  // Test all proxies
  const results = await mapWithConcurrency(
    candidates,
    LOOKUP_CONCURRENCY,
    async (proxy) => {
      const isValid = await isResidentialProxy(proxy);
      return { proxy: proxy.trim(), isValid };
    }
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

      await interaction.editReply('🔍 Fetching residential proxies from public lists...');
      const validProxies = await getAndCheckProxies();

      if (validProxies.length === 0) {
        await interaction.editReply('❌ No valid residential proxies found from public lists.');
        return;
      }

      // Create temporary file
      const filePath = path.join(tempDir, `residential_proxies_${Date.now()}.txt`);
      const content = validProxies.join('\n');
      await fs.writeFile(filePath, content, 'utf-8');

      // Create attachment and send
      const attachment = new AttachmentBuilder(filePath, {
        name: `residential_proxies_${validProxies.length}.txt`,
      });

      await interaction.editReply({
        content: `✅ Found and validated **${validProxies.length}** residential proxies.`,
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
