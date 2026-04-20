// scripts/exportProxies.js
import { getAllResidentialProxies } from '../src/lib/proxyDb.js';
import fs from 'fs';

const proxies = getAllResidentialProxies();
if (!proxies.length) {
  console.log('No proxies found in database.');
  process.exit(0);
}

fs.writeFileSync('data/proxies.txt', proxies.join('\n'), 'utf-8');
console.log(`Exported ${proxies.length} proxies to data/proxies.txt`);