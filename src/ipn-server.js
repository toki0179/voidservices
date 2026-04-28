import http from 'node:http';
import { config } from './config.js';
import { verifyHmac, processCallback } from './lib/paymento.js';

const PORT = config.ipnPort;
const HOST = config.ipnHost;

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/ipn') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/ipn') {
    let rawBody = '';
    for await (const chunk of req) {
      rawBody += chunk;
    }

    const signature = req.headers['x-hmac-sha256-signature'] || '';
    const contentType = req.headers['content-type'] || '';

    if (!verifyHmac(rawBody, signature)) {
      console.warn('[ipn] Invalid HMAC signature');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid signature' }));
      return;
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const orderId = body.orderId;
    const status = body.orderStatus;

    if (!orderId || !status) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing orderId or status' }));
      return;
    }

    console.log(`[ipn] Received callback for order ${orderId}, status: ${status}`);

    const processed = await processCallback(orderId, status);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: processed ? true : false }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

export function startIpnServer() {
  const server = http.createServer(handleRequest);
  server.listen(PORT, HOST, () => {
    console.log(`[ipn] IPN server listening on ${HOST}:${PORT}`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startIpnServer();
}