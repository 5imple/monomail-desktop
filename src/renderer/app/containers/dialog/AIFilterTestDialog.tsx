import React, { FC, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import Loader from '@/renderer/app/components/ui/loader';
import { cn } from '@/renderer/app/lib/utils';
import { toast } from 'sonner';
import aiApi from '@/main/api/ai/aiApi';
import mailApi from '@/main/api/mail/mailApi';
import { AIFilterTestRequest, AIFilterTestResult } from '@/main/api/ai/types';
import { DBGetAllThreadsMultiUser } from '@/renderer/app/lib/db/thread';

interface AIFilterTestDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accountId: string;
  initialPrompt?: string;
}

interface EmailSuggestion {
  id: string;
  subject: string;
  searchText: string;
  suggestedLabel: string;
  action: 'accept' | 'reject';
  isFiltered?: boolean;
  from: string;
  source: string;
  confidence?: number;
}

type FlowState = 'ai-searching' | 'fallback-searching' | 'search-complete' | 'teaching';

const AIFilterTestDialog: FC<AIFilterTestDialogProps> = ({
  children,
  open,
  onOpenChange,
  accountId,
  initialPrompt = ''
}) => {
  const { t } = useTranslation();
  const [flowState, setFlowState] = useState<FlowState>('ai-searching');
  const [labelName, setLabelName] = useState(initialPrompt);
  const [emailSuggestions, setEmailSuggestions] = useState<EmailSuggestion[]>([]);
  const [keepInInbox, setKeepInInbox] = useState(true);
  const [searchMethod, setSearchMethod] = useState<'ai' | 'fallback'>('ai');

  // Reset state when dialog opens and start the flow
  useEffect(() => {
    if (open) {
      setFlowState('ai-searching');
      setEmailSuggestions([]);
      setKeepInInbox(true);
      setLabelName(initialPrompt);
      setSearchMethod('ai');

      // Start the actual functionality only if we have a valid prompt
      if (initialPrompt.trim()) {
        handleFetchAndTest(initialPrompt);
      } else {
        toast.error('Please provide a filter description');
        onOpenChange(false);
      }
    }
  }, [open, initialPrompt, accountId]);

  const generateSearchPromptForAI = (filterPrompt: string): string => {
    const lowerPrompt = filterPrompt.toLowerCase();

    // Check for emails requiring personal response/action
    if (
      (lowerPrompt.includes('request') ||
        lowerPrompt.includes('question') ||
        lowerPrompt.includes('decision')) &&
      (lowerPrompt.includes('response') ||
        lowerPrompt.includes('reply') ||
        lowerPrompt.includes('personal'))
    ) {
      return `Find emails from real people that contain questions, requests for feedback, decisions to be made, or explicit asks for replies. Include emails asking for confirmation, opinions, or next steps.`;
    }

    // Check for sales/promotional content
    if (
      lowerPrompt.includes('sales') ||
      lowerPrompt.includes('promotional') ||
      lowerPrompt.includes('marketing') ||
      lowerPrompt.includes('cold outreach')
    ) {
      return `Find sales and promotional emails, cold outreach, marketing messages, demo requests, and unsolicited business proposals`;
    }

    // Check for newsletters/subscriptions
    if (
      lowerPrompt.includes('newsletter') ||
      lowerPrompt.includes('subscription') ||
      lowerPrompt.includes('automated')
    ) {
      return `Find newsletters, email subscriptions, marketing communications, and promotional updates`;
    }

    // Check for transactional emails
    if (
      lowerPrompt.includes('receipt') ||
      lowerPrompt.includes('transaction') ||
      lowerPrompt.includes('order') ||
      lowerPrompt.includes('confirmation')
    ) {
      return `Find receipts, transaction confirmations, order notifications, and payment confirmations`;
    }

    // Check for support emails
    if (
      lowerPrompt.includes('support') ||
      lowerPrompt.includes('help') ||
      lowerPrompt.includes('ticket')
    ) {
      return `Find customer support emails, help desk tickets, and support communications`;
    }

    // Check for calendar/meeting emails
    if (
      lowerPrompt.includes('meeting') ||
      lowerPrompt.includes('calendar') ||
      lowerPrompt.includes('schedule')
    ) {
      return `Find meeting invitations, calendar events, scheduling requests, and appointment confirmations`;
    }

    // Extract example phrases from the prompt
    const quotedText = filterPrompt.match(/"([^"]+)"/g)?.map((q) => q.replace(/"/g, '')) || [];

    if (quotedText.length > 0) {
      return `Find emails containing phrases like: ${quotedText.join(', ')}`;
    }

    // Fallback: use the original prompt directly for AI search
    return filterPrompt;
  };

  const handleFetchAndTest = async (promptToUse?: string) => {
    const activePrompt = promptToUse || labelName;
    if (!activePrompt.trim()) {
      toast.error('Please provide a filter description');
      onOpenChange(false);
      return;
    }

    try {
      let emailItems: EmailSuggestion[] = [];

      // Stage 1: Try AI search first for better relevance
      setFlowState('ai-searching');
      setSearchMethod('ai');

      try {
        const searchPrompt = generateSearchPromptForAI(activePrompt);
        console.log('Using AI search with prompt:', searchPrompt);

        const aiSearchResponse = await mailApi.aiSearchThreads(accountId, {
          prompt: activePrompt,
          maxResults: 20 // Get more results for better variety
        });

        console.log('AI search response:', aiSearchResponse);

        if (aiSearchResponse.threads && aiSearchResponse.threads.length > 0) {
          // Convert AI search results to email items
          emailItems = aiSearchResponse.threads.map((thread) => {
            const latestMessage = thread.messages[thread.messages.length - 1];

            // Determine source based on labels
            let source = 'other';
            const labelIds = latestMessage?.labelIds || [];
            if (labelIds.includes('INBOX')) source = 'inbox';
            else if (labelIds.includes('SENT')) source = 'sent';
            else if (labelIds.includes('DRAFT')) source = 'drafts';
            else if (labelIds.includes('SPAM')) source = 'spam';

            const fromInfo = latestMessage?.from?.name || latestMessage?.from?.email || 'Unknown';

            return {
              id: thread.id,
              subject: thread.subject || 'No Subject',
              searchText: thread.snippet || 'No content available',
              suggestedLabel: '',
              action: 'reject' as const,
              from: fromInfo,
              source: source,
              confidence: 0.8 // AI search results are generally more relevant
            };
          });

          console.log(`AI search found ${emailItems.length} relevant emails`);
        }
      } catch (aiSearchError) {
        console.warn('AI search failed, falling back to local search:', aiSearchError);
        setSearchMethod('fallback');
      }

      // Stage 2: Fallback to local search if AI search didn't return enough results
      if (emailItems.length < 10) {
        setFlowState('fallback-searching');
        setSearchMethod('fallback');

        console.log('Falling back to local search for more emails');

        // Fetch from local cache as fallback
        const allThreads = await DBGetAllThreadsMultiUser([accountId], 200);

        if (allThreads.length === 0) {
          toast.error('No cached emails found. Please sync some emails first.');
          onOpenChange(false);
          return;
        }

        // Extract keywords from the prompt for relevance scoring
        const promptKeywords = activePrompt
          .toLowerCase()
          .split(/\s+/)
          .filter((word) => word.length > 2)
          .filter(
            (word) =>
              ![
                'the',
                'and',
                'for',
                'are',
                'but',
                'not',
                'you',
                'all',
                'can',
                'her',
                'was',
                'one',
                'our',
                'had',
                'but',
                'day',
                'get',
                'has',
                'him',
                'his',
                'how',
                'its',
                'may',
                'new',
                'now',
                'old',
                'see',
                'two',
                'who',
                'boy',
                'did',
                'way',
                'who',
                'oil',
                'sit',
                'set'
              ].includes(word)
          );

        // Convert threads to email items with relevance scoring
        const fallbackItems: (EmailSuggestion & { relevanceScore: number })[] = [];

        for (const thread of allThreads) {
          const latestItem = thread.items[thread.items.length - 1];
          if (!latestItem) continue;

          // Determine source based on labels
          let source = 'other';
          if (thread.labelIds.includes('INBOX')) source = 'inbox';
          else if (thread.labelIds.includes('SENT')) source = 'sent';
          else if (thread.labelIds.includes('DRAFT')) source = 'drafts';
          else if (thread.labelIds.includes('SPAM')) source = 'spam';
          else if (thread.labelIds.includes('TRASH')) continue; // Skip trash

          // Extract sender info based on item type
          let fromInfo = 'Unknown';
          if (latestItem.type === 'message') {
            const messageItem =
              latestItem as import('@/main/models/message/MonoMessage').IMonoMessage;
            fromInfo = messageItem.from?.name || messageItem.from?.email || 'Unknown';
          } else if (latestItem.type === 'draft') {
            const draftItem = latestItem as import('@/main/models/draft/MonoDraft').IMonoDraft;
            fromInfo = draftItem.from || 'Unknown';
          }

          // Weighted relevance score
          const subjectText = (thread.subject || '').toLowerCase();
          const bodyText = (thread.snippet || '').toLowerCase();
          const fromText = fromInfo.toLowerCase();

          let relevanceScore = 0;
          for (const keyword of promptKeywords) {
            if (subjectText.includes(keyword)) relevanceScore += 3;
            if (fromText.includes(keyword)) relevanceScore += 2;
            if (bodyText.includes(keyword)) relevanceScore += 1;
          }

          const maxPossibleScore = promptKeywords.length * 3;
          relevanceScore = maxPossibleScore > 0 ? relevanceScore / maxPossibleScore : 0;

          fallbackItems.push({
            id: thread.id,
            subject: thread.subject || 'No Subject',
            searchText: thread.snippet || 'No content available',
            suggestedLabel: '',
            action: 'reject' as const,
            from: fromInfo,
            source: source,
            confidence: relevanceScore,
            relevanceScore: relevanceScore
          });
        }

        // Sort by relevance and take the most relevant ones
        fallbackItems.sort((a, b) => b.relevanceScore - a.relevanceScore);

        // Combine with AI search results (if any) and remove duplicates
        const aiSearchIds = new Set(emailItems.map((item) => item.id));
        const additionalItems = fallbackItems
          .filter((item) => !aiSearchIds.has(item.id))
          .slice(0, Math.max(0, 30 - emailItems.length))
          .map(({ relevanceScore, ...item }) => item);

        emailItems = [...emailItems, ...additionalItems];
      }

      if (emailItems.length === 0) {
        toast.error('No suitable emails found for testing');
        onOpenChange(false);
        return;
      }

      // Stage 3: Search complete
      setFlowState('search-complete');

      // Wait a moment then start AI testing
      setTimeout(async () => {
        try {
          // Test the filter against the sample
          const testRequest: AIFilterTestRequest = {
            prompt: activePrompt.trim(),
            data: emailItems.map((email) => ({
              id: email.id,
              content: `Subject: ${email.subject}\nFrom: ${email.from}\nBody: ${email.searchText}`
            }))
          };

          const testResponse = await aiApi.testAIFilter(accountId, testRequest);

          // Merge AI results into the email items
          const enrichedEmails = emailItems.map((email) => {
            const result = testResponse.result.find((r) => r.id === email.id);
            const isFiltered = result ? result.isFiltered : false;

            return {
              ...email,
              isFiltered,
              action: isFiltered ? ('accept' as const) : ('reject' as const),
              suggestedLabel: isFiltered ? labelName : '',
              searchText:
                email.searchText.length > 50
                  ? email.searchText.substring(0, 50) + '...'
                  : email.searchText
            };
          });

          // --- Stratified sampling: 70% matches, 30% non-matches ---
          const MATCH_RATIO = 0.7;
          const DISPLAY_COUNT = 10;

          const matched = enrichedEmails.filter((e) => e.isFiltered);
          const notMatched = enrichedEmails.filter((e) => !e.isFiltered);

          // Determine how many of each we can take while respecting the desired ratio and availability
          const desiredMatchCount = Math.round(DISPLAY_COUNT * MATCH_RATIO);
          const matchCount = Math.min(desiredMatchCount, matched.length);
          const nonMatchCount = Math.min(DISPLAY_COUNT - matchCount, notMatched.length);

          // If we don't have enough non-matches (or matches), top-up from the other category
          const finalMatches = matched.slice(0, matchCount);
          const finalNonMatches = notMatched.slice(0, nonMatchCount);

          let finalEmails = [...finalMatches, ...finalNonMatches];

          // Top-up if we still have fewer than DISPLAY_COUNT
          if (finalEmails.length < DISPLAY_COUNT) {
            const pool = [...matched.slice(matchCount), ...notMatched.slice(nonMatchCount)];
            finalEmails = finalEmails.concat(pool.slice(0, DISPLAY_COUNT - finalEmails.length));
          }

          // Randomise order before showing to the user
          finalEmails.sort(() => Math.random() - 0.5);

          setEmailSuggestions(finalEmails);
          setFlowState('teaching');
        } catch (error) {
          console.error('Error testing AI filter:', error);
          toast.error('Failed to test filter with AI');
          onOpenChange(false);
        }
      }, 1500);
    } catch (error) {
      console.error('Error in fetch and test process:', error);
      toast.error('Failed to fetch emails for testing');
      onOpenChange(false);
    }
  };

  const toggleAction = (id: string) => {
    setEmailSuggestions((prev) =>
      prev.map((suggestion) =>
        suggestion.id === id
          ? {
              ...suggestion,
              action: suggestion.action === 'accept' ? 'reject' : 'accept',
              suggestedLabel: suggestion.action === 'accept' ? '' : labelName
            }
          : suggestion
      )
    );
  };

  const handleSave = () => {
    const acceptedEmails = emailSuggestions.filter((e) => e.action === 'accept');
    toast.success(`Filter saved with ${acceptedEmails.length} email examples`);
    onOpenChange(false);
  };

  const getDialogTitle = () => {
    if (flowState === 'teaching') {
      return 'Teach me how to label future emails.';
    }
    return 'Testing AI filter';
  };

  const getSearchingText = () => {
    if (flowState === 'ai-searching') {
      return 'Using AI to find relevant emails';
    }
    if (flowState === 'fallback-searching') {
      return 'Searching local cache for additional emails';
    }
    return 'Searching for relevant emails';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent className="dark:border sm:max-h-[80vh] sm:max-w-[600px]">
          <DialogHeader className="text-center">
            <MonoIcon type={'Beaker'} className="mx-auto mb-2" />
            <DialogTitle className="text-center font-medium">{getDialogTitle()}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Searching States */}
            {(flowState === 'ai-searching' || flowState === 'fallback-searching') && (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Loader className="h-4 w-4" />
                  <span className="text-sm">{getSearchingText()}</span>
                </div>

                <div className="text-sm text-muted-foreground">Testing filter with AI</div>
              </div>
            )}

            {/* Search Complete State */}
            {flowState === 'search-complete' && (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <MonoIcon type="CheckCircle" className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Found relevant emails</span>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <Loader className="h-4 w-4" />
                  <span className="text-sm">Testing filter with AI</span>
                </div>
              </div>
            )}

            {/* Teaching State */}
            {flowState === 'teaching' && (
              <div className="space-y-4">
                {searchMethod === 'ai' && (
                  <div className="mb-2 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
                    <MonoIcon type="Sparkles" className="h-3 w-3" />
                    Results found using AI search
                  </div>
                )}

                {/* Email suggestions list */}
                <div className="space-y-2">
                  {emailSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="flex items-center justify-between rounded-lg border bg-background p-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="line-clamp-1 text-sm font-medium">
                          {suggestion.subject}
                        </span>
                      </div>

                      <div className="flex items-center rounded-lg border bg-muted p-0.5">
                        <Button
                          variant={suggestion.action === 'accept' ? 'secondary' : 'ghost'}
                          sizeVariant="sm"
                          typeVariant={'icon'}
                          onClick={() => toggleAction(suggestion.id)}
                        >
                          <MonoIcon type="Check" className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={suggestion.action === 'reject' ? 'secondary' : 'ghost'}
                          sizeVariant="sm"
                          typeVariant={'icon'}
                          className="text-destructive hover:text-destructive"
                          onClick={() => toggleAction(suggestion.id)}
                        >
                          <MonoIcon type="X" className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {flowState === 'teaching' && (
            <DialogFooter>
              <Button onClick={handleSave} className="w-full">
                Save
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default AIFilterTestDialog;
