import { IMonoDraft, MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/icons';
import AttachmentItem from '@/renderer/app/components/mail/attachment/AttachmentItem';
import ContactProfileDropdown from '@/renderer/app/components/mail/ContactProfileDropdown';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/renderer/app/components/ui/card';
import {
  ScrollArea,
  ScrollAreaViewport,
  ScrollBar
} from '@/renderer/app/components/ui/scroll-area';
import { convertPlainTextToHtml } from '@/renderer/app/containers/editor/TextEditor';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { cn } from '@/renderer/app/lib/utils';
import { useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { FC, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface DraftCardProps {
  className?: string;
  cardClassName?: string;
  collapsed?: boolean;
  item: MonoDraft;
  preview?: boolean;
}

const DraftCard: FC<DraftCardProps> = ({ item, cardClassName, className, collapsed, preview }) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const { getUidFromEmail } = useAuth();
  const executeCommand = useExecuteCommand();
  const [showQuotedContent, setShowQuotedContent] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { draftsMapByAccount, removeDraft, sendDraftQueue } = useDraftAtom();
  const [draftMessage, setDraftMessage] = useState<IMonoDraft>(item.toPlainObject());
  const { signatures } = useSignatureAtom();
  const [showCcDropdown, setShowCcDropdown] = useState(false);
  const [showBccDropdown, setShowBccDropdown] = useState(false);
  const { t } = useTranslation();

  const accountId = getUidFromEmail(item.from);
  useEffect(() => {
    setIsCollapsed(collapsed);
  }, [collapsed]);

  const updateHeight = () => {
    if (containerRef.current && contentRef.current) {
      const contentHeight = contentRef.current.scrollHeight;
      containerRef.current.style.height = isCollapsed ? '0px' : `${contentHeight}px`;
    }
  };

  useEffect(() => {
    requestAnimationFrame(updateHeight);
  }, [isCollapsed, showQuotedContent, contentRef.current, draftsMapByAccount]);

  useEffect(() => {
    if (contentRef.current) {
      const images = contentRef.current.querySelectorAll('img');

      const onImageLoad = () => {
        requestAnimationFrame(updateHeight);
      };

      images.forEach((img) => {
        if (img.complete) {
          onImageLoad();
        } else {
          img.addEventListener('load', onImageLoad);
          img.addEventListener('error', onImageLoad); // handle errors to ensure callback
        }
      });

      return () => {
        images.forEach((img) => {
          img.removeEventListener('load', onImageLoad);
          img.removeEventListener('error', onImageLoad);
        });
      };
    }
    return () => {};
  }, [contentRef.current]);

  useEffect(() => {
    let isMounted = true;
    const fetchDraftMessage = async () => {
      if (!item.id || !accountId) return;

      // Get drafts for this account
      const accountDrafts = draftsMapByAccount[accountId] || {};

      if (accountDrafts[item.id]) {
        // Update the message with the latest draft data from the account
        const draft = accountDrafts[item.id];
        if (isMounted) {
          setDraftMessage(draft);
          setTimeout(() => {
            updateHeight();
          }, 150);
        }
      } else {
        if (isMounted) {
          setDraftMessage(item.toPlainObject());
        }
      }
    };
    fetchDraftMessage();

    return () => {
      isMounted = false;
    };
  }, [item, draftsMapByAccount, accountId]);

  const handleDiscardDraft = async () => {
    if (accountId) await removeDraft(accountId, draftMessage.id);
  };

  return (
    <>
      <div className={cn('group', className)}>
        <Card
          className={cn(
            // Newton draft signal: 3px red left stripe distinguishes the
            // in-progress draft from sent messages in the same thread.
            'relative overflow-hidden border-border/60 shadow-md before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-red-500 before:content-[""]',
            cardClassName
          )}
        >
          <CardHeader
            className="px-4 py-2"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
          >
            {/* Use draftMessage instead of item */}
            <div className="flex items-center gap-4 text-sm">
              <div className="w-full min-w-0">
                <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {draftMessage.isAiGenerated ? (
                    <>
                      <MonoIcon
                        className="mr-1 inline-block h-3 w-3 -translate-y-[1px] text-accent"
                        type={'Sparkles'}
                      />
                      AI draft
                    </>
                  ) : (
                    'Draft'
                  )}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <div className="line-clamp-1 text-[14px] font-medium tracking-tight text-foreground">
                    {draftMessage.subject.length > 0 ? draftMessage.subject : '(No subject)'}
                  </div>
                  {draftMessage.timestamp && (
                    <div className="-mr-2 ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                      {!preview &&
                        (sendDraftQueue.includes(item.id) ? (
                          <div className="text-md h-8 p-2">Sending...</div>
                        ) : (
                          <>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                executeCommand('COMPOSE_NEW_MESSAGE', {
                                  draft: MonoDraft.fromPlainObject(draftMessage),
                                  accountId: accountId
                                });
                              }}
                              variant="default"
                              sizeVariant={'sm'}
                              disabled={!draftMessage}
                            >
                              Edit draft
                            </Button>
                            <Button
                              tooltip={t('tooltip.discard_draft')}
                              variant="ghost"
                              sizeVariant={'sm'}
                              typeVariant={'icon'}
                              disabled={!draftMessage}
                              onClick={async (e) => {
                                e.stopPropagation();
                                await handleDiscardDraft();
                              }}
                            >
                              <MonoIcon type={'Trash'} />
                            </Button>
                          </>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>

          {/* Use draftMessage instead of item in the content */}
          <div ref={containerRef} className="transition-height duration-300 ease-bouncy-in-out">
            <div ref={contentRef}>
              <div className="ml-12 grid gap-1 px-4 pb-4">
                <div className="line-clamp-1 text-xs">
                  <span className="font-medium text-muted-foreground">To:</span>{' '}
                  {draftMessage.to.length === 0 ? (
                    <span>(No recipient)</span>
                  ) : (
                    draftMessage.to.map((recipient, index) => {
                      return (
                        <span key={recipient} className="mr-1">
                          <ContactProfileDropdown value={recipient}>
                            <Button className="text-xs" variant="link" typeVariant={'inline'}>
                              {`${recipient} (${recipient})`}
                            </Button>
                          </ContactProfileDropdown>
                        </span>
                      );
                    })
                  )}
                </div>

                {/* CC Recipients - Only show if there are cc recipients */}
                {draftMessage.cc && draftMessage.cc.length > 0 && (
                  <div className="text-xs">
                    <span className="font-medium text-muted-foreground">
                      {t('message_card.cc')}:
                    </span>
                    <Button
                      className="ml-1 h-auto p-0 text-xs"
                      variant="link"
                      typeVariant={'inline'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCcDropdown(!showCcDropdown);
                      }}
                    >
                      {draftMessage.cc.length} {t('message_card.recipients')}
                      <MonoIcon
                        type={showCcDropdown ? 'ChevronUp' : 'ChevronDown'}
                        className="ml-1 h-3 w-3"
                      />
                    </Button>
                    {showCcDropdown && (
                      <div className="ml-6 mt-1">
                        {draftMessage.cc.map((recipient) => (
                          <div key={recipient} className="py-1 text-xs">
                            {preview ? (
                              <span>{`${recipient}`}</span>
                            ) : (
                              // <ContactProfileDropdown value={recipient.email}>
                              <Button className="text-xs" variant="link" typeVariant={'inline'}>
                                {`${recipient}`}
                              </Button>
                              // </ContactProfileDropdown>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* BCC Recipients - Only show if there are bcc recipients */}
                {draftMessage.bcc && draftMessage.bcc.length > 0 && (
                  <div className="text-xs">
                    <span className="font-medium text-muted-foreground">
                      {t('message_card.bcc')}:
                    </span>
                    <Button
                      className="ml-1 h-auto p-0 text-xs"
                      variant="link"
                      typeVariant={'inline'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowBccDropdown(!showBccDropdown);
                      }}
                    >
                      {draftMessage.bcc.length} {t('message_card.recipients')}
                      <MonoIcon
                        type={showBccDropdown ? 'ChevronUp' : 'ChevronDown'}
                        className="ml-1 h-3 w-3"
                      />
                    </Button>
                    {showBccDropdown && (
                      <div className="ml-6 mt-1">
                        {draftMessage.bcc.map((recipient) => (
                          <div key={recipient} className="py-1 text-xs">
                            {preview ? (
                              <span>{`${recipient}`}</span>
                            ) : (
                              // <ContactProfileDropdown value={recipient.email}>
                              <Button className="text-xs" variant="link" typeVariant={'inline'}>
                                {`${recipient}`}
                              </Button>
                              // </ContactProfileDropdown>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <CardContent className="px-6 pb-4">
                {/* Use draftMessage.body */}
                <ScrollArea>
                  <ScrollAreaViewport>
                    <div
                      className="reset-selection relative block cursor-auto select-text overflow-hidden whitespace-pre"
                      dangerouslySetInnerHTML={{
                        __html: convertPlainTextToHtml(draftMessage.body)
                      }}
                    ></div>
                    <ScrollBar orientation={'horizontal'} />
                  </ScrollAreaViewport>
                </ScrollArea>
                {signatures.find((signature) => signature.id === draftMessage.signatureId) && (
                  <div
                    className="reset-selection mt-2"
                    dangerouslySetInnerHTML={{
                      __html:
                        signatures.find((signature) => signature.id === draftMessage.signatureId)
                          ?.content ?? ''
                    }}
                  ></div>
                )}
              </CardContent>

              {Object.values(draftMessage.attachments).length > 0 && (
                <CardFooter className="flex flex-col items-start gap-3 p-4">
                  <div className="text-sm">
                    <MonoIcon
                      type={'Paperclip'}
                      className="mr-2 inline-block h-4 w-4 text-muted-foreground"
                    />
                    <span>
                      {Object.values(draftMessage.attachments).length} attachment
                      {Object.values(draftMessage.attachments).length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid auto-cols-max grid-flow-row gap-3 text-center">
                    {accountId &&
                      Object.values(draftMessage.attachments).map((attachment, index) => (
                        <AttachmentItem
                          source={'draft'}
                          key={attachment.attachmentId}
                          itemId={draftMessage.id}
                          preview
                          accountId={accountId}
                          attachment={attachment}
                        />
                      ))}
                  </div>
                </CardFooter>
              )}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
};

export default DraftCard;
