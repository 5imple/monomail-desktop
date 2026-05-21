import { apiClient } from '@/main/api/apiClient';
import authApi from '@/main/api/auth/authApi';
import {
  MonoAccount,
  MonoMember,
  SupportedLanguage,
  supportedLanguages,
  UserPreference
} from '@/main/api/auth/types';
import draftApi from '@/main/api/draft/draftApi';
import mailApi from '@/main/api/mail/mailApi';
import signatureApi from '@/main/api/signature/signatureApi';
import templateApi from '@/main/api/template/templateApi';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import AccountSelectDialog from '@/renderer/app/containers/dialog/AccountSelectDialog';
import { isDevelopment } from '@/renderer/app/lib/accessManagement';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { auth } from '@/renderer/app/lib/monoAuth';
import { updateBadgeWithLabelCount } from '@/renderer/app/lib/updateAppBadgeWithThread';
// useBillingAtom + getCachedBillingInfo removed — payment-free build.
import { useAutopilotSettings } from '@/renderer/app/store/ai/useAutopilotSettings';
import { useBookmarkAtom } from '@/renderer/app/store/bookmark/useBookmarkAtom';
import { useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { useTemplateAtom } from '@/renderer/app/store/compose/useTemplateAtom';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useAIFilters } from '@/renderer/app/store/filter/useAIFilters';
import { clearLabelsCache, useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useSharedAtom } from '@/renderer/app/store/shared/useSharedAtom';
import {
  clearSpaceCache,
  getCachedActiveSpaceId,
  useSpaceAtom
} from '@/renderer/app/store/space/useSpaceAtom';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import { useTrackingAtom } from '@/renderer/app/store/tracking/useTrackingAtom';
import * as amplitude from '@amplitude/analytics-browser';
import {
  MonoUser as User,
  signInWithToken as signInWithCustomToken,
  onAuthStateChanged
} from '@/renderer/app/lib/monoAuth';
import mixpanel from 'mixpanel-browser';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';
import { authCache } from './AuthCache';

interface AuthContextType {
  isLoggedIn: boolean;
  user: User | null;
  member: MonoMember | null;
  accounts: MonoAccount[];
  preference: UserPreference;
  isLoading: boolean;
  idToken: string | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateAccounts: () => Promise<void>;
  getUidFromEmail: (email: string) => string | undefined;
  getAccountByUid: (accountId: string) => MonoAccount | undefined;
  updatePreference: (newPreference: Partial<UserPreference>) => Promise<void>;
}

const isSupportedLanguage = (lang: string): lang is SupportedLanguage => {
  return supportedLanguages.has(lang as SupportedLanguage);
};

const getClientLanguage = (): string => {
  const language = navigator.language || (navigator as any).userLanguage;
  return language.split('-')[0];
};

export const defaultPreference: UserPreference = {
  language: 'en',
  appearance: {
    theme: 'system',
    density: 'compact'
  },
  compose: {
    cancelWindow: 5,
    fullscreen: false
  },
  account: {
    accentColor: {}
  },
  signature: {
    includeInForwards: true,
    includeInReplies: true,
    includeInNewMessages: true
  },
  notification: {
    alertSound: 'Mono',
    watchNotification: {},
    marketingEmails: false,
    securityEmails: true
  },
  display: {
    inbox: {
      category: {}
    },
    threadList: {
      showAvatar: false,
      showSnippet: true,
      showLabels: true,
      showAttachments: true
    }
  },
  system: {
    openAtLogin: false
  }
};
const mergeWithDefaultPreference = (
  userPreference: UserPreference,
  accounts: MonoAccount[]
): { mergedPreference: UserPreference; needsUpdate: boolean } => {
  // Create a new Record based on default and existing preferences
  const watchNotification = accounts.reduce((acc, account) => {
    acc[account.uid] = userPreference.notification.watchNotification[account.uid] || 'PRIMARY';
    return acc;
  }, {});

  const category = accounts.reduce((acc, account) => {
    acc[account.uid] = userPreference.display.inbox.category[account.uid] || {
      showUpdates: true,
      showSocial: true,
      showPromotions: true,
      showForums: true
    };
    return acc;
  }, {});

  const mergedPreference: UserPreference = {
    language: isSupportedLanguage(userPreference.language)
      ? userPreference.language
      : isSupportedLanguage(getClientLanguage())
        ? (getClientLanguage() as SupportedLanguage)
        : defaultPreference.language,

    appearance: {
      theme: userPreference.appearance?.theme || defaultPreference.appearance.theme,
      density: userPreference.appearance?.density || defaultPreference.appearance.density
    },
    compose: {
      cancelWindow: userPreference.compose.cancelWindow || defaultPreference.compose.cancelWindow,
      fullscreen: userPreference.compose.fullscreen
    },
    signature: {
      includeInForwards: userPreference.signature.includeInForwards,
      includeInNewMessages: userPreference.signature.includeInNewMessages,
      includeInReplies: userPreference.signature.includeInReplies
    },
    display: {
      inbox: {
        category: category
      },
      threadList: {
        showAvatar:
          userPreference.display.threadList?.showAvatar ??
          defaultPreference.display.threadList.showAvatar,
        showSnippet:
          userPreference.display.threadList?.showSnippet ??
          defaultPreference.display.threadList.showSnippet,
        showLabels:
          userPreference.display.threadList?.showLabels ??
          defaultPreference.display.threadList.showLabels,
        showAttachments:
          userPreference.display.threadList?.showAttachments ??
          defaultPreference.display.threadList.showAttachments
      }
    },
    account: {
      accentColor: userPreference.account.accentColor
    },
    notification: {
      alertSound:
        userPreference.notification.alertSound || defaultPreference.notification.alertSound,
      watchNotification,
      marketingEmails:
        userPreference.notification?.marketingEmails ??
        defaultPreference.notification.marketingEmails,
      securityEmails:
        userPreference.notification?.securityEmails ?? defaultPreference.notification.securityEmails
    },
    system: {
      openAtLogin: userPreference.system.openAtLogin || defaultPreference.system.openAtLogin
    }
  };

  const needsUpdate = JSON.stringify(userPreference) !== JSON.stringify(mergedPreference);

  return { mergedPreference, needsUpdate };
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
AuthContext.displayName = 'AuthContext';

interface AuthState {
  isLoggedIn: boolean;
  user: User | null;
  accounts: MonoAccount[];
  member: MonoMember | null;
  preference: UserPreference;
  isLoading: boolean;
  idToken: string | null;
  needSelectAccount: boolean;
  relatedMembers: Array<MonoMember>;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    user: null,
    accounts: [],
    member: null,
    preference: defaultPreference,
    isLoading: true,
    idToken: null,
    needSelectAccount: false,
    relatedMembers: []
  });

  // Extract destructured variables for convenience
  const {
    isLoggedIn,
    user,
    accounts,
    member,
    preference,
    isLoading,
    idToken,
    needSelectAccount,
    relatedMembers
  } = authState;

  const { i18n, t } = useTranslation();

  const { fetchAndSetBookmarks } = useBookmarkAtom();
  const { initializeContacts } = useContactAtom();
  const { fetchAndSetTrackingHistories } = useTrackingAtom();
  const { setTemplates } = useTemplateAtom();
  const { loadAllFilters } = useAIFilters();
  const { setSignatures } = useSignatureAtom();
  const { updateDraft, resetDrafts } = useDraftAtom();
  const { resetThreadsMap } = useThreadOperationAtom();
  // Payment-free build — billing state functions are no-ops below.
  const { loadShared, loadSharedForAllAccounts } = useSharedAtom();
  const { loadLabels, loadCachedLabels } = useLabelAtom();
  const { loadAutopilotSettings } = useAutopilotSettings();

  // Use the space hooks
  const { loadSpaces, activeSpace, loadCachedSpaces } = useSpaceAtom();
  // Memoize utility function to prevent recreation on each render
  const getUidFromEmail = useCallback(
    (email: string): string | undefined => {
      return accounts.find((acc) => acc.email === email)?.uid;
    },
    [accounts]
  );
  const getAccountByUid = useCallback(
    (accountId: string): MonoAccount | undefined => {
      return accounts.find((acc) => acc.uid === accountId);
    },
    [accounts]
  );

  const updatePreference = useCallback(
    async (newPreference: Partial<UserPreference>) => {
      if (!user) return;

      const updatedPreference = {
        ...preference,
        ...newPreference,
        appearance: {
          ...preference.appearance,
          ...newPreference.appearance
        },
        compose: {
          ...preference.compose,
          ...newPreference.compose
        },
        signature: {
          ...preference.signature,
          ...newPreference.signature
        },
        notification: {
          ...preference.notification,
          ...newPreference.notification
        },
        display: {
          ...preference.display,
          ...newPreference.display,
          inbox: {
            ...preference.display?.inbox,
            ...newPreference.display?.inbox,
            category: {
              ...preference.display?.inbox?.category,
              ...newPreference.display?.inbox?.category
            }
          },
          threadList: {
            ...preference.display?.threadList,
            ...newPreference.display?.threadList
          }
        }
      };
      await authApi.updateUserPreference(updatedPreference); // Call API to update server-side

      setAuthState((prev) => ({
        ...prev,
        preference: updatedPreference
      }));

      // Update the cache with the new preference
      await authCache.updateCachedPreference(updatedPreference);
    },
    [user, preference]
  );

  const fetchPreference = useCallback(async (accounts: MonoAccount[]) => {
    const userPreference = await authApi.getUserPreference();

    const { mergedPreference, needsUpdate } = mergeWithDefaultPreference(userPreference, accounts);

    // Ensure we persist newly introduced fields (e.g., showAttachments) on load
    const missingShowAttachments =
      !(userPreference.display && (userPreference.display.threadList as any)) ||
      (userPreference.display &&
        (userPreference.display.threadList as any) &&
        (userPreference.display.threadList as any).showAttachments === undefined);

    if (needsUpdate || missingShowAttachments) {
      await authApi.updateUserPreference(mergedPreference);
    }
    if (isElectron) electronApi.setAlertSound(mergedPreference.notification.alertSound);

    if (isElectron) {
      accounts.forEach((account) => {
        electronApi.setSplitCategoryPreferences(
          account.uid,
          mergedPreference.display.inbox.category[account.uid] || {
            showUpdates: true,
            showSocial: true,
            showPromotions: true,
            showForums: true
          }
        );
      });
    }

    setAuthState((prev) => ({
      ...prev,
      preference: mergedPreference
    }));

    return mergedPreference;
  }, []);

  const fetchBookmarks = useCallback(async () => {
    fetchAndSetBookmarks();
  }, [fetchAndSetBookmarks]);

  const fetchTrackingHistories = useCallback(async () => {
    fetchAndSetTrackingHistories();
  }, [fetchAndSetTrackingHistories]);

  const fetchBilling = useCallback(
    async (_token: string) => {
      // Payment-free build — no subscription to fetch. Kept as a no-op
      // so call sites (post-sign-in hydration) don't need editing.
    },
    []
  );

  const fetchTemplates = useCallback(async () => {
    const response = await templateApi.getTemplates();
    setTemplates(response);
  }, [setTemplates]);

  const fetchSignatures = useCallback(async () => {
    try {
      const signaturesResponse = await signatureApi.getSignatures();
      setSignatures(signaturesResponse || []);
    } catch (error) {
      console.error('Error fetching signatures: ', error);
    }
  }, [setSignatures]);

  const fetchShared = useCallback(async () => {
    await loadSharedForAllAccounts();
  }, [loadSharedForAllAccounts]);

  const fetchDrafts = useCallback(async () => {
    try {
      const response = await draftApi.getDrafts();
      // Process drafts for all accounts in the response
      if (response?.drafts) {
        // Iterate through each account's drafts
        for (const [accountId, drafts] of Object.entries(response.drafts)) {
          // Process each draft for this account
          for await (const draft of drafts) {
            const responseDraft = MonoDraft.fromPlainObject(draft);
            await updateDraft(accountId, responseDraft, false, true);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching drafts:', error);
    }
  }, [updateDraft]);

  const fetchLabels = useCallback(async () => {
    loadLabels();
  }, [loadLabels]);

  const fetchAISettings = useCallback(async () => {
    loadAutopilotSettings();
  }, [loadAutopilotSettings]);

  const fetchAIFilters = useCallback(async () => {
    loadAllFilters();
  }, [loadAllFilters]);

  // Fetch data for multiple accounts (used when switching spaces)
  const fetchDataForAccounts = useCallback(
    async (accounts: MonoAccount[]) => {
      try {
        // Reset global state that will be repopulated
        await Promise.all([
          fetchBookmarks(),
          fetchTrackingHistories(),
          fetchDrafts(),
          fetchLabels(),
          fetchAISettings(),
          fetchTemplates(),
          fetchSignatures(),
          fetchAIFilters(),
          fetchShared(),
          initializeContacts(accounts)
        ]);
      } catch (error) {
        console.error('Error fetching data for accounts:', error);
        // toast.error('Failed to load account data');
      }
    },
    [
      fetchBookmarks,
      fetchTrackingHistories,
      fetchDrafts,
      fetchLabels,
      fetchTemplates,
      fetchShared,
      fetchAIFilters,
      fetchSignatures,
      resetThreadsMap,
      resetDrafts
    ]
  );
  const fetchData = useCallback(
    async (user: User, retryCount = 0, maxRetries = 3) => {
      try {
        setAuthState((prev) => ({ ...prev, isLoading: true }));

        // First, try to use cached data if available
        const cachedData = await authCache.getCachedData();

        const cachedSpaces = await loadCachedSpaces();
        const cachedLabels = await loadCachedLabels();

        // If we have both auth cache and spaces cache, we can show cached data immediately
        // BUT we don't set the token yet - we'll wait for a fresh one
        if (cachedData && cachedData.accounts.length > 0 && cachedSpaces) {
          console.log('Using cached auth and spaces data while fetching fresh token');

          const needSelectAccount =
            !!cachedData.relatedMembers && cachedData.relatedMembers.length > 0;

          setAuthState((prev) => ({
            ...prev,
            user,
            // NOTE: Don't set idToken here - we'll wait for fresh token
            accounts: needSelectAccount ? [] : cachedData.accounts, // Don't load accounts if selection is needed
            member: cachedData.member,
            preference: cachedData.preference || defaultPreference,
            isLoggedIn: !needSelectAccount, // Only set logged in if no account selection needed
            needSelectAccount,
            relatedMembers: cachedData.relatedMembers || []
          }));
          if (cachedData.preference) {
            i18n.changeLanguage(cachedData.preference.language);
          }
        }

        // Payment-free build — no cached billing info to hydrate.
        // Get fresh token BEFORE updating API client to avoid expired token issues
        let idToken: string;
        let shouldUseCachedToken = false;

        // Check if we should force refresh due to stale token
        const isTokenStale = await authCache.isTokenStale();
        const forceRefresh = isTokenStale || !cachedData?.idToken;

        try {
          if (forceRefresh) {
            console.log('Cached token is stale or missing, forcing fresh Firebase token...');
          } else {
            console.log('Attempting to get fresh Firebase token...');
          }
          idToken = await user.getIdToken(forceRefresh);
          console.log('Successfully obtained fresh Firebase token');
        } catch (error) {
          console.warn('Failed to get fresh Firebase token:', error);

          if (cachedData?.idToken) {
            const tokenAge = Date.now() - cachedData.timestamp;
            const tokenAgeMinutes = Math.round(tokenAge / (60 * 1000));

            console.log(
              `Falling back to cached auth token due to Firebase network error (token age: ${tokenAgeMinutes} minutes)`
            );

            if (tokenAgeMinutes > 45) {
              console.warn('⚠️  Using potentially expired cached token - API calls may fail');
            }

            // Note: This is a fallback for network issues only
            // The cached token might still be expired, but it's better than no token
            idToken = cachedData.idToken;
            shouldUseCachedToken = true;
          } else {
            throw error;
          }
        }

        // Only update API client after we have confirmed token (fresh or fallback)
        apiClient.setApiClientIdToken(idToken);
        electronApi.setIdToken(idToken);

        // Update auth state with the confirmed token
        if (cachedData && cachedData.accounts.length > 0 && cachedSpaces) {
          const needSelectAccount =
            cachedData.relatedMembers && cachedData.relatedMembers.length > 0;

          if (!needSelectAccount) {
            // Update with fresh token instead of cached one
            setAuthState((prev) => ({
              ...prev,
              idToken, // Use the fresh/confirmed token, not cached
              isLoading: false
            }));
          }
        }

        let monoAccountResponse;
        try {
          monoAccountResponse = await authApi.getMonoAccount();
        } catch (error) {
          if (cachedData) {
            console.log('Using cached account data due to API network error');
            monoAccountResponse = {
              accounts: cachedData.accounts,
              relatedMembers: [],
              member: cachedData.member
            };
          } else {
            throw error;
          }
        }

        const { accounts, relatedMembers, member } = monoAccountResponse;

        // Update state with fresh data
        setAuthState((prev) => ({
          ...prev,
          user,
          idToken,
          accounts,
          relatedMembers,
          member: member || null
        }));

        // Cache the successful auth data with fresh token
        await authCache.saveAuthData({
          idToken, // Fresh token from Firebase
          accounts,
          member,
          preference: null, // Will be updated below
          relatedMembers
        });

        if (member && !isDevelopment()) {
          mixpanel.identify(member.uid);
          mixpanel.people.set({
            $user_id: member.uid,
            $name: member.displayName,
            $email: member.email,
            $member_name: member.memberName,
            $app_version: import.meta.env.MONO_ENV_APP_VERSION,
            $connected_accounts: accounts.length,
            $connected_emails: accounts.map((account) => account.email)
          });

          if (member.demographics) {
            mixpanel.people.set({
              $demographics_role: member.demographics.role,
              $demographics_email_usage: member.demographics.emailUsage,
              $demographics_discovery_source: member.demographics.discoverySource
            });
          }

          amplitude.setUserId(member.uid);
          // Set user properties in Amplitude
          const identifyObj = new amplitude.Identify();

          // Add user properties that match your Mixpanel implementation
          identifyObj.set('name', member.displayName);
          identifyObj.set('email', member.email);
          identifyObj.set('member_name', member.memberName);
          identifyObj.set('app_version', import.meta.env.MONO_ENV_APP_VERSION);
          identifyObj.set('connected_accounts_count', accounts.length);
          identifyObj.set(
            'connected_emails',
            accounts.map((account) => account.email)
          );
          // Add demographic properties if available
          if (member.demographics) {
            identifyObj.set('demographics_role', member.demographics.role);
            identifyObj.set('demographics_email_usage', member.demographics.emailUsage);
            identifyObj.set('demographics_discovery_source', member.demographics.discoverySource);
          }

          // Send the identify call
          amplitude.identify(identifyObj);

          // Track login event in Amplitude
          amplitude.track('login', {
            user_id: member.uid,
            app_version: import.meta.env.MONO_ENV_APP_VERSION,
            connected_accounts: accounts.length
          });
        }

        if (relatedMembers.length > 0) {
          setAuthState((prev) => ({
            ...prev,
            needSelectAccount: true
          }));
          return;
        }

        let preference;
        try {
          preference = await fetchPreference(accounts);
        } catch (error) {
          if (cachedData?.preference) {
            console.log('Using cached preference due to API network error');
            preference = cachedData.preference;
          } else {
            preference = defaultPreference;
          }
        }

        // Update cache with fresh token and preference
        await authCache.saveAuthData({
          idToken, // This is now guaranteed to be fresh (or best available fallback)
          accounts,
          member,
          preference,
          relatedMembers
        });

        // Update state with preference
        setAuthState((prev) => ({
          ...prev,
          preference
        }));

        i18n.changeLanguage(preference.language);
        fetchBilling(idToken);

        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        try {
          await authApi.updateUserTimezone(timezone);
        } catch (error) {
          console.warn('Failed to update timezone:', error);
        }

        updateBadgeWithLabelCount(accounts.map((account) => account.uid));

        // Check localStorage for a persisted active space ID
        let activeSpaceId: string | null = null;
        try {
          activeSpaceId = await getCachedActiveSpaceId();
        } catch (error) {
          console.error('Failed to read active space from localStorage:', error);
        }

        try {
          await loadSpaces(activeSpaceId);
        } catch (error) {
          console.error('Failed to load spaces:', error);
        }

        // If a space is active, load data for its accounts
        fetchDataForAccounts(accounts);

        setAuthState((prev) => ({
          ...prev,
          isLoggedIn: true,
          needSelectAccount: false
        }));
      } catch (error) {
        const isFirebaseNetworkError =
          error instanceof Error &&
          (error.message.includes('network error') ||
            error.message.includes('network-request-failed') ||
            error.message.includes('A network error') ||
            error.message.includes('Firebase: Error (auth/network-request-failed)'));

        // Retry logic for Firebase network errors
        if (isFirebaseNetworkError && retryCount < maxRetries) {
          console.log(
            `Firebase network error detected. Retrying (${retryCount + 1}/${maxRetries})...`
          );

          // Exponential backoff: 1s, 2s, 4s, etc.
          const backoffTime = Math.pow(2, retryCount) * 1000;

          setTimeout(() => {
            fetchData(user, retryCount + 1, maxRetries);
          }, backoffTime);

          return;
        }

        // If we have cached credentials, use them
        if (await authCache.hasCachedCredentials()) {
          const cachedData = await authCache.getCachedData();
          if (cachedData) {
            const needSelectAccount =
              !!cachedData.relatedMembers && cachedData.relatedMembers.length > 0;
            setAuthState((prev) => ({
              ...prev,
              isLoggedIn: !needSelectAccount,
              user: user,
              idToken: cachedData.idToken,
              accounts: needSelectAccount ? [] : cachedData.accounts,
              member: cachedData.member,
              preference: cachedData.preference || defaultPreference,
              isLoading: false,
              needSelectAccount,
              relatedMembers: cachedData.relatedMembers || []
            }));
            return;
          }
        }

        console.error('Error during authentication: ', (error as Error).message);
        toast.error(
          'Error during authentication' + (error instanceof Error ? `: ${error.message}` : '')
        );
        await signOut();
      } finally {
        // Only set loading to false if it hasn't been set to false already
        // setAuthState((prev) => ({
        //   ...prev,
        //   isLoading: prev.isLoading
        // }));
      }
    },
    [activeSpace, loadSpaces, fetchDataForAccounts]
  );

  const signIn = useCallback(async (token: string) => {
    setAuthState((prev) => ({ ...prev, isLoading: true }));
    try {
      await signInWithCustomToken(auth, token);
    } catch (error) {
      console.error('An error occurred during sign-in.', error);
      toast.error(
        'An error occurred during sign-in: ' + (error instanceof Error ? error.message : '')
      );
      setAuthState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      Promise.all(
        accounts.map(async (account) => {
          mailApi.stopCloudPubSub(account.uid);
        })
      );

      await auth.signOut();
      await authCache.clearCache();
      await clearSpaceCache();
      await clearLabelsCache();
      electronApi.setIdToken(null);
      // Payment-free build — no billing state to reset.

      setAuthState({
        isLoggedIn: false,
        user: null,
        accounts: [],
        member: null,
        preference: defaultPreference,
        isLoading: false,
        idToken: null,
        needSelectAccount: false,
        relatedMembers: []
      });
    } catch (error) {
      console.error('An error occurred during sign-out.', error);
      toast.error(
        'An error occurred during sign-out: ' + (error instanceof Error ? error.message : '')
      );
    }
  }, [accounts]);

  const updateAccounts = useCallback(async () => {
    try {
      const monoAccountResponse = await authApi.getMonoAccount();
      const newAccounts = monoAccountResponse.accounts;

      setAuthState((prev) => ({
        ...prev,
        accounts: newAccounts,
        member: monoAccountResponse.member || prev.member
      }));

      loadSpaces(null);

      fetchDataForAccounts(newAccounts);

      // If we have an active space, we need to update it with the new accounts
    } catch (error) {
      console.error('Error fetching accounts: ', error);
    }
  }, [loadSpaces]);
  const handleCreateAccount = async () => {
    if (!user) return;
    try {
      setAuthState((prev) => ({
        ...prev,
        needSelectAccount: false,
        isLoading: true
      }));

      // Collect device information using the same method from SignInContent
      const collectDeviceInfo = () => {
        const parser = new UAParser();
        const result = parser.getResult();

        return {
          browser: `${result.browser.name || 'Unknown'} ${result.browser.version || ''}`,
          os: `${result.os.name || 'Unknown'} ${result.os.version || ''}`,
          device: result.device.vendor
            ? `${result.device.vendor} ${result.device.model}`
            : 'Desktop',
          language: navigator.language,
          platform: navigator.platform,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
      };

      // Get device info
      const deviceInfo = collectDeviceInfo();

      // Pass device info to createMember
      const monoAccountResponse = await authApi.createMember(deviceInfo);
      if (!monoAccountResponse.member) throw new Error('No member found');

      setAuthState((prev) => ({
        ...prev,
        relatedMembers: monoAccountResponse.relatedMembers,
        accounts: monoAccountResponse.accounts,
        member: monoAccountResponse.member || null
      }));

      await fetchPreference(monoAccountResponse.accounts);
      await loadSpaces(null);
      await fetchDataForAccounts(monoAccountResponse.accounts);

      setAuthState((prev) => ({
        ...prev,
        isLoggedIn: true,
        isLoading: false
      }));
    } catch (error) {
      console.error('Error during account creation: ', error);
      toast.error(
        'Error during account creation: ' + (error instanceof Error ? error.message : '')
      );
      await signOut();
    } finally {
      setAuthState((prev) => ({
        ...prev,
        isLoading: false
      }));
    }
  };

  const handleSignIn = useCallback(async () => {
    if (!user) return;
    try {
      setAuthState((prev) => ({
        ...prev,
        needSelectAccount: false,
        isLoading: true
      }));

      await fetchPreference(accounts);

      let activeSpaceId: string | null = null;
      try {
        activeSpaceId = await getCachedActiveSpaceId();
      } catch (error) {
        console.error('Failed to read active space from localStorage:', error);
      }

      // Fetch spaces
      await loadSpaces(activeSpaceId);
      // If a space is active, fetch data for its accounts
      fetchDataForAccounts(accounts);

      setAuthState((prev) => ({
        ...prev,
        isLoggedIn: true,
        isLoading: false
      }));
    } catch (error) {
      console.error('Error during authentication: ', error);
      toast.error('Error during authentication: ' + (error instanceof Error ? error.message : ''));
      await signOut();
    } finally {
      setAuthState((prev) => ({
        ...prev,
        isLoading: false
      }));
    }
  }, [user, accounts, fetchPreference, loadSpaces, fetchDataForAccounts, signOut]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setAuthState((prev) => ({ ...prev, isLoading: true }));
      if (user) {
        await fetchData(user);
      }
      setAuthState((prev) => ({ ...prev, isLoading: false }));
    });

    const removeSignInListener = electronApi.on<string>('renderer:auth:sign-in', async (token) => {
      await signIn(token);
    });

    const removeAddAccountListener = electronApi.on<string>(
      'renderer:auth:add-account',
      async () => {
        await updateAccounts();
        toast.success(t('toast.preferences.integration.account_added'));
      }
    );
    const removeAccountScopeUpdateListener = electronApi.on<string>(
      'renderer:auth:scope-updated',
      async () => {
        await updateAccounts();
        toast.success(t('toast.account.scope_update_success'));
      }
    );

    // Phase-B: token refresh lives in the main-process TokenManager, which
    // schedules a refresh ~60s before each access token expires. The
    // renderer just listens for `renderer:auth:token-changed` (handled
    // inside monoAuth) and re-flows the new token through React state via
    // `onAuthStateChanged` above.

    return () => {
      unsubscribeAuth();
      removeSignInListener();
      removeAccountScopeUpdateListener();
      removeAddAccountListener();
    };
  }, []);

  useEffect(() => {
    const removeBillingListener = electronApi.on('renderer:auth:billing-updated', async () => {
      if (idToken) {
        await fetchBilling(idToken);
      }
    });

    return () => {
      removeBillingListener();
    };
  }, [idToken]);

  const contextValue = useMemo(() => {
    return {
      isLoggedIn,
      user,
      isLoading,
      idToken,
      signIn,
      signOut,
      member,
      accounts,
      preference,
      updateAccounts,
      updatePreference,
      getUidFromEmail,
      getAccountByUid
    };
  }, [
    isLoggedIn,
    user,
    isLoading,
    idToken,
    signIn,
    signOut,
    member,
    accounts,
    preference,
    updateAccounts,
    updatePreference,
    getUidFromEmail,
    getAccountByUid,
    fetchDrafts
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      <AccountSelectDialog
        accounts={accounts}
        member={member}
        relatedMembers={relatedMembers}
        open={needSelectAccount}
        onCreateAccount={handleCreateAccount}
        onSignIn={handleSignIn}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
