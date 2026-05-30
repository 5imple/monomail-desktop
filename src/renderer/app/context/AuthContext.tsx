import { apiClient, gmailApiClient } from '@/main/api/apiClient';
import {
  MonoAccount,
  MonoMember,
  GetMonoAccountResponse,
  UserPreference
} from '@/main/api/auth/types';
import draftApi from '@/main/api/draft/draftApi';
import signatureApi from '@/main/api/signature/signatureApi';
import templateApi from '@/main/api/template/templateApi';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { isDevelopment } from '@/renderer/app/lib/accessManagement';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { auth, MonoUser as User, onAuthStateChanged } from '@/renderer/app/lib/monoAuth';
import { updateBadgeWithLabelCount } from '@/renderer/app/lib/updateAppBadgeWithThread';
import { useBookmarkAtom } from '@/renderer/app/store/bookmark/useBookmarkAtom';
import { useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { useTemplateAtom } from '@/renderer/app/store/compose/useTemplateAtom';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { clearLabelsCache, useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useSharedAtom } from '@/renderer/app/store/shared/useSharedAtom';
import {
  clearSpaceCache,
  getCachedActiveSpaceId,
  useSpaceAtom
} from '@/renderer/app/store/space/useSpaceAtom';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import { useTrackingAtom } from '@/renderer/app/store/tracking/useTrackingAtom';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { authCache } from './AuthCache';

interface AuthContextType {
  isLoggedIn: boolean;
  user: User | null;
  member: MonoMember | null;
  accounts: MonoAccount[];
  preference: UserPreference;
  isLoading: boolean;
  idToken: string | null;
  signOut: () => Promise<void>;
  updateAccounts: () => Promise<void>;
  getUidFromEmail: (email: string) => string | undefined;
  getAccountByUid: (accountId: string) => MonoAccount | undefined;
  updatePreference: (newPreference: Partial<UserPreference>) => Promise<void>;
}

export const defaultPreference: UserPreference = {
  appearance: {
    theme: 'pure-light',
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

type ElectronAuthState = Awaited<ReturnType<typeof electronApi.getAuthState>>;

const buildDirectGoogleAccountResponse = (
  authState: ElectronAuthState
): GetMonoAccountResponse | null => {
  if (!authState?.googleAccounts?.length) return null;

  const primaryUid = authState.member?.uid ?? authState.googleAccounts[0].uid;
  const accounts: MonoAccount[] = authState.googleAccounts.map((account) => ({
    uid: account.uid,
    displayName: account.displayName || account.email,
    provider: 'google',
    email: account.email,
    profileImageUrl: account.photoURL || '',
    primary: account.uid === primaryUid,
    scopes: account.scopes,
    isExpired: account.expiresAt <= Date.now()
  }));

  const primaryAccount = accounts.find((account) => account.uid === primaryUid) ?? accounts[0];
  const memberEmail = authState.member?.email ?? primaryAccount.email;
  const member: MonoMember = {
    uid: authState.member?.uid ?? primaryAccount.uid,
    displayName: authState.member?.displayName || primaryAccount.displayName,
    email: memberEmail,
    primaryUid: primaryAccount.uid,
    memberName: memberEmail.split('@')[0],
    profileImageUrl: authState.member?.photoURL || primaryAccount.profileImageUrl
  };

  return {
    accounts,
    member
  };
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
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    user: null,
    accounts: [],
    member: null,
    preference: defaultPreference,
    isLoading: true,
    idToken: null
  });

  // Extract destructured variables for convenience
  const { isLoggedIn, user, accounts, member, preference, isLoading, idToken } = authState;

  const { t } = useTranslation();

  const { fetchAndSetBookmarks } = useBookmarkAtom();
  const { initializeContacts } = useContactAtom();
  const { fetchAndSetTrackingHistories } = useTrackingAtom();
  const { setTemplates } = useTemplateAtom();
  const { setSignatures } = useSignatureAtom();
  const { updateDraft, resetDrafts } = useDraftAtom();
  const { resetThreadsMap } = useThreadOperationAtom();
  const { loadShared, loadSharedForAllAccounts } = useSharedAtom();
  const { loadLabels, loadCachedLabels } = useLabelAtom();

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
      // Preferences are local-only in Gmail-direct mode — persist to the cache.
      setAuthState((prev) => ({
        ...prev,
        preference: updatedPreference
      }));
      await authCache.updateCachedPreference(updatedPreference);
    },
    [user, preference]
  );

  const fetchPreference = useCallback(async (accounts: MonoAccount[]) => {
    // Gmail-direct mode: preferences live in the local cache, not a backend.
    const cached = await authCache.getCachedData();
    const userPreference = cached?.preference ?? defaultPreference;

    const { mergedPreference } = mergeWithDefaultPreference(userPreference, accounts);

    await authCache.updateCachedPreference(mergedPreference);

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
    await fetchAndSetBookmarks();
  }, [fetchAndSetBookmarks]);

  const fetchTrackingHistories = useCallback(async () => {
    await fetchAndSetTrackingHistories();
  }, [fetchAndSetTrackingHistories]);

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
    await loadLabels(accounts.map((a) => a.uid));
  }, [loadLabels, accounts]);

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
          fetchTemplates(),
          fetchSignatures(),
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
      fetchSignatures,
      resetThreadsMap,
      resetDrafts
    ]
  );
  const fetchData = useCallback(
    async (user: User, retryCount = 0, maxRetries = 3) => {
      let confirmedIdToken: string | null = null;

      try {
        setAuthState((prev) => ({ ...prev, isLoading: true }));

        // First, try to use cached data if available
        let cachedData = await authCache.getCachedData();

        const cachedSpaces = await loadCachedSpaces();
        const cachedLabels = await loadCachedLabels();

        // Detect stale cache: if the token owner (Google sub) is not in cached accounts,
        // the cache belongs to a previous session. Discard it so we don't temporarily
        // flash wrong accounts or fall back to them on error.
        const tokenState = await electronApi.getAuthState();
        const tokenMemberUid = tokenState?.member?.uid;
        if (
          cachedData &&
          tokenMemberUid &&
          !cachedData.accounts.some((a) => a.uid === tokenMemberUid)
        ) {
          await authCache.clearCache();
          await clearSpaceCache();
          await clearLabelsCache();
          cachedData = null;
        }

        // If we have both auth cache and spaces cache, we can show cached data immediately
        // BUT we don't set the token yet - we'll wait for a fresh one
        if (cachedData && cachedData.accounts.length > 0 && cachedSpaces) {
          setAuthState((prev) => ({
            ...prev,
            user,
            accounts: cachedData.accounts,
            member: cachedData.member,
            preference: cachedData.preference || defaultPreference,
            isLoggedIn: true
          }));
        }

        // Get the current token from main memory/safeStorage. Tokens are never
        // read from renderer IndexedDB.
        let idToken: string;

        try {
          idToken = await user.getIdToken(false);
          confirmedIdToken = idToken;
        } catch (error) {
          console.warn('Failed to get auth token from main:', error);
          throw error;
        }

        // Only update API client after we have confirmed token (fresh or fallback)
        apiClient.setApiClientIdToken(idToken);
        gmailApiClient.setApiClientIdToken(idToken);

        // Update auth state with the confirmed token
        if (cachedData && cachedData.accounts.length > 0 && cachedSpaces) {
          setAuthState((prev) => ({
            ...prev,
            idToken,
            isLoading: false
          }));
        }

        const monoAccountResponse = buildDirectGoogleAccountResponse(tokenState);
        if (!monoAccountResponse) {
          throw new Error('No Google account available');
        }

        const { accounts, member } = monoAccountResponse;

        // Update state with fresh data
        setAuthState((prev) => ({
          ...prev,
          user,
          idToken,
          accounts,
          member: member || null
        }));

        // Cache the successful auth data with fresh token
        await authCache.saveAuthData({
          accounts,
          member: member ?? null,
          preference: null // Will be updated below
        });

        let preference;
        try {
          preference = await fetchPreference(accounts);
        } catch (error) {
          if (cachedData?.preference) {
            preference = cachedData.preference;
          } else {
            preference = defaultPreference;
          }
        }

        // Update cache with fresh token and preference
        await authCache.saveAuthData({
          accounts,
          member: member ?? null,
          preference
        });

        // Update state with preference
        setAuthState((prev) => ({
          ...prev,
          preference
        }));

        updateBadgeWithLabelCount(accounts.map((account) => account.uid));
        electronApi.setKnownAccountUids(accounts.map((account) => account.uid)).catch(() => {});

        // Check localStorage for a persisted active space ID
        let activeSpaceId: string | null = null;
        try {
          activeSpaceId = await getCachedActiveSpaceId();
        } catch (error) {
          console.error('Failed to read active space from localStorage:', error);
        }

        try {
          await loadSpaces(
            activeSpaceId,
            accounts.map((account) => account.uid)
          );
        } catch (error) {
          console.error('Failed to load spaces:', error);
        }

        // If a space is active, load data for its accounts
        fetchDataForAccounts(accounts);

        setAuthState((prev) => ({
          ...prev,
          isLoggedIn: true
        }));
      } catch (error) {
        const isNetworkError =
          error instanceof Error &&
          (error.message.includes('network error') ||
            error.message.includes('network-request-failed') ||
            error.message.includes('A network error'));

        // Retry logic for transient network errors
        if (isNetworkError && retryCount < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, etc.
          const backoffTime = Math.pow(2, retryCount) * 1000;

          setTimeout(() => {
            fetchData(user, retryCount + 1, maxRetries);
          }, backoffTime);

          return;
        }

        // If we still have a current token, cached non-secret account data can
        // hydrate the UI while the network is down.
        if (confirmedIdToken && (await authCache.hasCachedCredentials())) {
          const cachedData = await authCache.getCachedData();
          if (cachedData) {
            setAuthState((prev) => ({
              ...prev,
              isLoggedIn: true,
              user: user,
              idToken: confirmedIdToken,
              accounts: cachedData.accounts,
              member: cachedData.member,
              preference: cachedData.preference || defaultPreference,
              isLoading: false
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
        // no-op
      }
    },
    [activeSpace, loadSpaces, fetchDataForAccounts]
  );

  const clearLocalAuthState = useCallback(async () => {
    await authCache.clearCache();
    await clearSpaceCache();
    await clearLabelsCache();
    apiClient.setApiClientIdToken(null);
    apiClient.setApiActiveUid(null);
    gmailApiClient.setApiClientIdToken(null);
    gmailApiClient.setApiActiveUid(null);
    await electronApi.setActiveUid(null);

    setAuthState({
      isLoggedIn: false,
      user: null,
      accounts: [],
      member: null,
      preference: defaultPreference,
      isLoading: false,
      idToken: null
    });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await auth.signOut();
      await clearLocalAuthState();
    } catch (error) {
      console.error('An error occurred during sign-out.', error);
      toast.error(
        'An error occurred during sign-out: ' + (error instanceof Error ? error.message : '')
      );
      await clearLocalAuthState();
    }
  }, [clearLocalAuthState]);

  const updateAccounts = useCallback(async () => {
    try {
      // renderer:auth:token-changed fires before renderer:auth:add-account, so
      // monoAuth's mirror already holds the new token. apiClient.idToken is only
      // refreshed inside fetchData (which does not run for mid-session addAccount),
      // so we must sync it here before making any API calls.
      const currentUser = auth.currentUser;
      if (currentUser) {
        const freshToken = await currentUser.getIdToken(false);
        apiClient.setApiClientIdToken(freshToken);
        gmailApiClient.setApiClientIdToken(freshToken);
        setAuthState((prev) => ({ ...prev, idToken: freshToken }));
      }

      const authState = await electronApi.getAuthState();
      const monoAccountResponse = buildDirectGoogleAccountResponse(authState);
      if (!monoAccountResponse) throw new Error('No account data available');

      const newAccounts = monoAccountResponse.accounts;

      setAuthState((prev) => ({
        ...prev,
        accounts: newAccounts,
        member: monoAccountResponse.member || prev.member,
        isLoggedIn: true
      }));

      // Keep cache in sync so stale data doesn't flash on next startup
      authCache
        .saveAuthData({
          accounts: newAccounts,
          member: monoAccountResponse.member ?? null,
          preference: null
        })
        .catch(() => {});

      updateBadgeWithLabelCount(newAccounts.map((a) => a.uid));
      electronApi.setKnownAccountUids(newAccounts.map((a) => a.uid)).catch(() => {});

      loadSpaces(
        null,
        newAccounts.map((account) => account.uid)
      );
      fetchDataForAccounts(newAccounts);
    } catch (error) {
      console.error('Error fetching accounts: ', error);
    }
  }, [loadSpaces, fetchDataForAccounts]);

  // Keep a ref to the latest updateAccounts so the fixed [] listener never holds a stale closure.
  const updateAccountsRef = useRef(updateAccounts);
  useEffect(() => {
    updateAccountsRef.current = updateAccounts;
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setAuthState((prev) => ({ ...prev, isLoading: true }));
      if (user) {
        await fetchData(user);
      } else {
        await clearLocalAuthState();
      }
      setAuthState((prev) => ({ ...prev, isLoading: false }));
    });

    const removeAddAccountListener = electronApi.on<string>(
      'renderer:auth:add-account',
      async () => {
        await updateAccountsRef.current();
        toast.success(t('toast.preferences.integration.account_added'));
      }
    );

    // Token refresh lives in the main-process TokenManager, which schedules a
    // refresh ~60s before each access token expires. The renderer just listens
    // for `renderer:auth:token-changed` (handled inside monoAuth) and re-flows
    // the new token through React state via `onAuthStateChanged` above.

    return () => {
      unsubscribeAuth();
      removeAddAccountListener();
    };
  }, []);

  const contextValue = useMemo(() => {
    return {
      isLoggedIn,
      user,
      isLoading,
      idToken,
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

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
