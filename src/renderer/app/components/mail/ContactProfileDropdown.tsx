import React, { useEffect, useState } from 'react';

import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { Contact, DBGetContact } from '@/renderer/app/lib/db/contact';
import { useComposeWindowAtom } from '@/renderer/app/store/compose/useComposeWindowAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface ContactProfileDropdownMenuProps {
  value: string;
  children?: React.ReactNode;
  onOpenChange?: (value: boolean) => void;
  /** Account to send "New email" from; falls back to the first account. */
  fromEmail?: string;
}

const ContactProfileDropdownMenu = React.forwardRef<
  HTMLDivElement,
  ContactProfileDropdownMenuProps
>(({ value, children, onOpenChange, fromEmail }, ref) => {
  const { t } = useTranslation();
  const [contact, setContact] = useState<Contact | null>(null);
  const [nameCopied, setNameCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const { member, accounts } = useAuth();
  const { searchNewQuery } = useGlobalAtom();
  const executeCommand = useExecuteCommand();
  const { globalDraftWindows, handleCloseButton } = useComposeWindowAtom();
  const getContact = async () => {
    if (!member) return;

    const response = await DBGetContact(member.uid, `contact-${value}`);

    if (response) {
      setContact(response);
    }
  };

  useEffect(() => {
    const fetchContact = async () => {
      await getContact();
    };
    fetchContact();
  }, [value]);

  if (!contact) return children;

  const handleCopyToClipboard = (url: string, type: 'email' | 'name') => {
    navigator.clipboard.writeText(url).then(
      () => {
        toast.success(t('toast.clipboard_copy'));
        switch (type) {
          case 'email':
            setEmailCopied(true);
            setTimeout(() => {
              setEmailCopied(false);
            }, 1000);
            break;

          case 'name':
            setNameCopied(true);
            setTimeout(() => {
              setNameCopied(false);
            }, 1000);
            break;
        }
      },
      (err) => {
        console.error('Could not copy text: ', err);
      }
    );
  };

  const handleSearchContact = () => {
    if (!contact) return;
    const search = () => searchNewQuery(`from:${contact.emailAddress}`, undefined, false);
    // From a chip inside an open compose the results would load hidden behind
    // it: close compose first (its usual save prompt included).
    const composeExpanded = !!document.querySelector('[data-compose-expanded="true"]');
    if (composeExpanded && handleCloseButton) void handleCloseButton(search);
    else search();
  };

  const handleNewEmail = async () => {
    const from = fromEmail ?? accounts[0]?.email;
    if (contact && from)
      if (globalDraftWindows.length > 0) {
        if (handleCloseButton) {
          await handleCloseButton(() => {
            executeCommand('COMPOSE_NEW_MESSAGE', {
              draft: new MonoDraft({ from, to: [contact.emailAddress] })
            });
          });
        }
      } else {
        executeCommand('COMPOSE_NEW_MESSAGE', {
          draft: new MonoDraft({ from, to: [contact.emailAddress] })
        });
      }
  };

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-64 overflow-hidden p-1.5">
        <div className="flex items-center gap-3 overflow-hidden px-2">
          {/* <RecipientAvatar recipient={{ email: contact.emailAddress, name: contact.displayName }} /> */}
          <div className="overflow-hidden">
            <div className="group -mb-2 flex items-center text-sm">
              {contact.displayName || contact.emailAddress}

              {/* Nothing to copy beyond the address when there's no name. */}
              {contact.displayName && (
                <Button
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => handleCopyToClipboard(`${contact.displayName}`, 'name')}
                  variant="text"
                  sizeVariant={'xs'}
                  typeVariant="icon"
                  tooltip={t('contact_card.copy')}
                >
                  {nameCopied ? (
                    <MonoIcon type={'CheckCircle'} className="h-3 w-3 text-green-500" />
                  ) : (
                    <MonoIcon type={'Copy'} className="h-3 w-3" />
                  )}
                </Button>
              )}
            </div>
            <div className="group flex items-center text-sm text-muted-foreground">
              <div className="overflow-hidden text-ellipsis">
                <span className="whitespace-nowrap">{contact.emailAddress}</span>
              </div>
              <Button
                className="text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => handleCopyToClipboard(`${contact.emailAddress}`, 'email')}
                variant="text"
                sizeVariant={'xs'}
                typeVariant="icon"
                tooltip={t('contact_card.copy')}
              >
                {emailCopied ? (
                  <MonoIcon type={'CheckCircle'} className="h-3 w-3 text-green-500" />
                ) : (
                  <MonoIcon type={'Copy'} className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleNewEmail}>{t('contact_card.new_email')}</DropdownMenuItem>
        {/* <DropdownMenuItem>Pin contact</DropdownMenuItem> */}
        <DropdownMenuItem onClick={handleSearchContact} className="overflow-hidden">
          <div className="overflow-hidden text-ellipsis">
            <span className="whitespace-nowrap">{`${t('contact_card.search_for')} "${contact.emailAddress}"`}</span>
          </div>
        </DropdownMenuItem>
        {/* <DropdownMenuItem className="text-destructive hover:text-destructive">
          Block Sender
        </DropdownMenuItem> */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
ContactProfileDropdownMenu.displayName = 'ContactProfileDropdownMenu';

export default ContactProfileDropdownMenu;
