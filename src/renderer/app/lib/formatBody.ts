import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoRecipient } from '@/main/models/types';

export function formatForwardedMessage(emailData: MonoMessage) {
  // Destructure the email data
  const { from, timestamp, subject, to } = emailData;
  const body = emailData.getParsedBody();

  // Helper function to format recipient
  const formatRecipient = (recipient: MonoRecipient) => {
    const email = recipient.email.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return recipient.name === recipient.email
      ? `&lt;${email}&gt;`
      : `${recipient.name} &lt;${email}&gt;`;
  };

  // Format from and to fields
  const formattedFrom = formatRecipient(from);
  const formattedTo = to.map(formatRecipient).join(', ');

  // Format timestamp to a readable date
  const formattedDate = new Date(timestamp).toLocaleString('en-US', { timeZone: 'UTC' });

  // Define the forward header content dynamically
  const forwardHeader = `
  <div>---------- Forwarded message ---------</div>
  <div><strong>From:</strong> ${formattedFrom}</div>
  <div><strong>Date:</strong> ${formattedDate}</div>
  <div><strong>Subject:</strong> ${subject}</div>
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
  const { from, timestamp } = emailData;
  const body = emailData.getParsedBody();

  // Helper function to format the "from" field
  const formatRecipient = (recipient: MonoRecipient) => {
    const email = recipient.email.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return recipient.name === recipient.email
      ? `&lt;${email}&gt;`
      : `${recipient.name} &lt;${email}&gt;`;
  };

  // Format the sender and timestamp
  const formattedFrom = formatRecipient(from);
  const formattedDate = new Date(timestamp).toLocaleString('en-US', { timeZone: 'UTC' });

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
