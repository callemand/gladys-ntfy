// -----------------------------------------------------------------------------
// Turn an ntfy failure into a message a user can act on, in English and
// French (the shape of the SDK `MultiLanguageMessage`).
//
// The raw failure ("HTTP 401 unauthorized") says what happened, not what to
// fix. These messages name the setting to check — the server URL of the
// integration settings, or the topic/token of the "My account" block — and
// end with the server's own wording when there is one.
// -----------------------------------------------------------------------------

import { ACCESS_TOKEN_PREFIX } from '../constants.js';

export const ERROR_CODES = {
  NO_TOPIC: 'NO_TOPIC',
  INVALID_TOPIC: 'INVALID_TOPIC',
};

/**
 * Explain a failure of the integration (publish refused, server unreachable,
 * topic missing or invalid).
 * @param {Error & { status?: number, ntfyError?: string, unreachable?: boolean,
 *   networkError?: string, code?: string }} err the failure
 * @param {{ serverUrl: string, accessToken?: string|null }} context
 * @returns {{ en: string, fr: string }}
 */
export function describeError(err, { serverUrl, accessToken = null }) {
  const message = baseMessage(err, { serverUrl, accessToken });
  if (!err.ntfyError) {
    return message;
  }
  return {
    en: `${message.en} (ntfy: "${err.ntfyError}")`,
    fr: `${message.fr} (ntfy : « ${err.ntfyError} »)`,
  };
}

function baseMessage(err, { serverUrl, accessToken }) {
  if (err.code === ERROR_CODES.NO_TOPIC) {
    return {
      en: 'No ntfy topic is set for this user: fill it in their "My account" block.',
      fr: 'Aucun topic ntfy pour cet utilisateur : renseignez-le dans son bloc « Mon compte ».',
    };
  }
  if (err.code === ERROR_CODES.INVALID_TOPIC) {
    return {
      en: 'The ntfy topic of this user is not valid: use only letters, digits, - and _ (64 characters at most), with no spaces or accents.',
      fr: "Le topic ntfy de cet utilisateur n'est pas valide : utilisez uniquement des lettres, des chiffres, - et _ (64 caractères maximum), sans espaces ni accents.",
    };
  }
  if (err.unreachable) {
    return {
      en: `Unable to reach the ntfy server ${serverUrl} (${err.networkError}). Check the server URL in the integration settings, and that Gladys can reach it.`,
      fr: `Impossible de joindre le serveur ntfy ${serverUrl} (${err.networkError}). Vérifiez l'URL du serveur dans les réglages de l'intégration, et que Gladys peut y accéder.`,
    };
  }
  if (!err.status) {
    // not an ntfy answer: an unexpected failure, kept as is
    return { en: err.message, fr: err.message };
  }
  switch (err.status) {
    case 401:
      if (accessToken && !accessToken.startsWith(ACCESS_TOKEN_PREFIX)) {
        return {
          en: `ntfy refused the access token (401): an ntfy access token starts with "${ACCESS_TOKEN_PREFIX}". Check the token in the "My account" block.`,
          fr: `ntfy a refusé le jeton d'accès (401) : un jeton ntfy commence par « ${ACCESS_TOKEN_PREFIX} ». Vérifiez le jeton dans le bloc « Mon compte ».`,
        };
      }
      return {
        en: 'ntfy refused the access token (401): it is invalid, expired or was deleted. Check the token in the "My account" block.',
        fr: "ntfy a refusé le jeton d'accès (401) : il est invalide, expiré ou a été supprimé. Vérifiez le jeton dans le bloc « Mon compte ».",
      };
    case 403:
      if (!accessToken) {
        return {
          en: 'This ntfy topic requires an access token (403): add one in the "My account" block.',
          fr: "Ce topic ntfy demande un jeton d'accès (403) : ajoutez-en un dans le bloc « Mon compte ».",
        };
      }
      return {
        en: 'The access token is not allowed to publish on this topic (403): give it write access on the ntfy server, or use a topic it can write to.',
        fr: "Le jeton d'accès n'a pas le droit de publier sur ce topic (403) : donnez-lui l'accès en écriture sur le serveur ntfy, ou utilisez un topic sur lequel il peut écrire.",
      };
    case 404:
      return {
        en: `No ntfy server answers at ${serverUrl} (404). Check the server URL in the integration settings.`,
        fr: `Aucun serveur ntfy ne répond à l'adresse ${serverUrl} (404). Vérifiez l'URL du serveur dans les réglages de l'intégration.`,
      };
    case 413:
      return {
        en: 'The notification is too large for the ntfy server (413).',
        fr: 'La notification est trop volumineuse pour le serveur ntfy (413).',
      };
    case 429:
      return {
        en: 'The ntfy server limits the number of notifications and the limit is reached (429): wait a moment, or use your own server.',
        fr: 'Le serveur ntfy limite le nombre de notifications et la limite est atteinte (429) : patientez un peu, ou utilisez votre propre serveur.',
      };
    default:
      if (err.status >= 500) {
        return {
          en: `The ntfy server ran into an error (HTTP ${err.status}): try again later.`,
          fr: `Le serveur ntfy a rencontré une erreur (HTTP ${err.status}) : réessayez plus tard.`,
        };
      }
      return {
        en: `ntfy refused the notification (HTTP ${err.status}).`,
        fr: `ntfy a refusé la notification (HTTP ${err.status}).`,
      };
  }
}
