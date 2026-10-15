import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { embedQuotedImages, formatQuotedReply } from '@/renderer/app/lib/formatBody';
import { buildRawMessage } from '@/renderer/app/lib/mime/buildRawMessage';
// Resolved (via the runner's alias) to scripts/__tests__/m365/stubs/apiClient.mjs.
import { __setGraphHandler, __reset } from '@/main/api/apiClient';

// A reply goes out with the message it answers quoted under it (it used to be
// shown in the compose card but never sent), its pictures included, and with
// In-Reply-To / References so it lands in the same conversation.

const { window } = new JSDOM('');
Object.assign(globalThis, {
  DOMParser: window.DOMParser,
  Node: window.Node,
  document: window.document
});

beforeEach(() => __reset());

const original = (html: string, inlineImages = {}) =>
  new MonoMessage({
    id: 'orig-1',
    threadId: 'conv-1',
    timestamp: Date.UTC(2026, 9, 15, 17, 40),
    timezone: 'UTC',
    subject: 'Guidance Circle launch meeting',
    from: { name: 'Valerie Imbruce', email: 'vimbruce2@example.edu' },
    to: [{ name: 'Roushdy N. Alshawa', email: 'ralshawa2@example.edu' }],
    cc: [{ name: 'Emily A. Lifs', email: 'elifs2@example.edu' }],
    bcc: [],
    labelIds: ['INBOX'],
    inlineImages,
    attachments: {},
    payload: {
      partId: '',
      mimeType: 'text/html',
      filename: '',
      headers: [],
      body: { size: html.length, data: Buffer.from(html).toString('base64url') }
    } as any
  } as any);

test('formatQuotedReply: a Microsoft reply quotes the original under an Outlook header', () => {
  const quote = formatQuotedReply(original('<p>Yes, Emily will set one up.</p>'), 'outlook');
  assert.match(quote, /data-history/);
  assert.match(quote, /<b>From:<\/b> Valerie Imbruce &lt;vimbruce2@example\.edu&gt;/);
  assert.match(quote, /<b>Sent:<\/b> \w+day, October 1[45], 2026 \d+:\d\d [AP]M/);
  assert.match(quote, /<b>To:<\/b> Roushdy N\. Alshawa &lt;ralshawa2@example\.edu&gt;/);
  assert.match(quote, /<b>Cc:<\/b> Emily A\. Lifs/);
  assert.match(quote, /<b>Subject:<\/b> Guidance Circle launch meeting/);
  assert.match(quote, /Yes, Emily will set one up\./);
});

test('formatQuotedReply: a Gmail reply quotes it as "On … wrote:" in a blockquote', () => {
  const quote = formatQuotedReply(original('<p>Yes, Emily will set one up.</p>'), 'gmail');
  assert.match(
    quote,
    /On \w{3}, Oct 1[45], 2026 at \d+:\d\d [AP]M Valerie Imbruce &lt;<a href="mailto:vimbruce2@example\.edu">/
  );
  assert.match(quote, /<blockquote class="gmail_quote"[^>]*>[\s\S]*Yes, Emily will set one up\./);
});

test('embedQuotedImages: a quoted inline picture travels as a data: image; an unknown one is left out', async () => {
  __setGraphHandler(async (_method: string, url: string) => {
    assert.match(url, /\/messages\/orig-1\/attachments\/att-logo/);
    return { attachmentId: 'att-logo', size: 8, data: 'iVBORw0K' };
  });
  const message = original('<p>Hi</p>', {
    'logo@x': { attachmentId: 'att-logo', mimeType: 'image/png', fileName: 'logo.png', size: 8 }
  });
  const html = await embedQuotedImages(
    '<p>Sig</p><img data-attachment-id="att-logo" data-content-id="logo@x" src=""><img data-attachment-id="gone" data-content-id="gone@x" src="">',
    message,
    'uid-quote'
  );
  assert.match(html, /<img src="data:image\/png;base64,iVBORw0K">/);
  assert.doesNotMatch(html, /gone/);
});

test('buildRawMessage: a reply carries In-Reply-To and References (deduped, one id per line)', async () => {
  const draft = new MonoDraft({
    from: 'me@example.edu',
    to: ['vimbruce2@example.edu'],
    subject: 'Re: Plan',
    body: '<p>Sounds good</p>'
  });
  const raw = await buildRawMessage(draft, [], {
    messageId: '<b@example.edu>',
    references: '<a@example.edu> <b@example.edu>'
  });
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /\r\nIn-Reply-To: <b@example\.edu>\r\n/);
  assert.match(mime, /\r\nReferences: <a@example\.edu>\r\n <b@example\.edu>\r\n/);

  const fresh = Buffer.from(await buildRawMessage(draft), 'base64url').toString('utf8');
  assert.doesNotMatch(fresh, /In-Reply-To|References/);
});
