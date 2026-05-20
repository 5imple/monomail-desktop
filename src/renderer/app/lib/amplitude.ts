import * as amplitude from '@amplitude/analytics-browser';
import { sessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';

/**
 * Amplitude + Session Replay init.
 *
 * Privacy guardrails (added 2026-05):
 *
 *   1. Sample rate dropped from 100% → 5%. Recording every session of an
 *      email client is hostile to user privacy and exposes the team to
 *      GDPR/HIPAA risk on any incident.
 *   2. `privacyConfig` masks all inputs, textareas, contenteditables, and
 *      the rendered message body. This prevents Session Replay from
 *      capturing the user's password (any input that's NOT
 *      `type="password"` would otherwise be recorded character-by-character),
 *      OAuth credentials, recipient addresses typed into the To: field,
 *      and the contents of incoming or outgoing email messages.
 *   3. Compose / reader containers are explicitly blocked entirely.
 *   4. The Amplitude API key now reads from build env (MONO_ENV_AMPLITUDE_KEY)
 *      with the previous hardcoded key as a fallback for local dev only.
 *      Production builds should set the env var.
 *
 * If you need to verify masking works:
 *   - Open Amplitude Session Replay viewer.
 *   - Confirm `<input>` values appear as asterisks.
 *   - Confirm the compose editor renders as a blank rectangle.
 */

// Selectors for things we don't want Session Replay to see.
// `block` removes the node entirely; `mask` replaces text with asterisks.
const PRIVACY_BLOCK_SELECTORS = [
  '.compose',
  '[data-compose]',
  '[data-nav-area="display-panel"] .message-body',
  '[data-message-body]',
  '.thread-reader',
  '.message-card-content',
  '.signature-editor',
  '[data-signature]'
];

const PRIVACY_MASK_SELECTORS = [
  'input',
  'textarea',
  '[contenteditable]',
  '[contenteditable="true"]',
  '.ProseMirror', // Tiptap editor root
  '.tiptap-content',
  '.message-subject',
  '.recipient-input',
  '.search-input'
];

const initializeAmplitude = (): void => {
  const apiKey =
    (import.meta.env.MONO_ENV_AMPLITUDE_KEY as string | undefined) ||
    'e36a4d80f6bbad334a3ca71f7c13e562';

  amplitude.add(
    sessionReplayPlugin({
      // 5% sample. Drop further (or to 0) if regulated content flows through.
      sampleRate: 0.05,
      privacyConfig: {
        // Conservative default — replaces text with asterisks unless the
        // node is explicitly opted in elsewhere in the Amplitude config.
        defaultMaskLevel: 'conservative',
        maskSelector: PRIVACY_MASK_SELECTORS,
        blockSelector: PRIVACY_BLOCK_SELECTORS
      }
    })
  );

  amplitude.init(apiKey, {
    autocapture: {
      elementInteractions: true,
      // Don't capture form-submission payloads — they'd include the
      // body of any in-app form (sign-in, signature edits, etc.).
      formInteractions: false
    }
  });
};

export default initializeAmplitude;
