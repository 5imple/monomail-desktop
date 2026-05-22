import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/renderer/app/lib/utils';

// Define the ref interface
export interface DirectHTMLEditorRef {
  setContent: (content: string) => void;
  focus: () => void;
  isEmpty: () => boolean;
  getHTML: () => string;
}

interface DirectHTMLEditorProps {
  className?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * DirectHTMLSignatureEditor - A component that preserves exact HTML layout
 * This editor uses contentEditable directly instead of a rich text editor library
 * to maintain the exact layout of pasted HTML signatures
 */
const DirectHTMLSignatureEditor = forwardRef<DirectHTMLEditorRef, DirectHTMLEditorProps>(
  ({ className, value, onChange, placeholder }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [initialized, setInitialized] = useState(false);
    const [isEmpty, setIsEmpty] = useState(!value);

    // Add CSS styles to head for email client compatibility
    useEffect(() => {
      const style = document.createElement('style');
      style.textContent = `
        /* Ensure empty editor shows placeholder */
        .mono-signature:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          display: block;
        }
        
        /* Ensure images display properly */
        .mono-signature img {
          max-width: 100%;
          height: auto;
          display: inline-block;
        }
        
        /* Style links with accent color and underline */
        .mono-signature a {
          color: hsl(var(--accent));
          text-decoration: underline;
        }

        /* Preserve Outlook-specific formatting */
        [data-outlook-element='true'] {
          /* Outlook uses MSO- prefixed styles, we'll keep them intact */
        }

        /* Preserve Gmail-specific formatting */
        [data-gmail-element='true'] {
          /* Gmail uses specific classes, we'll keep them intact */
        }

        /* Preserve Apple Mail-specific formatting */
        [data-apple-mail-element='true'] {
          /* Apple Mail uses specific classes, we'll keep them intact */
        }

        /* Preserve font size and family */
        .mono-signature [style*='font-size'],
        .mono-signature [style*='font-family'] {
          /* Keep original font styling */
        }

        /* Preserve exact spacing */
        .mono-signature [data-preserve-linebreak='true'] {
          display: block !important;
        }

        .mono-signature [data-preserve-block='true'] {
          display: block !important;
        }

        .mono-signature [data-preserve-para='true'] {
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }
        
        /* Preserve signature tables */
        .signature-preserved-table {
          border-collapse: separate !important;
          border-spacing: 0 !important;
        }
        
        /* Preserve signature elements */
        .signature-preserved-element {
          margin: 0 !important;
        }
      `;
      document.head.appendChild(style);

      return () => {
        document.head.removeChild(style);
      };
    }, []);

    // Initialize content when the component mounts
    useEffect(() => {
      if (editorRef.current && !initialized) {
        if (value) {
          editorRef.current.innerHTML = sanitizeHTML(value);
          setIsEmpty(false);
        } else {
          setIsEmpty(true);
        }
        setInitialized(true);
      }
    }, [value, initialized]);

    // Update content when value prop changes
    useEffect(() => {
      if (editorRef.current && initialized) {
        const currentHTML = editorRef.current.innerHTML;
        if (value !== currentHTML) {
          editorRef.current.innerHTML = sanitizeHTML(value);
          setIsEmpty(!value);
        }
      }
    }, [value, initialized]);

    // Check if content is empty
    const checkIfEmpty = (html: string): boolean => {
      // Create a temp div to check if the HTML is effectively empty
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;

      // Consider empty if it contains only whitespace, breaks, or empty paragraphs
      const text = tempDiv.textContent || tempDiv.innerText || '';
      const hasText = text.trim().length > 0;

      // Check if there are any images or tables
      const hasImages = tempDiv.querySelectorAll('img').length > 0;
      const hasTables = tempDiv.querySelectorAll('table').length > 0;

      return !hasText && !hasImages && !hasTables;
    };

    const sanitizeHTML = (html: string): string =>
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'b',
          'i',
          'em',
          'strong',
          'u',
          's',
          'p',
          'br',
          'span',
          'div',
          'a',
          'img',
          'table',
          'tbody',
          'tr',
          'td',
          'th',
          'thead',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'ul',
          'ol',
          'li',
          'blockquote',
          'font',
          'hr'
        ],
        ALLOWED_ATTR: [
          'href',
          'target',
          'rel',
          'src',
          'alt',
          'width',
          'height',
          'style',
          'class',
          'align',
          'border',
          'cellpadding',
          'cellspacing',
          'colspan',
          'rowspan',
          'bgcolor',
          'color',
          'face',
          'size',
          'title'
        ],
        ALLOW_DATA_ATTR: false,
        ALLOW_UNKNOWN_PROTOCOLS: false
      });

    // Check if a string is a valid URL
    const isValidURL = (text: string): boolean => {
      try {
        // Simple check for URL pattern
        const urlPattern =
          /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\\+.~#?&//=]*)$/;
        return urlPattern.test(text.trim());
      } catch (e) {
        return false;
      }
    };

    // Create hyperlink from selected text and URL
    const createHyperlink = (selectedText: string, url: string): string => {
      // Ensure URL has a protocol
      let formattedURL = url.trim();
      if (!formattedURL.startsWith('http://') && !formattedURL.startsWith('https://')) {
        formattedURL = 'https://' + formattedURL;
      }

      // Create an anchor tag with the URL and selected text
      // Style is applied via CSS in the useEffect above
      return `<a href="${formattedURL}" target="_blank" rel="noopener noreferrer">${selectedText}</a>`;
    };

    // Handle input changes
    const handleInput = () => {
      if (editorRef.current) {
        const content = editorRef.current.innerHTML;
        setIsEmpty(checkIfEmpty(content));
        onChange(content);
      }
    };

    // Handle paste event
    const handlePaste = (event: React.ClipboardEvent) => {
      event.preventDefault();

      // Get the clipboard data
      const html = event.clipboardData.getData('text/html');
      const text = event.clipboardData.getData('text');

      // Get the current selection
      const selection = window.getSelection();

      // Check if we have a selection and pasted content is a URL
      if (selection && !selection.isCollapsed && text && isValidURL(text)) {
        // Get the selected text
        const selectedText = selection.toString();

        // Create a hyperlink with the selected text and pasted URL
        const hyperlink = sanitizeHTML(createHyperlink(selectedText, text));

        // Insert the hyperlink at the current selection
        document.execCommand('insertHTML', false, hyperlink);
      } else if (html) {
        // Process the HTML to ensure it's safe and preserves formatting
        const processedHTML = sanitizeHTML(processExternalHTML(html));

        // Insert at the current selection
        document.execCommand('insertHTML', false, processedHTML);
      } else if (text) {
        // Insert plain text
        document.execCommand('insertText', false, text);
      }

      // Trigger the change handler
      handleInput();
    };

    // Process HTML from external sources (like email clients)
    const processExternalHTML = (html: string): string => {
      // Create a temporary element to process the HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;

      // Remove potentially harmful elements
      const scripts = tempDiv.querySelectorAll('script, iframe, object, embed');
      scripts.forEach((el) => el.remove());

      // Preserve exact table layouts
      const tables = tempDiv.querySelectorAll('table');
      tables.forEach((table) => {
        table.setAttribute('cellspacing', '0');
        table.setAttribute('cellpadding', '0');

        // Add classes to preserve exact layout
        table.classList.add('signature-preserved-table');
      });

      // Detect email client specific elements
      // Outlook elements often have mso- prefixed styles
      const allElements = tempDiv.querySelectorAll('*');
      allElements.forEach((el) => {
        if (el instanceof HTMLElement) {
          // Check for client-specific attributes
          const allAttributes = Array.from(el.attributes);
          const style = el.getAttribute('style') || '';

          // Check for Outlook specific markers
          if (
            style.includes('mso-') ||
            allAttributes.some((attr) => attr.name.startsWith('mso-'))
          ) {
            el.setAttribute('data-outlook-element', 'true');
          }

          // Check for Gmail specific markers (spans with specific IDs or classes)
          if (
            el.classList.contains('gmail_') ||
            el.id.includes('gmail-') ||
            el.getAttribute('data-g')
          ) {
            el.setAttribute('data-gmail-element', 'true');
          }

          // Check for Apple Mail specific markers
          if (
            style.includes('AppleMailWordmark') ||
            style.includes('AppleMailBodyText') ||
            el.classList.contains('ApplePlainTextBody')
          ) {
            el.setAttribute('data-apple-mail-element', 'true');
          }

          // Preserve block level elements
          if (window.getComputedStyle(el).display === 'block') {
            el.setAttribute('data-preserve-block', 'true');
          }

          // Preserve line breaks
          if (el.tagName === 'BR') {
            el.setAttribute('data-preserve-linebreak', 'true');
          }

          // Preserve paragraphs
          if (el.tagName === 'P') {
            el.setAttribute('data-preserve-para', 'true');
          }

          // Add preservation class to all elements
          el.classList.add('signature-preserved-element');
        }
      });

      // Convert obsolete or email-client specific tags to standard HTML
      const obsoleteTags = tempDiv.querySelectorAll('font');
      obsoleteTags.forEach((tag) => {
        if (tag instanceof HTMLElement) {
          const span = document.createElement('span');

          // Transfer style attributes
          const color = tag.getAttribute('color');
          const face = tag.getAttribute('face');
          const size = tag.getAttribute('size');

          if (color) span.style.color = color;
          if (face) span.style.fontFamily = face;
          if (size) {
            // Convert font size to pixels (approximate)
            const sizeMap: Record<string, string> = {
              '1': '10px',
              '2': '12px',
              '3': '14px',
              '4': '16px',
              '5': '18px',
              '6': '24px',
              '7': '32px'
            };
            span.style.fontSize = sizeMap[size] || '14px';
          }

          // Transfer the content
          span.innerHTML = tag.innerHTML;

          // Replace the original tag
          if (tag.parentNode) {
            tag.parentNode.replaceChild(span, tag);
          }
        }
      });

      return sanitizeHTML(tempDiv.innerHTML);
    };

    // Handle focus to show/hide placeholder
    const handleFocus = () => {
      // No additional placeholder handling needed now that we use CSS
    };

    const handleBlur = () => {
      if (editorRef.current) {
        const content = editorRef.current.innerHTML.trim();
        setIsEmpty(checkIfEmpty(content));
      }
    };

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      setContent: (content: string) => {
        if (editorRef.current) {
          editorRef.current.innerHTML = sanitizeHTML(content);
          setIsEmpty(checkIfEmpty(content));
          handleInput();
        }
      },
      focus: () => {
        if (editorRef.current) {
          editorRef.current.focus();

          // Move cursor to the end
          const range = document.createRange();
          const selection = window.getSelection();
          range.selectNodeContents(editorRef.current);
          range.collapse(false); // Collapse to the end
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      },
      isEmpty: () => {
        if (editorRef.current) {
          return checkIfEmpty(editorRef.current.innerHTML);
        }
        return true;
      },
      getHTML: () => {
        if (editorRef.current) {
          return editorRef.current.innerHTML;
        }
        return '';
      }
    }));

    return (
      <div className="mono-signature-container">
        <div
          ref={editorRef}
          className={cn(
            'mono-signature',
            'min-h-[200px] p-3 text-sm outline-none',
            'rounded-md border-0',
            isEmpty ? 'empty-signature' : '',
            className
          )}
          contentEditable={true}
          onInput={handleInput}
          onPaste={handlePaste}
          onFocus={handleFocus}
          onBlur={handleBlur}
          data-placeholder={
            placeholder || 'Type your signature here or paste from another application...'
          }
        />
      </div>
    );
  }
);

DirectHTMLSignatureEditor.displayName = 'DirectHTMLSignatureEditor';
export default DirectHTMLSignatureEditor;
