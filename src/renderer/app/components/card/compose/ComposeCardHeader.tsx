import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
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
  onClose: (onComplete?: () => void) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  isMinimized: boolean;
  isMaximized: boolean;
  hasElectronPadding: boolean;
  draftStatus: React.ReactNode;
}

const ComposeCardHeader: FC<ComposeCardHeaderProps> = ({
  composeDraft,
  handleInputChange,
  onKeyDown,
  onClose,
  onMinimize,
  onMaximize,
  isMinimized,
  isMaximized,
  hasElectronPadding,
  draftStatus
}) => {
  const { t } = useTranslation();
  const { contactArray } = useContactAtom();
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  if (isMinimized) {
    return (
      <div
        className="flex h-12 cursor-pointer items-center gap-2 px-4"
        onClick={onMinimize}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {composeDraft.subject.length > 0 ? composeDraft.subject : '(No subject)'}
        </span>
        <Button
          variant="ghost"
          sizeVariant="sm"
          typeVariant="icon"
          className="text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onMinimize();
          }}
        >
          <MonoIcon type="ChevronUp" className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              sizeVariant="sm"
              typeVariant="icon"
              className="text-muted-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <MonoIcon type="X" className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onClose()}>
              <MonoIcon type="X" className="mr-2 h-4 w-4" />
              <span>{t('tooltip.close')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <>
      {/* To row */}
      <div
        className={cn(
          'no-drag flex items-start px-5 pt-4',
          hasElectronPadding && 'pl-28'
        )}
      >
        <span className="mr-3 mt-[9px] shrink-0 text-sm font-semibold text-foreground">To</span>
        <div className="min-w-0 flex-1">
          <ContactSuggestionInput
            contacts={contactArray}
            className="z-10 min-h-0 items-start border-none px-0 py-0.5"
            inputProps={{ className: 'p-2' }}
            hideClearAllButton={true}
            placeholder=""
            commandProps={{ onKeyDown }}
            value={
              composeDraft.to &&
              composeDraft.to.map<Option>((toAddr) => {
                const contact = contactArray.find((c) => c.emailAddress === toAddr);
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
                }
                return { label: toAddr, value: toAddr };
              })
            }
            onChange={(options) =>
              handleInputChange('to', options.map((o) => o.value).filter(Boolean))
            }
            onSelectionChange={() => {}}
            emptyIndicator={<span>No result</span>}
          />
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-0.5 pt-1">
          <Button
            onClick={() => setShowCc(!showCc)}
            className={cn(
              'font-sans text-[13px] font-medium tracking-normal transition-colors',
              showCc ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            variant="text"
            sizeVariant="sm"
          >
            Cc
          </Button>
          <Button
            onClick={() => setShowBcc(!showBcc)}
            className={cn(
              'font-sans text-[13px] font-medium tracking-normal transition-colors',
              showBcc ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            variant="text"
            sizeVariant="sm"
          >
            Bcc
          </Button>

          {draftStatus && <div className="px-1">{draftStatus}</div>}

          <Button
            onClick={onMinimize}
            tooltip={t('tooltip.minimize')}
            shortcut="MOD+SHIFT+M"
            variant="ghost"
            sizeVariant="sm"
            typeVariant="icon"
            className="text-muted-foreground hover:text-foreground"
          >
            <MonoIcon type="ChevronDown" className="h-3.5 w-3.5" />
          </Button>
          <Button
            onClick={onMaximize}
            tooltip={isMaximized ? 'Restore' : 'Expand'}
            variant="ghost"
            sizeVariant="sm"
            typeVariant="icon"
            className="text-muted-foreground hover:text-foreground"
          >
            <MonoIcon type={isMaximized ? 'Minimize' : 'Maximize'} className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                sizeVariant="sm"
                typeVariant="icon"
                className="text-muted-foreground hover:text-foreground"
              >
                <MonoIcon type="X" className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onClose()}>
                <MonoIcon type="X" className="mr-2 h-4 w-4" />
                <span>{t('tooltip.close')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Cc row */}
      {(composeDraft.cc.length > 0 || showCc) ? (
        <div className="no-drag flex items-start px-5 pt-1">
          <span className="mr-3 mt-[9px] shrink-0 text-sm font-semibold text-foreground">Cc</span>
          <ContactSuggestionInput
            contacts={contactArray}
            className="min-h-0 flex-1 items-start border-none px-0 py-0.5"
            inputProps={{ className: 'p-2' }}
            hideClearAllButton={true}
            placeholder=""
            value={
              composeDraft.cc &&
              composeDraft.cc.map<Option>((ccAddr) => {
                const contact = contactArray.find((c) => c.emailAddress === ccAddr);
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
                }
                return { label: ccAddr, value: ccAddr };
              })
            }
            onChange={(options) =>
              handleInputChange('cc', options.map((o) => o.value).filter(Boolean))
            }
            commandProps={{ onKeyDown }}
            onSelectionChange={() => {}}
            emptyIndicator={<span>No result</span>}
          />
        </div>
      ) : null}

      {/* Bcc row */}
      {(composeDraft.bcc.length > 0 || showBcc) ? (
        <div className="no-drag flex items-start px-5 pt-1">
          <span className="mr-3 mt-[9px] shrink-0 text-sm font-semibold text-foreground">
            Bcc
          </span>
          <ContactSuggestionInput
            contacts={contactArray}
            className="min-h-0 flex-1 items-start border-none px-0 py-0.5"
            inputProps={{ className: 'p-2' }}
            hideClearAllButton={true}
            placeholder=""
            commandProps={{ onKeyDown }}
            defaultValue={
              composeDraft.bcc &&
              composeDraft.bcc.map<Option>((bccAddr) => {
                const contact = contactArray.find((c) => c.emailAddress === bccAddr);
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
                }
                return { label: bccAddr, value: bccAddr };
              })
            }
            onChange={(options) =>
              handleInputChange('bcc', options.map((o) => o.value).filter(Boolean))
            }
            onSelectionChange={() => {}}
            emptyIndicator={<span>No result</span>}
          />
        </div>
      ) : null}
    </>
  );
};

export default ComposeCardHeader;
