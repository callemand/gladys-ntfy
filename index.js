// -----------------------------------------------------------------------------
// Entry point of the Gladys ntfy external integration.
//
// This is a SEND-ONLY COMMUNICATION integration (manifest
// `messaging.receive: false`, no devices): Gladys pushes notifications to ntfy,
// there is no incoming path and no account linking.
//
//   - Each Gladys user fills their own ntfy topic + access token in the
//     "My account" block (manifest `contact_schema`).
//   - When Gladys delivers a notification to a user, onSendMessage receives the
//     resolved `contact` (that user's topic + token) and the message; the
//     integration publishes it to the topic.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, normalizeContact } from './src/config.js';
import { publish } from './src/ntfy/client.js';
import { buildOutgoingPayload } from './src/messaging/messageRouter.js';

const gladys = new GladysIntegration();

// Integration-wide configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

// --- Gladys asks to deliver a notification to a user -------------------------
// `contact` carries that user's contact_schema values (topic + access token).
gladys.onSendMessage(async (contact, message) => {
  const { topic, accessToken } = normalizeContact(contact);
  if (!topic) {
    throw new Error('This Gladys user has no ntfy topic configured in their account');
  }
  const payload = buildOutgoingPayload(message, config);
  await publish({ serverUrl: config.serverUrl, topic, accessToken }, payload);
  logger.debug(`Notification published to ntfy topic "${topic}"`);
});

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> reloading the ntfy configuration');
  config = normalizeConfig(newConfig);
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  logger.info('WebSocket connected to Gladys');
  try {
    config = normalizeConfig(await gladys.getConfig());
    // Send-only channel: there is no persistent link to a third party, so the
    // integration is "connected" as soon as it is up and configured.
    await gladys.setConnectionStatus(true).catch(() => {});
    logger.info(`ntfy ready (server ${config.serverUrl})`);
  } catch (err) {
    logger.error(`Post-connection initialization failed: ${err.message}`);
  }
});

gladys.on('disconnected', () => {
  logger.warn('WebSocket disconnected - the SDK will try to reconnect');
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the ntfy integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
