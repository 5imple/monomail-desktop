import MonoIcon from '@/renderer/app/components/icons/icons';
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const FilterTemplateCarousel = ({ onSelectTemplate }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const carouselRef = useRef(null);
  const { t } = useTranslation();

  const templates = [
    {
      id: 'needs-reply',
      title: t('filter.templates.needs_reply.title', 'Needs Reply'),
      description: t(
        'filter.templates.needs_reply.description',
        'Apply this filter ONLY to emails requiring my direct personal response.'
      ),
      content: t(
        'filter.templates.needs_reply.content',
        `Match if ALL are true:
- Email is from a real person (not automated)
- Contains a clear request, question, opinion, or decision prompt
- Explicitly requires your personal response

Examples to Match:
- “Can you confirm availability?”
- “Do you have any thoughts on this?”
- “Please review and reply”
- “Let me know how you'd like to proceed.”

Do NOT match if:
- Newsletter, notification, or promotional message
- Does not need your reply
- It’s informational only, with no action or reply expected
`
      )
    },
    {
      id: 'newsletter',
      title: t('filter.templates.newsletter.title', 'Newsletter'),
      description: t(
        'filter.templates.newsletter.description',
        'Apply this filter to regular newsletters, digests, and subscription-based content.'
      ),
      content: t(
        'filter.templates.newsletter.content',
        `Match if ALL are true:
- The email is part of a recurring publication or subscription
- Its primary purpose is informational, with no required action or reply
- Content typically includes blog posts, news digests, or community updates

Examples to Match:
- Weekly tech roundups
- “Top stories this week”
- Company blog updates

Do NOT match if:
- The email includes marketing, promotions, or ads
- one-time announcement outside a regular series
- It asks for replies, decisions, or user actions
`
      )
    },
    {
      id: 'transactional',
      title: t('filter.templates.transactional.title', 'Transactional'),
      description: t(
        'filter.templates.transactional.description',
        'Apply this filter to purchase confirmations, invoices, and transaction records.'
      ),
      content: t(
        'filter.templates.transactional.content',
        `Match if ALL are true:
- The email contains a purchase confirmation, invoice, or payment receipt
- It mentions order numbers, billing, or transaction-specific details

Examples to match:
- “Your order #12345 has shipped”
- “Invoice attached”
- “Payment received”

Do NOT match if:
- The email is promotional, includes discounts, or suggests future purchases
-  It relates to cart abandonment or product recommendations without confirming a completed transaction
`
      )
    },
    {
      id: 'to-do',
      title: t('filter.templates.to_do.title', 'To Do'),
      description: t(
        'filter.templates.to_do.description',
        'Apply this filter to emails containing specific tasks for me to complete.'
      ),
      content: t(
        'filter.templates.to_do.content',
        `Match if ALL are true:
- The email includes a clear, actionable task or assignment directed at you
- The action is time-sensitive or clearly within your area of responsibility

Examples to Match:
- “Please review the document by Tuesday”
- “Add your availability to the calendar”
- “Assign the project lead”

Do NOT match if:
- The email is purely informational or FYI-only
- General or promotional, with no specific task for you
- There is no actionable request requiring your attention
`
      )
    },
    {
      id: 'fyi',
      title: t('filter.templates.fyi.title', 'FYI'),
      description: t(
        'filter.templates.fyi.description',
        'Apply this filter ONLY to purely informational emails requiring NO action.'
      ),
      content: t(
        'filter.templates.fyi.content',
        `Match if ALL are true:
- The email is purely informational
- It contains no direct or implied questions, decisions, or requests
- No reply, input, or action is expected from the recipient

Examples to Match:
- Just sharing this update.
- For your reference only.
- Project or status updates with no next steps or action items

Do NOT match if:
- The email asks for your input, decision, or confirmation
- It suggests, implies, or requests any action or follow-up
`
      )
    },
    {
      id: 'promotion',
      title: t('filter.templates.promotion.title', 'Promotion'),
      description: t(
        'filter.templates.promotion.description',
        'Apply this filter to commercial or promotional content.'
      ),
      content: t(
        'filter.templates.promotion.content',
        `Match if ALL are true:
- The email’s main purpose is to sell, promote, or pitch a product, service, or opportunity
- Contains offers, discounts, or recruitment language
- May include phrases like “Limited time”, “Try now”, “Join us”

Examples to Match:
- Cold outreach from sales or marketing
- Unsolicited invitations to events, products, or services
- Recruiting emails or offers for free trials

Do NOT match if:
- Already agreed-upon correspondence
- There is no sales or promotional intent`
      )
    }
  ];

  const goToSlide = (index) => {
    if (isAnimating) return;

    setIsAnimating(true);
    setActiveIndex(index);

    // Reset animation flag after transition completes
    setTimeout(() => {
      setIsAnimating(false);
    }, 300);
  };

  const goToNext = () => {
    const newIndex = (activeIndex + 1) % templates.length;
    goToSlide(newIndex);
  };

  const goToPrev = () => {
    const newIndex = (activeIndex - 1 + templates.length) % templates.length;
    goToSlide(newIndex);
  };

  const handleTemplateClick = (template) => {
    if (onSelectTemplate) {
      onSelectTemplate(template);
    }
  };

  const showLeftButton = activeIndex > 0;
  const showRightButton = activeIndex < 1;

  return (
    <div className="-mx-12">
      <div className="relative overflow-hidden">
        {/* Left fade gradient mask */}
        <div className="absolute left-0 top-0 z-10 h-full w-12 bg-gradient-to-r from-background to-transparent"></div>
        {/* Right fade gradient mask */}
        <div className="absolute right-0 top-0 z-10 h-full w-12 bg-gradient-to-l from-background to-transparent"></div>

        {/* Navigation arrows */}

        {showLeftButton && (
          <button
            onClick={goToPrev}
            className="absolute left-12 top-1/2 z-20 -translate-y-1/2 rounded-md border bg-card p-1 shadow-md"
            aria-label={t('common.previous', 'Previous template')}
          >
            <MonoIcon
              type={'ChevronLeft'}
              className="text-muted-foreground transition-colors hover:text-foreground"
            />
          </button>
        )}

        {showRightButton && (
          <button
            onClick={goToNext}
            className="absolute right-12 top-1/2 z-20 -translate-y-1/2 rounded-md border bg-card p-1 shadow-md"
            aria-label={t('common.next', 'Next template')}
          >
            <MonoIcon
              type={'ChevronRight'}
              className="text-muted-foreground transition-colors hover:text-foreground"
            />
          </button>
        )}
        {/* Carousel container */}
        <div
          ref={carouselRef}
          className="flex gap-3 px-12 py-3 transition-transform duration-300 ease-in-out"
          style={{
            transform: `translateX(calc(-${activeIndex * 38}rem))`
          }}
        >
          {templates.map((template, index) => (
            <div
              key={template.id}
              className="flex min-w-fit flex-col items-center transition-opacity duration-300"
              onClick={() => handleTemplateClick(template)}
            >
              <div
                className={
                  'flex w-fit max-w-60 cursor-pointer flex-col overflow-hidden rounded-lg border shadow-sm transition-all duration-300 hover:shadow-md'
                }
              >
                <div className="p-4">
                  <h3 className="text-sm font-medium">{template.title}</h3>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {template.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FilterTemplateCarousel;
