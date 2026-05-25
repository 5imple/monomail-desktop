import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import { MonoMessage } from '@/main/models/message/MonoMessage';

import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { Card, CardContent, CardHeader } from '@/renderer/app/components/ui/card';
import {
  ScrollArea,
  ScrollAreaViewport,
  ScrollBar
} from '@/renderer/app/components/ui/scroll-area';
import { formatMessageDate, getForwardedMessageBody } from '@/renderer/app/lib/formatBody';
import { cn } from '@/renderer/app/lib/utils';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ReferenceCardProps {
  type: 'reply' | 'forward';
  item: MonoMessage;
  accountId: string;
}

const ReferenceCard: FC<ReferenceCardProps> = ({ type, item, accountId }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const referenceBody = useMemo(() => {
    return type === 'forward' ? getForwardedMessageBody(item) : item.getParsedBody();
  }, [item, type]);
  const formattedDate = useMemo(() => formatMessageDate(item), [item]);

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  useEffect(() => {
    if (contentRef.current) {
      if (isExpanded) {
        setContentHeight(contentRef.current.scrollHeight);
      } else {
        setContentHeight(0);
      }
    }
  }, [isExpanded]);

  const updateHeight = () => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  };

  const subject = item.subject.length > 0 ? item.subject : '(No subject)';
  const sender = item.from?.name?.trim() || item.from?.email || 'Original message';
  const summary = type === 'reply' ? `Replying to ${sender}` : `Forwarding ${sender}`;

  useEffect(() => {
    if (!contentRef.current) return;

    const images = contentRef.current.querySelectorAll('img[data-attachment-id]');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(async (entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          const attachmentId = img.getAttribute('data-attachment-id');
          const cid = img.getAttribute('data-content-id');
          const imgWidth = img.getAttribute('width');
          const imgHeight = img.getAttribute('height');

          // Show skeleton on top of the image
          img.style.display = 'none'; // Hide image initially

          const skeleton = document.createElement('div');
          skeleton.className = `bg-muted-low animate-pulse rounded-md`;
          skeleton.setAttribute('style', `width: ${imgWidth}px; height: ${imgHeight}px;`);
          img.parentNode?.insertBefore(skeleton, img); // Insert skeleton before image
          updateHeight();

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
      <CardHeader className={cn('px-4 py-3', isExpanded && 'border-b border-border/40')}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="line-clamp-1 text-[13px] font-medium tracking-tight text-foreground">
              {summary}
            </div>
            <div className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">
              {subject} · {formattedDate}
            </div>
          </div>
          <Button
            onClick={toggleExpand}
            tooltip={isExpanded ? t('tooltip.minimize') : t('tooltip.maximize')}
            variant="ghost"
            sizeVariant="sm"
            typeVariant="icon"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? <MonoIcon type="Minimize" /> : <MonoIcon type="Maximize" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div
          className="overflow-hidden transition-all duration-300"
          style={{ height: `${contentHeight}px` }}
        >
          <div ref={contentRef} className="px-4 py-3">
            <ScrollArea>
              <ScrollAreaViewport>
                <div
                  className="select-text"
                  dangerouslySetInnerHTML={{ __html: referenceBody }}
                ></div>
                <ScrollBar orientation={'horizontal'} />
              </ScrollAreaViewport>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReferenceCard;
