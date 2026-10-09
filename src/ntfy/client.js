// -----------------------------------------------------------------------------
// Minimal ntfy publish client (uses the Node.js built-in fetch).
//
// ntfy publishing is a single HTTP call:
//   POST {server}/{topic}   body = message, headers = Title, Priority, Tags...
// With an attached image, the image is the body instead (PUT, `Filename`
// header) and the message moves to the `message` query parameter, which keeps
// UTF-8 and line breaks a header could not carry.
// The server/topic/token are per-user (they come from the `contact` of each
// outgoing message), so `publish()` takes them per call rather than storing
// them on the instance.
// -----------------------------------------------------------------------------

import { REQUEST_TIMEOUT_MS } from '../constants.js';
import { buildAuthHeader } from '../config.js';

/**
 * Publish a text notification to an ntfy topic.
 * @param {object} target
 * @param {string} target.serverUrl base URL, without trailing slash
 * @param {string} target.topic ntfy topic
 * @param {string|null} [target.accessToken] ntfy access token (tk_...)
 * @param {object} message
 * @param {string} message.text body of the notification
 * @param {string} [message.title] notification title
 * @param {number} [message.priority] ntfy priority (1-5)
 * @param {string[]} [message.tags] ntfy tags
 * @param {{ data: Buffer, contentType: string, filename: string }} [message.attachment]
 *   an image to attach
 * @returns {Promise<string|null>} the published message id (or null)
 */
export async function publish(
  { serverUrl, topic, accessToken },
  { text, title, priority, tags, attachment },
) {
  const authHeader = buildAuthHeader(accessToken);
  const headers = {
    'Content-Type': attachment ? attachment.contentType : 'text/plain; charset=utf-8',
    ...(authHeader ? { Authorization: authHeader } : {}),
  };
  if (attachment) {
    headers.Filename = attachment.filename;
  }
  if (title) {
    headers.Title = encodeHeaderValue(title);
  }
  if (priority) {
    headers.Priority = String(priority);
  }
  if (tags && tags.length > 0) {
    headers.Tags = tags.join(',');
  }
  const base = serverUrl.replace(/\/+$/, '');
  let url = `${base}/${encodeURIComponent(topic)}`;
  if (attachment && text && text.trim()) {
    url += `?${new URLSearchParams({ message: text })}`;
  }
  const response = await fetch(url, {
    method: attachment ? 'PUT' : 'POST',
    headers,
    body: attachment ? attachment.data : text,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const error = new Error(`ntfy publish failed: HTTP ${response.status} ${body}`.trim());
    error.status = response.status;
    throw error;
  }
  const published = await response.json().catch(() => ({}));
  return published.id || null;
}

/**
 * ntfy carries the notification Title in an HTTP header, which must be ASCII.
 * To keep a publish from ever failing on an exotic character, strip non-ASCII
 * characters from the title (the message body itself keeps full UTF-8).
 * @param {string} value
 */
function encodeHeaderValue(value) {
  let ascii = '';
  for (const char of value) {
    if (char.charCodeAt(0) <= 0x7f) {
      ascii += char;
    }
  }
  return ascii.trim() || 'Gladys';
}
