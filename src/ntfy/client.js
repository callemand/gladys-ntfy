// -----------------------------------------------------------------------------
// Minimal ntfy publish client (uses the Node.js built-in fetch).
//
// ntfy publishing is a single HTTP call:
//   POST {server}/{topic}   body = message, headers = Priority, Tags...
// The title goes in the `title` query parameter rather than a header: a header
// must be ASCII, the query string keeps UTF-8 ("Alarme déclenchée").
// With an attached image, the image is the body instead (PUT, `Filename`
// header) and the message moves to the `message` query parameter, which keeps
// UTF-8 and line breaks a header could not carry.
// The server/topic/token are per-user (they come from the `contact` of each
// outgoing message), so `publish()` takes them per call rather than storing
// them on the instance.
//
// Every failure throws an error carrying what describeError() needs to explain
// it: `status` (HTTP status) and `ntfyError` (the server's own wording) for a
// refusal, `unreachable` and `networkError` for a server that never answered.
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
  if (priority) {
    headers.Priority = String(priority);
  }
  if (tags && tags.length > 0) {
    headers.Tags = tags.join(',');
  }
  const params = new URLSearchParams();
  if (title && title.trim()) {
    params.set('title', title.trim());
  }
  if (attachment && text && text.trim()) {
    params.set('message', text);
  }
  const base = serverUrl.replace(/\/+$/, '');
  const query = params.toString();
  const url = `${base}/${encodeURIComponent(topic)}${query ? `?${query}` : ''}`;
  const response = await request(url, {
    method: attachment ? 'PUT' : 'POST',
    headers,
    body: attachment ? attachment.data : text,
  });
  if (!response.ok) {
    throw await refusalError(response);
  }
  const published = await response.json().catch(() => ({}));
  return published.id || null;
}

/**
 * Check that an ntfy server answers, with its health endpoint. Any HTTP answer
 * proves the server is reachable (an old server without /v1/health answers
 * 404); only an explicit `healthy: false` counts as unhealthy.
 * @param {string} serverUrl base URL, without trailing slash
 * @returns {Promise<{ healthy: boolean }>} rejects when the server is unreachable
 */
export async function checkServer(serverUrl) {
  const base = serverUrl.replace(/\/+$/, '');
  const response = await request(`${base}/v1/health`, { method: 'GET' });
  if (!response.ok) {
    return { healthy: true };
  }
  const health = await response.json().catch(() => ({}));
  return { healthy: health.healthy !== false };
}

/**
 * fetch with the request timeout, turning a network failure (DNS, refused
 * connection, TLS, timeout) into an error flagged `unreachable`.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function request(url, options) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    const networkError =
      err.name === 'TimeoutError'
        ? 'timeout'
        : (err.cause && (err.cause.code || err.cause.message)) || err.message;
    const error = new Error(`ntfy server unreachable: ${networkError}`, { cause: err });
    error.unreachable = true;
    error.networkError = networkError;
    throw error;
  }
}

/**
 * Build the error of a request the server refused. ntfy answers errors as
 * JSON (`{"code":40101,"http":401,"error":"unauthorized"}`): its `error` is
 * kept as `ntfyError`; a non-ntfy answer (proxy page) keeps its raw text.
 * @param {Response} response
 * @returns {Promise<Error>}
 */
async function refusalError(response) {
  const body = (await response.text().catch(() => '')).trim();
  let ntfyError = null;
  try {
    ntfyError = JSON.parse(body).error || null;
  } catch {
    // not an ntfy JSON error
  }
  const detail = ntfyError || body.slice(0, 200);
  const error = new Error(`ntfy publish failed: HTTP ${response.status} ${detail}`.trim());
  error.status = response.status;
  error.ntfyError = ntfyError;
  return error;
}
