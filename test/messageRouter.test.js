import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOutgoingPayload } from '../src/messaging/messageRouter.js';

const config = { defaultTitle: 'Gladys', defaultPriority: 4 };

test('buildOutgoingPayload maps the text and applies the config title/priority', () => {
  const payload = buildOutgoingPayload({ text: 'Hello', file: null }, config);
  assert.deepEqual(payload, { text: 'Hello', title: 'Gladys', priority: 4 });
});

test('buildOutgoingPayload substitutes a space for an empty body (ntfy needs 1+ char)', () => {
  assert.equal(buildOutgoingPayload({ text: '', file: null }, config).text, ' ');
  assert.equal(buildOutgoingPayload({}, config).text, ' ');
});
