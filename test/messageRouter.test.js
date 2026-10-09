import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOutgoingPayload, parseImageAttachment } from '../src/messaging/messageRouter.js';

const config = { defaultTitle: 'Gladys', defaultPriority: 4 };

test('buildOutgoingPayload maps the text and applies the config title/priority', () => {
  const payload = buildOutgoingPayload({ text: 'Hello', file: null }, config);
  assert.deepEqual(payload, { text: 'Hello', title: 'Gladys', priority: 4 });
});

test('buildOutgoingPayload substitutes a space for an empty body (ntfy needs 1+ char)', () => {
  assert.equal(buildOutgoingPayload({ text: '', file: null }, config).text, ' ');
  assert.equal(buildOutgoingPayload({}, config).text, ' ');
});

test('parseImageAttachment decodes the image Gladys attaches to a message', () => {
  // the camera image format: "image/jpg;base64,..." (no "data:" prefix)
  const jpg = parseImageAttachment(
    `image/jpg;base64,${Buffer.from('jpeg-bytes').toString('base64')}`,
  );
  assert.deepEqual(jpg, {
    data: Buffer.from('jpeg-bytes'),
    contentType: 'image/jpeg',
    filename: 'gladys.jpg',
  });
  const png = parseImageAttachment(
    `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
  );
  assert.equal(png.contentType, 'image/png');
  assert.equal(png.filename, 'gladys.png');
});

test('parseImageAttachment ignores what is not an image', () => {
  assert.equal(parseImageAttachment(null), null);
  assert.equal(parseImageAttachment(''), null);
  assert.equal(parseImageAttachment('not an image'), null);
  assert.equal(parseImageAttachment('application/pdf;base64,JVBERi0='), null);
  assert.equal(parseImageAttachment('image/png;base64,'), null);
});

test('buildOutgoingPayload carries the attached image', () => {
  const payload = buildOutgoingPayload(
    { text: 'Motion', file: `image/jpg;base64,${Buffer.from('x').toString('base64')}` },
    config,
  );
  assert.equal(payload.text, 'Motion');
  assert.deepEqual(payload.attachment.data, Buffer.from('x'));
});
