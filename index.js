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
import { TOPIC_PATTERN } from './src/constants.js';
import { publish, checkServer } from './src/ntfy/client.js';
import { describeError, ERROR_CODES } from './src/ntfy/errors.js';
import { buildOutgoingPayload } from './src/messaging/messageRouter.js';

const gladys = new GladysIntegration();

// Integration-wide configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

// --- Connection status ---------------------------------------------------------
// The status shown in the Configuration screen is the one place where a user
// sees that notifications fail without reading the logs: an unreachable server
// (checked at startup and on every config change) or the last refused
// notification flips it to disconnected with the reason; the next notification
// delivered flips it back. `lastConnected` keeps every successful send from
// re-posting a status that did not change.
let lastConnected = null;

async function reportStatus(connected, message) {
  if (connected && lastConnected === true) {
    return;
  }
  lastConnected = connected;
  await gladys.setConnectionStatus(connected, message).catch(() => {});
}

async function checkServerAndReport() {
  try {
    const { healthy } = await checkServer(config.serverUrl);
    if (healthy) {
      logger.info(`ntfy server ${config.serverUrl} is reachable`);
      await reportStatus(true);
      return;
    }
    const message = {
      en: `The ntfy server ${config.serverUrl} reports it is not healthy: notifications may not be delivered.`,
      fr: `Le serveur ntfy ${config.serverUrl} signale un problème : les notifications risquent de ne pas arriver.`,
    };
    logger.warn(message.en);
    await reportStatus(false, message);
  } catch (err) {
    const message = describeError(err, { serverUrl: config.serverUrl });
    logger.error(message.en);
    await reportStatus(false, message);
  }
}

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function contactError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// --- Gladys asks to deliver a notification to a user -------------------------
// `contact` carries that user's contact_schema values (topic + access token).
gladys.onSendMessage(async (contact, message) => {
  const { topic, accessToken } = normalizeContact(contact);
  try {
    if (!topic) {
      throw contactError(ERROR_CODES.NO_TOPIC);
    }
    if (!TOPIC_PATTERN.test(topic)) {
      throw contactError(ERROR_CODES.INVALID_TOPIC);
    }
    const payload = buildOutgoingPayload(message, config);
    const target = { serverUrl: config.serverUrl, topic, accessToken };
    try {
      await publish(target, payload);
    } catch (err) {
      // A server can refuse attachments (disabled on a self-hosted one: 400) or
      // this one (too large: 413). The text still gets through, without it.
      if (!payload.attachment || ![400, 413].includes(err.status)) {
        throw err;
      }
      logger.warn(`ntfy refused the image (${err.message}): sending the text alone`);
      const { attachment: _refused, ...textOnly } = payload;
      await publish(target, textOnly);
    }
  } catch (err) {
    const reason = describeError(err, { serverUrl: config.serverUrl, accessToken });
    logger.error(`Notification not sent: ${reason.en}`);
    await reportStatus(false, {
      en: `Last notification not sent: ${lowerFirst(reason.en)}`,
      fr: `Dernière notification non envoyée : ${lowerFirst(reason.fr)}`,
    });
    // the ack carries the explanation, not the raw HTTP failure
    throw new Error(reason.en, { cause: err });
  }
  logger.debug(`Notification published to ntfy topic "${topic}"`);
  await reportStatus(true);
});

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> reloading the ntfy configuration');
  config = normalizeConfig(newConfig);
  await checkServerAndReport();
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  logger.info('WebSocket connected to Gladys');
  try {
    config = normalizeConfig(await gladys.getConfig());
    logger.info(`ntfy ready (server ${config.serverUrl})`);
    // Send-only channel: there is no persistent link to a third party, so the
    // integration is "connected" as long as its server answers. A reconnection
    // always re-posts the status (Gladys may have lost it).
    lastConnected = null;
    await checkServerAndReport();
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
