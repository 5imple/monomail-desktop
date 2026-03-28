import { Button } from '@/renderer/app/components/ui/button';
import { Input } from '@/renderer/app/components/ui/input';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { animated, useSpring, useTrail } from '@react-spring/web';
import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/renderer/app/lib/utils';

interface SpaceTemplate {
  id: string;
  name: string;
  description: string;
  icon: MonoIconType;
  color: string;
  examples: string[] | Record<string, any>;
}

interface OnBoardingSpaceTemplatesProps {
  onContinue: (id: string, spaceName: string, spaceIcon: string, spaceColor: string) => void;
  onBack?: () => void;
}

const OnBoardingSpaceTemplates: FC<OnBoardingSpaceTemplatesProps> = ({ onContinue, onBack }) => {
  const { t } = useTranslation();
  const [selectedTemplate, setSelectedTemplate] = useState<SpaceTemplate | null>(null);
  const [customName, setCustomName] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const SPACE_TEMPLATES: SpaceTemplate[] = [
    {
      id: 'work',
      name: t('onboarding.space_templates.templates.work.name'),
      description: t('onboarding.space_templates.templates.work.description'),
      icon: 'Briefcase',
      color: '#035ddf',
      examples: t('onboarding.space_templates.templates.work.examples', {
        returnObjects: true
      }) as string[]
    },
    {
      id: 'personal',
      name: t('onboarding.space_templates.templates.personal.name'),
      description: t('onboarding.space_templates.templates.personal.description'),
      icon: 'Home',
      color: '#22c55e',
      examples: t('onboarding.space_templates.templates.personal.examples', {
        returnObjects: true
      }) as string[]
    },
    {
      id: 'development',
      name: t('onboarding.space_templates.templates.development.name'),
      description: t('onboarding.space_templates.templates.development.description'),
      icon: 'Terminal',
      color: '#6366f1',
      examples: t('onboarding.space_templates.templates.development.examples', {
        returnObjects: true
      }) as string[]
    },
    {
      id: 'learning',
      name: t('onboarding.space_templates.templates.learning.name'),
      description: t('onboarding.space_templates.templates.learning.description'),
      icon: 'AcademicCap',
      color: '#fb923c',
      examples: t('onboarding.space_templates.templates.learning.examples', {
        returnObjects: true
      }) as string[]
    },
    {
      id: 'designer',
      name: t('onboarding.space_templates.templates.designer.name'),
      description: t('onboarding.space_templates.templates.designer.description'),
      icon: 'Sparkles',
      color: '#ec4899',
      examples: t('onboarding.space_templates.templates.designer.examples', {
        returnObjects: true
      }) as string[]
    },
    {
      id: 'marketing',
      name: t('onboarding.space_templates.templates.marketing.name'),
      description: t('onboarding.space_templates.templates.marketing.description'),
      icon: 'Megaphone',
      color: '#facc15',
      examples: t('onboarding.space_templates.templates.marketing.examples', {
        returnObjects: true
      }) as string[]
    },
    {
      id: 'admin',
      name: t('onboarding.space_templates.templates.admin.name'),
      description: t('onboarding.space_templates.templates.admin.description'),
      icon: 'Cog',
      color: '#14b8a6',
      examples: t('onboarding.space_templates.templates.admin.examples', {
        returnObjects: true
      }) as string[]
    },
    {
      id: 'newsletters',
      name: t('onboarding.space_templates.templates.newsletters.name'),
      description: t('onboarding.space_templates.templates.newsletters.description'),
      icon: 'Book',
      color: '#a855f7',
      examples: t('onboarding.space_templates.templates.newsletters.examples', {
        returnObjects: true
      }) as string[]
    }
  ];
  const leftTrail = useTrail(4, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 300
  });

  const templatesSpring = useTrail(SPACE_TEMPLATES.length, {
    from: { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
    to: { opacity: 1, transform: 'translateY(0px) scale(1)' },
    config: { tension: 280, friction: 20 },
    delay: 500
  });

  const customInputSpring = useSpring({
    from: { opacity: 0, transform: 'translateY(10px)' },
    to: {
      opacity: showCustomInput ? 1 : 0,
      transform: showCustomInput ? 'translateY(0px)' : 'translateY(10px)'
    },
    config: { tension: 300, friction: 25 }
  });

  const continueButtonSpring = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: {
      opacity: selectedTemplate && customName.trim() ? 1 : 0,
      transform: selectedTemplate && customName.trim() ? 'translateY(0px)' : 'translateY(20px)'
    },
    config: { tension: 300, friction: 25 }
  });

  const handleTemplateSelect = (template: SpaceTemplate) => {
    setSelectedTemplate(template);
    setCustomName(template.name);
    setShowCustomInput(true);
  };

  const handleSubmit = () => {
    if (selectedTemplate && customName.trim()) {
      onContinue(
        selectedTemplate.id,
        customName.trim(),
        selectedTemplate.icon,
        selectedTemplate.color
      );
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && selectedTemplate && customName.trim()) {
      handleSubmit();
    }
  };

  // Helper function to convert hex to rgba for shadows
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <>
      <div className="mx-auto max-w-7xl p-6">
        <Button
          variant="ghost"
          sizeVariant="sm"
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <MonoIcon type="ChevronLeft" className="h-4 w-4" />
          {t('onboarding.space_templates.back')}
        </Button>
        <div className="flex items-start gap-12">
          {/* Left Side - Content */}
          <div className="flex-1">
            {leftTrail.map((style, index) => {
              if (index === 0) {
                return (
                  <animated.h1
                    key="title"
                    style={style}
                    className="mb-2 text-3xl font-medium leading-tight text-foreground"
                  >
                    {t('onboarding.space_templates.title')}
                  </animated.h1>
                );
              }
              if (index === 1) {
                return (
                  <animated.p
                    key="description"
                    style={style}
                    className="mb-8 text-lg leading-relaxed text-muted-foreground"
                  >
                    {t('onboarding.space_templates.description')}
                  </animated.p>
                );
              }
              if (index === 2) {
                return (
                  <animated.div key="custom-input" style={style} className="mb-8 space-y-4">
                    {showCustomInput && (
                      <animated.div style={customInputSpring} className="space-y-3">
                        <label className="text-sm font-medium">
                          {t('onboarding.space_templates.space_name')}
                        </label>
                        <Input
                          type="text"
                          placeholder={t('onboarding.space_templates.enter_space_name')}
                          sizeVariant={'lg'}
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          onKeyPress={handleKeyPress}
                          className="w-full"
                          autoFocus
                        />
                        {selectedTemplate && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div
                              className="rounded p-1"
                              style={{
                                backgroundColor: `${selectedTemplate.color}20`,
                                color: selectedTemplate.color
                              }}
                            >
                              <MonoIcon type={selectedTemplate.icon} className="h-4 w-4" />
                            </div>
                            <span>
                              {t('onboarding.space_templates.using_template', {
                                name: selectedTemplate.name
                              })}
                            </span>
                          </div>
                        )}

                        {selectedTemplate && (
                          <animated.div
                            style={customInputSpring}
                            className="mt-6 rounded-lg border bg-muted p-4"
                          >
                            <h4 className="mb-2 text-sm font-medium">
                              {t('onboarding.space_templates.what_you_organize')}
                            </h4>
                            <div className="space-y-1">
                              {selectedTemplate.examples.map((example, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-2 text-xs text-muted-foreground"
                                >
                                  <div
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: selectedTemplate.color }}
                                  />
                                  {example}
                                </div>
                              ))}
                            </div>
                          </animated.div>
                        )}
                      </animated.div>
                    )}
                  </animated.div>
                );
              }

              if (index === 3) {
                return (
                  <animated.div key="continue-button" style={style}>
                    <animated.div style={continueButtonSpring}>
                      <Button
                        sizeVariant="xl"
                        onClick={handleSubmit}
                        className="px-8"
                        disabled={!selectedTemplate || !customName.trim()}
                      >
                        {t('onboarding.space_templates.continue')}
                      </Button>
                    </animated.div>
                  </animated.div>
                );
              }
              return null;
            })}
          </div>

          {/* Right Side - Template Selection */}
          <div className="relative flex-1 shrink-0">
            <div className="rounded-lg border bg-background p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="mb-2 text-lg font-medium">
                  {t('onboarding.space_templates.select_template')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('onboarding.space_templates.select_template_description')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {templatesSpring.map((springStyle, templateIndex) => {
                  const template = SPACE_TEMPLATES[templateIndex];
                  const isSelected = selectedTemplate?.id === template.id;

                  return (
                    <animated.div
                      key={template.id}
                      style={springStyle}
                      className={`group relative cursor-pointer`}
                      onClick={() => handleTemplateSelect(template)}
                    >
                      <div
                        className={`rounded-lg border p-4 transition-all duration-200 hover:scale-105`}
                        style={{
                          borderColor: isSelected ? template.color : undefined,
                          backgroundColor: isSelected ? `${template.color}10` : undefined,
                          boxShadow: isSelected
                            ? `0 8px 20px -5px ${hexToRgba(template.color, 0.3)}, 0 3px 6px -2px ${hexToRgba(template.color, 0.15)}`
                            : ''
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = `${template.color}80`;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '';
                          }
                        }}
                      >
                        {/* Icon with colored background */}
                        <div className="mb-3 flex justify-center">
                          <div
                            className="rounded-lg p-2"
                            style={{
                              backgroundColor: `${template.color}20`,
                              color: template.color
                            }}
                          >
                            <MonoIcon type={template.icon} className="h-5 w-5" />
                          </div>
                        </div>
                        {/* Template Info */}
                        <h3 className="mb-1 text-center text-sm font-semibold">{template.name}</h3>
                        <p className="text-center text-xs leading-relaxed text-muted-foreground">
                          {template.description}
                        </p>

                        {/* Selection indicator */}
                        {isSelected && (
                          <div className="absolute -right-2 -top-2">
                            <div
                              className="rounded-full p-1"
                              style={{ backgroundColor: template.color }}
                            >
                              <MonoIcon type="Check" className="h-3 w-3 text-white" />
                            </div>
                          </div>
                        )}
                      </div>
                    </animated.div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OnBoardingSpaceTemplates;
