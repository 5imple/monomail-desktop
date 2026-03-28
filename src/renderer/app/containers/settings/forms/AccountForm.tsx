import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import authApi from '@/main/api/auth/authApi';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/renderer/app/components/ui/table';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

// Change indicator component
const ChangeIndicator = () => <div className="ml-1 h-2 w-2 rounded-full bg-accent" />;

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
      // Update user preferences
      await authApi.updateUserPreference({
        account: {
          ...localPreference.account,
          accentColor: data.accentColor
        }
      });

      // Update the local preference state
      const updatedPreference = {
        ...localPreference,
        account: {
          ...localPreference.account,
          accentColor: data.accentColor
        }
      };

      setLocalPreference(updatedPreference);

      // Also update the global preference
      if (updatePreference) {
        updatePreference({
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

  if (!member || accounts.length === 0) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Account Colors Section */}
        <div>
          <div className="overflow-hidden rounded-md border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead colSpan={2} className="bg-muted">
                    {t('settings.account.title', 'Account Colors')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts
                  .sort((a) => (a.uid === member?.primaryUid ? -1 : 1))
                  .map((account) => (
                    <TableRow key={account.email}>
                      <TableCell className="h-12 p-4">
                        <AccountList accounts={[account]} />
                      </TableCell>
                      <TableCell className="h-full gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="secondary" className="w-36 justify-between">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2 w-2 rounded-full"
                                  style={{
                                    backgroundColor: watchValues.accentColor[account.uid]
                                  }}
                                />
                                {getColorNameOrDefault(watchValues.accentColor[account.uid])}
                              </div>
                              {isFieldModified(
                                'accentColor',
                                account.uid,
                                preference.account?.accentColor?.[account.uid] || '#035ddf'
                              ) && <ChangeIndicator />}
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
                                    <div
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: color.hex }}
                                    />
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

          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={!isFormModified}>
              {t('settings.buttons.save_changes', 'Save Changes')}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
