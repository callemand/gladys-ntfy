import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig, normalizeContact, buildAuthHeader } from '../src/config.js';
import { DEFAULT_SERVER_URL, DEFAULT_TITLE, DEFAULT_PRIORITY } from '../src/constants.js';

test('normalizeConfig applies the defaults on an empty config', () => {
  const config = normalizeConfig();
  assert.equal(config.serverUrl, DEFAULT_SERVER_URL);
  assert.equal(config.defaultTitle, DEFAULT_TITLE);
  assert.equal(config.defaultPriority, DEFAULT_PRIORITY);
});

test('normalizeConfig trims the server URL and strips trailing slashes', () => {
  const config = normalizeConfig({ server_url: '  https://ntfy.example.com/  ' });
  assert.equal(config.serverUrl, 'https://ntfy.example.com');
});

test('normalizeConfig falls back to the default server on an empty URL', () => {
  assert.equal(normalizeConfig({ server_url: '   ' }).serverUrl, DEFAULT_SERVER_URL);
});

test('normalizeConfig coerces the priority and clamps invalid values', () => {
  assert.equal(normalizeConfig({ default_priority: '5' }).defaultPriority, 5);
  assert.equal(normalizeConfig({ default_priority: '9' }).defaultPriority, DEFAULT_PRIORITY);
  assert.equal(normalizeConfig({ default_priority: 'foo' }).defaultPriority, DEFAULT_PRIORITY);
});

test('normalizeContact reads the per-user topic and access token', () => {
  const contact = normalizeContact({ topic: '  my-topic  ', access_token: 'tk_abc' });
  assert.equal(contact.topic, 'my-topic');
  assert.equal(contact.accessToken, 'tk_abc');
});

test('normalizeContact returns nulls when the contact is empty', () => {
  const contact = normalizeContact({});
  assert.equal(contact.topic, null);
  assert.equal(contact.accessToken, null);
});

test('buildAuthHeader builds a Bearer header from the access token', () => {
  assert.equal(buildAuthHeader('tk_abc'), 'Bearer tk_abc');
});

test('buildAuthHeader returns null without a token', () => {
  assert.equal(buildAuthHeader(null), null);
  assert.equal(buildAuthHeader(''), null);
});
