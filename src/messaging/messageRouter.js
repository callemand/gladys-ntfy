// -----------------------------------------------------------------------------
// Pure message-mapping helper, kept out of index.js so it can be unit tested
// without a network.
// -----------------------------------------------------------------------------

/**
 * Build the ntfy publish payload for a message Gladys asks to deliver
 * (`OutgoingMessage` = `{ text, file }`). The title and priority come from the
 * integration-wide config.
 * @param {{ text: string, file: string|null }} message
 * @param {{ defaultTitle: string, defaultPriority: number }} config
 * @returns {{ text: string, title: string, priority: number }}
 */
export function buildOutgoingPayload(message, config) {
  const text = (message && message.text) || '';
  return {
    // ntfy needs a non-empty body: fall back to a single space.
    text: text || ' ',
    title: config.defaultTitle,
    priority: config.defaultPriority,
  };
}
