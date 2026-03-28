import { useEffect, useState } from 'react';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle
} from '@/renderer/app/components/ui/dialog';
import { Badge } from '@/renderer/app/components/ui/badge';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { cn } from '@/renderer/app/lib/utils';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { DBGetMessagesByLabel } from '@/renderer/app/lib/db/message';
import { toast } from 'sonner';
import Loader from '@/renderer/app/components/ui/loader';

type MessageCandidate = {
  id: string;
  content: string;
  subject: string;
  timestamp: number;
  score: number;
  truncatedContent?: string;
};

type ProcessStep = {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
};

interface ToneSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMessages: (messages: MessageCandidate[]) => void;
  accountId?: string;
}

export function ToneSelectionDialog({
  isOpen,
  onClose,
  onSelectMessages,
  accountId
}: ToneSelectionDialogProps) {
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<MessageCandidate[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState<ProcessStep[]>([
    { id: 'fetch', label: 'Finding your sent messages', status: 'pending' },
    { id: 'analyze', label: 'Analyzing message quality', status: 'pending' },
    { id: 'ready', label: 'Ready for selection', status: 'pending' }
  ]);

  // Helper function to extract formatted text from HTML while preserving structure
  const extractFormattedTextFromHtml = (html: string): string => {
    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Remove script and style elements
    const scripts = tempDiv.querySelectorAll('script, style');
    scripts.forEach((script) => script.remove());

    // Convert HTML to text while preserving line breaks and structure
    const convertNodeToText = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();

        // Add line breaks for block elements
        const blockElements = ['div', 'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr'];
        const isBlockElement = blockElements.includes(tagName);

        let text = '';

        // Process child nodes
        for (const child of Array.from(node.childNodes)) {
          text += convertNodeToText(child);
        }

        // Add appropriate line breaks for block elements
        if (isBlockElement) {
          if (tagName === 'br') {
            return '\n';
          } else if (tagName === 'p' || tagName === 'div') {
            return text + '\n';
          } else if (tagName.startsWith('h')) {
            return text + '\n';
          } else if (tagName === 'li') {
            return '- ' + text + '\n';
          } else {
            return text + '\n';
          }
        }

        return text;
      }

      return '';
    };

    let result = convertNodeToText(tempDiv);

    // Clean up excessive line breaks while preserving intentional formatting
    result = result
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive line breaks
      .replace(/^\s+|\s+$/g, '') // Trim start and end
      .replace(/[ \t]+/g, ' '); // Normalize spaces but keep line breaks

    return result;
  };

  // Function to score message quality based on various criteria
  const scoreMessage = (message: MonoMessage): number => {
    const rawContent = message.getParsedBody() || '';
    const content = extractFormattedTextFromHtml(rawContent);
    const subject = message.subject || '';

    let score = 0;

    // Length criteria (prefer messages between 50-300 characters)
    const contentLength = content.length;
    if (contentLength >= 50 && contentLength <= 500) {
      score += 30;
    } else if (contentLength > 300 && contentLength <= 500) {
      score += 20;
    } else if (contentLength < 50) {
      score += 5;
    }

    // Has proper greeting/closing (prioritize English)
    const hasGreeting =
      /^(Hello|Hi|Dear|Good morning|Good afternoon|Greetings|안녕하세요|안녕)/i.test(content);
    const hasClosing =
      /(Thank you|Best regards|Sincerely|Kind regards|Regards|Best wishes|Yours truly|감사합니다|고맙습니다|드림)/i.test(
        content
      );
    if (hasGreeting) score += 15;
    if (hasClosing) score += 15;

    // Professional tone indicators (prioritize English)
    const professionalWords = [
      // English professional words
      'please',
      'regarding',
      'attached',
      'forward',
      'review',
      'confirm',
      'update',
      'follow up',
      'meeting',
      'schedule',
      'deadline',
      'project',
      'proposal',
      'report',
      'presentation',
      'discussion',
      'feedback',
      'approval',
      'response',
      'information',
      'details',
      'requirements',
      // Korean professional words
      '확인',
      '검토',
      '송부',
      '첨부',
      '문의',
      '답변',
      '진행'
    ];
    const professionalCount = professionalWords.filter((word) =>
      content.toLowerCase().includes(word.toLowerCase())
    ).length;
    score += professionalCount * 5;

    // Has meaningful subject
    if (subject && subject.length > 5) score += 10;

    // Avoid automated/system messages
    const isAutomated = /no-reply|noreply|auto|system|notification/i.test(
      message.from?.[0]?.email || ''
    );
    if (isAutomated) score -= 50;

    // Prefer recent messages (within last 6 months)
    const sixMonthsAgo = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000;
    if (message.timestamp > sixMonthsAgo) score += 10;

    return Math.max(0, score);
  };

  const updateStepStatus = (stepId: string, status: ProcessStep['status']) => {
    setSteps((prev) => prev.map((step) => (step.id === stepId ? { ...step, status } : step)));
  };

  // Function to fetch and analyze messages
  const fetchAndAnalyzeMessages = async () => {
    if (!accountId) {
      toast.error('Please select an account first');
      return;
    }

    setIsProcessing(true);
    setMessages([]);

    // Reset all steps to pending
    setSteps((prev) => prev.map((step) => ({ ...step, status: 'pending' })));

    try {
      // Step 1: Fetch messages
      updateStepStatus('fetch', 'loading');

      const sentMessages: MonoMessage[] = await DBGetMessagesByLabel(accountId, 'SENT', 100);

      if (!sentMessages || sentMessages.length === 0) {
        updateStepStatus('fetch', 'error');
        toast.info('No sent messages found');
        return;
      }

      updateStepStatus('fetch', 'completed');

      // Step 2: Analyze messages
      updateStepStatus('analyze', 'loading');

      // Add a small delay to show the loading step
      await new Promise((resolve) => setTimeout(resolve, 500));

      const candidates: MessageCandidate[] = [];

      for (const message of sentMessages) {
        const rawContent = message.getParsedBody();
        const content = extractFormattedTextFromHtml(rawContent);

        // Skip very short messages
        if (content.length < 20) continue;

        // Skip messages that are mostly quotes/forwards
        const lines = content.split('\n');
        const quotedLines = lines.filter(
          (line) => line.trim().startsWith('>') || line.includes('From:') || line.includes('Sent:')
        );
        if (quotedLines.length > lines.length * 0.5) continue;

        const score = scoreMessage(message);
        if (score > 20) {
          candidates.push({
            id: message.id,
            content: content.trim(),
            subject: message.subject || 'No Subject',
            timestamp: message.timestamp,
            score
          });
        }
      }

      // Sort by score and take top candidates
      const topCandidates = candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, 10) // Get top 10 for user to choose from
        .map((candidate) => ({
          ...candidate,
          content: candidate.content, // Keep full content for display
          truncatedContent:
            candidate.content.length > 200
              ? candidate.content.substring(0, 200) + '...'
              : candidate.content
        }));

      updateStepStatus('analyze', 'completed');

      if (topCandidates.length === 0) {
        updateStepStatus('ready', 'error');
        toast.info('No suitable example messages found. Try sending some emails first!');
        return;
      }

      // Step 3: Ready for selection
      updateStepStatus('ready', 'completed');
      setMessages(topCandidates);
    } catch (error) {
      console.error('Error fetching example messages:', error);
      updateStepStatus('analyze', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Start the process when dialog opens and accountId is available
  useEffect(() => {
    if (isOpen && accountId && !isProcessing && messages.length === 0) {
      fetchAndAnalyzeMessages();
    }
  }, [isOpen, accountId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedMessages(new Set());
      setExpandedMessages(new Set());
      setMessages([]);
      setIsProcessing(false);
      setSteps((prev) => prev.map((step) => ({ ...step, status: 'pending' })));
    }
  }, [isOpen]);

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else if (newSet.size < 2) {
        // Only allow selecting up to 2 messages
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const toggleMessageExpansion = (messageId: string) => {
    setExpandedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const handleConfirm = () => {
    const selected = messages.filter((msg) => selectedMessages.has(msg.id));
    onSelectMessages(selected);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(timestamp));
  };

  const renderStepIcon = (step: ProcessStep) => {
    switch (step.status) {
      case 'completed':
        return <MonoIcon type="CheckCircle" className="h-4 w-4 text-green-500" />;
      case 'loading':
        return <Loader />;
      case 'error':
        return <MonoIcon type={'AlertCircle'} className="h-4 w-4 text-red-500" />;
      default:
        return <div className="border-1 h-4 w-4 rounded-full border-muted-foreground/30" />;
    }
  };

  const isShowingMessages = messages.length > 0 && !isProcessing;

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent className="max-h-[80vh] w-full max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isShowingMessages ? 'Select Example Messages' : 'Analyzing Your Messages'}
            </DialogTitle>
            <DialogDescription>
              {isShowingMessages
                ? 'Choose up to 2 messages that best represent your writing style. These will be used to create your voice profile.'
                : "We're analyzing your sent messages to find the best examples for your voice profile."}
            </DialogDescription>
          </DialogHeader>

          {/* Step Progress Indicator */}
          {!isShowingMessages && (
            <div className="space-y-4 py-6">
              {steps.map((step) => (
                <div key={step.id} className="flex items-center gap-3">
                  {renderStepIcon(step)}
                  <span
                    className={cn(
                      'text-sm',
                      step.status === 'completed' && 'text-foreground',
                      step.status === 'loading' && 'font-medium text-foreground',
                      step.status === 'error' && 'text-red-500',
                      step.status === 'pending' && 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Message Selection UI */}
          {isShowingMessages && (
            <>
              <ScrollArea className="max-h-[50vh]">
                <div className="space-y-3 pr-4">
                  {messages.map((message, index) => {
                    const isSelected = selectedMessages.has(message.id);
                    const isExpanded = expandedMessages.has(message.id);
                    const canSelect = selectedMessages.size < 2 || isSelected;
                    const shouldShowExpandButton = message.content.length > 200;
                    const displayContent = isExpanded
                      ? message.content
                      : message.truncatedContent || message.content;

                    return (
                      <div
                        key={message.id}
                        onClick={() => toggleMessageSelection(message.id)}
                        className={cn(
                          'group relative rounded-lg border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-sm',
                          isSelected && 'border-primary shadow-sm',
                          !canSelect && 'opacity-50'
                        )}
                      >
                        {/* Message header */}
                        <div className="mb-3 flex items-start justify-between">
                          <div className="flex flex-1 items-center justify-between">
                            <h4 className="font-medium leading-tight text-foreground">
                              {message.subject}
                            </h4>
                            <div className="flex items-center text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                {formatDate(message.timestamp)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Message content */}
                        <div className="space-y-3">
                          <div className="relative">
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                              {displayContent}
                            </p>
                          </div>

                          {shouldShowExpandButton && (
                            <Button
                              variant="ghost"
                              sizeVariant="sm"
                              onClick={() => toggleMessageExpansion(message.id)}
                            >
                              {isExpanded ? 'Show less' : 'Read full message'}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}

          <DialogFooter className="gap-2">
            {isShowingMessages && (
              <Button
                onClick={handleConfirm}
                className="px-8"
                disabled={selectedMessages.size === 0}
              >
                Submit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
