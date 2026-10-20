# ntfy

## Overview

This integration lets Gladys Assistant **send push notifications** through
[**ntfy**](https://ntfy.sh), a simple notification service. When a scene sends a
message to you, it is pushed to your phone through the ntfy app.

It works with the free public server **https://ntfy.sh** as well as with your
own **self-hosted** ntfy server.

This is a **send-only** channel: Gladys only sends notifications, it does not
receive messages back. Each Gladys user configures their **own ntfy topic** in
their account, so everyone gets their notifications on their own phone.

## Prerequisites

- The **ntfy app** installed on your phone
  ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) /
  [iOS](https://apps.apple.com/us/app/ntfy/id1625396347)), or any ntfy client.
- Internet access from your Gladys instance (to reach https://ntfy.sh), or a
  reachable self-hosted ntfy server.
- A **topic**. A topic is a channel: pick a **long, hard-to-guess** name, with
  only letters, digits, `-` and `_`.
- An **access token** (`tk_…`) allowed to publish to that topic, if your server
  or topic is protected. It is optional for a topic open to anyone, such as a
  public topic on ntfy.sh.

## Configuration

The configuration has two parts:

### 1. Integration settings (shared, set once)

- **ntfy server URL** — `https://ntfy.sh` by default, or your self-hosted
  server;
- **Default priority** — the priority of the notifications Gladys sends;
- **Default notification title** — the title shown on those notifications.

### 2. My account (per user)

Each Gladys user opens the integration and fills their own account block:

- **Your ntfy topic** — the topic your notifications are sent to;
- **Access token** (optional) — an ntfy access token (`tk_…`) allowed to
  publish to that topic. Leave it empty if the topic is open to anyone.

Then **subscribe to that topic in the ntfy app** on your phone so the
notifications reach you.

## Sending notifications

Use a Gladys scene with a **"Send a message"** action, choose this integration
and the user to notify: the message is published to that user's ntfy topic and
pushed to their phone.

The **"Send a camera image"** action works too: the image comes as an
attachment of the notification, shown in the ntfy app. If the ntfy server does
not accept attachments (disabled on some self-hosted servers, or an image too
large), the text is still sent, without the image.

## Troubleshooting

The integration checks that the ntfy server answers at startup and on every
settings change. When it does not, or when a notification is refused, the
Configuration screen shows it with the reason and what to fix. The status goes
back to normal as soon as a notification gets through. The same message is
written in the **Logs** tab of the integration.

- **Unable to reach the ntfy server** — the server URL is wrong, or Gladys
  cannot reach the network or the server.
- **Access token refused (401)** — the token is invalid, expired or deleted. An
  ntfy token starts with `tk_`.
- **Not allowed to publish (403)** — the topic requires a token, or the token
  cannot write to this topic; fix its permissions on your ntfy server.
- **Invalid topic** — a topic only accepts letters, digits, `-` and `_` (64
  characters at most), with no spaces or accents.
- **Limit reached (429)** — the server limits the number of notifications;
  wait, or use your own server.
- **A user gets no notification, with no error** — check that the ntfy app on
  their phone is subscribed to the **same topic and server** as their "My
  account" block.
- **Notifications arrive without a title** — set the **Default notification
  title** in the integration settings.
