import authApi from '@/main/api/auth/authApi';
import { Button } from '@/renderer/app/components/ui/button';
import { Input } from '@/renderer/app/components/ui/input';
import { Label } from '@/renderer/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/renderer/app/components/ui/select';
import { Separator } from '@/renderer/app/components/ui/separator';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { animated, useTrail } from '@react-spring/web';
import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

const roleOptions = [
  'Student',
  'Marketing Manager',
  'Product Manager',
  'Sales Representative',
  'Consultant',
  'Investor',
  'Researcher',
  'Professor',
  'Software Engineer',
  'Designer (UX/UI, Graphic, etc.)',
  'Startup Founder',
  'Executive / C-Level',
  'Freelancer / Independent',
  'Writer / Journalist',
  'Other'
];

const emailUsageOptions = [
  'Personal Use',
  'Business / Work',
  'Freelance',
  'Newsletter & Subscriptions',
  'Sales & Outreach',
  'Other'
];

const discoveryOptions = [
  'Friend / Colleague',
  'Social Media (Twitter, LinkedIn, etc.)',
  'Blog / Article',
  'Ad (Google, Facebook, etc.)',
  'Product Hunt',
  'Search Engine (Google, Bing, etc.)',
  'Other'
];

const OnBoardingDemographic: FC<{ onContinue: () => void }> = ({ onContinue }) => {
  const { updatePreference, preference } = useAuth();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [customRole, setCustomRole] = useState('');
  const [selectedEmailUsage, setSelectedEmailUsage] = useState<string | null>(null);
  const [customEmailUsage, setCustomEmailUsage] = useState('');
  const [selectedDiscoverySource, setSelectedDiscoverySource] = useState<string | null>(null);
  const [customDiscoverySource, setCustomDiscoverySource] = useState('');
  const { t } = useTranslation();

  const elements = [
    t('onboarding.demographic.title'),
    t('onboarding.demographic.description'),
    t('onboarding.demographic.button')
  ];

  const trail = useTrail(elements.length, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 400
  });

  return (
    <div className="text-center">
      {trail.map((style, index) => {
        if (index === 0) {
          return (
            <animated.h1 key="title" style={style} className="text-2xl font-semibold">
              {elements[index]}
            </animated.h1>
          );
        }
        if (index === 1) {
          return (
            <animated.p key="description" style={style} className="mb-6 text-xl">
              {elements[index]}
            </animated.p>
          );
        }
        return null;
      })}

      {/* Form Card */}
      <animated.div style={trail[2]} className="mt-4">
        <div className="rounded-md pb-6 text-start transition-all">
          {/* Role Selection */}
          <div className="mb-3">
            <Label>{t('onboarding.demographic.role')}</Label>
            <Select defaultValue={selectedRole || undefined} onValueChange={setSelectedRole}>
              <SelectTrigger variant={'secondary'} className="">
                <SelectValue placeholder={t('onboarding.demographic.role_placeholder')} />
              </SelectTrigger>
              <SelectContent className="dark">
                <SelectGroup>
                  {roleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {selectedRole === 'Other' && (
              <div className="mt-2">
                <Input
                  placeholder={t('onboarding.demographic.role_custom_placeholder')}
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  className=""
                />
                <Separator className="my-3" />
              </div>
            )}
          </div>

          {/* Email Usage Selection */}
          <div className="mb-3">
            <Label>{t('onboarding.demographic.email_usage')}</Label>
            <Select
              defaultValue={selectedEmailUsage || undefined}
              onValueChange={setSelectedEmailUsage}
            >
              <SelectTrigger variant={'secondary'} className="">
                <SelectValue placeholder={t('onboarding.demographic.email_usage_placeholder')} />
              </SelectTrigger>
              <SelectContent className="dark">
                <SelectGroup>
                  {emailUsageOptions.map((usage) => (
                    <SelectItem key={usage} value={usage}>
                      {usage}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {selectedEmailUsage === 'Other' && (
              <div className="mt-2">
                <Input
                  placeholder={t('onboarding.demographic.email_usage_custom_placeholder')}
                  value={customEmailUsage}
                  onChange={(e) => setCustomEmailUsage(e.target.value)}
                />
                <Separator className="my-3" />
              </div>
            )}
          </div>

          {/* Discovery Source Selection */}
          <div className="mb-3">
            <Label>{t('onboarding.demographic.discovery')}</Label>
            <Select
              defaultValue={selectedDiscoverySource || undefined}
              onValueChange={setSelectedDiscoverySource}
            >
              <SelectTrigger variant={'secondary'} className="">
                <SelectValue placeholder={t('onboarding.demographic.discovery_placeholder')} />
              </SelectTrigger>
              <SelectContent className="dark">
                <SelectGroup>
                  {discoveryOptions.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {selectedDiscoverySource === 'Other' && (
              <div className="mt-2">
                <Input
                  placeholder={t('onboarding.demographic.discovery_custom_placeholder')}
                  value={customDiscoverySource}
                  onChange={(e) => setCustomDiscoverySource(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      </animated.div>

      {/* Continue Button */}
      <animated.div style={trail[2]} className="mt-6 flex justify-center">
        <Button
          sizeVariant={'xl'}
          onClick={async () => {
            try {
              authApi.updateUserDemographics({
                role: selectedRole === 'Other' ? customRole : selectedRole!,
                emailUsage: selectedEmailUsage === 'Other' ? customEmailUsage : selectedEmailUsage!,
                discoverySource:
                  selectedDiscoverySource === 'Other'
                    ? customDiscoverySource
                    : selectedDiscoverySource!
              });

              onContinue();
            } catch (error) {
              console.error('Failed to update user demographics:', error);
            }
          }}
          disabled={
            !selectedRole ||
            (!customRole && selectedRole === 'Other') ||
            !selectedEmailUsage ||
            (!customEmailUsage && selectedEmailUsage === 'Other') ||
            !selectedDiscoverySource ||
            (!customDiscoverySource && selectedDiscoverySource === 'Other')
          }
        >
          {elements[2]}
        </Button>
      </animated.div>
    </div>
  );
};

export default OnBoardingDemographic;
