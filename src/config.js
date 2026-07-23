// -----------------------------------------------------------------------------
// Configuration + per-user contact handling.
//
// Two layers (contract B.15, send-only channel):
//   - the integration-wide `config_schema` (server URL + notification defaults),
//     fetched with `gladys.getConfig()` and hot-reloaded via onConfigUpdated;
//   - the per-user `contact_schema` values (topic + access token), handed to
//     the integration inside the `contact` of every onSendMessage call.
// -----------------------------------------------------------------------------

import { DEFAULT_SERVER_URL, DEFAULT_TITLE, DEFAULT_PRIORITY, NTFY_PRIORITY } from './constants.js';

export const DEFAULT_CONFIG = {
  serverUrl: DEFAULT_SERVER_URL,
  defaultPriority: DEFAULT_PRIORITY,
  defaultTitle: DEFAULT_TITLE,
};

/**
 * Coerce the select value (a string in the manifest) to a valid ntfy priority.
 * @param {unknown} raw priority coming from the config
 * @returns {number} a priority in [1, 5]
 */
function normalizePriority(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < NTFY_PRIORITY.MIN || value > NTFY_PRIORITY.MAX) {
    return DEFAULT_PRIORITY;
  }
  return value;
}

/**
 * Merge the integration-wide config with the defaults and normalize it.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const serverUrl = (raw.server_url || DEFAULT_SERVER_URL).trim().replace(/\/+$/, '');
  return {
    serverUrl: serverUrl || DEFAULT_SERVER_URL,
    defaultPriority: normalizePriority(raw.default_priority),
    defaultTitle: raw.default_title != null ? String(raw.default_title) : DEFAULT_TITLE,
  };
}

/**
 * Read the per-user ntfy identity out of the `contact` handed to onSendMessage
 * (the user's `contact_schema` values on a send-only channel).
 * @param {Record<string, unknown>} contact
 * @returns {{ topic: string|null, accessToken: string|null }}
 */
export function normalizeContact(contact = {}) {
  const topic = contact.topic ? String(contact.topic).trim() : null;
  return {
    topic: topic || null,
    accessToken: contact.access_token ? String(contact.access_token) : null,
  };
}

/**
 * Build the HTTP Authorization header value for an ntfy request, or null when
 * no access token is set (anonymous topic).
 * @param {string|null} accessToken
 * @returns {string|null}
 */
export function buildAuthHeader(accessToken) {
  return accessToken ? `Bearer ${accessToken}` : null;
}
