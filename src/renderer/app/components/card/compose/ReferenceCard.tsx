import mailApi from '@/main/api/mail/mailApi';
import { MonoMessage } from '@/main/models/message/MonoMessage';

import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Card, CardContent, CardHeader } from '@/renderer/app/components/ui/card';
import {
  ScrollArea,
  ScrollAreaViewport,
  ScrollBar
} from '@/renderer/app/components/ui/scroll-area';
import { formatMessageCardDate } from '@/renderer/app/lib/formatDate';
import { getForwardedMessageBody } from '@/renderer/app/lib/formatBody';
import { cn } from '@/renderer/app/lib/utils';
import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ReferenceCardProps {
  type: 'reply' | 'forward';
  item: MonoMessage;
  accountId: string;
}

// Collapsed content stays mounted (for the height animation), so it's made
// inert: its links leave the Tab order. React 18 has no typed `inert` prop.
const inertWhen = (condition: boolean) =>
  (condition ? { inert: '' } : {}) as React.HTMLAttributes<HTMLDivElement>;

const ReferenceCard: FC<ReferenceCardProps> = ({ type, item, accountId }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const referenceBody = useMemo(() => {
    return type === 'forward' ? getForwardedMessageBody(item) : item.getParsedBody();
  }, [item, type]);
  // Local time, like the reader's message cards (formatMessageDate keeps the
  // sender's zone, right for the forwarded "Date:" line but not for the UI).
  const formattedDate = useMemo(() => formatMessageCardDate(item.timestamp), [item]);

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  const subject = item.subject.length > 0 ? item.subject : t('compose_card.no_subject');
  const sender = item.from?.name?.trim() || item.from?.email || t('compose_card.original_message');
  const summary =
    type === 'reply'
      ? t('compose_card.replying_to', { name: sender })
      : t('compose_card.forwarding', { name: sender });
  const expandedLabel = isExpanded
    ? t('message_card.hide_original')
    : t('message_card.show_original');
  // Forwarding sends the original's text, not its files — say so rather
  // than let them go missing silently.
  const originalHasFiles =
    type === 'forward' &&
    (Object.keys(item.attachments ?? {}).length > 0 || item.hasAttachments === true);

  useEffect(() => {
    if (!contentRef.current) return;

    const images = contentRef.current.querySelectorAll('img[data-attachment-id]');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(async (entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          const cid = img.getAttribute('data-content-id');
          const imgWidth = img.getAttribute('width');
          const imgHeight = img.getAttribute('height');

          // Show skeleton on top of the image
          img.style.display = 'none'; // Hide image initially

          const skeleton = document.createElement('div');
          skeleton.className = `bg-muted-low animate-pulse rounded-md`;
          skeleton.setAttribute('style', `width: ${imgWidth}px; height: ${imgHeight}px;`);
          img.parentNode?.insertBefore(skeleton, img); // Insert skeleton before image

          if (cid) {
            try {
              // TODO better solution
              const inlineImage = item.inlineImages[cid];
              if (inlineImage && accountId) {
                const inlineAttachment = await mailApi.getAttachmentInline(
                  accountId,
                  item.id,
                  inlineImage.attachmentId
                );
                const base64Image = `data:${inlineImage.mimeType};base64,${inlineAttachment.data}`;

                img.src = base64Image; // Set image source
                img.onload = () => {
                  skeleton.remove(); // Remove skeleton when image loads
                  img.style.display = 'block'; // Show the image
                };
                observer.unobserve(img);
              }
            } catch (error) {
              console.error('Failed to load image', error);
              skeleton.remove(); // Remove skeleton if the image load fails
            }
          }
        }
      });
    });

    images.forEach((img) => observer.observe(img));

    return () => {
      images.forEach((img) => observer.unobserve(img));
    };
  }, [contentRef.current, item.id]);

  return (
    <Card className="border-border/60 shadow-sm transition-all duration-400 ease-bouncy-in-out">
      <CardHeader className={cn('p-0', isExpanded && 'border-b border-border/40')}>
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={toggleExpand}
          className={cn(
            'flex w-full items-center gap-3 rounded-[inherit] px-4 py-3 text-left',
            'transition-colors hover:bg-muted/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="line-clamp-1 text-[13px] font-medium tracking-tight text-foreground">
              {summary}
            </div>
            <div className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">
              {subject} · {formattedDate}
            </div>
            {originalHasFiles && (
              <div className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
                <MonoIcon type="Paperclip" className="h-3 w-3" />
                <span>{t('compose_card.forward_attachments_not_included')}</span>
              </div>
            )}
          </div>
          <span className="flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground">
            <MonoIcon type={isExpanded ? 'ChevronUp' : 'ChevronDown'} className="h-3.5 w-3.5" />
            <span>{expandedLabel}</span>
          </span>
        </button>
      </CardHeader>
      <CardContent className="p-0">
        {/* Grid-row collapse: follows the content's real height, so images
            that load later and width changes (Expand) aren't clipped the way
            a height measured once was. */}
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300',
            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          )}
          {...inertWhen(!isExpanded)}
        >
          <div className="min-h-0 overflow-hidden">
            <div ref={contentRef} className="px-4 py-3">
              <ScrollArea>
                <ScrollAreaViewport>
                  {/* The reader's email paper: message HTML always on white,
                      so its own dark text stays readable in dark themes. */}
                  <div
                    className="email-document select-text rounded-md bg-white px-4 py-3 text-[#202124]"
                    dangerouslySetInnerHTML={{ __html: referenceBody }}
                  ></div>
                  <ScrollBar orientation={'horizontal'} />
                </ScrollAreaViewport>
              </ScrollArea>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReferenceCard;
