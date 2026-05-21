import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { ReleaseNote, useReleaseNotesAtom } from '@/renderer/app/store/layout/useReleaseNotesAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { DialogTitle } from '@radix-ui/react-dialog';
import React, { FC, useEffect, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown, { Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import dayjs from 'dayjs';

interface ReleaseNoteDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // Release note to display
  releaseNote?: ReleaseNote;
}

// Badge component for feature labels
const Badge: FC<{ children: React.ReactNode; category?: string }> = ({
  children,
  category = 'default'
}) => {
  // Map category names to colors. Aligned to the Newton palette:
  //   stone  → neutral / informational
  //   red    → primary action (compose)
  //   lime   → active categorization / customization
  //   amber  → command / transient
  //   rose   → security-sensitive
  const getCategoryColor = (category: string) => {
    const categoryColors: Record<string, string> = {
      history: 'bg-stone-500',
      templates: 'bg-chart-1',
      notifications: 'bg-stone-500',
      contacts: 'bg-stone-500',
      compose: 'bg-red-500',
      slash: 'bg-amber-500',
      slack: 'bg-stone-500',
      auth: 'bg-rose-600',
      'oauth applications': 'bg-rose-600',
      preferences: 'bg-stone-400',
      labeling: 'bg-chart-1',
      api: 'bg-stone-500',
      default: 'bg-stone-400'
    };

    // Normalize category for lookup - lowercase for case insensitive matching
    const normalizedCategory = category.toLowerCase();
    return categoryColors[normalizedCategory] || 'bg-stone-400';
  };

  return (
    <span className="mr-1 inline-flex items-center rounded-full border px-2.5 py-1 text-sm">
      <span
        className={`mr-1.5 h-2 w-2 rounded-full ${getCategoryColor(category.toString())}`}
      ></span>
      {children}
    </span>
  );
};

// Media components for rendering images and videos
const ImageComponent: FC<{ src: string; alt?: string }> = ({ src, alt }) => {
  return (
    <div className="my-4">
      <img
        src={src}
        alt={alt || 'Image'}
        className="h-auto w-full max-w-full select-text rounded-md border object-cover shadow-lg"
        loading="lazy"
      />
      {alt && <p className="mt-3 text-center text-sm text-muted-foreground">{alt}</p>}
    </div>
  );
};

// Video component with proper styling
const VideoComponent: FC<{ src: string; caption?: string }> = ({ src, caption }) => {
  return (
    <div className="my-6 w-full">
      <video
        src={src}
        autoPlay
        muted
        loop
        disablePictureInPicture
        className="w-full rounded-lg border object-cover shadow-lg"
        preload="metadata"
      />
      {caption && <p className="mt-3 text-center text-sm text-muted-foreground">{caption}</p>}
    </div>
  );
};

// Foldable section component
const FoldableSection: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="-mx-2 mb-3 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center rounded-md p-2 text-left font-medium transition-all hover:bg-muted"
      >
        <MonoIcon type={isOpen ? 'ChevronUp' : 'ChevronDown'} className="mr-2 h-4 w-4" />
        <span>{title}</span>
      </button>
      {isOpen && <div className="px-3">{children}</div>}
    </div>
  );
};

// Custom components for rendering Markdown elements
const MarkdownComponents: Components = {
  h1: ({ node, ...props }) => <h1 className="mb-2 select-text text-xl font-medium" {...props} />,
  h2: ({ node, ...props }) => <h2 className="mb-2 select-text text-lg font-medium" {...props} />,
  h3: ({ node, ...props }) => <h3 className="mb-2 select-text text-lg font-medium" {...props} />,
  p: ({ node, ...props }) => <p className="text-md mb-4 select-text leading-relaxed" {...props} />,
  ul: ({ node, ...props }) => (
    <ul className="text-md mb-4 ml-5 select-text list-disc space-y-1" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="text-md mb-4 ml-5 select-text list-decimal space-y-1" {...props} />
  ),
  strong: ({ node, ...props }) => <strong className="font-medium" {...props} />,
  li: ({ node, ...props }) => <li className="select-text leading-relaxed" {...props} />,
  a: ({ href, children, ...props }) => (
    <a
      href={href}
      className="select-text text-accent hover:underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  code: ({ node, className, children, ...props }) => (
    <code className="select-text rounded bg-primary/10 p-1 text-sm" {...props}>
      {children}
    </code>
  ),
  blockquote: ({ node, children, ...props }) => (
    <blockquote className="border-l-4 border-gray-200 pl-4 italic dark:border-gray-700" {...props}>
      {children}
    </blockquote>
  ),
  hr: ({ node, ...props }) => (
    <hr className="my-6 select-text border-gray-200 dark:border-gray-700" {...props} />
  ),
  img: ({ src, alt }) => <ImageComponent src={src || ''} alt={alt} />
};

// Interface for special content elements
interface ContentElement {
  index: number;
  [key: string]: any;
}

// Parse and render the content with custom components for fold sections and videos
const RenderContent: FC<{ content: string }> = ({ content }) => {
  // Extract foldable sections
  const extractFoldables = (text: string) => {
    const foldPattern = /:::fold\s+(.*?)\n([\s\S]*?):::/g;
    const sections: { title: string; content: string; index: number }[] = [];
    let lastIndex = 0;
    let match;

    // Find all fold sections
    while ((match = foldPattern.exec(text)) !== null) {
      sections.push({
        title: match[1],
        content: match[2].trim(),
        index: match.index
      });
      lastIndex = match.index + match[0].length;
    }

    return { sections, lastIndex };
  };

  // Extract video embeds
  const extractVideos = (text: string) => {
    const videoPattern = /@video\[(.*?)\](?:{(.*?)})?/g;
    const videos: { src: string; caption?: string; index: number }[] = [];
    let lastIndex = 0;
    let match;

    // Find all videos
    while ((match = videoPattern.exec(text)) !== null) {
      videos.push({
        src: match[1],
        caption: match[2],
        index: match.index
      });
      lastIndex = match.index + match[0].length;
    }

    return { videos, lastIndex };
  };

  // Process the content to replace special syntax with components
  const processContent = () => {
    const result: ReactNode[] = [];
    const currentText = content;
    let currentIndex = 0;

    // First, handle foldable sections
    const { sections: foldSections } = extractFoldables(currentText);

    // Then, handle videos
    const { videos } = extractVideos(currentText);

    // Combine and sort by index
    const allSpecial = [...foldSections, ...videos].sort((a, b) => a.index - b.index);

    // Process each special element
    allSpecial.forEach((item: ContentElement, idx) => {
      // Add text before this element
      if (item.index > currentIndex) {
        const textBefore = currentText.substring(currentIndex, item.index);
        if (textBefore.trim()) {
          result.push(
            <Markdown
              key={`text-${idx}`}
              components={MarkdownComponents}
              rehypePlugins={[rehypeRaw]}
              remarkPlugins={[remarkGfm]}
            >
              {textBefore}
            </Markdown>
          );
        }
      }

      // Add the special element
      if ('title' in item) {
        // It's a foldable section
        result.push(
          <FoldableSection key={`fold-${idx}`} title={item.title}>
            {renderContentWithBadges(item.content, item.title.toLowerCase())}
          </FoldableSection>
        );

        // Update current position - find the end of this fold section
        const pattern = new RegExp(
          `:::fold\\s+${item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[\\s\\S]*?:::`
        );
        const match = pattern.exec(currentText);
        if (match) {
          currentIndex = match.index + match[0].length;
        }
      } else if ('src' in item) {
        // It's a video
        result.push(<VideoComponent key={`video-${idx}`} src={item.src} caption={item.caption} />);

        // Update current position - find the end of this video embed
        const pattern = new RegExp(
          `@video\\[${item.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\](?:{.*?})?`
        );
        const match = pattern.exec(currentText);
        if (match) {
          currentIndex = match.index + match[0].length;
        }
      }
    });

    // Add any remaining text
    if (currentIndex < currentText.length) {
      const remainingText = currentText.substring(currentIndex);
      if (remainingText.trim()) {
        result.push(
          <Markdown
            key="text-final"
            className={'no-drag select-text'}
            components={MarkdownComponents}
            rehypePlugins={[rehypeRaw]}
            remarkPlugins={[remarkGfm]}
          >
            {remainingText}
          </Markdown>
        );
      }
    }

    return result;
  };

  // Helper to render content with badges for list items
  const renderContentWithBadges = (content: string, sectionTitle: string) => {
    // Replace list items with badged versions
    const lines = content.split('\n');
    const processedLines = lines.map((line) => {
      // Check if line starts with "- " indicating a list item
      if (line.trim().startsWith('- ')) {
        // Look for a category label pattern: "- Category Text"
        // We'll use a regex that captures the category at the beginning of a list item
        const listItemMatch = line.trim().match(/^- (.*?):(.*)/);
        const categoryWordMatch = line.trim().match(/^- ([A-Za-z\s]+)(.*)$/);

        if (listItemMatch) {
          // Format: "- Category: Content"
          const [, category, text] = listItemMatch;
          return (
            <div key={line} className="flex items-start gap-2 py-1.5">
              <span className="mr-2">•</span>
              <span>
                <Badge category={category}>{category}</Badge>
                {text}
              </span>
            </div>
          );
        } else if (categoryWordMatch) {
          // Try to extract a category and content
          // This handles cases like "- Comments Fixed a bug..."
          const fullText = categoryWordMatch[0].substring(2); // Remove the "- "

          // Find the first space after a word (looking for the category)
          const firstSpaceIndex = fullText.search(/\s/);
          if (firstSpaceIndex > 0) {
            const category = fullText.substring(0, firstSpaceIndex);
            const remainingText = fullText.substring(firstSpaceIndex);

            return (
              <div key={line} className="flex py-1.5">
                <span className="text-sm">
                  <Badge category={category}>{category}</Badge>
                  {remainingText}
                </span>
              </div>
            );
          }
        }
      }

      // For non-list items or list items that don't match our pattern, pass to Markdown
      return line;
    });

    // Return processed content
    return (
      <div>
        {processedLines.map((line, index) =>
          typeof line === 'string' ? (
            <Markdown
              key={`line-${index}`}
              components={MarkdownComponents}
              rehypePlugins={[rehypeRaw]}
              remarkPlugins={[remarkGfm]}
            >
              {line}
            </Markdown>
          ) : (
            line
          )
        )}
      </div>
    );
  };

  return <>{processContent()}</>;
};

const ReleaseNoteDialog: FC<ReleaseNoteDialogProps> = ({
  children,
  open,
  onOpenChange,
  releaseNote: propReleaseNote
}) => {
  const { t } = useTranslation();
  const { activateTour, setActivateTour } = useGlobalAtom();
  const {
    markModalAsSeen,
    currentReleaseNote: atomReleaseNote,
    setCurrentReleaseNote,
    releaseNotes
  } = useReleaseNotesAtom();
  const { closeDialog } = useDialogs();

  // Use the prop release note if provided, otherwise fall back to the one from the atom
  const releaseNote = propReleaseNote || atomReleaseNote;

  // Determine current note index
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  useEffect(() => {
    if (releaseNote && releaseNotes.length > 0) {
      // Find current note index
      const index = releaseNotes.findIndex((note) => note.uid === releaseNote.uid);
      setCurrentIndex(index);
    }
  }, [releaseNote, releaseNotes]);

  useEffect(() => {
    if (releaseNote) {
      markModalAsSeen();
    }
  }, [releaseNote?.uid, markModalAsSeen]);

  if (!releaseNote) return null;

  const content = releaseNote.content || '';

  // Check if we have previous or next notes
  const hasPreviousNote = currentIndex < releaseNotes.length - 1;
  const hasNextNote = currentIndex > 0;

  // Handle navigation within the component
  const handlePreviousNote = () => {
    if (hasPreviousNote && currentIndex >= 0) {
      // Show previous note (older note, so higher index)
      const prevNote = releaseNotes[currentIndex + 1];
      setCurrentReleaseNote(prevNote);
    }
  };

  const handleNextNote = () => {
    if (hasNextNote && currentIndex > 0) {
      // Show next note (newer note, so lower index)
      const nextNote = releaseNotes[currentIndex - 1];

      // Update the current release note
      if (atomReleaseNote && nextNote) {
        setCurrentReleaseNote(nextNote);
      }
    } else if (currentIndex === 0) {
      // If we're at the newest note and "next" is clicked, close the dialog
      onOpenChange(false);
      closeDialog('releaseNote');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent
          closeButton={false}
          aria-description=""
          className="gap-0 overflow-hidden border-none p-0 dark:border sm:max-w-[640px]"
        >
          <div className="flex items-center justify-between border-b p-2 shadow-sm">
            <div className="flex items-center">
              <h3 className="ml-2 text-sm text-muted-foreground">
                {dayjs(releaseNote.date).format('MMMM DD')}
              </h3>
            </div>
            <div className="flex items-center">
              {hasPreviousNote && (
                <Button variant={'ghost'} sizeVariant={'sm'} onClick={handlePreviousNote}>
                  <MonoIcon type={'ArrowLeft'} className="mr-1 mt-1" /> Previous
                </Button>
              )}
              {hasNextNote && (
                <Button variant={'ghost'} sizeVariant={'sm'} onClick={handleNextNote}>
                  Next <MonoIcon type={'ArrowRight'} className="ml-1 mt-1" />
                </Button>
              )}
              <Button variant={'ghost'} sizeVariant={'sm'} asChild>
                <a
                  href={`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/changelog`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Changelog <MonoIcon type={'ExternalLink'} className="ml-1 mt-1" />
                </a>
              </Button>
            </div>
          </div>
          <div className="space-y-0">
            <ScrollArea viewportClassName="max-h-[80vh] p-6">
              <div>
                <div className="space-y-4">
                  <h1 className="text-xl font-medium">Release note v{releaseNote.version}</h1>
                  <div className="markdown-content text-left">
                    <RenderContent content={content} />
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default ReleaseNoteDialog;
