import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import { MonoMessage } from '@/main/models/message/MonoMessage';

import MonoIcon from '@/renderer/app/components/icons/icons';
import ContactProfileDropdown from '@/renderer/app/components/mail/ContactProfileDropdown';
import { Button } from '@/renderer/app/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/renderer/app/components/ui/card';
import {
  ScrollArea,
  ScrollAreaViewport,
  ScrollBar
} from '@/renderer/app/components/ui/scroll-area';
import { formatMessageDate, getForwardedMessageBody } from '@/renderer/app/lib/formatBody';
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

  const getReferenceTitle = () => {
    switch (type) {
      case 'forward':
        return 'Forwarded message';
      case 'reply':
        return 'Reply message';

      default:
        return 'Reference message';
    }
  };

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
      <CardHeader className="border-b border-border/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Quoted · {type === 'reply' ? 'Reply' : 'Forward'}
            </p>
            <div className="text-[14px] font-medium tracking-tight text-foreground">
              {getReferenceTitle()}
            </div>
          </div>
          <div>
            <Button
              onClick={toggleExpand}
              tooltip={isExpanded ? t('tooltip.minimize') : t('tooltip.maximize')}
              variant={'ghost'}
              sizeVariant={'sm'}
              typeVariant={'icon'}
            >
              {isExpanded ? <MonoIcon type={'Minimize'} /> : <MonoIcon type={'Maximize'} />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="border-b border-border/40">
        {/* Always visible subject */}
        <div className="text-[14px] font-medium tracking-tight">
          {item.subject.length > 0 ? item.subject : '(No subject)'}
        </div>
        {/* Collapsible content */}
        <div
          className="overflow-hidden transition-all duration-300"
          style={{ height: `${contentHeight}px` }}
        >
          <div ref={contentRef}>
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
      <CardFooter className="flex flex-col items-start justify-center">
        <div className="grid gap-1">
          <div className="line-clamp-1 text-xs">
            <span className="font-medium text-muted-foreground">From:</span>{' '}
            <ContactProfileDropdown value={item.from.email}>
              <Button className="text-xs" variant="link" typeVariant={'inline'}>
                {item.from && `${item.from.name} (${item.from.email})`}
              </Button>
            </ContactProfileDropdown>
          </div>
          <div className="line-clamp-1 text-xs">
            <span className="font-medium text-muted-foreground">Date:</span> {formattedDate}
          </div>
          <div className="line-clamp-1 text-xs">
            <span className="font-medium text-muted-foreground">To:</span>{' '}
            {item.to.length === 0 ? (
              <span>(No recipient)</span>
            ) : (
              item.to.map((recipient, index) => {
                return (
                  <span key={recipient.email} className="mr-1">
                    <ContactProfileDropdown value={recipient.email}>
                      <Button className="text-xs" variant="link" typeVariant={'inline'}>
                        {`${recipient.name} (${recipient.email})`}
                      </Button>
                    </ContactProfileDropdown>
                  </span>
                );
              })
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
};

export default ReferenceCard;
