# Gladys ntfy integration

External integration for [Gladys Assistant](https://gladysassistant.com) that
sends push notifications through [**ntfy**](https://ntfy.sh) — the public
`ntfy.sh` server or your own self-hosted instance.

Built from the official
[`integration-template-js`](https://github.com/GladysAssistant/integration-template-js)
template with the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

## What it does

This is a **send-only communication** integration (manifest
`messaging.receive: false`, no devices): Gladys pushes notifications to ntfy,
there is no incoming path and no account linking.

- **Per-user identity** — each Gladys user fills their own ntfy **topic** and
  **access token** in the "My account" block (manifest `contact_schema`).
- **Sending** — when Gladys delivers a notification to a user, `onSendMessage`
  receives the resolved `contact` (that user's topic + token) and the message;
  the integration publishes it with `POST {server}/{topic}` (`Bearer` token,
  configured default title and priority).
- **Images** — a message with an image (`message.file`, e.g. the "send a camera
  image" scene action, `image/jpg;base64,…`) is published as an ntfy
  **attachment**: `PUT {server}/{topic}` with the image as body, a `Filename`
  header, and the text in the `message` query parameter (UTF-8 and line breaks
  survive, which a header would not allow). A server that refuses it (400:
  attachments disabled, 413: too large) gets the text alone instead.

## Configuration

Integration-wide (`config_schema`):

| Field              | Description                                         |
| ------------------ | --------------------------------------------------- |
| `server_url`       | ntfy server URL, shared (default `https://ntfy.sh`) |
| `default_priority` | Priority of the sent notifications (1–5, default 3) |
| `default_title`    | Title of the sent notifications (default `Gladys`)  |

Per user (`contact_schema`, the "My account" block):

| Field          | Description                                         |
| -------------- | --------------------------------------------------- |
| `topic`        | The user's ntfy topic (required)                    |
| `access_token` | Access token (`tk_…`) allowed to publish (required) |

See [`docs/en.md`](docs/en.md) / [`docs/fr.md`](docs/fr.md) for the end-user
guide.

## Project structure

```
index.js                          # SDK wiring: onSendMessage / onConfigUpdated
gladys-assistant-integration.json # manifest (communication, messaging.receive:false, config + contact schemas)
src/
  constants.js                    # ntfy protocol constants + defaults
  config.js                       # normalizeConfig / normalizeContact / buildAuthHeader
  ntfy/client.js                  # publish() — one POST per notification
  messaging/messageRouter.js      # pure mapping: OutgoingMessage -> ntfy payload
test/                             # node:test unit tests + a full e2e (real index.js vs fake Gladys + fake ntfy)
docs/{en.md, fr.md}
```

## Development

```bash
npm install
npm test          # node --test (unit + e2e)
npm run lint      # eslint
npm run format    # prettier --write
```

Validate the manifest before publishing:

```bash
npx --yes github:GladysAssistant/integration-store .
```

## License

Apache-2.0
