import mailApi from '@/main/api/mail/mailApi';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoRecipient } from '@/main/models/types';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

export function formatRecipient(recipient: MonoRecipient) {
  const name = escapeHtml(recipient.name || recipient.email);
  const email = escapeHtml(recipient.email);
  return recipient.name === recipient.email || !recipient.name
    ? `&lt;${email}&gt;`
    : `${name} &lt;${email}&gt;`;
}

function parseTimezoneOffset(timezone: string): number | null {
  const match = timezone.match(/^([+-])(\d{2})(\d{2})$/);
  if (!match) return null;

  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

export function formatMessageDate(emailData: MonoMessage): string {
  const timezone = emailData.timezone || '';
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  });

  const offsetMinutes = parseTimezoneOffset(timezone);
  if (offsetMinutes !== null) {
    return `${formatter.format(new Date(emailData.timestamp + offsetMinutes * 60_000))} ${timezone}`;
  }

  if (timezone === 'UTC' || timezone === 'GMT') {
    return `${formatter.format(new Date(emailData.timestamp))} ${timezone}`;
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(emailData.timestamp));
}

export function getForwardedMessageBody(emailData: MonoMessage): string {
  const body = emailData.getParsedBody();
  const history = emailData.getParsedHistory().join('');

  return history ? `${body}${history}` : body;
}

export function formatForwardedMessage(emailData: MonoMessage) {
  // Destructure the email data
  const { from, subject, to } = emailData;
  const body = getForwardedMessageBody(emailData);

  // Format from and to fields
  const formattedFrom = formatRecipient(from);
  const formattedTo = to.map(formatRecipient).join(', ');

  // Format timestamp to a readable date
  const formattedDate = escapeHtml(formatMessageDate(emailData));
  const formattedSubject = escapeHtml(subject);

  // Define the forward header content dynamically
  const forwardHeader = `
  <div>---------- Forwarded message ---------</div>
  <div><strong>From:</strong> ${formattedFrom}</div>
  <div><strong>Date:</strong> ${formattedDate}</div>
  <div><strong>Subject:</strong> ${formattedSubject}</div>
  <div><strong>To:</strong> ${formattedTo}</div>
  `;
  // Combine the forward header and the original body
  const formattedBody = `
  <div data-history class="mono-history">
    <div>${forwardHeader}</div>
    <br/>
    <blockquote>
      ${body}
    </blockquote>
  </div>
  `;
  // const formattedBody = `<div>This is test</div>`;

  return formattedBody;
}

// Dates as the quoting mail apps write them, in the reader's own time zone.
const quoteDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', options).format(date);
  return {
    long: format({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    short: format({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    time: format({ hour: 'numeric', minute: '2-digit' })
  };
};

/**
 * The message being replied to, quoted under the reply the way mail apps do:
 * Outlook's header block for a Microsoft account (what colleagues' Outlook
 * replies show), Gmail's "On … wrote:" otherwise. The whole of it — the
 * message and the history it carries — so the conversation reads on. Marked
 * data-history, so the app's reader folds it like any quoted history.
 */
export function formatQuotedReply(message: MonoMessage, style: 'outlook' | 'gmail'): string {
  const body = getForwardedMessageBody(message);
  const date = quoteDate(message.timestamp);

  if (style === 'outlook') {
    const recipients = (list: MonoRecipient[]) => list.map(formatRecipient).join('; ');
    const header = [
      `<b>From:</b> ${formatRecipient(message.from)}`,
      `<b>Sent:</b> ${escapeHtml(`${date.long} ${date.time}`)}`,
      message.to.length > 0 ? `<b>To:</b> ${recipients(message.to)}` : '',
      message.cc.length > 0 ? `<b>Cc:</b> ${recipients(message.cc)}` : '',
      `<b>Subject:</b> ${escapeHtml(message.subject)}`
    ]
      .filter(Boolean)
      .join('<br>');
    return `<div data-history class="mono-history"><hr style="display:inline-block;width:98%" tabindex="-1"><div id="divRplyFwdMsg" dir="ltr"><font face="Calibri, sans-serif" style="font-size:11pt" color="#000000">${header}</font><div>&nbsp;</div></div><div>${body}</div></div>`;
  }

  const { name, email } = message.from;
  const sender = name && name !== email ? `${escapeHtml(name)} ` : '';
  const address = escapeHtml(email);
  return `<div data-history class="mono-history gmail_quote"><div dir="ltr" class="gmail_attr">On ${escapeHtml(`${date.short} at ${date.time}`)} ${sender}&lt;<a href="mailto:${address}">${address}</a>&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${body}</blockquote></div>`;
}

// Quoted pictures travel with the message up to this much (base64), so a
// reply to a picture-heavy email stays well under the send size limits.
const QUOTED_IMAGES_BUDGET = 1_000_000;

/**
 * Inline pictures of a quoted / forwarded message (signature logos, pasted
 * images) are blanks in its parsed body — the reader loads each on display.
 * Load them into the quote as data: images (buildRawMessage sends those as
 * inline parts); any that won't load, or would go over the budget, is left
 * out rather than sent as a broken image.
 */
export async function embedQuotedImages(
  html: string,
  message: MonoMessage,
  uid: string
): Promise<string> {
  if (!html.includes('data-attachment-id')) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let budget = QUOTED_IMAGES_BUDGET;
  for (const img of Array.from(doc.querySelectorAll('img[data-attachment-id]'))) {
    const inline = message.inlineImages[img.getAttribute('data-content-id') ?? ''];
    let src: string | null = null;
    if (inline && budget > 0) {
      try {
        const { data } = await mailApi.getAttachmentInline(uid, message.id, inline.attachmentId);
        const base64 = (data ?? '').replace(/-/g, '+').replace(/_/g, '/');
        if (base64 && base64.length <= budget) {
          budget -= base64.length;
          src = `data:${inline.mimeType || 'image/png'};base64,${base64}`;
        }
      } catch (error) {
        console.error('Could not load a quoted image:', error);
      }
    }
    if (src) {
      img.setAttribute('src', src);
      img.removeAttribute('data-attachment-id');
      img.removeAttribute('data-content-id');
    } else {
      img.remove();
    }
  }
  return doc.body.innerHTML;
}
