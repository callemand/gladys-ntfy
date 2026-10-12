import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { publish, checkServer } from '../src/ntfy/client.js';

function startServer(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

test('publish POSTs the body with the title, Priority/Tags/Auth headers and returns the id', async (t) => {
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
  const target = new URL(req.url, url);
  assert.equal(target.pathname, '/my-topic');
  assert.equal(target.searchParams.get('title'), 'Gladys');
  assert.equal(req.body, 'Hello world');
  assert.equal(req.headers.title, undefined);
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

test('publish keeps the accents and emojis of the title', async (t) => {
  let target = null;
  const { server, url } = await startServer((req, res) => {
    target = new URL(req.url, 'http://ntfy');
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'x' }));
  });
  t.after(() => server.close());

  await publish({ serverUrl: url, topic: 't' }, { text: 'body', title: 'Alerte évènement 🔥' });
  assert.equal(target.searchParams.get('title'), 'Alerte évènement 🔥');
});

test('publish sends no title for a blank one', async (t) => {
  let target = null;
  const { server, url } = await startServer((req, res) => {
    target = req.url;
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'x' }));
  });
  t.after(() => server.close());

  await publish({ serverUrl: url, topic: 't' }, { text: 'body', title: '  ' });
  assert.equal(target, '/t');
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
      assert.equal(err.ntfyError, null, 'a non-JSON answer has no ntfy wording');
      assert.match(err.message, /HTTP 403 forbidden/);
      return true;
    },
  );
});

test('publish keeps the wording of an ntfy JSON error', async (t) => {
  const { server, url } = await startServer((req, res) => {
    req.resume();
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end('{"code":40101,"http":401,"error":"unauthorized","link":"https://ntfy.sh/docs"}');
  });
  t.after(() => server.close());

  await assert.rejects(
    () => publish({ serverUrl: url, topic: 't', accessToken: 'tk_bad' }, { text: 'x' }),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.ntfyError, 'unauthorized');
      return true;
    },
  );
});

test('publish flags a server that cannot be reached', async () => {
  // a port nobody listens on: open a server, note its port, close it
  const { server, url } = await startServer(() => {});
  await new Promise((resolve) => server.close(resolve));

  await assert.rejects(
    () => publish({ serverUrl: url, topic: 't' }, { text: 'x' }),
    (err) => {
      assert.equal(err.unreachable, true);
      assert.equal(err.status, undefined);
      assert.equal(err.networkError, 'ECONNREFUSED');
      return true;
    },
  );
});

test('checkServer reads the health endpoint', async (t) => {
  let path = null;
  const { server, url } = await startServer((req, res) => {
    path = req.url;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"healthy":true}');
  });
  t.after(() => server.close());

  assert.deepEqual(await checkServer(url), { healthy: true });
  assert.equal(path, '/v1/health');
});

test('checkServer reports a server that says it is unhealthy', async (t) => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"healthy":false}');
  });
  t.after(() => server.close());

  assert.deepEqual(await checkServer(url), { healthy: false });
});

test('checkServer accepts a server without a health endpoint', async (t) => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(404);
    res.end('page not found');
  });
  t.after(() => server.close());

  assert.deepEqual(await checkServer(url), { healthy: true });
});

test('checkServer rejects when the server cannot be reached', async () => {
  const { server, url } = await startServer(() => {});
  await new Promise((resolve) => server.close(resolve));

  await assert.rejects(
    () => checkServer(url),
    (err) => err.unreachable === true,
  );
});

test('publish PUTs an attachment, the message going in the query string', async (t) => {
  const requests = [];
  const { server, url } = await startServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'att-1' }));
    });
  });
  t.after(() => server.close());

  const image = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10]);
  const id = await publish(
    { serverUrl: url, topic: 'cam', accessToken: 'tk_test' },
    {
      text: 'Alerte évènement\nCuisine',
      title: 'Gladys',
      priority: 5,
      attachment: { data: image, contentType: 'image/jpeg', filename: 'gladys.jpg' },
    },
  );

  assert.equal(id, 'att-1');
  const [req] = requests;
  assert.equal(req.method, 'PUT');
  const target = new URL(req.url, url);
  assert.equal(target.pathname, '/cam');
  assert.equal(target.searchParams.get('message'), 'Alerte évènement\nCuisine');
  assert.equal(target.searchParams.get('title'), 'Gladys');
  assert.equal(req.headers.filename, 'gladys.jpg');
  assert.equal(req.headers['content-type'], 'image/jpeg');
  assert.equal(req.headers.priority, '5');
  assert.deepEqual(req.body, image);
});

test('publish sends an attachment with no message when the text is blank', async (t) => {
  let target = null;
  const { server, url } = await startServer((req, res) => {
    target = req.url;
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'x' }));
  });
  t.after(() => server.close());

  await publish(
    { serverUrl: url, topic: 'cam' },
    {
      text: ' ',
      attachment: { data: Buffer.from('i'), contentType: 'image/png', filename: 'gladys.png' },
    },
  );
  assert.equal(target, '/cam');
});
