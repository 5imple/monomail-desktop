import contactApi from '@/main/api/contact/contactApi';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/renderer/app/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { Contact, DBCreateContact, DBRemoveContactbyID } from '@/renderer/app/lib/db/contact';
import { generalEmailDomains } from '@/renderer/app/lib/faviconUtils';
import { cn } from '@/renderer/app/lib/utils';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { FC, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { parse } from 'tldts';
interface ContactCardProps {
  contact: Contact;
  isList: boolean;
}

const ContactCard: FC<ContactCardProps> = ({ contact, isList }) => {
  const { t } = useTranslation();
  const { member, accounts } = useAuth();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const { contactArray, setContactArray } = useContactAtom();

  const [isRendering, setIsRendering] = useState(false);
  const [opacity, setOpacity] = useState(0);
  const executeCommand = useExecuteCommand();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsRendering(true);
            setTimeout(() => setOpacity(100), 50); // Delay to ensure render
          } else {
            setIsRendering(false);
            setOpacity(0); // Reset opacity when not rendering
          }
        });
      },
      {
        root: document.getElementById('ext-contact-list'),
        threshold: 0, // Trigger as soon as it intersects
        rootMargin: '128px 0px 128px 0px' // Trigger 50px before it enters the viewport
      }
    );
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const handleClickNewEmail = (contact: Contact) => {
    if (accounts[0])
      executeCommand('COMPOSE_NEW_MESSAGE', {
        draft: new MonoDraft({ from: accounts[0].email, to: [contact.emailAddress] })
      });
  };
  const handleClickCopy = (contact: Contact) => {
    navigator.clipboard.writeText(contact.emailAddress).then(
      () => {
        toast.success(t('toast.clipboard_copy'));
      },
      (err) => {
        console.error('Could not copy text: ', err);
      }
    );
  };
  const handleClickRemove = async (contact: Contact) => {
    if (member) {
      contactApi.deleteMonoContact(contact.contactId);
      await DBRemoveContactbyID(member.uid, contact.contactId);
      setContactArray((prev) => prev.filter((v) => v.contactId !== contact.contactId));
    }
  };
  const handleClickAddToContact = async () => {
    if (member) {
      contactApi.createMonoContact(contact);
      await DBCreateContact(member.uid, contact);
      setContactArray((prev) => prev.concat([contact]));
    }
  };
  const contactAdded = contactArray.map((v) => v.emailAddress).includes(contact.emailAddress);

  const isGeneralDomain = generalEmailDomains.includes(contact.emailAddress.split('@')[1]);

  if (!contact || !isRendering) {
    return (
      <div
        ref={containerRef}
        className={cn(
          'h-full transition-[height] duration-300 ease-bouncy-in-out',
          contact ? 'h-[80px]' : 'h-[0px]'
        )}
      ></div>
    );
  }
  return (
    <div ref={containerRef}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              'flex flex-row gap-3 rounded-md border p-3 shadow-sm',
              `transition-opacity duration-100`,
              opacity == 0 ? 'opacity-0' : 'opacity-100'
            )}
          >
            <RecipientAvatar
              recipient={{ email: contact.emailAddress, name: contact.displayName }}
            />
            <div className="relative flex-1 overflow-hidden">
              <div className="flex items-center">
                <div className="flex-1 overflow-hidden text-ellipsis">
                  <span className="whitespace-nowrap text-sm font-semibold">
                    {contact.displayName.length > 0 ? contact.displayName : contact.emailAddress}
                  </span>
                </div>
                {isList && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="ml-auto shrink-0 text-muted-foreground"
                        variant="ghost"
                        typeVariant="icon"
                        sizeVariant="xs"
                      >
                        <MonoIcon type={'MoreHorizontal'} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleClickRemove(contact)}>
                        <MonoIcon type={'Trash'} className="mr-2" />
                        {t('extension.contact_card.remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="flex max-w-[150px] whitespace-nowrap text-sm text-muted-foreground">
                  <span
                    className={
                      isGeneralDomain
                        ? 'flex-shrink-0'
                        : 'flex-shrink overflow-hidden overflow-ellipsis whitespace-nowrap'
                    }
                  >
                    {contact.emailAddress.split('@')[0]}
                  </span>
                  @
                  {isGeneralDomain ? (
                    <span className="flex-shrink overflow-hidden overflow-ellipsis whitespace-nowrap">
                      {contact.emailAddress.split('@')[1]}
                    </span>
                  ) : (
                    <Button
                      variant={'link'}
                      typeVariant={'inline'}
                      asChild
                      tooltip={`${t('tooltip.visit')} "${parse(contact.emailAddress).domain}"`}
                      className="max-w-[120px] flex-shrink-0 justify-start overflow-hidden text-muted-foreground"
                    >
                      <a
                        href={`https://${parse(contact.emailAddress).domain}`}
                        target="_blank"
                        className="underline"
                        rel="noreferrer"
                      >
                        {contact.emailAddress.split('@')[1]}
                      </a>
                    </Button>
                  )}
                </span>
                <div className="flex">
                  <Button
                    onClick={() => handleClickNewEmail(contact)}
                    className="text-muted-foreground"
                    variant="ghost"
                    typeVariant="icon"
                    sizeVariant="xs"
                    tooltip={t('contact_card.new_email')}
                  >
                    <MonoIcon type="Edit" />
                  </Button>
                  <Button
                    onClick={() => handleClickCopy(contact)}
                    className="text-muted-foreground"
                    variant="ghost"
                    typeVariant="icon"
                    sizeVariant="xs"
                    tooltip={t('contact_card.copy')}
                  >
                    <MonoIcon type="Copy" />
                  </Button>
                </div>
              </div>

              {/* {!isList && (
                <Button
                  className="w-full mt-2"
                  variant={'secondary'}
                  sizeVariant={'sm'}
                  onClick={handleClickAddToContact}
                  disabled={contactAdded}
                >
                  Add to contact
                </Button>
              )} */}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="dark">
          <ContextMenuItem>
            <MonoIcon type={'Search'} className="mr-2" />
            {t('extension.contact_card.search')}
          </ContextMenuItem>
          <ContextMenuItem>
            <MonoIcon type={'Pin'} className="mr-2" />
            {t('extension.contact_card.pin')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => handleClickRemove(contact)}>
            <MonoIcon type={'Trash'} className="mr-2" />
            {t('extension.contact_card.remove')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
};

export default ContactCard;
