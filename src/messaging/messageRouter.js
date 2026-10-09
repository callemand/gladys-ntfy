// -----------------------------------------------------------------------------
// Pure message-mapping helper, kept out of index.js so it can be unit tested
// without a network.
// -----------------------------------------------------------------------------

// Gladys hands the image of a message as `<mime>;base64,<data>` (the camera
// image format, e.g. "image/jpg;base64,..."), sometimes with a `data:` prefix.
const IMAGE_FILE = /^(?:data:)?(image\/[a-z0-9.+-]+);base64,(.+)$/is;

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * Decode the image attached to a Gladys message into an ntfy attachment.
 * @param {string|null|undefined} file the `file` of the outgoing message
 * @returns {{ data: Buffer, contentType: string, filename: string }|null} the
 *   attachment, or null when there is none (or it is not a readable image)
 */
export function parseImageAttachment(file) {
  if (typeof file !== 'string' || !file) {
    return null;
  }
  const match = IMAGE_FILE.exec(file.trim());
  if (!match) {
    return null;
  }
  const data = Buffer.from(match[2], 'base64');
  if (data.length === 0) {
    return null;
  }
  // "image/jpg" is what Gladys writes, "image/jpeg" is the registered type
  const contentType =
    match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  return { data, contentType, filename: `gladys.${EXTENSIONS[contentType] || 'img'}` };
}

/**
 * Build the ntfy publish payload for a message Gladys asks to deliver
 * (`OutgoingMessage` = `{ text, file }`). The title and priority come from the
 * integration-wide config; an attached image becomes an ntfy attachment.
 * @param {{ text: string, file: string|null }} message
 * @param {{ defaultTitle: string, defaultPriority: number }} config
 * @returns {{ text: string, title: string, priority: number, attachment?: object }}
 */
export function buildOutgoingPayload(message, config) {
  const text = (message && message.text) || '';
  const payload = {
    // ntfy needs a non-empty body: fall back to a single space.
    text: text || ' ',
    title: config.defaultTitle,
    priority: config.defaultPriority,
  };
  const attachment = parseImageAttachment(message && message.file);
  if (attachment) {
    payload.attachment = attachment;
  }
  return payload;
}
