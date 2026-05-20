import { generateUUID } from '@/main/utils';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Badge } from '@/renderer/app/components/ui/badge';
import { BillingBanner } from '@/renderer/app/components/ui/billing-banner';
import { BillingSwitch } from '@/renderer/app/components/ui/billing-switch';
import { Button, buttonVariants } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/renderer/app/components/ui/select';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import AIFilterEditDialog from '@/renderer/app/containers/dialog/AIFilterEditDialog';
import AIFilterTestDialog from '@/renderer/app/containers/dialog/AIFilterTestDialog';
import FilterExamplesDialog from '@/renderer/app/containers/settings/forms/filter/FilterExamplesDialog';
import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { AIFilter, useAIFilters } from '@/renderer/app/store/filter/useAIFilters';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { TooltipPortal } from '@radix-ui/react-tooltip';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

// Define a type for filter actions
type FilterAction = {
  type: string;
  value?: string;
  enabled: boolean;
};

export const FilterForm = () => {
  const {
    getFiltersForAccount,
    isLoading,
    createAIFilter,
    updateAIFilter,
    removeAIFilter,
    toggleAIFilterActive
  } = useAIFilters();

  const { getLabelsForAccount, labelsMapByAccount } = useLabelAtom();
  const { getAccountByUid, accounts } = useAuth();
  const { getUserPlan } = useBillingAtom();
  const { t } = useTranslation();
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0].uid ?? '');

  // State for AI Filter dialog
  const [aiFilterDialogOpen, setAIFilterDialogOpen] = useState(false);
  const [selectedAIFilter, setSelectedAIFilter] = useState<AIFilter | null>(null);

  // State for AI Filter test dialog
  const [aiFilterTestDialogOpen, setAIFilterTestDialogOpen] = useState(false);
  const [selectedTestFilter, setSelectedTestFilter] = useState<AIFilter | null>(null);

  const accountUids = useMemo(() => accounts.map((account) => account.uid), [accounts]);

  // Get the filters for the selected account
  const aiFilters = useMemo(() => {
    if (!selectedAccountId) return [];
    return getFiltersForAccount(selectedAccountId);
  }, [selectedAccountId, getFiltersForAccount]);

  // Check if filters are loading for the selected account
  const isLoadingAIFilters = useMemo(() => {
    if (!selectedAccountId) return false;
    return isLoading(selectedAccountId);
  }, [selectedAccountId, isLoading]);

  // Create a map of account IDs to account emails for display
  const accountEmailMap = useMemo(() => {
    const emailMap: Record<string, string> = {};
    accountUids.forEach((accountId) => {
      const account = getAccountByUid(accountId);
      emailMap[accountId] = account?.email || accountId;
    });
    return emailMap;
  }, [accountUids, getAccountByUid]);

  // Set the first account as default when accounts are loaded
  useEffect(() => {
    if (accountUids.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accountUids[0]);
    }
  }, [accountUids, selectedAccountId]);

  // Handle add AI filter
  const handleAddAIFilter = () => {
    setSelectedAIFilter(null);
    setAIFilterDialogOpen(true);
  };

  // Handle edit AI filter
  const handleEditAIFilter = (filterId: string) => {
    const filterToEdit = aiFilters.find((filter) => filter.id === filterId);
    if (filterToEdit) {
      setSelectedAIFilter(filterToEdit);
      setAIFilterDialogOpen(true);
    }
  };

  // Handle delete AI filter
  const handleDeleteAIFilter = async (filterId: string) => {
    try {
      await removeAIFilter(selectedAccountId, filterId);
    } catch (error) {
      console.error('Error deleting AI filter:', error);
      toast.error(t('toast.error.ai_filter_delete'));
    }
  };

  // Handle save AI filter
  const handleSaveAIFilter = async (data: AIFilter) => {
    try {
      // Deactivate filter if no output labels are selected
      if (data.outputLabels.length === 0) {
        data.isActive = false;
      }

      if (data.id && aiFilters.some((f) => f.id === data.id)) {
        await updateAIFilter(selectedAccountId, data.id, data);
      } else {
        await createAIFilter(selectedAccountId, data);
      }
    } catch (error) {
      console.error('Error saving AI filter:', error);
      toast.error(t('toast.error.ai_filter_save'));
    }
  };

  // Handle toggle filter active state - now using the dedicated function
  const handleToggleFilterActive = async (filterId: string, isActive: boolean = false) => {
    try {
      // Find the filter
      const filter = aiFilters.find((f) => f.id === filterId);

      // Don't allow activation if no output labels are set
      if (!isActive && filter && filter.outputLabels.length === 0) {
        toast.error(t('toast.error.ai_filter_invalid'));
        return;
      }

      await toggleAIFilterActive(selectedAccountId, filterId);
    } catch (error) {
      console.error('Error updating filter status:', error);
      toast.error(t('toast.error.ai_filter_status'));
    }
  };

  // Handle test AI filter
  const handleTestAIFilter = (filterId: string) => {
    const filterToTest = aiFilters.find((filter) => filter.id === filterId);
    if (filterToTest) {
      setSelectedTestFilter(filterToTest);
      setAIFilterTestDialogOpen(true);
    }
  };

  const getLabelFromMap = (labelId: string, accountId: string) => {
    // Get all labels for the current account
    if (!labelsMapByAccount[accountId]) return null;
    const label = labelsMapByAccount[accountId][labelId];
    return label;
  };

  // Check if all output labels are valid (either empty or contains valid labels)
  const hasValidLabels = (filter: AIFilter) => {
    if (!filter.outputLabels || filter.outputLabels.length === 0) return false;

    const result = filter.outputLabels.some((labelId) => {
      const label = getLabelFromMap(labelId, selectedAccountId);
      return !!label;
    });
    return result;
  };

  const handleSelectTemplate = (template) => {
    // Create a new filter from the template
    const templateLabelName = template.outputLabels[0]; // Get the label name from outputLabels array
    const accountLabels = labelsMapByAccount[selectedAccountId] || {};
    const matchingLabel = Object.values(accountLabels).find(
      (label) => label.name.toLowerCase() === templateLabelName.toLowerCase()
    );

    const newFilter = {
      id: generateUUID(), // Will be generated on save
      name: template.name,
      prompt: template.prompt,
      isActive: true,
      outputLabels: matchingLabel ? [matchingLabel.id] : [],
      markAsDone: template.markAsDone,
      moveToTrash: template.moveToTrash,
      templateLabelName: matchingLabel ? undefined : templateLabelName,
      templateLabelColor: {
        backgroundColor: template.color.background,
        textColor: template.color.text
      }
    };

    setSelectedAIFilter(newFilter);
    setAIFilterDialogOpen(true);
  };

  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <>
      <BillingBanner type="pro" />
      <div className="space-y-8">
        <div className="space-y-4">
          <SettingsPageHeader
            title={t('settings.filter.ai.title') || 'AI Filters'}
            description={t('settings.filter.description') || 'Manage your email filters and rules'}
            action={
              <div className="flex gap-2">
                {accountUids.length > 0 && (
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger variant={'secondary'} className="">
                      <SelectValue
                        placeholder="Select Account"
                        className={cn(buttonVariants({ variant: 'secondary' }))}
                      />
                    </SelectTrigger>
                    <SelectContent className="dark">
                      {accountUids.map((accountId) => (
                        <SelectItem key={accountId} value={accountId}>
                          {accountEmailMap[accountId]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" type="button">
                      <MonoIcon type="Plus" className="mr-2" />
                      {t('settings.filter.add_ai_filter') || 'Add AI Filter'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleAddAIFilter}>
                      <MonoIcon type="Plus" className="mr-2 h-4 w-4" />
                      {t('settings.filter.add_ai_filter') || 'Empty AI Filter'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowTemplates(true)}>
                      <MonoIcon type="FileText" className="mr-2 h-4 w-4" />
                      {t('settings.filter.ai.use_template') || 'Use Template'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
          />
          {!selectedAccountId ? (
            <div className="space-y-6 text-center">
              <span className="mt-10 text-sm text-muted-foreground">Please select an account</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-3">
                {aiFilters.length === 0 ? (
                  <div className="space-y-6 text-center">
                    <div className="group rounded-lg p-4 text-center">
                      <div className="mb-4 text-sm text-muted-foreground">
                        {t('settings.filter.ai.no_filters')}
                      </div>
                    </div>
                  </div>
                ) : (
                  aiFilters.map((filter) => (
                    <div
                      key={filter.id}
                      className="group rounded-lg border bg-card p-4 shadow-sm transition-shadow duration-300 hover:shadow-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="basis-1/2 space-y-1">
                          <h4 className="text-sm font-medium">{filter.name}</h4>
                          <p className="line-clamp-1 text-sm text-muted-foreground">
                            {filter.prompt}
                          </p>
                        </div>
                        <MonoIcon type="ArrowRight" />
                        <div className="flex flex-col items-start space-y-2">
                          <div className="flex">
                            <div className="mr-4">
                              <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                                Actions
                                {!hasValidLabels(filter) && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <MonoIcon
                                        type={'AlertCircle'}
                                        className="mr-2 text-destructive"
                                      />
                                    </TooltipTrigger>
                                    <TooltipPortal>
                                      <TooltipContent side="right">
                                        Filter requires valid label
                                      </TooltipContent>
                                    </TooltipPortal>
                                  </Tooltip>
                                )}
                              </div>
                              <div className="-ml-1 flex text-sm">
                                {filter.outputLabels.map((label) => {
                                  const currentLabel = getLabelFromMap(label, selectedAccountId);
                                  return currentLabel ? (
                                    <Badge
                                      key={label}
                                      sizeVariant={'xs'}
                                      className="ml-1 line-clamp-1 rounded-sm"
                                      style={{
                                        backgroundColor: currentLabel.color?.backgroundColor,
                                        color: currentLabel.color?.textColor
                                      }}
                                    >
                                      {currentLabel.name.replace('Mono/', '')}
                                    </Badge>
                                  ) : null;
                                })}

                                {filter.markAsDone && (
                                  <Badge
                                    sizeVariant={'xs'}
                                    className="ml-1 line-clamp-1 rounded-sm"
                                  >
                                    Mark as done
                                  </Badge>
                                )}
                                {filter.moveToTrash && (
                                  <Badge
                                    sizeVariant={'xs'}
                                    className="ml-1 line-clamp-1 text-ellipsis rounded-sm"
                                  >
                                    Move to trash
                                  </Badge>
                                )}
                                {!filter.markAsDone && !filter.moveToTrash && (
                                  <Badge
                                    sizeVariant={'xs'}
                                    className="ml-1 line-clamp-1 rounded-sm"
                                  >
                                    Keep in Inbox
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="ml-auto flex items-center space-x-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          {/* <Button
                            variant="secondary"
                            sizeVariant="sm"
                            typeVariant="icon"
                            className="h-8 w-8 p-0"
                            onClick={() => handleTestAIFilter(filter.id)}
                            title="Test Filter"
                          >
                            <MonoIcon type={'Beaker'} className="h-4 w-4" />
                          </Button> */}
                          <Button
                            variant="secondary"
                            sizeVariant="sm"
                            typeVariant="icon"
                            className="h-8 w-8 p-0"
                            onClick={() => handleEditAIFilter(filter.id)}
                          >
                            <MonoIcon type="Cog" className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="secondary"
                            sizeVariant="sm"
                            typeVariant="icon"
                            className="h-8 w-8 p-0"
                            onClick={() => handleDeleteAIFilter(filter.id)}
                          >
                            <MonoIcon type="Trash" className="h-4 w-4" />
                          </Button>
                        </div>
                        <BillingSwitch
                          size={'sm'}
                          checked={filter.isActive ?? false}
                          disabled={!hasValidLabels(filter)}
                          onCheckedChange={() =>
                            handleToggleFilterActive(filter.id, filter.isActive)
                          }
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <FilterExamplesDialog
            open={showTemplates}
            onOpenChange={setShowTemplates}
            onSelectTemplate={handleSelectTemplate}
          />

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm">{t('settings.filter.gmail.title') || 'Gmail Filters'}</h4>
              <p className="text-sm text-muted-foreground">
                {t('settings.filter.gmail.description') ||
                  'Manage your Gmail filters directly in Gmail settings'}
              </p>
            </div>
            <Button onClick={() => {}} variant="secondary" asChild>
              <a
                href="https://mail.google.com/mail/u/0/#settings/filters"
                target="_blank"
                rel="noreferrer"
              >
                {t('settings.filter.gmail.open') || 'Open Gmail Filters'}{' '}
                <MonoIcon className="ml-2" type="ExternalLink" />
              </a>
            </Button>
          </div>
        </div>
        {/* AI Filter Dialog */}
        <AIFilterEditDialog
          filter={selectedAIFilter}
          open={aiFilterDialogOpen}
          onOpenChange={setAIFilterDialogOpen}
          onSave={handleSaveAIFilter}
          accountId={selectedAccountId}
        />

        {/* AI Filter Test Dialog */}
        <AIFilterTestDialog
          open={aiFilterTestDialogOpen}
          onOpenChange={setAIFilterTestDialogOpen}
          accountId={selectedAccountId}
          initialPrompt={selectedTestFilter?.prompt || ''}
        />
      </div>
    </>
  );
};

export default FilterForm;
