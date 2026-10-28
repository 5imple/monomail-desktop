import mailApi from '@/main/api/mail/mailApi';
import { payloadHasBodyData } from '@/main/models/message/bodyData';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { parseOnce } from '@/renderer/app/components/card/compose/parseOnce';
import { DBGetMessage, DBSaveMessage } from '@/renderer/app/lib/db/message';

/**
 * The message being replied to or forwarded, in full and parsed once: what the
 * quote (or the forwarded copy) is made from. Shared by the compose window
 * and the reader's quick reply, so both quote the same way.
 *
 * Not stored, or stored from a listing (metadata only: R / A / F work on a
 * list row whose bodies were never fetched): the full message is fetched, or
 * the quote would go out empty. The stored copy stays the fallback if that
 * fails. Throws when there is nothing at all.
 */
export async function loadReplyOriginal(uid: string, messageId: string): Promise<MonoMessage> {
  let message = await DBGetMessage(uid, messageId);
  if (!message || !payloadHasBodyData(message.payload)) {
    try {
      const messageResponse = await mailApi.getMessage(uid, messageId);
      if (messageResponse?.payload) {
        const fetched = MonoMessage.fromGmailMessage(messageResponse);
        message = fetched;
        await DBSaveMessage(uid, fetched);
      }
    } catch (error) {
      if (!message) throw error;
      console.error('[compose] could not fetch the full original message:', error);
    }
  }
  if (!message) throw new Error('Original message not found');
  return parseOnce(message);
}
