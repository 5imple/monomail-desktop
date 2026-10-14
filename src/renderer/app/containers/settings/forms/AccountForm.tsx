import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import MonoIcon from '@/renderer/app/components/icons/icons';
import AccountList from '@/renderer/app/components/ui/account-list';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem
} from '@/renderer/app/components/ui/dropdown-menu';
import { Form } from '@/renderer/app/components/ui/form';
import { Table, TableBody, TableCell, TableRow } from '@/renderer/app/components/ui/table';
import { SettingsChangeDot } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

// Swatches big enough to tell apart, with an edge so Silver shows on the light
// button and Gray on the dark menu.
const SWATCH = 'h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-foreground/15';

const COLOR_PALETTE = [
  { hex: '#035ddf', name: 'Blue' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#facc15', name: 'Yellow' },
  { hex: '#a855f7', name: 'Purple' },
  { hex: '#fb923c', name: 'Orange' },
  { hex: '#f9a8d4', name: 'Pink' },
  { hex: '#4b5563', name: 'Gray' },
  { hex: '#d1d5db', name: 'Silver' }
];

// Extended schema to include all account settings
const AccountFormSchema = z.object({
  accentColor: z.record(z.string(), z.string())
  // Add other account settings as needed
});

type AccountFormValues = z.infer<typeof AccountFormSchema>;

export function AccountForm() {
  const { member, accounts, preference, updatePreference } = useAuth();
  const { t } = useTranslation();

  // Add local state to track the current saved preferences
  const [localPreference, setLocalPreference] = useState(preference);

  // Create default values for the form
  const initialValues = useMemo(() => {
    return {
      accentColor: accounts.reduce(
        (acc, account) => {
          acc[account.uid] = preference.account?.accentColor?.[account.uid] || '#035ddf'; // Default to blue
          return acc;
        },
        {} as Record<string, string>
      )
    };
  }, [accounts, preference]);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(AccountFormSchema),
    defaultValues: initialValues
  });

  // Get form values
  const watchValues = form.watch();

  // Helper function to check if a specific field has been modified
  const isFieldModified = (fieldName: string, accountUid: string, originalValue: any) => {
    // Fixed: Use the correct path format for nested properties
    if (fieldName === 'accentColor') {
      const currentValue = watchValues.accentColor[accountUid];
      return currentValue !== originalValue;
    }
    return false;
  };

  // Determine if any settings have been modified
  const isFormModified = useMemo(() => {
    // Check accent colors
    const isAccentColorModified = Object.entries(watchValues.accentColor).some(
      ([uid, value]) => value !== (preference.account?.accentColor?.[uid] || '#035ddf')
    );

    // Return true if any field is modified
    return isAccentColorModified;
  }, [watchValues, preference]);

  async function onSubmit(data: AccountFormValues) {
    if (!member) return;
    try {
      // Update the local preference state
      const updatedPreference = {
        ...localPreference,
        account: {
          ...localPreference.account,
          accentColor: data.accentColor
        }
      };

      setLocalPreference(updatedPreference);

      // Also update the global preference (awaited, so a failure reaches the catch)
      if (updatePreference) {
        await updatePreference({
          account: {
            ...localPreference.account,
            accentColor: data.accentColor
            // Include other fields as needed
          }
        });
      }

      toast.success(t('toast.preferences.updated'));
    } catch (e) {
      toast.error(t('toast.error.preference_update'));
      console.error(e);
    }
  }

  const getColorNameOrDefault = (hex: string) => {
    return COLOR_PALETTE.find((color) => color.hex === hex)?.name || 'Custom';
  };

  // Primary account first, as a copy: sorting the context's array in place
  // reordered it for everyone.
  const sortedAccounts = useMemo(
    () =>
      [...accounts].sort(
        (a, b) => Number(b.uid === member?.primaryUid) - Number(a.uid === member?.primaryUid)
      ),
    [accounts, member?.primaryUid]
  );

  if (!member || accounts.length === 0) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Account Colors Section */}
        <div>
          {/* No table header: it only repeated the page title. */}
          <div className="overflow-hidden rounded-md border shadow-sm">
            <Table>
              <TableBody>
                {sortedAccounts.map((account) => (
                  <TableRow key={account.email}>
                    <TableCell className="h-12 p-4">
                      <AccountList accounts={[account]} />
                    </TableCell>
                    {/* Right-aligned like the Accounts page's actions. */}
                    <TableCell className="h-12 text-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="secondary" className="w-40 justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className={SWATCH}
                                style={{
                                  backgroundColor: watchValues.accentColor[account.uid]
                                }}
                              />
                              {getColorNameOrDefault(watchValues.accentColor[account.uid])}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {isFieldModified(
                                'accentColor',
                                account.uid,
                                preference.account?.accentColor?.[account.uid] || '#035ddf'
                              ) && <SettingsChangeDot />}
                              <MonoIcon type="ChevronDown" className="h-4 w-4 opacity-50" />
                            </div>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuGroup>
                            {COLOR_PALETTE.map((color) => (
                              <DropdownMenuCheckboxItem
                                key={color.hex}
                                checked={watchValues.accentColor[account.uid] === color.hex}
                                onClick={() =>
                                  form.setValue(`accentColor.${account.uid}`, color.hex)
                                }
                              >
                                <div className="flex items-center gap-2">
                                  <div className={SWATCH} style={{ backgroundColor: color.hex }} />
                                  {color.name}
                                </div>
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Add more account settings sections as needed */}

          {/* Left-aligned, like Save on every other page. */}
          <div className="mt-4">
            <Button type="submit" disabled={!isFormModified || form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? t('settings.buttons.saving', 'Saving…')
                : t('settings.buttons.save_changes', 'Save Changes')}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
