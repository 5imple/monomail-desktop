import aiApi from '@/main/api/ai/aiApi';
import DOMPurify from 'dompurify';
import React, { useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

interface ThreadSummaryHoverCardProps {
  threadId: string;
  children: React.ReactNode;
}

const ThreadSummaryHoverCard: React.FC<ThreadSummaryHoverCardProps> = ({ threadId, children }) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false); // For fade-in effect

  const positionRef = useRef({ x: 0, y: 0 }); // Use ref to prevent re-renders
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Fetches the thread summary.
   */
  const fetchSummary = async () => {
    if (!summary && !isLoading) {
      setIsLoading(true);
      abortControllerRef.current = new AbortController();

      try {
        // Simulate fetching AI summary
        // const response = await aiApi.summarizeThread(threadId, abortControllerRef.current.signal);
        // console.log('response: ', response);
        // setSummary(`### Subject\n- **Point 1**\n- Point 2\n\n[Learn More](https://example.com)`);
      } catch (error) {
        console.error('Failed to fetch summary:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  /**
   * Handles hover start (delays fetch to avoid flickering).
   */
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    positionRef.current = { x: e.clientX + 15, y: e.clientY + 15 }; // Store cursor position
    hoverTimeoutRef.current = setTimeout(() => {
      fetchSummary();
      setIsVisible(true);
    }, 300);
  }, []);

  /**
   * Updates position on movement (throttled to avoid excessive updates).
   */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    positionRef.current = { x: e.clientX + 15, y: e.clientY + 15 };
  }, []);

  /**
   * Cancels fetch & hides summary.
   */
  const handleMouseLeave = useCallback(() => {
    setIsVisible(false);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();
  }, []);

  /**
   * Sanitizes and allows safe HTML rendering.
   */
  const renderHTML = (html: string) => ({
    __html: DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['img', 'h1', 'h2', 'h3', 'a'],
      ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'width', 'height']
    })
  });

  return (
    <>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>

      {isVisible && summary && (
        <div
          className="absolute z-50 max-w-sm rounded-md border bg-card p-3 text-sm shadow-xl transition-opacity duration-200"
          style={{
            position: 'fixed',
            top: `${positionRef.current.y}px`,
            left: `${positionRef.current.x}px`,
            opacity: isVisible ? 1 : 0,
            pointerEvents: 'none'
          }}
        >
          {isLoading ? (
            <div className="p-3">
              <div className="mb-1 h-4 w-3/4 animate-pulse rounded-sm bg-violet-500/15"></div>
              <div className="mb-1 h-4 w-1/2 animate-pulse rounded-sm bg-violet-500/10"></div>
            </div>
          ) : (
            summary &&
            (summary.startsWith('<') ? (
              <div dangerouslySetInnerHTML={renderHTML(summary)} />
            ) : (
              <ReactMarkdown className="markdown" rehypePlugins={[rehypeRaw]}>
                {summary}
              </ReactMarkdown>
            ))
          )}
        </div>
      )}
    </>
  );
};

export default ThreadSummaryHoverCard;
