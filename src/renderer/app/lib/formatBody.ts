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

export function formatReplyMessage(emailData: MonoMessage) {
  // Destructure the email data
  const { from } = emailData;
  const body = emailData.getParsedBody();

  // Format the sender and timestamp
  const formattedFrom = formatRecipient(from);
  const formattedDate = formatMessageDate(emailData);

  // Add the reply prefix line
  const replyHeader = `On ${formattedDate}, ${formattedFrom} wrote:\n`;

  // Indent the original email body for the quoted reply format
  const quotedBody = body
    .split('\n')
    .map((line) => `> ${line}`) // Prefix each line with ">"
    .join('\n');

  // Combine the reply header with the quoted original email
  const replyMessage = `${replyHeader}${quotedBody}`;

  return replyMessage;
}
