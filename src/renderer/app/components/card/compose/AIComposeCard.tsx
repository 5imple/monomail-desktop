import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { ScrollArea, ScrollAreaViewport } from '@/renderer/app/components/ui/scroll-area';
import { Textarea } from '@/renderer/app/components/ui/textarea';
import { cn } from '@/renderer/app/lib/utils';
import { FC, useEffect, useRef, useState } from 'react';
import aiApi from '@/main/api/ai';
import { useTransition, animated } from '@react-spring/web';
import { useTranslation } from 'react-i18next';
// useBillingAtom removed — payment-free build, every consumer treats
// hasProAccess as true.
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { isDevelopment } from '@/renderer/app/lib/accessManagement';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { DBGetContactByEmail } from '@/renderer/app/lib/db/contact';

interface AIComposeCardProps {
  onSave: (finalText: string) => void;
  onClose: () => void;
  uid: string;
  draft?: MonoDraft;
}

const AIComposeCard: FC<AIComposeCardProps> = ({ onSave, onClose, uid, draft }) => {
  const { t } = useTranslation();
  const hasProAccess = true;
  const { openDialog } = useDialogs();
  const { getAccountByUid } = useAuth();
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContents, setGeneratedContents] = useState<string[]>([]);
  const [currentContentIndex, setCurrentContentIndex] = useState(0);
  const [showPopover, setShowPopover] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayedContent, setDisplayedContent] = useState('');

  const cardRef = useRef<HTMLDivElement | null>(null);
  const acceptButtonRef = useRef<HTMLButtonElement | null>(null);
  const typewriterInterval = useRef<NodeJS.Timeout | null>(null);

  const currentContent = generatedContents[currentContentIndex] || '';
  const [previousInput, setPreviousInput] = useState('');

  // Helper function to extract first name from display name
  const getFirstName = (displayName: string): string => {
    return displayName.split(' ')[0];
  };

  // Helper function to fetch contact by email
  const getContactByEmail = async (email: string) => {
    try {
      const contacts = await DBGetContactByEmail(uid, email);
      return contacts.length > 0 ? contacts[0] : null;
    } catch (error) {
      console.error('Error fetching contact by email:', error);
      return null;
    }
  };

  // Helper function to format the from field as "Name <email>" if name is available
  // When both to and from have names, use first names only (no email)
  const formatFromField = async () => {
    const account = getAccountByUid(uid);
    if (!account) return undefined;

    // Check if any recipient has a display name
    let hasRecipientNames = false;
    if (draft?.to && draft.to.length > 0) {
      for (const email of draft.to) {
        const contact = await getContactByEmail(email);
        if (contact && contact.displayName && contact.displayName !== email) {
          hasRecipientNames = true;
          break;
        }
      }
    }

    // If displayName exists and is different from email
    if (account.displayName && account.displayName !== account.email) {
      // Use first name only (no email) if both from and to have names
      if (hasRecipientNames) {
        return getFirstName(account.displayName);
      }
      // Otherwise use full name with email
      return `${account.displayName} <${account.email}>`;
    }

    // When no name exists, return undefined
    return undefined;
  };

  // Helper function to format the to field using contact names when available
  // When both to and from have names, use first names only (no email)
  const formatToField = async () => {
    if (!draft?.to || draft.to.length === 0) return undefined;

    // Check if from account has a display name
    const account = getAccountByUid(uid);
    const hasFromName = account?.displayName && account.displayName !== account.email;

    const formattedRecipients: string[] = [];
    for (const email of draft.to) {
      // Find contact for this email
      const contact = await getContactByEmail(email);

      // If contact found and has a display name different from email
      if (contact && contact.displayName && contact.displayName !== email) {
        // Use first name only (no email) if both from and to have names
        const nameToUse = hasFromName ? getFirstName(contact.displayName) : contact.displayName;
        if (hasFromName) {
          formattedRecipients.push(nameToUse); // Just the first name, no email
        } else {
          formattedRecipients.push(`${nameToUse} <${email}>`);
        }
      }
      // When no name exists, we don't add anything (skip this recipient)
    }

    // Return the formatted array only if it has valid entries
    return formattedRecipients.length > 0 ? formattedRecipients : undefined;
  };

  // Check if user has pro plan for AI features

  // If user doesn't have pro access, show billing prompt
  useEffect(() => {
    if (!hasProAccess) {
      // Close the AI compose card and open billing page
      onClose();
      openDialog('preference', { defaultPage: 'billing' });
    }
  }, [hasProAccess, onClose, openDialog]);

  const popoverTransition = useTransition(showPopover, {
    from: { opacity: 0, transform: 'translateY(10px)' },
    enter: { opacity: 1, transform: 'translateY(0px)' },
    leave: { opacity: 0, transform: 'translateY(10px)' }
  });

  // Early return if no pro access (component will unmount due to onClose)
  if (!hasProAccess) {
    return null;
  }
  const bounce = () => {
    if (cardRef.current) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 150);
    }
  };

  const handleAction = async (retry = false) => {
    let prompt = '';

    if (retry) {
      prompt = previousInput;
    } else {
      prompt = input;
      setPreviousInput(input);
    }

    if (!prompt.trim()) return;

    // bounce();
    setIsGenerating(true);
    setDisplayedContent(''); // Clear the display for skeleton
    resetTextareaHeight();
    setShowPopover(false);

    const isEditing = !!currentContent;

    try {
      const contentToSend = isEditing ? currentContent : '';
      const fromField = await formatFromField();
      const toField = await formatToField();

      const response = await aiApi.generateDraft(uid, contentToSend, prompt, fromField, toField);

      const newContent = response.template;

      if (isEditing) {
        const updatedContents = [...generatedContents];
        updatedContents[currentContentIndex] = newContent;
      }

      setGeneratedContents([...generatedContents, newContent]);
      setCurrentContentIndex(generatedContents.length);

      setIsGenerating(false);
      setInput('');
      setShowPopover(true);
      setTimeout(() => {
        if (acceptButtonRef && acceptButtonRef.current) acceptButtonRef.current.focus();
      }, 150);

      // Start typewriting effect
      // handleTypewritingEffect(newContent);
      setDisplayedContent(newContent);
    } catch (error) {
      console.error('Error generating AI content:', error);
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    onSave(currentContent);
    setInput('');
    setGeneratedContents([]);
    setCurrentContentIndex(0);
    setShowPopover(false);
    onClose();
  };

  const handlePrevious = () => {
    if (currentContentIndex > 0) {
      setCurrentContentIndex(currentContentIndex - 1);
      setDisplayedContent(generatedContents[currentContentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (currentContentIndex < generatedContents.length - 1) {
      setCurrentContentIndex(currentContentIndex + 1);
      setDisplayedContent(generatedContents[currentContentIndex + 1]);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const resetTextareaHeight = () => {
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.style.height = 'auto'; // Reset height
    }
  };

  return (
    <div className="relative w-full max-w-xl">
      <div
        ref={cardRef}
        className={cn(
          'relative flex items-center justify-center rounded-lg bg-transparent transition-all duration-300',
          isAnimating ? 'scale-[0.995]' : 'scale-100'
        )}
      >
        <div
          className={cn(
            // AI gradient halo: tuned to amber → red gradient. Newton uses
            // amber (secondary-accent) for AI affordances; the gradient
            // sweeps through the primary accent on the way to keep visual
            // motion without introducing a third palette.
            'absolute inset-0 animate-gradient-flow rounded-lg bg-gradient-to-r from-[hsl(var(--secondary-accent)/0.7)] via-[hsl(var(--accent)/0.5)] to-[hsl(var(--secondary-accent)/0.7)] blur-xl transition-all duration-6000 ease-bouncy-in-out',
            isGenerating ? 'blur-sm duration-1000' : 'blur-lg'
          )}
        ></div>

        <div
          className={cn(
            'relative w-full overflow-hidden rounded-lg bg-card transition-all duration-300 ease-in-out'
          )}
        >
          <ScrollArea className={cn('w-full')}>
            <ScrollAreaViewport
              className={cn(
                'relative h-0 opacity-0 transition-all duration-300 ease-bouncy-in-out',
                isGenerating && 'h-14 opacity-100',
                displayedContent.length > 0 && 'h-[180px] opacity-100'
              )}
            >
              {isGenerating ? (
                <div className="p-3">
                  <div className="mb-2 h-4 w-3/4 animate-pulse rounded-sm bg-[hsl(var(--secondary-accent)/0.2)]"></div>
                  <div className="h-4 w-1/2 animate-pulse rounded-sm bg-[hsl(var(--secondary-accent)/0.15)]"></div>
                </div>
              ) : (
                displayedContent.length > 0 && (
                  <>
                    <div
                      className={cn(
                        'sticky top-0 z-[1] flex flex-row items-center justify-between bg-card p-1 transition-all duration-300 ease-bouncy-in-out'
                      )}
                    >
                      <div className="flex gap-3">
                        <Button
                          ref={acceptButtonRef}
                          variant={'ghost'}
                          sizeVariant={'sm'}
                          onClick={handleAccept}
                        >
                          <MonoIcon type="Check" className="mr-1.5" />
                          Accept
                        </Button>
                        <Button
                          variant={'ghost'}
                          sizeVariant={'sm'}
                          onClick={() => handleAction(true)}
                          disabled={isGenerating}
                        >
                          <MonoIcon type={'RotateCcw'} className="mr-1.5" />
                          Retry
                        </Button>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          variant={'ghost'}
                          sizeVariant={'sm'}
                          onClick={handlePrevious}
                          disabled={currentContentIndex === 0}
                        >
                          <MonoIcon type="ChevronLeft" className="mr-1.5" />
                          Previous
                        </Button>
                        <Button
                          variant={'ghost'}
                          sizeVariant={'sm'}
                          onClick={handleNext}
                          disabled={currentContentIndex === generatedContents.length - 1}
                        >
                          Next
                          <MonoIcon type="ChevronRight" className="ml-1.5" />
                        </Button>
                      </div>
                    </div>
                    <div className={cn('wipe wipe-active whitespace-pre-wrap p-3 text-sm')}>
                      {displayedContent.split('\n\n').map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))}
                    </div>
                  </>
                )
              )}
            </ScrollAreaViewport>
          </ScrollArea>
          <div className={cn('')}>
            <Textarea
              className="w-full resize-none rounded-none border-0 bg-card p-3 disabled:text-muted-foreground disabled:opacity-100"
              autoResize
              autoFocus
              placeholder={
                currentContent
                  ? t('compose_card.ai.describe_edit')
                  : t('compose_card.ai.outline_note')
              }
              maxHeight="100px"
              disabled={isGenerating}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isGenerating) {
                  e.preventDefault();
                  handleAction();
                }
              }}
            />
            <div
              className={`absolute bottom-2 right-2 ${
                isGenerating || input.length === 0 ? 'text-muted-foreground' : 'text-foreground'
              }`}
              onClick={() => handleAction()}
            >
              <MonoIcon type="ArrowUpCircle" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIComposeCard;
