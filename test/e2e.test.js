// End-to-end test: boots the REAL integration process (index.js) against a
// fake Gladys host (WebSocket + REST, same contract as the SDK) and a fake ntfy
// server, then exercises the send-only flow: on a message.send the integration
// publishes to the user's own ntfy topic with their access token.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELECTOR = 'ntfy-test';
const TOKEN = 'test-token';
const USER_TOPIC = 'alice-home-topic';
const USER_ACCESS_TOKEN = 'tk_alice';

async function waitUntil(predicate, what, timeoutMs = 10000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// --- Fake ntfy server (publish only) -----------------------------------------
function startFakeNtfy() {
  const publishes = [];
  let counter = 0;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const id = `pub-${counter++}`;
      publishes.push({ method: req.method, path: req.url, headers: req.headers, body, id });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, event: 'message', message: body }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, publishes, port: server.address().port }),
    );
  });
}

// --- Fake Gladys host (REST + WebSocket) -------------------------------------
function startFakeGladys(ntfyPort) {
  const state = { commandResults: [], connectionStatuses: [], ws: null };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const respond = (json) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (req.method === 'GET' && req.url === '/api/integration/v1/device') {
        respond([]);
      } else if (req.method === 'GET' && req.url === '/api/integration/v1/config') {
        respond({
          config: {
            server_url: `http://127.0.0.1:${ntfyPort}`,
            default_title: 'Gladys',
            default_priority: '4',
          },
        });
      } else if (req.method === 'POST' && req.url === '/api/integration/v1/connection_status') {
        state.connectionStatuses.push(JSON.parse(body));
        respond({ success: true });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    state.ws = ws;
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'authenticate.integration-request' && message.payload.token === TOKEN) {
        ws.send(JSON.stringify({ type: 'authentication.connected', payload: {} }));
      }
      if (message.type === 'external-integration.command-result') {
        state.commandResults.push(message.payload);
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, state, port: server.address().port }));
  });
}

test('the ntfy integration publishes a notification to the user topic', async (t) => {
  const ntfy = await startFakeNtfy();
  const gladys = await startFakeGladys(ntfy.port);
  t.after(() => {
    ntfy.server.close();
    gladys.server.close();
  });

  let output = '';
  const child = spawn(process.execPath, ['index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      GLADYS_HOST_API_URL: `http://127.0.0.1:${gladys.port}`,
      GLADYS_INTEGRATION_TOKEN: TOKEN,
      GLADYS_INTEGRATION_SELECTOR: SELECTOR,
      LOG_LEVEL: 'debug',
    },
  });
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  t.after(() => child.kill('SIGKILL'));

  const send = (type, payload) => gladys.state.ws.send(JSON.stringify({ type, payload }));

  await t.test('on connection: reports connected', async () => {
    await waitUntil(
      () => gladys.state.connectionStatuses.some((s) => s.connected === true),
      `connection status\n${output}`,
    );
  });

  await t.test('message.send publishes to the user topic with their token', async () => {
    // Send-only payload shape (SDK >= 0.9): `contact` carries the user's
    // contact_schema values (topic + access token).
    send('external-integration.message.send', {
      message_id: 'send-1',
      contact: { topic: USER_TOPIC, access_token: USER_ACCESS_TOKEN },
      message: { text: 'Dinner is ready', file: null },
    });
    await waitUntil(() => ntfy.publishes.length >= 1, `publish\n${output}`);
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'send-1'),
      `send ack\n${output}`,
    );

    const ack = gladys.state.commandResults.find((r) => r.message_id === 'send-1');
    assert.equal(ack.success, true, ack.error);

    const publish = ntfy.publishes.at(-1);
    assert.equal(publish.method, 'POST');
    assert.equal(publish.path, `/${USER_TOPIC}`);
    assert.equal(publish.body, 'Dinner is ready');
    assert.equal(publish.headers.title, 'Gladys');
    assert.equal(publish.headers.priority, '4');
    assert.equal(publish.headers.authorization, `Bearer ${USER_ACCESS_TOKEN}`);
  });

  await t.test('a message to a user without a topic is acked as failed', async () => {
    send('external-integration.message.send', {
      message_id: 'send-2',
      contact: { access_token: 'tk_x' },
      message: { text: 'no topic', file: null },
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'send-2'),
      `fail ack\n${output}`,
    );
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'send-2');
    assert.equal(ack.success, false);
    assert.match(ack.error, /no ntfy topic/);
  });
});
