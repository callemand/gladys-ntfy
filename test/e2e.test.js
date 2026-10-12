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

// --- Fake ntfy server (health + publish) -------------------------------------
function startFakeNtfy() {
  const publishes = [];
  // `refuseAttachments`: answer like a server with attachments disabled
  // `refuseWith`: answer every publish with this ntfy error ({ status, error })
  const options = { refuseAttachments: false, refuseWith: null };
  let counter = 0;
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"healthy":true}');
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const id = `pub-${counter++}`;
      publishes.push({
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: raw.toString(),
        raw,
        id,
      });
      if (options.refuseWith) {
        const { status, error } = options.refuseWith;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: status * 100 + 1, http: status, error }));
        return;
      }
      if (options.refuseAttachments && req.headers.filename) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"code":40014,"http":400,"error":"invalid request: attachments not allowed"}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, event: 'message' }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, publishes, options, port: server.address().port }),
    );
  });
}

// A tiny real PNG (1x1), in the format Gladys hands camera images over.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const GLADYS_IMAGE = `image/png;base64,${PNG_BASE64}`;

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

  await t.test('on connection: checks the server and reports connected', async () => {
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
    const url = new URL(publish.path, 'http://ntfy');
    assert.equal(url.pathname, `/${USER_TOPIC}`);
    assert.equal(url.searchParams.get('title'), 'Gladys');
    assert.equal(publish.body, 'Dinner is ready');
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
    assert.match(ack.error, /No ntfy topic is set for this user/);
  });

  await t.test('a topic ntfy would reject is caught before sending', async () => {
    const before = ntfy.publishes.length;
    send('external-integration.message.send', {
      message_id: 'send-bad-topic',
      contact: { topic: 'ma maison é', access_token: USER_ACCESS_TOKEN },
      message: { text: 'bad topic', file: null },
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'send-bad-topic'),
      `bad topic ack\n${output}`,
    );
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'send-bad-topic');
    assert.equal(ack.success, false);
    assert.match(ack.error, /topic of this user is not valid/);
    assert.equal(ntfy.publishes.length, before, 'nothing published');
  });

  await t.test('a refused token is explained, in the ack and in the status', async () => {
    ntfy.options.refuseWith = { status: 401, error: 'unauthorized' };
    const statusesBefore = gladys.state.connectionStatuses.length;
    send('external-integration.message.send', {
      message_id: 'send-401',
      contact: { topic: USER_TOPIC, access_token: 'tk_expired' },
      message: { text: 'refused', file: null },
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'send-401'),
      `401 ack\n${output}`,
    );
    ntfy.options.refuseWith = null;
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'send-401');
    assert.equal(ack.success, false);
    assert.match(ack.error, /refused the access token \(401\).*"My account"/);

    await waitUntil(
      () => gladys.state.connectionStatuses.length > statusesBefore,
      `disconnected status\n${output}`,
    );
    const status = gladys.state.connectionStatuses.at(-1);
    assert.equal(status.connected, false);
    assert.match(status.message.en, /^Last notification not sent: ntfy refused the access token/);
    assert.match(status.message.fr, /^Dernière notification non envoyée : ntfy a refusé le jeton/);
    assert.match(output, /Notification not sent: ntfy refused the access token/, 'logged');
  });

  await t.test('the next notification delivered reports connected again', async () => {
    const statusesBefore = gladys.state.connectionStatuses.length;
    send('external-integration.message.send', {
      message_id: 'send-recovered',
      contact: { topic: USER_TOPIC, access_token: USER_ACCESS_TOKEN },
      message: { text: 'back', file: null },
    });
    await waitUntil(
      () => gladys.state.connectionStatuses.length > statusesBefore,
      `connected status\n${output}`,
    );
    assert.equal(gladys.state.connectionStatuses.at(-1).connected, true);
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'send-recovered');
    assert.equal(ack.success, true, ack && ack.error);
  });

  await t.test('an image is published as an attachment, with the text', async () => {
    const before = ntfy.publishes.length;
    send('external-integration.message.send', {
      message_id: 'send-image',
      contact: { topic: USER_TOPIC, access_token: USER_ACCESS_TOKEN },
      message: { text: 'Mouvement détecté\nEntrée', file: GLADYS_IMAGE },
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'send-image'),
      `image ack\n${output}`,
    );
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'send-image');
    assert.equal(ack.success, true, ack.error);

    const published = ntfy.publishes.slice(before);
    assert.equal(published.length, 1);
    const [publish] = published;
    assert.equal(publish.method, 'PUT');
    const url = new URL(publish.path, 'http://ntfy');
    assert.equal(url.pathname, `/${USER_TOPIC}`);
    assert.equal(url.searchParams.get('message'), 'Mouvement détecté\nEntrée');
    assert.equal(publish.headers.filename, 'gladys.png');
    assert.equal(publish.headers['content-type'], 'image/png');
    assert.equal(url.searchParams.get('title'), 'Gladys');
    assert.equal(publish.headers.authorization, `Bearer ${USER_ACCESS_TOKEN}`);
    assert.deepEqual(publish.raw, Buffer.from(PNG_BASE64, 'base64'), 'the image bytes');
  });

  await t.test('a server that refuses attachments still gets the text', async () => {
    ntfy.options.refuseAttachments = true;
    const before = ntfy.publishes.length;
    send('external-integration.message.send', {
      message_id: 'send-refused',
      contact: { topic: USER_TOPIC, access_token: USER_ACCESS_TOKEN },
      message: { text: 'Porte ouverte', file: GLADYS_IMAGE },
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'send-refused'),
      `refused ack\n${output}`,
    );
    ntfy.options.refuseAttachments = false;
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'send-refused');
    assert.equal(ack.success, true, ack.error);
    const published = ntfy.publishes.slice(before);
    assert.deepEqual(
      published.map((p) => p.method),
      ['PUT', 'POST'],
      'the image first, then the text alone',
    );
    assert.equal(published[1].body, 'Porte ouverte');
    assert.equal(published[1].headers.filename, undefined);
  });
});
