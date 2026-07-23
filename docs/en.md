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
- A **topic** and an **access token** for it. A topic is a channel; pick a
  **long, hard-to-guess** name and protect it with a token (`tk_…`) allowed to
  publish to it.

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
- **Access token** — an ntfy access token (`tk_…`) allowed to publish to that
  topic.

Then **subscribe to that topic in the ntfy app** on your phone so the
notifications reach you.

## Sending notifications

Use a Gladys scene with a **"Send a message"** action, choose this integration
and the user to notify: the message is published to that user's ntfy topic and
pushed to their phone.

## Troubleshooting

- **A user gets no notification** — check that their **topic** and **access
  token** are filled in their account block, and that the ntfy app on their
  phone is subscribed to the **same topic and server**.
- **Publishing fails (403)** — the access token is missing or not allowed to
  publish to the topic; create/renew it on your ntfy server.
- **Notifications arrive without a title** — set the **Default notification
  title** in the integration settings.
