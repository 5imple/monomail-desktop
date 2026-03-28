import mailApi from '@/main/api/mail/mailApi';
import { useMessageOperationAtom } from '@/renderer/app/store/message/useMessageOperationAtom';

export function useMessageLabelAtom() {
  const { updateMessageState } = useMessageOperationAtom();
  const markMessageAsRead = async (uid: string, messageId: string, callApi = true) => {
    await updateMessageState(uid, messageId, [], ['UNREAD']);
    if (callApi) {
      mailApi.modifyMessage(uid, messageId, [], ['UNREAD']);
    }
  };

  const markMessageAsUnread = async (uid: string, messageId: string, callApi = true) => {
    await updateMessageState(uid, messageId, ['UNREAD'], []);
    if (callApi) {
      mailApi.modifyMessage(uid, messageId, ['UNREAD'], []);
    }
  };

  const starMessageById = async (uid: string, messageId: string, callApi = true) => {
    await updateMessageState(uid, messageId, ['STARRED'], []);
    if (callApi) {
      mailApi.modifyMessage(uid, messageId, ['STARRED'], []);
    }
  };

  const unstarMessageById = async (uid: string, messageId: string, callApi = true) => {
    await updateMessageState(uid, messageId, [], ['STARRED']);
    if (callApi) {
      mailApi.modifyMessage(uid, messageId, [], ['STARRED']);
    }
  };

  return {
    markMessageAsRead,
    markMessageAsUnread,
    starMessageById,
    unstarMessageById
  };
}
