import test from 'node:test';
import assert from 'node:assert/strict';

import { describeError, ERROR_CODES } from '../src/ntfy/errors.js';

const SERVER = 'https://ntfy.example.com';

function httpError(status, ntfyError = null) {
  const error = new Error(`ntfy publish failed: HTTP ${status}`);
  error.status = status;
  error.ntfyError = ntfyError;
  return error;
}

function codeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

test('every message comes in English and French', () => {
  const failures = [
    codeError(ERROR_CODES.NO_TOPIC),
    codeError(ERROR_CODES.INVALID_TOPIC),
    Object.assign(new Error('x'), { unreachable: true, networkError: 'ENOTFOUND' }),
    httpError(401),
    httpError(403),
    httpError(404),
    httpError(413),
    httpError(429),
    httpError(502),
    httpError(418),
  ];
  for (const failure of failures) {
    const message = describeError(failure, { serverUrl: SERVER, accessToken: 'tk_x' });
    assert.ok(message.en && message.fr, `en + fr for ${failure.message}`);
    assert.notEqual(message.en, message.fr);
  }
});

test('an unreachable server names the URL and the cause', () => {
  const err = Object.assign(new Error('x'), { unreachable: true, networkError: 'ENOTFOUND' });
  const { en, fr } = describeError(err, { serverUrl: SERVER });
  assert.match(en, /Unable to reach the ntfy server https:\/\/ntfy\.example\.com \(ENOTFOUND\)/);
  assert.match(fr, /Impossible de joindre le serveur ntfy https:\/\/ntfy\.example\.com/);
});

test('a refused token points to the "My account" block', () => {
  const { en, fr } = describeError(httpError(401), { serverUrl: SERVER, accessToken: 'tk_abc' });
  assert.match(en, /refused the access token \(401\).*"My account"/);
  assert.match(fr, /« Mon compte »/);
});

test('a 401 with a token that is not an ntfy token says what one looks like', () => {
  const { en } = describeError(httpError(401), { serverUrl: SERVER, accessToken: 'my-password' });
  assert.match(en, /starts with "tk_"/);
});

test('a 403 tells apart a missing token from a token without the right', () => {
  assert.match(
    describeError(httpError(403), { serverUrl: SERVER, accessToken: null }).en,
    /requires an access token/,
  );
  assert.match(
    describeError(httpError(403), { serverUrl: SERVER, accessToken: 'tk_abc' }).en,
    /not allowed to publish on this topic/,
  );
});

test("the server's own wording is appended", () => {
  const { en, fr } = describeError(httpError(429, 'limit reached: too many requests'), {
    serverUrl: SERVER,
  });
  assert.match(en, /\(429\).*\(ntfy: "limit reached: too many requests"\)$/);
  assert.match(fr, /\(ntfy : « limit reached: too many requests »\)$/);
});

test('an unexpected failure keeps its own message', () => {
  const { en, fr } = describeError(new Error('boom'), { serverUrl: SERVER });
  assert.equal(en, 'boom');
  assert.equal(fr, 'boom');
});
