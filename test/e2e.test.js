// End-to-end test: boots the REAL integration process (index.js) against a
// fake Gladys host (WebSocket + REST) and a fake ntfy server, then exercises
// the send-only flow in both server modes (cloud and local companion server).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
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
function startFakeGladys(configValues) {
  const state = { commandResults: [], connectionStatuses: [], containerActions: [], ws: null };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const respond = (json) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      const url = req.url;
      if (req.method === 'GET' && url === '/api/integration/v1/device') {
        respond([]);
      } else if (req.method === 'GET' && url === '/api/integration/v1/config') {
        respond({ config: configValues });
      } else if (req.method === 'GET' && url === '/api/integration/v1/container') {
        respond({
          containers: [
            {
              name: 'server',
              status: 'running',
              desired: 'running',
              ports: [{ container_port: 80, host_port: 8099 }],
            },
          ],
        });
      } else if (
        req.method === 'POST' &&
        /\/api\/integration\/v1\/container\/server\/(start|stop|restart)$/.test(url)
      ) {
        state.containerActions.push(url.split('/').pop());
        respond({ success: true });
      } else if (req.method === 'POST' && url === '/api/integration/v1/connection_status') {
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

function startIntegration(gladysPort, extraEnv = {}) {
  let output = '';
  const child = spawn(process.execPath, ['index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      GLADYS_HOST_API_URL: `http://127.0.0.1:${gladysPort}`,
      GLADYS_INTEGRATION_TOKEN: TOKEN,
      GLADYS_INTEGRATION_SELECTOR: 'ntfy-test',
      LOG_LEVEL: 'debug',
      ...extraEnv,
    },
  });
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  return { child, out: () => output };
}

test('cloud mode: publishes to the user topic with their token', async (t) => {
  const ntfy = await startFakeNtfy();
  const gladys = await startFakeGladys({
    mode: 'cloud',
    server_url: `http://127.0.0.1:${ntfy.port}`,
    default_title: 'Gladys',
    default_priority: '4',
  });
  const { child, out } = startIntegration(gladys.port);
  t.after(() => {
    child.kill('SIGKILL');
    ntfy.server.close();
    gladys.server.close();
  });

  await waitUntil(
    () => gladys.state.connectionStatuses.some((s) => s.connected === true),
    `connection status\n${out()}`,
  );
  // Cloud mode makes sure the companion server is stopped.
  assert.ok(gladys.state.containerActions.includes('stop'), 'cloud mode stops the companion');

  gladys.state.ws.send(
    JSON.stringify({
      type: 'external-integration.message.send',
      payload: {
        message_id: 'send-1',
        contact: { topic: USER_TOPIC, access_token: USER_ACCESS_TOKEN },
        message: { text: 'Dinner is ready', file: null },
      },
    }),
  );
  await waitUntil(() => ntfy.publishes.length >= 1, `publish\n${out()}`);
  await waitUntil(
    () => gladys.state.commandResults.some((r) => r.message_id === 'send-1'),
    `send ack\n${out()}`,
  );

  const ack = gladys.state.commandResults.find((r) => r.message_id === 'send-1');
  assert.equal(ack.success, true, ack.error);
  const publish = ntfy.publishes.at(-1);
  assert.equal(publish.path, `/${USER_TOPIC}`);
  assert.equal(publish.body, 'Dinner is ready');
  assert.equal(publish.headers.title, 'Gladys');
  assert.equal(publish.headers.priority, '4');
  assert.equal(publish.headers.authorization, `Bearer ${USER_ACCESS_TOKEN}`);
});

test('local mode: starts the companion server and publishes to it', async (t) => {
  const ntfy = await startFakeNtfy(); // stands in for the companion ntfy server
  const gladys = await startFakeGladys({
    mode: 'local',
    default_title: 'Gladys',
    default_priority: '3',
  });
  // Point the internal server URL at our fake companion ntfy.
  const { child, out } = startIntegration(gladys.port, {
    NTFY_LOCAL_SERVER_URL: `http://127.0.0.1:${ntfy.port}`,
  });
  t.after(() => {
    child.kill('SIGKILL');
    ntfy.server.close();
    gladys.server.close();
  });

  await waitUntil(
    () => gladys.state.connectionStatuses.some((s) => s.connected === true),
    `connection status\n${out()}`,
  );
  assert.ok(gladys.state.containerActions.includes('start'), 'local mode starts the companion');

  // Anonymous local topic: no access token in the contact.
  gladys.state.ws.send(
    JSON.stringify({
      type: 'external-integration.message.send',
      payload: {
        message_id: 'send-local',
        contact: { topic: USER_TOPIC },
        message: { text: 'Local hello', file: null },
      },
    }),
  );
  await waitUntil(() => ntfy.publishes.length >= 1, `local publish\n${out()}`);
  const ack = gladys.state.commandResults.find((r) => r.message_id === 'send-local');
  assert.equal(ack.success, true, ack.error);
  const publish = ntfy.publishes.at(-1);
  assert.equal(publish.path, `/${USER_TOPIC}`);
  assert.equal(publish.body, 'Local hello');
  assert.equal(
    publish.headers.authorization,
    undefined,
    'no auth header for an anonymous local topic',
  );
});
