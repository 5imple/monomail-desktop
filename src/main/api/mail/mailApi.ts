import thread from '@/main/api/mail/thread';
import message from '@/main/api/mail/message';
import attachment from '@/main/api/mail/attachment';
import drafts from '@/main/api/mail/drafts';
import label from '@/main/api/mail/label';
import history from '@/main/api/mail/history';
import aiSearch from '@/main/api/mail/aiSearch';
import reminder from '@/main/api/mail/reminder';
import cloudPubSub from '@/main/api/mail/cloudPubSub';

export default {
  ...thread,
  ...message,
  ...attachment,
  ...drafts,
  ...label,
  ...history,
  ...aiSearch,
  ...reminder,
  ...cloudPubSub
};
