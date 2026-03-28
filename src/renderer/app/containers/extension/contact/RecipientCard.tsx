import contactApi from '@/main/api/contact/contactApi';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoRecipient } from '@/main/models/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/renderer/app/components/ui/context-menu';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import {
  DBCreateContact,
  DBGetContactByEmail,
  DBRemoveContactbyID
} from '@/renderer/app/lib/db/contact';
import { generalEmailDomains } from '@/renderer/app/lib/faviconUtils';
import { cn } from '@/renderer/app/lib/utils';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { FC, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { parse } from 'tldts';
import { CopyButton } from '@/renderer/app/components/ui/copy-button';

interface RecipientCardProps {
  recipient: MonoRecipient;
}

const RecipientCard: FC<RecipientCardProps> = ({ recipient }) => {
  const { accounts, member } = useAuth();
  const { t } = useTranslation();
  const { contactArray, setContactArray } = useContactAtom();

  const [isRendering, setIsRendering] = useState(false);
  const [opacity, setOpacity] = useState(0);

  const executeCommand = useExecuteCommand();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleClickNewEmail = (recipient: MonoRecipient) => {
    if (accounts[0])
      executeCommand('COMPOSE_NEW_MESSAGE', {
        draft: new MonoDraft({ from: accounts[0].email, to: [recipient.email] })
      });
  };
  const handleClickCopy = (recipient: MonoRecipient) => {
    navigator.clipboard.writeText(recipient.email).then(
      () => {
        toast.success(t('toast.clipboard_copy'));
      },
      (err) => {
        console.error('Could not copy text: ', err);
      }
    );
  };

  const handleClickRemove = async (recipient: MonoRecipient) => {
    if (member) {
      const selectedContact = (await DBGetContactByEmail(member.uid, recipient.email))[0];
      if (selectedContact) {
        // synchronous necessary?
        contactApi.deleteMonoContact(selectedContact.contactId);
        await DBRemoveContactbyID(member.uid, selectedContact.contactId);
        setContactArray((prev) => prev.filter((v) => v.emailAddress !== recipient.email));
      }
    }
  };
  const handleClickAddToContact = async () => {
    if (member) {
      const contact = (await DBGetContactByEmail(member.uid, recipient.email))[0];
      if (contact) {
        contactApi.createMonoContact(contact);
        await DBCreateContact(member.uid, contact);
      }
    }
  };
  const contactAdded = contactArray.map((v) => v.emailAddress).includes(recipient.email);

  const isGeneralDomain = generalEmailDomains.includes(recipient.email.split('@')[1]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          ref={containerRef}
          className={cn(
            'flex flex-row gap-3 rounded-md shadow-none',
            `transition-opacity duration-100`
          )}
        >
          <RecipientAvatar recipient={recipient} />
          <div className="relative flex-1 overflow-hidden">
            <div className="flex items-center">
              <div className="flex-1 overflow-hidden text-ellipsis">
                <span className="whitespace-nowrap text-sm font-semibold">
                  {recipient.name.length > 0 ? recipient.name : recipient.email}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <span className="flex whitespace-nowrap text-sm text-muted-foreground">
                  <span
                    className={
                      isGeneralDomain
                        ? 'flex-shrink-0'
                        : 'flex-shrink overflow-hidden overflow-ellipsis whitespace-nowrap'
                    }
                  >
                    {recipient.email.split('@')[0]}
                  </span>
                  @
                  {isGeneralDomain ? (
                    <span className="flex-shrink overflow-hidden overflow-ellipsis whitespace-nowrap">
                      {recipient.email.split('@')[1]}
                    </span>
                  ) : (
                    <Button
                      variant={'link'}
                      typeVariant={'inline'}
                      asChild
                      tooltip={`${t('tooltip.visit')} "${parse(recipient.email).domain}"`}
                      className="flex-shrink-0 justify-start overflow-hidden text-muted-foreground"
                    >
                      <a
                        href={`https://${parse(recipient.email).domain}`}
                        target="_blank"
                        className="underline"
                        rel="noreferrer"
                      >
                        {recipient.email.split('@')[1]}
                      </a>
                    </Button>
                  )}
                </span>
              </div>
              <div className="flex">
                <Button
                  onClick={() => handleClickNewEmail(recipient)}
                  className="text-muted-foreground"
                  variant="ghost"
                  typeVariant="icon"
                  sizeVariant="xs"
                  tooltip={t('recipient_card.new_email')}
                >
                  <MonoIcon type="Edit" />
                </Button>
                <CopyButton textToCopy={recipient.email} />
              </div>
            </div>

            {/* <Button
              className="w-full mt-2"
              variant={'secondary'}
              sizeVariant={'sm'}
              onClick={handleClickAddToContact}
              disabled={contactAdded}
            >
              Add to contact
            </Button> */}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="dark">
        <ContextMenuItem>
          <MonoIcon type={'Search'} className="mr-2" />
          Search
        </ContextMenuItem>
        <ContextMenuItem>
          <MonoIcon type={'Pin'} className="mr-2" />
          Pin
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => handleClickRemove(recipient)}>
          <MonoIcon type={'Trash'} className="mr-2" />
          Remove
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default RecipientCard;
