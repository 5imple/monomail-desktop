import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { Separator } from '@/renderer/app/components/ui/separator';
import { AI_FILTER_TEMPLATES } from '@/renderer/app/containers/onboarding/aiFilterExamples';
import { cn } from '@/renderer/app/lib/utils';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface FilterExamplesDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: any) => void;
}

// Icon mapping for categories
const categoryIcons: Record<string, MonoIconType> = {
  work: 'Briefcase',
  personal: 'UserIcon',
  development: 'CodeBracket',
  finance: 'Banknotes',
  learning: 'AcademicCap',
  designer: 'PaintBrush',
  marketing: 'Megaphone',
  admin: 'Cog',
  newsletters: 'Envelope'
};

// Icon mapping for individual filters
const filterIcons: Record<string, MonoIconType> = {
  // Work
  'needs-reply': 'Envelope',
  'cold-outreach': 'Envelope',
  meetings: 'Calendar',
  'team-updates': 'UserGroup',

  // Personal
  promotions: 'Star',
  transactional: 'FileText',
  newsletters: 'Envelope',
  'family-friends': 'Heart',

  // Development
  'code-reviews': 'Terminal',
  deployments: 'Rocket',
  'security-alerts': 'Bell',
  'tech-newsletters': 'Terminal',

  // Finance
  'account-alerts': 'Bell',
  'investment-updates': 'Banknotes',
  statements: 'FileText',
  crypto: 'Banknotes',

  // Learning
  assignments: 'List',
  'course-updates': 'Book',
  grades: 'Trophy',
  'learning-resources': 'Book',

  // Designer
  'design-updates': 'PaintBrush',
  'design-review': 'LightBulb',
  'asset-requests': 'Folder',
  'client-feedback': 'Bell',

  // Marketing
  'newsletter-feedback': 'Bell',
  'campaign-performance': 'Megaphone',
  'launch-replies': 'Send',
  'vendor-pitches': 'UserGroup',

  // Admin
  'tool-invoices': 'FileText',
  'policy-updates': 'FileText',
  'access-requests': 'Cog',
  'hr-notices': 'UserGroup',

  // Newsletters
  digest: 'Bell',
  'blog-updates': 'Book',
  'saved-articles': 'Book',
  'feature-article': 'FileText'
};

const FilterExamplesDialog: React.FC<FilterExamplesDialogProps> = ({
  children,
  open,
  onOpenChange,
  onSelectTemplate
}) => {
  const { t } = useTranslation();

  const categories = {
    work: 'Work',
    personal: 'Personal',
    development: 'Development',
    finance: 'Finance',
    learning: 'Learning',
    designer: 'Designer',
    marketing: 'Marketing',
    admin: 'Admin',
    newsletters: 'Newsletters'
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent closeButton={false} className="overflow-hidden p-6 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="">{t('filter.examples.title', 'Filter Templates')}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="h-[70vh]">
            <div className="mx-auto grid max-w-2xl grid-cols-1 gap-12 pb-4">
              {Object.entries(categories).map(([categoryKey, categoryLabel]) => {
                const templates = AI_FILTER_TEMPLATES[categoryKey];

                if (!templates || templates.length === 0) {
                  return null;
                }

                return (
                  <div key={categoryKey} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <MonoIcon
                        type={categoryIcons[categoryKey]}
                        className="h-5 w-5 text-foreground/60"
                      />
                      <h2 className="font-medium text-foreground">{categoryLabel}</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          onClick={() => {
                            onSelectTemplate(template);
                            onOpenChange(false);
                          }}
                          className="flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-all duration-300 hover:border-primary/50 hover:shadow-md"
                        >
                          <div className="p-4">
                            <div className="mb-1 flex items-center gap-2">
                              <div
                                className="flex h-6 w-6 items-center justify-center rounded-sm"
                                style={{
                                  backgroundColor: template.color.background,
                                  color: template.color.text
                                }}
                              >
                                <MonoIcon
                                  type={filterIcons[template.id] || 'Filter'}
                                  className="h-4 w-4"
                                />
                              </div>
                              <h3 className="text-sm font-medium">{template.name}</h3>
                            </div>
                            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                              {template.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* <Separator /> */}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default FilterExamplesDialog;
