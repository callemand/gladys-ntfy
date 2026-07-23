import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { publish } from '../src/ntfy/client.js';

function startServer(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

test('publish POSTs the body with Title/Priority/Tags/Auth headers and returns the id', async (t) => {
  const requests = [];
  const { server, url } = await startServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg-123', event: 'message' }));
    });
  });
  t.after(() => server.close());

  const id = await publish(
    { serverUrl: url, topic: 'my-topic', accessToken: 'tk_test' },
    { text: 'Hello world', title: 'Gladys', priority: 4, tags: ['warning', 'skull'] },
  );

  assert.equal(id, 'msg-123');
  assert.equal(requests.length, 1);
  const req = requests[0];
  assert.equal(req.method, 'POST');
  assert.equal(req.url, '/my-topic');
  assert.equal(req.body, 'Hello world');
  assert.equal(req.headers.title, 'Gladys');
  assert.equal(req.headers.priority, '4');
  assert.equal(req.headers.tags, 'warning,skull');
  assert.equal(req.headers.authorization, 'Bearer tk_test');
});

test('publish omits the Authorization header for an anonymous topic', async (t) => {
  let auth = 'unset';
  const { server, url } = await startServer((req, res) => {
    auth = req.headers.authorization || null;
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'x' }));
  });
  t.after(() => server.close());

  await publish({ serverUrl: url, topic: 't', accessToken: null }, { text: 'hi' });
  assert.equal(auth, null);
});

test('publish strips non-ASCII characters from the Title header', async (t) => {
  let title = null;
  const { server, url } = await startServer((req, res) => {
    title = req.headers.title;
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'x' }));
  });
  t.after(() => server.close());

  await publish({ serverUrl: url, topic: 't' }, { text: 'body', title: 'Alerte évènement 🔥' });
  assert.ok(
    [...title].every((char) => char.charCodeAt(0) <= 0x7f),
    `title should be ASCII-only, got "${title}"`,
  );
});

test('publish throws with the HTTP status on a non-2xx response', async (t) => {
  const { server, url } = await startServer((req, res) => {
    req.resume();
    res.writeHead(403);
    res.end('forbidden');
  });
  t.after(() => server.close());

  await assert.rejects(
    () => publish({ serverUrl: url, topic: 't', accessToken: 'tk_bad' }, { text: 'x' }),
    (err) => {
      assert.equal(err.status, 403);
      return true;
    },
  );
});
