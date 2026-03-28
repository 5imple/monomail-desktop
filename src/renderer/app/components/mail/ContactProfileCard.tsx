import React, { FC, useEffect, useState } from 'react';

import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { Contact, DBGetContact } from '@/renderer/app/lib/db/contact';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface ContactProfileCardProps {
  email: string;
  children?: React.ReactNode;
}

const ContactProfileCard: FC<ContactProfileCardProps> = ({ email, children }) => {
  const [contact, setContact] = useState<Contact | null>(null);
  const [copied, setCopied] = useState(false);
  const { member } = useAuth();
  const { t } = useTranslation();

  const getContact = async () => {
    if (!member) return;
    const response = await DBGetContact(member.uid, `contact-${email}`);

    if (response) {
      setContact(response);
    }
  };

  useEffect(() => {
    const fetchContact = async () => {
      await getContact();
    };
    fetchContact();
  }, [email]);

  if (!contact) return children;

  const handleCopyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url).then(
      () => {
        toast.success(t('toast.clipboard_copy'));
        setCopied(true);

        setTimeout(() => {
          setCopied(false);
        }, 1000);
      },
      (err) => {
        console.error('Could not copy text: ', err);
      }
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="p-1.5">
        <div className="flex items-center gap-3 p-2">
          <RecipientAvatar
            recipient={{
              email: contact.emailAddress,
              name: contact.displayName
            }}
            className="h-8 w-8"
          />
          <div>
            <div className="group -mb-2 flex items-center text-sm">
              {contact.displayName ?? 'No name'}

              <Button
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => handleCopyToClipboard(`${contact.displayName}`)}
                variant="text"
                sizeVariant={'xs'}
                typeVariant="icon"
              >
                {copied ? (
                  <MonoIcon type={'CheckCircle'} className="h-3 w-3 text-green-500" />
                ) : (
                  <MonoIcon type={'Copy'} className="h-3 w-3" />
                )}
              </Button>
            </div>
            <div className="group flex items-center text-sm text-muted-foreground">
              {contact.emailAddress}
              <Button
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => handleCopyToClipboard(`${contact.emailAddress}`)}
                variant="text"
                sizeVariant={'xs'}
                typeVariant="icon"
              >
                {copied ? (
                  <MonoIcon type={'CheckCircle'} className="h-3 w-3 text-green-500" />
                ) : (
                  <MonoIcon type={'Copy'} className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
        <ul className="">
          <li className="flex items-center rounded-md p-2 text-sm text-foreground transition-all hover:bg-muted-low">
            <MonoIcon type={'Edit'} className="mr-2 h-4 w-4" />
            Compose an email
          </li>

          <li className="flex items-center rounded-md p-2 text-sm text-foreground transition-all hover:bg-muted-low">
            <MonoIcon type={'MailSearch'} className="mr-2 h-4 w-4" />
            Search emails from
          </li>
          <li className="flex items-center rounded-md p-2 text-sm text-destructive transition-all hover:bg-destructive/20 hover:text-destructive">
            <MonoIcon type={'AlertCircle'} className="mr-2 h-4 w-4" />
            Block Sender
          </li>
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ContactProfileCard;
