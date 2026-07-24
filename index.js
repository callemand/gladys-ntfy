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
// Two server modes (config `mode`):
//   - "cloud": publish to the public ntfy.sh or a URL the user sets;
//   - "local": Gladys runs a ntfy server as a companion container (manifest
//     `containers`), started on demand; the integration publishes to it on the
//     private network (http://server:80) and the user subscribes their phone to
//     it on the LAN.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  normalizeContact,
  isLocalMode,
  resolveServerBaseUrl,
} from './src/config.js';
import { publish } from './src/ntfy/client.js';
import { buildOutgoingPayload } from './src/messaging/messageRouter.js';
import { LOCAL_CONTAINER_NAME } from './src/constants.js';

const gladys = new GladysIntegration();

// Integration-wide configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

/**
 * Bring the companion ntfy server up (local mode) or down (cloud mode). Best
 * effort: a failure (e.g. Docker unavailable) is reported through the
 * connection status but never crashes the integration.
 */
async function applyServerMode() {
  if (isLocalMode(config)) {
    try {
      await gladys.startContainer(LOCAL_CONTAINER_NAME);
      logger.info('Local ntfy server container started');
      const containers = (await gladys.getContainers().catch(() => [])) || [];
      const server = containers.find((c) => c.name === LOCAL_CONTAINER_NAME);
      const port = server && server.ports && server.ports[0] && server.ports[0].host_port;
      await gladys
        .setConnectionStatus(true, {
          en: port
            ? `Local ntfy server running. Subscribe your phone to http://<gladys-ip>:${port}/<topic>.`
            : 'Local ntfy server running. Subscribe your phone to it on your LAN.',
          fr: port
            ? `Serveur ntfy local démarré. Abonnez votre téléphone à http://<ip-gladys>:${port}/<topic>.`
            : 'Serveur ntfy local démarré. Abonnez votre téléphone dessus sur votre réseau local.',
        })
        .catch(() => {});
    } catch (err) {
      logger.error(`Could not start the local ntfy server: ${err.message}`);
      await gladys
        .setConnectionStatus(false, {
          en: 'Local ntfy server could not start (Docker required). Check the integration logs.',
          fr: 'Le serveur ntfy local n’a pas pu démarrer (Docker requis). Consultez les journaux.',
        })
        .catch(() => {});
    }
    return;
  }

  // Cloud mode: make sure the companion server is not left running.
  await gladys.stopContainer(LOCAL_CONTAINER_NAME).catch(() => {});
  await gladys.setConnectionStatus(true).catch(() => {});
  logger.info(`ntfy ready in cloud mode (server ${config.serverUrl})`);
}

// --- Gladys asks to deliver a notification to a user -------------------------
// `contact` carries that user's contact_schema values (topic + access token).
gladys.onSendMessage(async (contact, message) => {
  const { topic, accessToken } = normalizeContact(contact);
  if (!topic) {
    throw new Error('This Gladys user has no ntfy topic configured in their account');
  }
  const payload = buildOutgoingPayload(message, config);
  await publish({ serverUrl: resolveServerBaseUrl(config), topic, accessToken }, payload);
  logger.debug(`Notification published to ntfy topic "${topic}"`);
});

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> reloading the ntfy configuration');
  config = normalizeConfig(newConfig);
  try {
    await applyServerMode();
  } catch (err) {
    logger.error(`Failed to apply the new configuration: ${err.message}`);
  }
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  logger.info('WebSocket connected to Gladys');
  try {
    config = normalizeConfig(await gladys.getConfig());
    await applyServerMode();
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
