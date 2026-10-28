import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { Option } from '@/renderer/app/components/ui/multi-selector';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import ContactSuggestionInput from '@/renderer/app/containers/input/ContactSuggestionInput';
import { Contact } from '@/renderer/app/lib/db/contact';
import { recipientLabel } from '@/renderer/app/lib/recipientLabel';
import { cn } from '@/renderer/app/lib/utils';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { FC, KeyboardEventHandler, memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/** Reply ↔ Reply all inside compose (a reply only). */
export interface ReplyAllToggle {
  /** 'add': reply-all recipients are missing; 'remove': back to the sender only. */
  mode: 'add' | 'remove';
  /** How many would be added. */
  missing: number;
  onToggle: () => void;
}

interface ComposeCardHeaderProps {
  composeDraft: MonoDraft;
  handleInputChange: (field: keyof MonoDraft, value: string | string[]) => void;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onClose: (onComplete?: () => void) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  isMinimized: boolean;
  isMaximized: boolean;
  ccVisible: boolean;
  bccVisible: boolean;
  onToggleCc: () => void;
  onToggleBcc: () => void;
  replyAll?: ReplyAllToggle | null;
}

// A chip for an address: the contact's avatar and name when we know them.
const toRecipientOption = (address: string, contacts: Map<string, Contact>): Option => {
  const contact = contacts.get(address);
  if (!contact) return { label: address, value: address };
  return {
    icon: (
      <RecipientAvatar
        className="h-full w-full shrink-0"
        key={contact.emailAddress}
        recipient={{ email: contact.emailAddress, name: contact.displayName }}
      />
    ),
    value: contact.emailAddress,
    label: recipientLabel(contact.displayName, contact.emailAddress)
  };
};

// Stable, so the recipient fields' effects don't re-run on every render.
const noopSelectionChange = () => undefined;

// One width for To / Cc / Bcc so the three fields start at the same x.
const FIELD_LABEL_CLASS = 'mr-2 mt-[9px] w-8 shrink-0 text-[14px] font-semibold text-foreground';
const WINDOW_BUTTON_CLASS = 'text-muted-foreground hover:text-foreground';
// The add-recipient field shares the last line with the chips instead of
// dropping to an empty line of its own when they nearly fill it; it only
// claims room to type while it has focus.
const RECIPIENT_INPUT_PROPS = { className: 'min-w-0 focus:min-w-[10rem]' };

const ComposeCardHeader: FC<ComposeCardHeaderProps> = ({
  composeDraft,
  handleInputChange,
  onKeyDown,
  onClose,
  onMinimize,
  onMaximize,
  isMinimized,
  isMaximized,
  ccVisible,
  bccVisible,
  onToggleCc,
  onToggleBcc,
  replyAll
}) => {
  const { t } = useTranslation();
  const { contactArray } = useContactAtom();

  // One lookup table per contact list (a find over every contact per chip,
  // per render, before).
  const contactsByEmail = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const contact of contactArray) {
      if (!map.has(contact.emailAddress)) map.set(contact.emailAddress, contact);
    }
    return map;
  }, [contactArray]);
  // Chip arrays change only with the addresses (a new array every render
  // re-ran the fields' sync effects).
  const toOptions = useMemo(
    () => composeDraft.to.map((address) => toRecipientOption(address, contactsByEmail)),
    [composeDraft.to, contactsByEmail]
  );
  const ccOptions = useMemo(
    () => composeDraft.cc.map((address) => toRecipientOption(address, contactsByEmail)),
    [composeDraft.cc, contactsByEmail]
  );
  const bccOptions = useMemo(
    () => composeDraft.bcc.map((address) => toRecipientOption(address, contactsByEmail)),
    [composeDraft.bcc, contactsByEmail]
  );
  const commandProps = useMemo(() => ({ onKeyDown }), [onKeyDown]);
  const handleToChange = useCallback(
    (options: Option[]) => handleInputChange('to', options.map((o) => o.value).filter(Boolean)),
    [handleInputChange]
  );
  const handleCcChange = useCallback(
    (options: Option[]) => handleInputChange('cc', options.map((o) => o.value).filter(Boolean)),
    [handleInputChange]
  );
  const handleBccChange = useCallback(
    (options: Option[]) => handleInputChange('bcc', options.map((o) => o.value).filter(Boolean)),
    [handleInputChange]
  );

  if (isMinimized) {
    const subject =
      composeDraft.subject.length > 0 ? composeDraft.subject : t('compose_card.no_subject');
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={t('compose_card.restore_named', { subject })}
        className="flex h-12 cursor-pointer items-center gap-2 rounded-xl px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onMinimize}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          // The reader binds Enter to Reply All; this Enter is ours.
          e.preventDefault();
          e.stopPropagation();
          onMinimize();
        }}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{subject}</span>
        <Button
          variant="ghost"
          sizeVariant="sm"
          typeVariant="icon"
          className="text-muted-foreground"
          tooltip={t('compose_card.restore')}
          shortcut="MOD+SHIFT+M"
          onClick={(e) => {
            e.stopPropagation();
            onMinimize();
          }}
        >
          <MonoIcon type="ChevronUp" className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          sizeVariant="sm"
          typeVariant="icon"
          className="text-muted-foreground"
          tooltip={t('tooltip.close')}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <MonoIcon type="X" className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const recipientToggle = (
    row: 'cc' | 'bcc',
    visible: boolean,
    hasRecipients: boolean,
    onToggle: () => void
  ) => (
    <Button
      tabIndex={-1}
      onClick={onToggle}
      aria-pressed={visible}
      tooltip={
        visible && !hasRecipients ? t(`compose_card.hide_${row}`) : t(`compose_card.add_${row}`)
      }
      shortcut={row === 'cc' ? 'MOD+SHIFT+C' : 'MOD+SHIFT+B'}
      className={cn(
        'font-sans text-[13px] font-medium tracking-normal transition-colors',
        visible ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
      variant="text"
      sizeVariant="sm"
    >
      {row === 'cc' ? t('text_editor.placeholder.cc') : t('text_editor.placeholder.bcc')}
    </Button>
  );

  return (
    <>
      {/* To row */}
      <div className="no-drag flex items-start px-9 pt-3" data-compose-to>
        <span className={FIELD_LABEL_CLASS}>{t('compose_card.to')}</span>
        <div className="min-w-0 flex-1">
          <ContactSuggestionInput
            contacts={contactArray}
            className="z-10 min-h-0 items-start border-none px-0 py-0.5"
            inputProps={RECIPIENT_INPUT_PROPS}
            hideClearAllButton={true}
            placeholder=""
            commandProps={commandProps}
            value={toOptions}
            onChange={handleToChange}
            onSelectionChange={noopSelectionChange}
            emptyIndicator={<span>{t('compose_card.no_contact_match')}</span>}
          />
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-0.5 pt-1">
          {replyAll && (
            // Reply ↔ Reply all without leaving compose.
            <Button
              tabIndex={-1}
              onClick={replyAll.onToggle}
              tooltip={
                replyAll.mode === 'add'
                  ? t('compose_card.reply_all_tooltip', { count: replyAll.missing })
                  : t('compose_card.reply_sender_only_tooltip')
              }
              shortcut="MOD+SHIFT+A"
              className="font-sans text-[13px] font-medium tracking-normal text-muted-foreground transition-colors hover:text-foreground"
              variant="text"
              sizeVariant="sm"
            >
              {replyAll.mode === 'add'
                ? t('compose_card.reply_all', { count: replyAll.missing })
                : t('compose_card.reply_sender_only')}
            </Button>
          )}
          {recipientToggle('cc', ccVisible, composeDraft.cc.length > 0, onToggleCc)}
          {recipientToggle('bcc', bccVisible, composeDraft.bcc.length > 0, onToggleBcc)}

          <Button
            tabIndex={-1}
            onClick={onMinimize}
            tooltip={t('tooltip.minimize')}
            shortcut="MOD+SHIFT+M"
            variant="ghost"
            sizeVariant="sm"
            typeVariant="icon"
            className={WINDOW_BUTTON_CLASS}
          >
            <MonoIcon type="ChevronDown" className="h-4 w-4" />
          </Button>
          <Button
            tabIndex={-1}
            onClick={onMaximize}
            tooltip={isMaximized ? t('compose_card.restore_size') : t('compose_card.expand')}
            variant="ghost"
            sizeVariant="sm"
            typeVariant="icon"
            className={WINDOW_BUTTON_CLASS}
          >
            <MonoIcon type={isMaximized ? 'Minimize' : 'Maximize'} className="h-4 w-4" />
          </Button>
          <Button
            tabIndex={-1}
            onClick={() => onClose()}
            tooltip={t('tooltip.close')}
            shortcut="ESC"
            variant="ghost"
            sizeVariant="sm"
            typeVariant="icon"
            className={WINDOW_BUTTON_CLASS}
          >
            <MonoIcon type="X" className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Cc row */}
      {ccVisible ? (
        <div className="no-drag flex items-start px-9 pt-1" data-compose-cc>
          <span className={FIELD_LABEL_CLASS}>{t('text_editor.placeholder.cc')}</span>
          <ContactSuggestionInput
            contacts={contactArray}
            className="min-h-0 flex-1 items-start border-none px-0 py-0.5"
            inputProps={RECIPIENT_INPUT_PROPS}
            hideClearAllButton={true}
            placeholder=""
            value={ccOptions}
            onChange={handleCcChange}
            commandProps={commandProps}
            onSelectionChange={noopSelectionChange}
            emptyIndicator={<span>{t('compose_card.no_contact_match')}</span>}
          />
        </div>
      ) : null}

      {/* Bcc row */}
      {bccVisible ? (
        <div className="no-drag flex items-start px-9 pt-1" data-compose-bcc>
          <span className={FIELD_LABEL_CLASS}>{t('text_editor.placeholder.bcc')}</span>
          <ContactSuggestionInput
            contacts={contactArray}
            className="min-h-0 flex-1 items-start border-none px-0 py-0.5"
            inputProps={RECIPIENT_INPUT_PROPS}
            hideClearAllButton={true}
            placeholder=""
            commandProps={commandProps}
            // value (not defaultValue) like To / Cc, so Bcc chips follow the
            // draft — they never picked up names once contacts loaded.
            value={bccOptions}
            onChange={handleBccChange}
            onSelectionChange={noopSelectionChange}
            emptyIndicator={<span>{t('compose_card.no_contact_match')}</span>}
          />
        </div>
      ) : null}
    </>
  );
};

// Re-renders only when its props change (the body no longer re-renders the
// card, and the card passes stable callbacks).
export default memo(ComposeCardHeader);
