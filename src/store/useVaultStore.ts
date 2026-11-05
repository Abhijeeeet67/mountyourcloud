import { create } from 'zustand';
import {
  DEMO_ACCOUNT_EMAIL,
  DEMO_ACCOUNT_NAME,
} from '../lib/constants';
import { generateSaltHex, hashPasswordPBKDF2 } from '../lib/crypto';
import {
  DEFAULT_PLANS,
  checkPlanSwitchAllowed,
  getBilledTotalInr,
  getEffectivePlans,
  normalizePlanId,
} from '../lib/pricing';
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
  connectedAccounts: ConnectedCloudAccount[];
  mounts: ProviderMount[];
  nodes: VaultNode[];
  activity: ActivityEvent[];
  settings: WorkspaceSettings;
  uploadJobs: UploadJob[];

  // Explorer UI state
  currentFolderId: string | null;
  selectedNodeIds: string[];
  focusedNodeId: string | null;
  searchQuery: string;
  categoryFilter: FileCategory;
  providerFilter: string; // 'all' or mount.id
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
  registerAccount: (email: string, displayName: string, password: string) => Promise<void>;
  resetPasswordLocal: (email: string, newPassword: string) => Promise<void>;
  launchDemoWorkspace: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (displayName: string) => Promise<void>;

  // Explorer & View Actions
  setCurrentFolderId: (folderId: string | null) => void;
  setSelectedNodeIds: (ids: string[], focusedId?: string | null) => void;
  setFocusedNodeId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setCategoryFilter: (cat: FileCategory) => void;
  setProviderFilter: (providerId: string) => void;
  toggleTreeFolder: (folderId: string, forceExpanded?: boolean) => void;
  setExplorerView: (view: ExplorerViewMode) => Promise<void>;
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

  // Subscription, Admin Config, Automation & Dev Actions
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
  updateTelegramWebhookSim: (
    patch: Partial<NonNullable<WorkspaceSettings['telegramWebhookSim']>>
  ) => Promise<void>;
  updateDeveloperSettings: (dev: Partial<DeveloperSettings>) => Promise<void>;
  updateApiCredentials: (creds: Record<string, string>) => Promise<void>;
  generateDemoToken: (name: string) => Promise<string>;
  revokeDemoToken: (tokenId: string) => Promise<void>;
  resetSampleWorkspace: () => Promise<void>;

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
    planId: 'pro',
    billingCycle: 'monthly',
    cancelledAt: null,
    invoices: [],
  },
  customPlans: structuredClone(DEFAULT_PLANS),
  scheduledTransfers: [],
  telegramWebhookSim: {
    enabled: true,
    botHandle: '@MountYourCloudsNotifyBot',
    notifyOnUpload: true,
    notifyOnQuotaWarn: true,
  },
  devSettings: {
    failureRate: 0,
    offline: false,
  },
  demoTokens: [],
  activeAccountEmail: null,
};

const announcedJobStates = new Map<string, string>();

export const useVaultStore = create<VaultStoreState>((set, get) => ({
  initialized: false,
  initializing: false,
  usingMemoryFallback: false,
  versionChangeDetected: false,

  currentAccount: null,
  connectedAccounts: [],
  mounts: [],
  nodes: [],
  activity: [],
  settings: DEFAULT_SETTINGS,
  uploadJobs: [],

  currentFolderId: null,
  selectedNodeIds: [],
  focusedNodeId: null,
  searchQuery: '',
  categoryFilter: 'all',
  providerFilter: 'all',
  expandedTreeFolderIds: ['fld-engineering', 'fld-design'],

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

    await get().refreshFromStorage();
    await get().fetchConnectedAccounts();
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
      telegramWebhookSim:
        rawSettings.telegramWebhookSim ?? DEFAULT_SETTINGS.telegramWebhookSim,
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
    const acc = await vaultRepository.getAccount(email);
    if (!acc) {
      throw new Error('No local demo account found with that email address.');
    }
    const candidateHash = await hashPasswordPBKDF2(password, acc.salt, 600_000);
    if (candidateHash !== acc.passwordHash) {
      throw new Error('Incorrect password for this local demo account.');
    }

    const nextSettings: WorkspaceSettings = {
      ...get().settings,
      activeAccountEmail: acc.email,
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  registerAccount: async (email, displayName, password) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();
    if (!cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!cleanName) {
      throw new Error('Display name is required.');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const existing = await vaultRepository.getAccount(cleanEmail);
    if (existing) {
      throw new Error('An account with this email already exists in this browser.');
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
    const nextSettings: WorkspaceSettings = {
      ...get().settings,
      activeAccountEmail: newAcc.email,
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  resetPasswordLocal: async (email, newPassword) => {
    const cleanEmail = email.trim().toLowerCase();
    const existing = await vaultRepository.getAccount(cleanEmail);
    if (!existing) {
      throw new Error('No local demo account exists for that email address.');
    }
    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters.');
    }

    const newSalt = generateSaltHex(16);
    const passwordHash = await hashPasswordPBKDF2(newPassword, newSalt, 600_000);
    await vaultRepository.putAccount({
      ...existing,
      salt: newSalt,
      passwordHash,
    });
    vaultRepository.notifyBroadcast();
  },

  launchDemoWorkspace: async () => {
    let demoAcc = await vaultRepository.getAccount(DEMO_ACCOUNT_EMAIL);
    if (!demoAcc) {
      const salt = generateSaltHex(16);
      const passwordHash = await hashPasswordPBKDF2('demo-vault-password', salt, 600_000);
      demoAcc = {
        email: DEMO_ACCOUNT_EMAIL,
        displayName: DEMO_ACCOUNT_NAME,
        passwordHash,
        salt,
        createdAt: Date.now(),
      };
      await vaultRepository.putAccount(demoAcc);
    }

    const nextSettings: WorkspaceSettings = {
      ...get().settings,
      activeAccountEmail: demoAcc.email,
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  signOut: async () => {
    const nextSettings: WorkspaceSettings = {
      ...get().settings,
      activeAccountEmail: null,
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  updateProfile: async (displayName) => {
    const acc = get().currentAccount;
    if (!acc) return;
    const clean = displayName.trim();
    if (!clean) throw new Error('Display name cannot be empty.');
    await vaultRepository.putAccount({
      ...acc,
      displayName: clean,
    });
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
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

  switchSubscriptionPlan: async (planId, billingCycle) => {
    const { mounts, settings } = get();
    const plans = getEffectivePlans(settings.customPlans);
    const targetPlan = plans[planId];
    const externalMountsCount = Math.max(0, mounts.length - 1);
    const check = checkPlanSwitchAllowed(planId, externalMountsCount, plans);
    if (!check.allowed) {
      throw new Error(check.reason ?? 'Plan downgrade blocked.');
    }

    const billedInr = getBilledTotalInr(targetPlan, billingCycle);
    const newInvoices = [...settings.subscription.invoices];
    if (billedInr > 0) {
      newInvoices.unshift({
        id: `INV-${new Date().getFullYear()}-${String(newInvoices.length + 2).padStart(3, '0')}`,
        issuedAt: Date.now(),
        description: `${targetPlan.name} Plan — ${
          billingCycle === 'annual' ? 'Annual (20% Off)' : 'Monthly'
        } Subscription (Demo)`,
        amountInr: billedInr,
      });
    }

    const nextSettings: WorkspaceSettings = {
      ...settings,
      subscription: {
        planId,
        billingCycle,
        cancelledAt: null,
        invoices: newInvoices,
      },
    };

    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  cancelSubscription: async () => {
    const { mounts, settings } = get();
    const plans = getEffectivePlans(settings.customPlans);
    const freePlan = plans.free;
    const externalMounts = Math.max(0, mounts.length - 1);

    // If external mounts fit in FREE plan, switch straight to FREE; otherwise mark subscription as cancelled at period end and keep current mounts intact
    const canImmediatelyDropToFree = externalMounts <= freePlan.maxMounts;

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

  updateTelegramWebhookSim: async (patch) => {
    const cur = get().settings;
    const currentSim = cur.telegramWebhookSim ?? DEFAULT_SETTINGS.telegramWebhookSim!;
    const nextSettings: WorkspaceSettings = {
      ...cur,
      telegramWebhookSim: {
        ...currentSim,
        ...patch,
      },
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

  generateDemoToken: async (name) => {
    const cleanName = name.trim() || 'CLI Token (Demo)';
    const randBytes = new Uint8Array(12);
    crypto.getRandomValues(randBytes);
    const hex = Array.from(randBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const prefix = `tv_demo_${hex.slice(0, 4)}`;
    const tokenValue = `${prefix}_${hex.slice(4)}`;

    const cur = get().settings;
    const nextSettings: WorkspaceSettings = {
      ...cur,
      demoTokens: [
        {
          id: `tok-${crypto.randomUUID()}`,
          name: cleanName,
          prefix,
          tokenValue,
          createdAt: Date.now(),
        },
        ...cur.demoTokens,
      ],
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
    return tokenValue;
  },

  revokeDemoToken: async (tokenId) => {
    const cur = get().settings;
    const nextSettings: WorkspaceSettings = {
      ...cur,
      demoTokens: cur.demoTokens.filter((t) => t.id !== tokenId),
    };
    await vaultRepository.setMeta('settings', nextSettings);
    vaultRepository.notifyBroadcast();
    await get().refreshFromStorage();
  },

  resetSampleWorkspace: async () => {
    await storageOrchestrator.resetWorkspace();
    set({
      currentFolderId: null,
      selectedNodeIds: [],
      focusedNodeId: null,
      previewFileId: null,
    });
    await get().refreshFromStorage();
  },

  fetchConnectedAccounts: async () => {
    try {
      const res = await fetch('/api/oauth/accounts');
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

// Selector helper: compute usedBytes per mount (including trashed files until permanently deleted, §2)
export function computeMountUsedBytesMap(nodes: VaultNode[]): Map<string, { usedBytes: number; fileCount: number }> {
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

// Selector helper: build breadcrumb path for a folderId
export function buildBreadcrumbChain(
  folderId: string | null,
  nodes: VaultNode[]
): { id: string | null; name: string }[] {
  const chain: { id: string | null; name: string }[] = [{ id: null, name: 'All Files' }];
  if (!folderId) return chain;

  const map = new Map(nodes.map((n) => [n.id, n]));
  const segments: { id: string; name: string }[] = [];
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
