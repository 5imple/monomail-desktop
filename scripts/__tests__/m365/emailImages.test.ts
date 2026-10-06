import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parsePayloadPart } from '@/main/models/message/utils';

// Images that can never load must not render as broken-image icons with
// their alt text; loadable inline (cid) images must survive for the reader.

const { window } = new JSDOM('');
Object.assign(globalThis as any, { DOMParser: window.DOMParser, Node: window.Node });

const render = (html: string, inlineImages: Record<string, unknown> = {}) => {
  const data = Buffer.from(html).toString('base64url');
  const message = {
    id: 'm1',
    inlineImages,
    payload: { mimeType: 'text/html', body: { data }, headers: [] }
  } as never;
  const { content } = parsePayloadPart(message);
  return new JSDOM(`<body>${content}</body>`).window.document.body;
};

test('emailImages: a quoted signature image with an empty src is dropped', () => {
  const body = render(
    '<p>Thanks</p><img data-imagetype="AttachmentByCid" alt="Image" src=""><img alt="Logo">'
  );
  assert.equal(body.querySelectorAll('img').length, 0);
  assert.match(body.textContent ?? '', /Thanks/);
});

test('emailImages: an unmatched cid image is dropped, a matched one is kept for loading', () => {
  const body = render('<img src="cid:known"><img src="cid:missing">', {
    known: { attachmentId: 'att1', contentId: 'known', mimeType: 'image/png', fileName: 'a.png', size: 1 }
  });
  const imgs = [...body.querySelectorAll('img')];
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].getAttribute('data-attachment-id'), 'att1');
});

test('emailImages: ordinary remote images are untouched', () => {
  const body = render('<img src="https://example.com/a.png" alt="A">');
  assert.equal(body.querySelector('img')?.getAttribute('src'), 'https://example.com/a.png');
});
