// -----------------------------------------------------------------------------
// ntfy protocol constants + integration defaults.
//
// This is a send-only *communication* integration (manifest
// `messaging.receive: false`): there are no devices and no incoming path. Each
// Gladys user enters their own ntfy topic + token in the "My account" block
// (manifest `contact_schema`), and Gladys hands those values to onSendMessage
// with every outgoing notification.
// -----------------------------------------------------------------------------

// Default public ntfy server, used when the user leaves the URL empty.
export const DEFAULT_SERVER_URL = 'https://ntfy.sh';

// Server modes (config `mode`): the public/remote cloud, or the local ntfy
// server managed by Gladys as a companion container.
export const SERVER_MODE = {
  CLOUD: 'cloud',
  LOCAL: 'local',
};

// Name of the companion ntfy container declared in the manifest. It is also its
// DNS alias on the integration's private network, so the integration reaches it
// at `http://server:80`. Overridable for tests via NTFY_LOCAL_SERVER_URL.
export const LOCAL_CONTAINER_NAME = 'server';
export const LOCAL_SERVER_URL = process.env.NTFY_LOCAL_SERVER_URL || 'http://server:80';

// Default notification title, used when none is configured.
export const DEFAULT_TITLE = 'Gladys';

// ntfy priorities (1 = min ... 5 = max). 3 is the ntfy default.
export const NTFY_PRIORITY = {
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
  MAX: 5,
};

export const DEFAULT_PRIORITY = NTFY_PRIORITY.DEFAULT;

// Gladys accepts message texts of 1-4096 characters (POST /message bound).
export const MAX_MESSAGE_TEXT_LENGTH = 4096;

// HTTP timeout for the publish requests (ms).
export const REQUEST_TIMEOUT_MS = 15000;
