// Updated ComposeCardEditor.tsx
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { Button } from '@/renderer/app/components/ui/button';
import { Option } from '@/renderer/app/components/ui/multi-selector';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import ContactSuggestionInput from '@/renderer/app/containers/input/ContactSuggestionInput';
import { ellipsisEmailString } from '@/renderer/app/lib/minimizeEmail';
import { cn } from '@/renderer/app/lib/utils';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';

import { FC, KeyboardEventHandler, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ComposeCardHeaderProps {
  composeDraft: MonoDraft;
  handleInputChange: (field: keyof MonoDraft, value: string | string[]) => void;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
}

const ComposeCardHeader: FC<ComposeCardHeaderProps> = ({
  composeDraft,
  handleInputChange,
  onKeyDown
}) => {
  const { t } = useTranslation();
  const { contactArray } = useContactAtom();
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  return (
    <>
      <div className="no-drag flex items-start justify-between border-b border-border/40 px-3">
        <ContactSuggestionInput
          contacts={contactArray}
          className="z-10 min-h-0 items-start border-none px-0 py-0.5"
          inputProps={{ className: 'p-2' }}
          hideClearAllButton={true}
          placeholder={t('text_editor.placeholder.recipients')}
          commandProps={{
            onKeyDown: onKeyDown
          }}
          value={
            composeDraft.to &&
            composeDraft.to.map<Option>((t) => {
              const contact = contactArray.find((contact) => contact.emailAddress === t);
              if (contact) {
                return {
                  icon: (
                    <RecipientAvatar
                      className="h-full w-full shrink-0"
                      key={contact.emailAddress}
                      recipient={{ email: contact.emailAddress, name: contact.displayName }}
                    />
                  ),
                  value: contact.emailAddress,
                  label: `${contact.displayName} (${ellipsisEmailString(contact.emailAddress)})`
                };
              } else {
                return {
                  label: t,
                  value: t
                };
              }
            })
          }
          onChange={(options) =>
            handleInputChange('to', options.map((contact) => contact.value).filter(Boolean))
          }
          onSelectionChange={(selected) => {}}
          emptyIndicator={<span>No result</span>}
        />
        <Button
          onClick={() => setShowCc(!showCc)}
          className={cn(
            'font-mono text-[10px] uppercase tracking-[0.18em] transition-colors',
            showCc ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
          )}
          variant={'text'}
          sizeVariant={'sm'}
        >
          Cc
        </Button>
        <Button
          onClick={() => setShowBcc(!showBcc)}
          className={cn(
            'font-mono text-[10px] uppercase tracking-[0.18em] transition-colors',
            showBcc ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
          )}
          variant={'text'}
          sizeVariant={'sm'}
        >
          Bcc
        </Button>
      </div>
      {composeDraft.cc.length > 0 || showCc ? (
        <div className="no-drag flex items-center justify-between border-b border-border/40 px-3">
          <ContactSuggestionInput
            contacts={contactArray}
            className="min-h-0 items-start border-none px-0 py-0.5"
            inputProps={{ className: 'p-2' }}
            hideClearAllButton={true}
            placeholder={t('text_editor.placeholder.cc')}
            value={
              composeDraft.cc &&
              composeDraft.cc.map<Option>((c) => {
                const contact = contactArray.find((contact) => contact.emailAddress === c);
                if (contact) {
                  return {
                    icon: (
                      <RecipientAvatar
                        className="h-full w-full shrink-0"
                        key={contact.emailAddress}
                        recipient={{ email: contact.emailAddress, name: contact.displayName }}
                      />
                    ),
                    value: contact.emailAddress,
                    label: `${contact.displayName} (${ellipsisEmailString(contact.emailAddress)})`
                  };
                } else {
                  return {
                    label: c,
                    value: c
                  };
                }
              })
            }
            onChange={(options) =>
              handleInputChange('cc', options.map((contact) => contact.value).filter(Boolean))
            }
            commandProps={{
              onKeyDown: onKeyDown
            }}
            onSelectionChange={(selected) => {}}
            emptyIndicator={<span>No result</span>}
          />
        </div>
      ) : null}

      {composeDraft.bcc.length > 0 || showBcc ? (
        <div className="no-drag flex items-center justify-between border-b border-border/40 px-3">
          <ContactSuggestionInput
            contacts={contactArray}
            className="min-h-0 items-start border-none px-0 py-0.5"
            inputProps={{ className: 'p-2' }}
            hideClearAllButton={true}
            placeholder={t('text_editor.placeholder.bcc')}
            commandProps={{
              onKeyDown: onKeyDown
            }}
            defaultValue={
              composeDraft.bcc &&
              composeDraft.bcc.map<Option>((b) => {
                const contact = contactArray.find((contact) => contact.emailAddress === b);
                if (contact) {
                  return {
                    icon: (
                      <RecipientAvatar
                        className="h-full w-full shrink-0"
                        key={contact.emailAddress}
                        recipient={{ email: contact.emailAddress, name: contact.displayName }}
                      />
                    ),
                    value: contact.emailAddress,
                    label: `${contact.displayName} (${ellipsisEmailString(contact.emailAddress)})`
                  };
                } else {
                  return {
                    label: b,
                    value: b
                  };
                }
              })
            }
            onChange={(options) =>
              handleInputChange('bcc', options.map((contact) => contact.value).filter(Boolean))
            }
            onSelectionChange={(selected) => {}}
            emptyIndicator={<span>No result</span>}
          />
        </div>
      ) : null}
    </>
  );
};

export default ComposeCardHeader;
