import { create } from 'zustand';
import { generateSaltHex, hashPasswordPBKDF2 } from '../lib/crypto';
import { clientEnv } from '../lib/env';
import { getAuthorizedHeaders, setClientSessionToken } from '../lib/oauth';
import {
  DEFAULT_PLANS,
  checkPlanSwitchAllowed,
  getEffectivePlans,
  normalizePlanId,
} from '../lib/pricing';
import {
  getActiveSupabaseSession,
  getSupabaseClient,
  getSupabaseOAuthRedirectUrl,
  isSupabaseConfigured,
  mapSupabaseUserToProfile,
} from '../lib/supabase';
import { storageOrchestrator } from '../storage/orchestrator';
import { isEffectivelyTrashed, vaultRepository } from '../storage/repository';
import type {
  Account,
  ActivityEvent,
  BillingCycle,
  ConnectedCloudAccount,
  DeveloperSettings,
  ExplorerViewMode,
  FileCategory,
  PlanDefinition,
  PlanId,
  ProviderMount,
  ScheduledTransferJob,
  SortDirection,
  SortField,
  ThemePreference,
  ToastMessage,
  UploadJob,
  VaultNode,
  WorkspaceSettings,
} from '../types/domain';

interface VaultStoreState {
  initialized: boolean;
  initializing: boolean;
  usingMemoryFallback: boolean;
  versionChangeDetected: boolean;

  currentAccount: Account | null;
  isAdmin: boolean;
  authProvider: string;
  emailVerified: boolean;
  connectedAccounts: ConnectedCloudAccount[];
  mounts: ProviderMount[];
  nodes: VaultNode[];
  activity: ActivityEvent[];
  settings: WorkspaceSettings;
  uploadJobs: UploadJob[];

  // Billing gateway status
  razorpayConfigured: boolean;
  razorpayMode: 'test' | 'live';
  razorpayKeyId: string | null;
  razorpayPlanIds: {
    proMonthly: string;
    proAnnual: string;
    ultraMonthly: string;
    ultraAnnual: string;
  };

  // Explorer UI state
  currentFolderId: string | null;
  selectedNodeIds: string[];
  focusedNodeId: string | null;
  searchQuery: string;
  categoryFilter: FileCategory;
  providerFilter: string;
  expandedTreeFolderIds: string[];

  // Global Modals & Drawers
  commandPaletteOpen: boolean;
  shortcutsModalOpen: boolean;
  uploadModalOpen: boolean;
  preselectedUploadFiles: File[];
  previewFileId: string | null;
  newFolderModalOpen: boolean;
  renameNodeId: string | null;
  moveModalNodeIds: string[] | null;
  mobileSidebarOpen: boolean;
  upgradePromptReason: string | null;

  // Toasts & Screen Reader Announcements
  toasts: ToastMessage[];
  uploadAnnouncement: string;

  // Actions
  initApp: () => Promise<void>;
  refreshFromStorage: () => Promise<void>;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
  setUpgradePromptReason: (reason: string | null) => void;

  // Auth Actions
  loginWithPassword: (email: string, password: string) => Promise<void>;
  registerAccount: (email: string, displayName: string, password: string) => Promise<{ requiresEmailConfirmation?: boolean }>;
  completeSocialOAuthLogin: (payload: {
    email: string;
    displayName: string;
    provider: string;
    sessionToken?: string;
  }) => Promise<void>;
  requestPasswordResetEmail: (email: string, fallbackNewPassword?: string) => Promise<string>;
  signOut: () => Promise<void>;
  updateProfile: (displayName: string) => Promise<void>;
  deleteUserAccount: () => Promise<void>;
  exportLocalWorkspaceData: () => Promise<void>;

  // Explorer & View Actions
  setCurrentFolderId: (folderId: string | null) => void;
  setSelectedNodeIds: (ids: string[], focusedId?: string | null) => void;
  setFocusedNodeId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setCategoryFilter: (cat: FileCategory) => void;
  setProviderFilter: (providerId: string) => void;
  toggleTreeFolder: (folderId: string, forceExpanded?: boolean) => void;
  setExplorerView: (view: ExplorerViewMode) => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  setSorting: (field: SortField, direction?: SortDirection) => Promise<void>;
  toggleSidebarCollapsed: () => Promise<void>;
  toggleInspectorOpen: (force?: boolean) => Promise<void>;

  // Modal Controls
  setCommandPaletteOpen: (open: boolean) => void;
  setShortcutsModalOpen: (open: boolean) => void;
  openUploadModal: (initialFiles?: File[]) => void;
  closeUploadModal: () => void;
  setPreviewFileId: (fileId: string | null) => void;
  setNewFolderModalOpen: (open: boolean) => void;
  setRenameNodeId: (nodeId: string | null) => void;
  setMoveModalNodeIds: (nodeIds: string[] | null) => void;
  setMobileSidebarOpen: (open: boolean) => void;

  // Subscription, Admin Config & Automation Actions
  fetchBillingStatus: () => Promise<void>;
  switchSubscriptionPlan: (planId: PlanId, billingCycle: BillingCycle) => Promise<void>;
  cancelSubscription: () => Promise<void>;
  updateCustomPlanConfig: (planId: PlanId, updatedPlan: PlanDefinition) => Promise<void>;
  resetCustomPlans: () => Promise<void>;
  addScheduledTransfer: (
    job: Omit<ScheduledTransferJob, 'id' | 'lastRunAt' | 'createdAt'>
  ) => Promise<void>;
  toggleScheduledTransfer: (jobId: string) => Promise<void>;
  runScheduledTransferNow: (jobId: string) => Promise<void>;
  deleteScheduledTransfer: (jobId: string) => Promise<void>;
  updateDeveloperSettings: (dev: Partial<DeveloperSettings>) => Promise<void>;
  updateApiCredentials: (creds: Record<string, string>) => Promise<void>;

  // Connected Cloud OAuth Accounts
  fetchConnectedAccounts: () => Promise<void>;
  disconnectCloudAccount: (id: string) => Promise<void>;
  refreshCloudAccount: (id: string) => Promise<void>;
}

const DEFAULT_SETTINGS: WorkspaceSettings = {
  explorerView: 'table',
  sortField: 'name',
  sortDirection: 'asc',
  sidebarCollapsed: false,
  inspectorOpen: true,
  subscription: {
    planId: 'free',
    billingCycle: 'monthly',
    cancelledAt: null,
    invoices: [],
  },
  customPlans: structuredClone(DEFAULT_PLANS),
  scheduledTransfers: [],
  devSettings: {
    failureRate: 0,
    offline: false,
  },
  demoTokens: [],
  activeAccountEmail: null,
};

const announcedJobStates = new Map<string, string>();

async function syncBackendSession(params: {
  userId?: string;
  email: string;
  displayName: string;
  provider?: string;
}): Promise<{ isAdmin: boolean }> {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token && !isSupabaseConfigured) {
        setClientSessionToken(data.token);
      }
      return { isAdmin: Boolean(data.user?.isAdmin) };
    }
  } catch {
    // Offline or standalone test environment
  }
  return { isAdmin: false };
}

export const useVaultStore = create<VaultStoreState>((set, get) => ({
  initialized: false,
  initializing: false,
  usingMemoryFallback: false,
  versionChangeDetected: false,

  currentAccount: null,
  isAdmin: false,
  authProvider: 'email',
  emailVerified: true,
  connectedAccounts: [],
  mounts: [],
  nodes: [],
  activity: [],
  settings: DEFAULT_SETTINGS,
  uploadJobs: [],

  razorpayConfigured: Boolean(clientEnv.razorpayKeyId),
  razorpayMode: clientEnv.razorpayMode,
  razorpayKeyId: clientEnv.razorpayKeyId || null,
  razorpayPlanIds: clientEnv.razorpayPlanIds,

  currentFolderId: null,
  selectedNodeIds: [],
  focusedNodeId: null,
  searchQuery: '',
  categoryFilter: 'all',
  providerFilter: 'all',
  expandedTreeFolderIds: [],

  commandPaletteOpen: false,
  shortcutsModalOpen: false,
  uploadModalOpen: false,
  preselectedUploadFiles: [],
  previewFileId: null,
  newFolderModalOpen: false,
  renameNodeId: null,
  moveModalNodeIds: null,
  mobileSidebarOpen: false,
  upgradePromptReason: null,

  toasts: [],
  uploadAnnouncement: '',

  initApp: async () => {
    if (get().initialized || get().initializing) return;
    set({ initializing: true });

    const { interruptedUploads } = await vaultRepository.init();
    storageOrchestrator.seedInterruptedUploads(interruptedUploads);

    storageOrchestrator.bindStoreCallbacks({
      getDevSettings: () => get().settings.devSettings,
      onMutated: () => {
        get().refreshFromStorage();
      },
      onPlanLimitReached: (reason) => {
        get().setUpgradePromptReason(reason);
      },
    });

    vaultRepository.onExternalChange(() => {
      get().refreshFromStorage();
    });

    // Check active Supabase session if configured and listen for OAuth callback sign-in events
    if (isSupabaseConfigured) {
      const sbSession = await getActiveSupabaseSession();
      if (sbSession?.user) {
        const profile = mapSupabaseUserToProfile(sbSession.user);
        const { isAdmin } = await syncBackendSession({
          userId: profile.id,
          email: profile.email,
          displayName: profile.displayName,
          provider: profile.provider,
        });
        await vaultRepository.putAccount({
          email: profile.email,
          displayName: profile.displayName,
          passwordHash: 'supabase_managed',
          salt: 'supabase',
          createdAt: profile.createdAt,
        });
        const curSettings = (await vaultRepository.getMeta<WorkspaceSettings>('settings')) ?? DEFAULT_SETTINGS;
        await vaultRepository.setMeta('settings', {
          ...curSettings,
          activeAccountEmail: profile.email,
        });
        set({
          isAdmin,
          authProvider: profile.provider,
          emailVerified: profile.emailVerified,
        });
      }

      const sbClient = getSupabaseClient();
      sbClient?.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const profile = mapSupabaseUserToProfile(session.user);
          const currentEmail = get().currentAccount?.email?.toLowerCase();
          if (currentEmail !== profile.email.toLowerCase()) {
            await get().completeSocialOAuthLogin({
              email: profile.email,
              displayName: profile.displayName,
              provider: profile.provider,
              sessionToken: session.access_token,
            });
          }
        }
      });
    }

    await get().refreshFromStorage();

    // If a session exists, verify with backend /api/auth/me and load connected accounts + billing
    const activeAcc = get().currentAccount;
    if (activeAcc) {
      const { isAdmin } = await syncBackendSession({
        email: activeAcc.email,
        displayName: activeAcc.displayName,
      });
      set({ isAdmin });
      await Promise.all([get().fetchConnectedAccounts(), get().fetchBillingStatus()]);
    }

    set({ initialized: true, initializing: false });
  },

  refreshFromStorage: async () => {
    const [mounts, nodes, activity, storedSettings] = await Promise.all([
      vaultRepository.getAllMounts(),
      vaultRepository.getAllNodes(),
      vaultRepository.getAllActivity(),
      vaultRepository.getMeta<WorkspaceSettings>('settings'),
    ]);

    const rawSettings = storedSettings ?? DEFAULT_SETTINGS;
    const normalizedPlanId = normalizePlanId(rawSettings.subscription?.planId);
    const settings: WorkspaceSettings = {
      ...DEFAULT_SETTINGS,
      ...rawSettings,
      subscription: {
        ...DEFAULT_SETTINGS.subscription,
        ...rawSettings.subscription,
        planId: normalizedPlanId,
      },
      customPlans: getEffectivePlans(rawSettings.customPlans),
      scheduledTransfers:
        rawSettings.scheduledTransfers ?? DEFAULT_SETTINGS.scheduledTransfers,
    };

    let currentAccount: Account | null = null;
    if (settings.activeAccountEmail) {
      const acc = await vaultRepository.getAccount(settings.activeAccountEmail);
      currentAccount = acc ?? null;
    }

    const jobs = storageOrchestrator.getUploadJobs();
    let nextAnnouncement = get().uploadAnnouncement;

    for (const j of jobs) {
      const prevStatus = announcedJobStates.get(j.id);
      if (prevStatus !== j.status) {
        announcedJobStates.set(j.id, j.status);
        if (j.status === 'completed') {
          nextAnnouncement = `Upload completed: ${j.fileName}`;
        } else if (j.status === 'error') {
          nextAnnouncement = `Upload failed: ${j.fileName}. ${j.errorMessage ?? ''}`;
        }
      }
    }

    set({
      usingMemoryFallback: vaultRepository.usingMemoryFallback,
      versionChangeDetected: vaultRepository.versionChangeDetected,
      mounts,
      nodes,
      activity,
      settings,
      currentAccount,
      uploadJobs: jobs,
      uploadAnnouncement: nextAnnouncement,
    });
  },

  addToast: (toast) => {
    const id = `toast-${crypto.randomUUID()}`;
    const duration = toast.durationMs ?? 4500;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    setTimeout(() => {
      get().dismissToast(id);
    }, duration);
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  setUpgradePromptReason: (reason) => {
    set({ upgradePromptReason: reason });
  },

  loginWithPassword: async (email, password) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }

    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error || !data.user) {
        throw new Error(error?.message || 'Invalid email or password.');
      }
      setClientSessionToken(data.session?.access_token ?? null);
      const profile = mapSupabaseUserToProfile(data.user);
      const { isAdmin } = await syncBackendSession({
        userId: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        provider: profile.provider,
      });

      const acc: Account = {
        email: profile.email,
        displayName: profile.displayName,
        passwordHash: 'supabase_managed',
        salt: 'supabase',
        createdAt: profile.createdAt,
      };
      await vaultRepository.putAccount(acc);

      const nextSettings: WorkspaceSettings = {
        ...get().settings,
        activeAccountEmail: acc.email,
      };
      await vaultRepository.setMeta('settings', nextSettings);
      set({ isAdmin, authProvider: profile.provider, emailVerified: profile.emailVerified });
      vaultRepository.notifyBroadcast();
      await get().refreshFromStorage();
      await Promise.all([get().fetchConnectedAccounts(), get().fetchBillingStatus()]);
      return;
    }

    // Verified PBKDF2-SHA256 + Server Session fallback when external Supabase URL is not yet configured
    const acc = await vaultRepository.getAccount(cleanEmail);
    if (!acc) {
      throw new Error('No account found with that email address. Please create an account first.');
    }
    const candidateHash = await hashPasswordPBKDF2(password, acc.salt, 600_000);
    if (candidateHash !== acc.passwordHash) {
      throw new Error('Invalid email or password.');
    }

    const { isAdmin } = await syncBackendSession({
      email: acc.email,
      displayName: acc.displayName,
      provider: 'email',
    });

    const nextSettings: WorkspaceSettings = {
      ...get().settings,
      activeAccountEmail: acc.email,
    };
    await vaultRepository.setMeta('settings', nextSettings);
    set({ isAdmin, authProvider: 'email', emailVerified: true });
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
    await Promise.all([get().fetchConnectedAccounts(), get().fetchBillingStatus()]);
  },

  registerAccount: async (email, displayName, password) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();
    if (!cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!cleanName) {
      throw new Error('Full name is required.');
    }
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { full_name: cleanName, name: cleanName },
          emailRedirectTo: getSupabaseOAuthRedirectUrl('/app/overview'),
        },
      });
      if (error) {
        throw new Error(error.message);
      }
      if (data.user && !data.session) {
        return { requiresEmailConfirmation: true };
      }
      if (data.user && data.session) {
        setClientSessionToken(data.session.access_token);
        const profile = mapSupabaseUserToProfile(data.user);
        const { isAdmin } = await syncBackendSession({
          userId: profile.id,
          email: profile.email,
          displayName: cleanName,
          provider: 'email',
        });
        const newAcc: Account = {
          email: profile.email,
          displayName: cleanName,
          passwordHash: 'supabase_managed',
          salt: 'supabase',
          createdAt: Date.now(),
        };
        await vaultRepository.putAccount(newAcc);
        const nextSettings: WorkspaceSettings = {
          ...get().settings,
          activeAccountEmail: newAcc.email,
        };
        await vaultRepository.setMeta('settings', nextSettings);
        set({ isAdmin, authProvider: 'email', emailVerified: profile.emailVerified });
        vaultRepository.notifyBroadcast();
        await get().refreshFromStorage();
        await Promise.all([get().fetchConnectedAccounts(), get().fetchBillingStatus()]);
        return { requiresEmailConfirmation: false };
      }
    }

    const existing = await vaultRepository.getAccount(cleanEmail);
    if (existing) {
      throw new Error('An account with this email address is already registered.');
    }

    const salt = generateSaltHex(16);
    const passwordHash = await hashPasswordPBKDF2(password, salt, 600_000);
    const newAcc: Account = {
      email: cleanEmail,
      displayName: cleanName,
      passwordHash,
      salt,
      createdAt: Date.now(),
    };

    await vaultRepository.putAccount(newAcc);
    const { isAdmin } = await syncBackendSession({
      email: newAcc.email,
      displayName: newAcc.displayName,
      provider: 'email',
    });

    const nextSettings: WorkspaceSettings = {
      ...get().settings,
      activeAccountEmail: newAcc.email,
    };
    await vaultRepository.setMeta('settings', nextSettings);
    set({ isAdmin, authProvider: 'email', emailVerified: true });
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
    await Promise.all([get().fetchConnectedAccounts(), get().fetchBillingStatus()]);
    return { requiresEmailConfirmation: false };
  },

  completeSocialOAuthLogin: async ({ email, displayName, provider, sessionToken }) => {
    const cleanEmail = (email || `${provider}_user@mountyourclouds.com`).trim().toLowerCase();
    const cleanName = (displayName || cleanEmail.split('@')[0] || 'User').trim();
    if (sessionToken) {
      setClientSessionToken(sessionToken);
    }

    const { isAdmin } = await syncBackendSession({
      email: cleanEmail,
      displayName: cleanName,
      provider,
    });

    const acc: Account = {
      email: cleanEmail,
      displayName: cleanName,
      passwordHash: 'oauth_managed',
      salt: provider,
      createdAt: Date.now(),
    };
    await vaultRepository.putAccount(acc);

    const nextSettings: WorkspaceSettings = {
      ...get().settings,
      activeAccountEmail: acc.email,
    };
    await vaultRepository.setMeta('settings', nextSettings);
    set({ isAdmin, authProvider: provider, emailVerified: true });
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
    await Promise.all([get().fetchConnectedAccounts(), get().fetchBillingStatus()]);
  },

  requestPasswordResetEmail: async (email, fallbackNewPassword) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }

    const sb = getSupabaseClient();
    if (sb) {
      const { error } = await sb.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: getSupabaseOAuthRedirectUrl('/auth'),
      });
      if (error) {
        throw new Error(error.message);
      }
      return `Password recovery link sent to ${cleanEmail}. Check your inbox to complete the reset.`;
    }

    if (!fallbackNewPassword || fallbackNewPassword.length < 8) {
      throw new Error('Please enter a new password of at least 8 characters.');
    }

    const existing = await vaultRepository.getAccount(cleanEmail);
    if (!existing) {
      throw new Error('No account found for that email address.');
    }

    const newSalt = generateSaltHex(16);
    const passwordHash = await hashPasswordPBKDF2(fallbackNewPassword, newSalt, 600_000);
    await vaultRepository.putAccount({
      ...existing,
      salt: newSalt,
      passwordHash,
    });
    vaultRepository.notifyBroadcast();
    return 'Account password updated. You can now sign in with your new password.';
  },

  signOut: async () => {
    const sb = getSupabaseClient();
    if (sb) {
      await sb.auth.signOut().catch(() => {});
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore
    }
    setClientSessionToken(null);

    const nextSettings: WorkspaceSettings = {
      ...get().settings,
      activeAccountEmail: null,
    };
    await vaultRepository.setMeta('settings', nextSettings);
    set({ isAdmin: false, connectedAccounts: [] });
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  updateProfile: async (displayName) => {
    const acc = get().currentAccount;
    if (!acc) return;
    const clean = displayName.trim();
    if (!clean) throw new Error('Display name cannot be empty.');

    const sb = getSupabaseClient();
    if (sb) {
      await sb.auth.updateUser({ data: { full_name: clean, name: clean } }).catch(() => {});
    }

    await vaultRepository.putAccount({
      ...acc,
      displayName: clean,
    });
    await syncBackendSession({ email: acc.email, displayName: clean });
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  deleteUserAccount: async () => {
    try {
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: getAuthorizedHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete account on server.');
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete account.');
    }

    await get().signOut();
  },

  exportLocalWorkspaceData: async () => {
    const bundle = await vaultRepository.exportGenuineUserData();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mountyourclouds-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  setCurrentFolderId: (folderId) => {
    set({
      currentFolderId: folderId,
      selectedNodeIds: [],
      focusedNodeId: null,
    });
  },

  setSelectedNodeIds: (ids, focusedId) => {
    set((state) => ({
      selectedNodeIds: ids,
      focusedNodeId: focusedId !== undefined ? focusedId : state.focusedNodeId,
    }));
  },

  setFocusedNodeId: (id) => {
    set({ focusedNodeId: id });
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setCategoryFilter: (cat) => set({ categoryFilter: cat }),
  setProviderFilter: (providerId) => set({ providerFilter: providerId }),

  toggleTreeFolder: (folderId, forceExpanded) => {
    set((state) => {
      const exists = state.expandedTreeFolderIds.includes(folderId);
      const shouldExpand = forceExpanded !== undefined ? forceExpanded : !exists;
      if (shouldExpand && !exists) {
        return { expandedTreeFolderIds: [...state.expandedTreeFolderIds, folderId] };
      }
      if (!shouldExpand && exists) {
        return {
          expandedTreeFolderIds: state.expandedTreeFolderIds.filter((id) => id !== folderId),
        };
      }
      return state;
    });
  },

  setExplorerView: async (view) => {
    const nextSettings: WorkspaceSettings = {
      ...get().settings,
      explorerView: view,
    };
    set({ settings: nextSettings });
    await vaultRepository.setMeta('settings', nextSettings);
  },

  setTheme: async (theme) => {
    const nextSettings: WorkspaceSettings = {
      ...get().settings,
      theme,
    };
    if (typeof document !== 'undefined') {
      const prefersDark =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      const shouldBeDark = theme === 'dark' || (theme === 'system' && prefersDark);
      document.documentElement.classList.toggle('dark', shouldBeDark);
    }
    set({ settings: nextSettings });
    await vaultRepository.setMeta('settings', nextSettings);
  },

  setSorting: async (field, direction) => {
    const cur = get().settings;
    const nextDir: SortDirection =
      direction ?? (cur.sortField === field && cur.sortDirection === 'asc' ? 'desc' : 'asc');
    const nextSettings: WorkspaceSettings = {
      ...cur,
      sortField: field,
      sortDirection: nextDir,
    };
    set({ settings: nextSettings });
    await vaultRepository.setMeta('settings', nextSettings);
  },

  toggleSidebarCollapsed: async () => {
    const cur = get().settings;
    const nextSettings: WorkspaceSettings = {
      ...cur,
      sidebarCollapsed: !cur.sidebarCollapsed,
    };
    set({ settings: nextSettings });
    await vaultRepository.setMeta('settings', nextSettings);
  },

  toggleInspectorOpen: async (force) => {
    const cur = get().settings;
    const nextOpen = force !== undefined ? force : !cur.inspectorOpen;
    const nextSettings: WorkspaceSettings = {
      ...cur,
      inspectorOpen: nextOpen,
    };
    set({ settings: nextSettings });
    await vaultRepository.setMeta('settings', nextSettings);
  },

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),
  openUploadModal: (initialFiles = []) =>
    set({ uploadModalOpen: true, preselectedUploadFiles: initialFiles }),
  closeUploadModal: () => set({ uploadModalOpen: false, preselectedUploadFiles: [] }),
  setPreviewFileId: (fileId) => set({ previewFileId: fileId }),
  setNewFolderModalOpen: (open) => set({ newFolderModalOpen: open }),
  setRenameNodeId: (nodeId) => set({ renameNodeId: nodeId }),
  setMoveModalNodeIds: (nodeIds) => set({ moveModalNodeIds: nodeIds }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

  fetchBillingStatus: async () => {
    try {
      const res = await fetch('/api/billing/subscription', {
        headers: getAuthorizedHeaders(),
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      const serverPlans = data.razorpayPlanIds || {};
      const fallbackPlans = clientEnv.razorpayPlanIds;

      set({
        razorpayConfigured: Boolean(data.razorpayConfigured || clientEnv.razorpayKeyId),
        razorpayMode:
          data.razorpayMode === 'live' || clientEnv.razorpayMode === 'live' ? 'live' : 'test',
        razorpayKeyId: data.razorpayKeyId || clientEnv.razorpayKeyId || null,
        razorpayPlanIds: {
          proMonthly: serverPlans.proMonthly || fallbackPlans.proMonthly || '',
          proAnnual: serverPlans.proAnnual || fallbackPlans.proAnnual || '',
          ultraMonthly: serverPlans.ultraMonthly || fallbackPlans.ultraMonthly || '',
          ultraAnnual: serverPlans.ultraAnnual || fallbackPlans.ultraAnnual || '',
        },
      });

      if (data.subscription) {
        const cur = get().settings;
        const nextSettings: WorkspaceSettings = {
          ...cur,
          subscription: {
            planId: normalizePlanId(data.subscription.planId),
            billingCycle: data.subscription.billingCycle || 'monthly',
            cancelledAt: data.subscription.cancelledAt ?? null,
            invoices: data.subscription.invoices ?? [],
          },
        };
        await vaultRepository.setMeta('settings', nextSettings);
        set({ settings: nextSettings });
      }
    } catch {
      // Offline or test runner
    }
  },

  switchSubscriptionPlan: async (planId, billingCycle) => {
    const { mounts, settings, razorpayPlanIds } = get();
    const plans = getEffectivePlans(settings.customPlans);
    const externalMountsCount = Math.max(0, mounts.filter((m) => m.kind !== 'local').length);
    const check = checkPlanSwitchAllowed(planId, externalMountsCount, plans);
    if (!check.allowed) {
      throw new Error(check.reason ?? 'Plan downgrade blocked.');
    }

    if (planId === 'free') {
      try {
        await fetch('/api/billing/create-order', {
          method: 'POST',
          headers: getAuthorizedHeaders({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify({ planId: 'free', billingCycle }),
        });
      } catch {
        // Continue local update if offline in tests
      }

      const nextSettings: WorkspaceSettings = {
        ...settings,
        subscription: {
          ...settings.subscription,
          planId: 'free',
          billingCycle,
          cancelledAt: null,
        },
      };
      await vaultRepository.setMeta('settings', nextSettings);
      vaultRepository.notifyBroadcast();
      await get().refreshFromStorage();
      return;
    }

    const rzpPlanIds = razorpayPlanIds || clientEnv.razorpayPlanIds;
    const selectedRazorpayPlanId =
      planId === 'pro'
        ? billingCycle === 'annual'
          ? rzpPlanIds.proAnnual
          : rzpPlanIds.proMonthly
        : billingCycle === 'annual'
        ? rzpPlanIds.ultraAnnual
        : rzpPlanIds.ultraMonthly;

    // Paid plan (PRO or ULTRA): Request recurring Subscription (if Plan ID is set) or Order from backend
    const orderRes = await fetch('/api/billing/create-order', {
      method: 'POST',
      headers: getAuthorizedHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({
        planId,
        billingCycle,
        razorpayPlanId: selectedRazorpayPlanId || undefined,
      }),
    });

    if (!orderRes.ok) {
      const errData = await orderRes.json().catch(() => ({}));
      throw new Error(
        errData.error ||
          'Razorpay payment gateway is not configured on the server. Configure Razorpay in the Admin Dashboard to enable paid plan upgrades.'
      );
    }

    const orderData = await orderRes.json();
    const effectiveKeyId = orderData.keyId || get().razorpayKeyId || clientEnv.razorpayKeyId;

    // Load Razorpay Checkout SDK dynamically if in browser
    if (typeof window !== 'undefined') {
      await new Promise<void>((resolve, reject) => {
        const openCheckout = () => {
          const RazorpayCtor = (window as unknown as { Razorpay?: any }).Razorpay;
          if (!RazorpayCtor) {
            reject(new Error('Failed to load Razorpay Checkout SDK.'));
            return;
          }

          const isRecurringSubscription = Boolean(orderData.subscriptionId);
          const checkoutOptions: Record<string, any> = {
            key: effectiveKeyId,
            name: 'MountYourClouds',
            description: `${plans[planId].name} Plan (${billingCycle})`,
            prefill: {
              name: get().currentAccount?.displayName || '',
              email: get().currentAccount?.email || '',
            },
            theme: { color: '#0071E3' },
            handler: async (response: {
              razorpay_order_id?: string;
              razorpay_subscription_id?: string;
              razorpay_payment_id: string;
              razorpay_signature: string;
            }) => {
              try {
                const verifyRes = await fetch('/api/billing/verify-payment', {
                  method: 'POST',
                  headers: getAuthorizedHeaders({ 'Content-Type': 'application/json' }),
                  credentials: 'include',
                  body: JSON.stringify({
                    razorpay_order_id: response.razorpay_order_id || (!isRecurringSubscription ? orderData.orderId : undefined),
                    razorpay_subscription_id:
                      response.razorpay_subscription_id ||
                      (isRecurringSubscription ? orderData.subscriptionId : undefined),
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                  }),
                });
                if (!verifyRes.ok) {
                  const vErr = await verifyRes.json().catch(() => ({}));
                  reject(new Error(vErr.error || 'Payment signature verification failed.'));
                  return;
                }
                await get().fetchBillingStatus();
                await get().refreshFromStorage();
                resolve();
              } catch (e) {
                reject(e);
              }
            },
            modal: {
              ondismiss: () => {
                reject(new Error('Checkout cancelled before payment completion.'));
              },
            },
          };

          if (isRecurringSubscription) {
            checkoutOptions.subscription_id = orderData.subscriptionId;
          } else {
            checkoutOptions.order_id = orderData.orderId;
            checkoutOptions.amount = orderData.amountPaise;
            checkoutOptions.currency = orderData.currency || 'INR';
          }

          const rzp = new RazorpayCtor(checkoutOptions);
          rzp.open();
        };

        if ((window as unknown as { Razorpay?: any }).Razorpay) {
          openCheckout();
        } else {
          const existingScript = document.querySelector(
            'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
          ) as HTMLScriptElement | null;
          if (existingScript) {
            existingScript.addEventListener('load', openCheckout, { once: true });
            existingScript.addEventListener(
              'error',
              () => reject(new Error('Could not load Razorpay Checkout script.')),
              { once: true }
            );
          } else {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.async = true;
            script.onload = openCheckout;
            script.onerror = () => reject(new Error('Could not load Razorpay Checkout script.'));
            document.body.appendChild(script);
          }
        }
      });
    }
  },

  cancelSubscription: async () => {
    const { mounts, settings } = get();
    const plans = getEffectivePlans(settings.customPlans);
    const freePlan = plans.free;
    const externalMounts = Math.max(0, mounts.filter((m) => m.kind !== 'local').length);
    const canImmediatelyDropToFree = externalMounts <= freePlan.maxMounts;

    try {
      await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: getAuthorizedHeaders(),
        credentials: 'include',
      });
    } catch {
      // Continue
    }

    const nextSettings: WorkspaceSettings = {
      ...settings,
      subscription: {
        ...settings.subscription,
        planId: canImmediatelyDropToFree ? 'free' : settings.subscription.planId,
        cancelledAt: Date.now(),
      },
    };

    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  updateCustomPlanConfig: async (planId, updatedPlan) => {
    const cur = get().settings;
    const currentPlans = getEffectivePlans(cur.customPlans);
    const nextPlans: Record<PlanId, PlanDefinition> = {
      ...currentPlans,
      [planId]: updatedPlan,
    };

    const nextSettings: WorkspaceSettings = {
      ...cur,
      customPlans: nextPlans,
    };

    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  resetCustomPlans: async () => {
    const cur = get().settings;
    const nextSettings: WorkspaceSettings = {
      ...cur,
      customPlans: structuredClone(DEFAULT_PLANS),
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  addScheduledTransfer: async (job) => {
    const cur = get().settings;
    const plans = getEffectivePlans(cur.customPlans);
    const activePlan = plans[normalizePlanId(cur.subscription.planId)];

    if (!activePlan.allowScheduledTransfers) {
      get().setUpgradePromptReason(
        `Scheduled & recurring cross-cloud transfers require the PRO (₹${plans.pro.baseMonthlyInr}/mo) or ULTRA (₹${plans.ultra.baseMonthlyInr}/mo) plan.`
      );
      throw new Error('Scheduled transfers require PRO or ULTRA.');
    }

    if (job.schedule !== 'daily' && !activePlan.allowCrossCloudSync) {
      get().setUpgradePromptReason(
        `Hourly and weekly recurring sync schedules require the ULTRA (₹${plans.ultra.baseMonthlyInr}/mo) plan.`
      );
      throw new Error('Recurring sync requires ULTRA.');
    }

    const newJob: ScheduledTransferJob = {
      ...job,
      id: `sched-${crypto.randomUUID()}`,
      lastRunAt: null,
      createdAt: Date.now(),
    };

    const nextSettings: WorkspaceSettings = {
      ...cur,
      scheduledTransfers: [newJob, ...(cur.scheduledTransfers ?? [])],
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  toggleScheduledTransfer: async (jobId) => {
    const cur = get().settings;
    const list = (cur.scheduledTransfers ?? []).map((j) =>
      j.id === jobId ? { ...j, enabled: !j.enabled } : j
    );
    const nextSettings: WorkspaceSettings = {
      ...cur,
      scheduledTransfers: list,
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  runScheduledTransferNow: async (jobId) => {
    const { settings, nodes } = get();
    const job = (settings.scheduledTransfers ?? []).find((j) => j.id === jobId);
    if (!job) return;

    const candidateIds = nodes
      .filter(
        (n) =>
          n.type === 'file' &&
          n.providerId === job.sourceMountId &&
          n.trashedAt === null
      )
      .slice(0, 5)
      .map((n) => n.id);

    if (candidateIds.length > 0) {
      await storageOrchestrator.transferBetweenClouds(
        candidateIds,
        job.targetMountId
      );
    }

    const list = (settings.scheduledTransfers ?? []).map((j) =>
      j.id === jobId ? { ...j, lastRunAt: Date.now() } : j
    );
    const nextSettings: WorkspaceSettings = {
      ...get().settings,
      scheduledTransfers: list,
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  deleteScheduledTransfer: async (jobId) => {
    const cur = get().settings;
    const list = (cur.scheduledTransfers ?? []).filter((j) => j.id !== jobId);
    const nextSettings: WorkspaceSettings = {
      ...cur,
      scheduledTransfers: list,
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  updateDeveloperSettings: async (dev) => {
    const cur = get().settings;
    const nextSettings: WorkspaceSettings = {
      ...cur,
      devSettings: {
        ...cur.devSettings,
        ...dev,
      },
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  updateApiCredentials: async (creds) => {
    const cur = get().settings;
    const nextSettings: WorkspaceSettings = {
      ...cur,
      apiCredentials: {
        ...(cur.apiCredentials || {}),
        ...creds,
      },
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  fetchConnectedAccounts: async () => {
    try {
      const res = await fetch('/api/oauth/accounts', {
        headers: getAuthorizedHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        set({ connectedAccounts: data.accounts || [] });
      }
    } catch {
      // Standalone browser mode or server offline
    }
  },

  disconnectCloudAccount: async (id: string) => {
    try {
      const res = await fetch(`/api/oauth/accounts/${encodeURIComponent(id)}/disconnect`, {
        method: 'POST',
        headers: getAuthorizedHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to disconnect account');
      }
      await get().fetchConnectedAccounts();
      get().addToast({
        title: 'Account Disconnected',
        description: 'Cloud account was disconnected and tokens securely removed.',
        variant: 'default',
      });
    } catch (err) {
      get().addToast({
        title: 'Disconnection Failed',
        description: err instanceof Error ? err.message : 'Could not disconnect account',
        variant: 'error',
      });
    }
  },

  refreshCloudAccount: async (id: string) => {
    try {
      const res = await fetch(`/api/oauth/accounts/${encodeURIComponent(id)}/refresh`, {
        method: 'POST',
        headers: getAuthorizedHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to refresh account token');
      }
      await get().fetchConnectedAccounts();
      get().addToast({
        title: 'Token Refreshed',
        description: 'Account authorization tokens successfully refreshed.',
        variant: 'success',
      });
    } catch (err) {
      get().addToast({
        title: 'Token Refresh Failed',
        description: err instanceof Error ? err.message : 'Could not refresh account token',
        variant: 'error',
      });
    }
  },
}));

export function computeMountUsedBytesMap(
  nodes: VaultNode[]
): Map<string, { usedBytes: number; fileCount: number }> {
  const map = new Map<string, { usedBytes: number; fileCount: number }>();
  for (const n of nodes) {
    if (n.type === 'file') {
      const cur = map.get(n.providerId) ?? { usedBytes: 0, fileCount: 0 };
      cur.usedBytes += n.sizeBytes;
      cur.fileCount += 1;
      map.set(n.providerId, cur);
    }
  }
  return map;
}

export function buildBreadcrumbChain(
  folderId: string | null,
  nodes: VaultNode[]
): { id: string | null; name: string }[] {
  const chain: { id: string | null; name: string }[] = [{ id: null, name: 'All Files' }];
  if (!folderId) return chain;

  const map = new Map(nodes.map((n) => [n.id, n]));
  const segments: { id: string | null; name: string }[] = [];
  let curr = map.get(folderId);
  const visited = new Set<string>();

  while (curr && curr.type === 'folder' && !isEffectivelyTrashed(curr, map)) {
    if (visited.has(curr.id)) break;
    visited.add(curr.id);
    segments.unshift({ id: curr.id, name: curr.name });
    curr = curr.parentId ? map.get(curr.parentId) : undefined;
  }

  return [...chain, ...segments];
}
