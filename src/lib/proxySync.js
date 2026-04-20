import net from 'node:net';
import { getAllProxies, replaceProxies } from './proxyDb.js';

const PROXY_SOURCES = [
  'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
  'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
  'https://raw.githubusercontent.com/opsxcq/proxy-list/master/list.txt',
  'https://www.proxy-list.download/api/v1/get?type=http',
];

const FETCH_TIMEOUT_MS = 5000;
const SOCKET_TIMEOUT_MS = 3500;
const MAX_PROXIES_PER_SOURCE = 400;
const MAX_CANDIDATE_PROXIES = 800;
const LOOKUP_CONCURRENCY = 20;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function fetchTextWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return '';
    }
    return await response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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

function parseProxyEndpoint(proxy, source) {
  const trimmed = String(proxy || '').trim();
  const match = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);

  if (!match) {
    return null;
  }
  const ip = match[1];
  const port = Number(match[2]);
  const octets = ip.split('.').map(Number);
  const validIp = octets.length === 4 && octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255);
  const validPort = Number.isInteger(port) && port > 0 && port <= 65535;
  if (!validIp || !validPort) {
    return null;
  }

  return {
    proxy: `${ip}:${port}`,
    ip,
    port,
    source: source || null,
  };
}

async function validateProxy(proxyInfo) {
  const { ip, port } = proxyInfo;
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: ip, port, timeout: SOCKET_TIMEOUT_MS });
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', onError);
    socket.once('timeout', onError);
    socket.setTimeout(SOCKET_TIMEOUT_MS);
  });
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

async function fetchCandidateProxies() {
  const candidates = new Map();

  for (const source of PROXY_SOURCES) {
    const text = await fetchTextWithTimeout(source);
    if (!text) {
      continue;
    }

    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, MAX_PROXIES_PER_SOURCE);

    for (const line of lines) {
      const parsed = parseProxyEndpoint(line, source);
      if (parsed) {
        candidates.set(parsed.proxy, parsed);
      }

      if (candidates.size >= MAX_CANDIDATE_PROXIES) {
        break;
      }
    }

    if (candidates.size >= MAX_CANDIDATE_PROXIES) {
      break;
    }
  }

  return Array.from(candidates.values());
}

export async function syncProxyDatabase() {
  const existingProxies = new Set(getAllProxies());
  const candidates = await fetchCandidateProxies();

  if (candidates.length === 0) {
    const removed = existingProxies.size;
    replaceProxies([]);
    return {
      candidates: 0,
      active: 0,
      restocked: 0,
      removed,
    };
  }

  const checks = await mapWithConcurrency(candidates, LOOKUP_CONCURRENCY, async (proxy) => {
    const valid = await validateProxy(proxy);
    return {
      proxy,
      valid,
    };
  });

  const validProxies = checks.filter(result => result.valid).map(result => result.proxy);
  const nextProxySet = new Set(validProxies.map(proxy => proxy.proxy));

  let restocked = 0;
  for (const proxy of nextProxySet) {
    if (!existingProxies.has(proxy)) {
      restocked += 1;
    }
  }

  let removed = 0;
  for (const proxy of existingProxies) {
    if (!nextProxySet.has(proxy)) {
      removed += 1;
    }
  }

  replaceProxies(validProxies);

  return {
    candidates: candidates.length,
    active: validProxies.length,
    restocked,
    removed,
  };
}

export function startProxySyncJob({ onRunCompleted, onRunFailed } = {}) {
  const runSync = async () => {
    try {
      const result = await syncProxyDatabase();
      console.log(
        `[proxy-sync] Completed: ${result.active}/${result.candidates} proxies active.`
      );
      if (typeof onRunCompleted === 'function') {
        await onRunCompleted(result);
      }
    } catch (error) {
      console.error('[proxy-sync] Failed:', error);
      if (typeof onRunFailed === 'function') {
        await onRunFailed(error);
      }
    }
  };

  // Run immediately and then schedule daily
  void runSync();
  return setInterval(() => {
    void runSync();
  }, DAILY_INTERVAL_MS);
}