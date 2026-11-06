import { openDB, type IDBPDatabase } from 'idb';
import { DEFAULT_PLANS } from '../lib/pricing';
import type {
  Account,
  ActivityEvent,
  FileNode,
  PersistedInFlightUpload,
  ProviderMount,
  VaultNode,
  WorkspaceSettings,
} from '../types/domain';
import { generateDeterministicSeedBundle } from './seed';

const DB_NAME = 'mountyourclouds_db';
const DB_VERSION = 2;
const BROADCAST_CHANNEL_NAME = 'mountyourclouds_sync';

const LEGACY_SAMPLE_MOUNT_IDS = new Set([
  'mega-vault',
  'terabox-cloud',
  's3-prod',
  'r2-edge',
  'gcs-archive',
  'webdav-nas',
]);

export function isEffectivelyTrashed(
  node: VaultNode,
  nodeMap: Map<string, VaultNode>
): boolean {
  let curr: VaultNode | undefined = node;
  const visited = new Set<string>();
  while (curr) {
    if (visited.has(curr.id)) break;
    visited.add(curr.id);
    if (curr.trashedAt !== null) return true;
    curr = curr.parentId ? nodeMap.get(curr.parentId) : undefined;
  }
  return false;
}

export function collectSubtreeIds(
  rootId: string,
  allNodes: VaultNode[]
): { nodeIds: string[]; fileNodes: FileNode[] } {
  const childrenMap = new Map<string | null, VaultNode[]>();
  const nodeMap = new Map<string, VaultNode>();

  for (const n of allNodes) {
    nodeMap.set(n.id, n);
    const list = childrenMap.get(n.parentId) ?? [];
    list.push(n);
    childrenMap.set(n.parentId, list);
  }

  const nodeIds: string[] = [];
  const fileNodes: FileNode[] = [];
  const stack: string[] = [rootId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodeMap.get(id);
    if (!node) continue;

    nodeIds.push(id);
    if (node.type === 'file') {
      fileNodes.push(node);
    } else {
      const kids = childrenMap.get(id) ?? [];
      for (const k of kids) {
        stack.push(k.id);
      }
    }
  }

  return { nodeIds, fileNodes };
}

class MemoryFallbackStore {
  public meta = new Map<string, unknown>();
  public accounts = new Map<string, Account>();
  public mounts = new Map<string, ProviderMount>();
  public nodes = new Map<string, VaultNode>();
  public blobs = new Map<string, Blob>();
  public thumbs = new Map<string, Blob>();
  public activity: ActivityEvent[] = [];
  private nextActivityId = 1;

  public clearAll(): void {
    this.meta.clear();
    this.accounts.clear();
    this.mounts.clear();
    this.nodes.clear();
    this.blobs.clear();
    this.thumbs.clear();
    this.activity = [];
    this.nextActivityId = 1;
  }

  public addActivity(ev: Omit<ActivityEvent, 'id'>): number {
    const id = this.nextActivityId++;
    this.activity.push({ ...ev, id });
    return id;
  }
}

function createCleanLocalVaultMount(): ProviderMount {
  const now = Date.now();
  return {
    id: 'local-vault',
    kind: 'local',
    mode: 'real',
    name: 'Local Browser Vault',
    endpoint: 'idb://mountyourclouds_db',
    region: 'browser-local',
    bucket: null,
    status: 'connected',
    allocatedBytes: 20 * 1_000_000_000,
    latencyMs: 3,
    zeroEgress: true,
    lastSyncedAt: now,
    createdAt: now,
  };
}

function createCleanDefaultSettings(): WorkspaceSettings {
  return {
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
}

export class VaultRepository {
  private db: IDBPDatabase | null = null;
  public usingMemoryFallback = false;
  public versionChangeDetected = false;
  private mem = new MemoryFallbackStore();
  private channel: BroadcastChannel | null = null;
  private changeListeners = new Set<() => void>();

  public async init(): Promise<{ interruptedUploads: PersistedInFlightUpload[] }> {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window && !this.channel) {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.channel.onmessage = () => {
          this.changeListeners.forEach((cb) => cb());
        };
      } catch {
        // Ignore BroadcastChannel errors
      }
    }

    if (!this.db && !this.usingMemoryFallback) {
      try {
        if (typeof indexedDB === 'undefined') {
          throw new Error('indexedDB is undefined in this environment');
        }
        this.db = await openDB(DB_NAME, DB_VERSION, {
          upgrade(db, _oldVersion, _newVersion, tx) {
            // Migrate out-of-line key stores ('meta', 'blobs', 'thumbs') if a legacy version created them with inline keyPath
            for (const storeName of ['meta', 'blobs', 'thumbs'] as const) {
              if (db.objectStoreNames.contains(storeName)) {
                const existing = tx.objectStore(storeName);
                if (existing.keyPath !== null) {
                  db.deleteObjectStore(storeName);
                  db.createObjectStore(storeName);
                }
              } else {
                db.createObjectStore(storeName);
              }
            }

            if (db.objectStoreNames.contains('accounts')) {
              if (tx.objectStore('accounts').keyPath !== 'email') {
                db.deleteObjectStore('accounts');
                db.createObjectStore('accounts', { keyPath: 'email' });
              }
            } else {
              db.createObjectStore('accounts', { keyPath: 'email' });
            }

            if (db.objectStoreNames.contains('mounts')) {
              if (tx.objectStore('mounts').keyPath !== 'id') {
                db.deleteObjectStore('mounts');
                db.createObjectStore('mounts', { keyPath: 'id' });
              }
            } else {
              db.createObjectStore('mounts', { keyPath: 'id' });
            }

            if (db.objectStoreNames.contains('nodes')) {
              if (tx.objectStore('nodes').keyPath !== 'id') {
                db.deleteObjectStore('nodes');
              }
            }
            if (!db.objectStoreNames.contains('nodes')) {
              const nodeStore = db.createObjectStore('nodes', { keyPath: 'id' });
              nodeStore.createIndex('by_parent', 'parentId', { unique: false });
              nodeStore.createIndex('by_provider', 'providerId', { unique: false });
              nodeStore.createIndex('by_starred', 'starred', { unique: false });
              nodeStore.createIndex('by_trashed', 'trashedAt', { unique: false });
            }

            if (db.objectStoreNames.contains('activity')) {
              if (tx.objectStore('activity').keyPath !== 'id') {
                db.deleteObjectStore('activity');
              }
            }
            if (!db.objectStoreNames.contains('activity')) {
              const actStore = db.createObjectStore('activity', {
                keyPath: 'id',
                autoIncrement: true,
              });
              actStore.createIndex('by_ts', 'ts', { unique: false });
            }
          },
          blocked: () => {},
          blocking: () => {
            this.versionChangeDetected = true;
            this.changeListeners.forEach((cb) => cb());
          },
          terminated: () => {
            this.usingMemoryFallback = true;
            this.changeListeners.forEach((cb) => cb());
          },
        });
      } catch {
        this.usingMemoryFallback = true;
        this.db = null;
      }
    }

    try {
      // Production Initialization: Do NOT call seedDatabase() automatically.
      // Ensure only the built-in Local Vault mount and clean settings exist on first launch,
      // and clean up any legacy prototype auto-seeded mounts if present.
      const legacySeeded = await this.getMeta<boolean>('seeded');
      const cleanInitialized = await this.getMeta<boolean>('productionInitialized');

      if (legacySeeded && !cleanInitialized) {
        await this.purgeLegacySampleData();
        await this.setMeta('productionInitialized', true);
      } else if (!cleanInitialized) {
        const existingMounts = await this.getAllMounts();
        if (!existingMounts.some((m) => m.id === 'local-vault')) {
          await this.putMount(createCleanLocalVaultMount());
        }
        const existingSettings = await this.getMeta<WorkspaceSettings>('settings');
        if (!existingSettings) {
          await this.setMeta('settings', createCleanDefaultSettings());
        }
        await this.setMeta('productionInitialized', true);
      }

      const inFlight = (await this.getMeta<PersistedInFlightUpload[]>('inFlightUploads')) ?? [];
      if (inFlight.length > 0) {
        await this.setMeta('inFlightUploads', []);
      }

      await this.purgeExpiredTrash();

      return { interruptedUploads: inFlight };
    } catch (err) {
      console.warn('VaultRepository: Recovering from legacy IndexedDB schema conflict:', err);
      try {
        this.db?.close();
      } catch {
        // Ignore close error
      }
      this.db = null;
      this.usingMemoryFallback = true;
      await this.putMount(createCleanLocalVaultMount());
      await this.setMeta('settings', createCleanDefaultSettings());
      await this.setMeta('productionInitialized', true);
      return { interruptedUploads: [] };
    }
  }

  /**
   * Removes fictional sample mounts, placeholder files without real user blobs, and the demo account
   * while preserving any genuine files uploaded by the user.
   */
  public async purgeLegacySampleData(): Promise<{ preservedFiles: number; removedSampleNodes: number }> {
    const [mounts, nodes] = await Promise.all([this.getAllMounts(), this.getAllNodes()]);

    for (const m of mounts) {
      if (LEGACY_SAMPLE_MOUNT_IDS.has(m.id) || m.mode === 'simulated') {
        await this.deleteMount(m.id);
      }
    }

    const currentMounts = await this.getAllMounts();
    if (!currentMounts.some((m) => m.id === 'local-vault')) {
      await this.putMount(createCleanLocalVaultMount());
    }

    let preservedFiles = 0;
    let removedSampleNodes = 0;
    const sampleNodeIdsToDelete: string[] = [];

    for (const n of nodes) {
      if (n.type === 'file') {
        if (!n.hasBlob || LEGACY_SAMPLE_MOUNT_IDS.has(n.providerId) || n.id.startsWith('seed-')) {
          sampleNodeIdsToDelete.push(n.id);
          removedSampleNodes++;
        } else {
          preservedFiles++;
        }
      } else if (n.id.startsWith('fld-')) {
        // Keep folders only if they aren't empty sample folders
        const hasRealChild = nodes.some(
          (child) => child.parentId === n.id && child.type === 'file' && child.hasBlob && !child.id.startsWith('seed-')
        );
        if (!hasRealChild) {
          sampleNodeIdsToDelete.push(n.id);
          removedSampleNodes++;
        }
      }
    }

    if (sampleNodeIdsToDelete.length > 0) {
      await this.deleteNodesAndBlobs(sampleNodeIdsToDelete, []);
    }

    // Reset settings if they were pointing to the demo account or fake invoices
    const settings = await this.getMeta<WorkspaceSettings>('settings');
    if (settings) {
      const cleanedInvoices = (settings.subscription?.invoices ?? []).filter(
        (inv) => !inv.description.includes('(Demo)') && !inv.id.startsWith('INV-2026-001')
      );
      await this.setMeta('settings', {
        ...createCleanDefaultSettings(),
        ...settings,
        subscription: {
          planId: settings.subscription?.planId === 'pro' && cleanedInvoices.length === 0 ? 'free' : (settings.subscription?.planId ?? 'free'),
          billingCycle: settings.subscription?.billingCycle ?? 'monthly',
          cancelledAt: null,
          invoices: cleanedInvoices,
        },
        demoTokens: [],
        activeAccountEmail:
          settings.activeAccountEmail === 'alex.rivera@mountyourclouds.demo'
            ? null
            : settings.activeAccountEmail,
      });
    }

    await this.setMeta('seeded', false);
    return { preservedFiles, removedSampleNodes };
  }

  /**
   * Exports genuine local user files and mounts (excluding any legacy sample fixtures) as a portable JSON bundle.
   */
  public async exportGenuineUserData(): Promise<{
    exportedAt: string;
    mounts: ProviderMount[];
    nodes: VaultNode[];
  }> {
    const [mounts, nodes] = await Promise.all([this.getAllMounts(), this.getAllNodes()]);
    const genuineMounts = mounts.filter(
      (m) => !LEGACY_SAMPLE_MOUNT_IDS.has(m.id) && m.mode !== 'simulated'
    );
    const genuineNodes = nodes.filter((n) => {
      if (n.id.startsWith('seed-')) return false;
      if (n.type === 'file' && (!n.hasBlob || LEGACY_SAMPLE_MOUNT_IDS.has(n.providerId))) {
        return false;
      }
      return true;
    });

    return {
      exportedAt: new Date().toISOString(),
      mounts: genuineMounts,
      nodes: genuineNodes,
    };
  }

  public onExternalChange(cb: () => void): () => void {
    this.changeListeners.add(cb);
    return () => {
      this.changeListeners.delete(cb);
    };
  }

  public notifyBroadcast(): void {
    try {
      this.channel?.postMessage({ type: 'MUTATED', ts: Date.now() });
    } catch {
      // Ignore
    }
  }

  private async putKeyValueStore(
    storeName: 'meta' | 'blobs' | 'thumbs',
    key: string,
    value: unknown
  ): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    if (store.keyPath !== null) {
      const keyProp = typeof store.keyPath === 'string' ? store.keyPath : 'key';
      await store.put({ [keyProp]: key, value });
    } else {
      await store.put(value, key);
    }
    await tx.done;
  }

  private async getKeyValueStore<T>(
    storeName: 'meta' | 'blobs' | 'thumbs',
    key: string
  ): Promise<T | undefined> {
    if (!this.db) return undefined;
    const tx = this.db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const raw = await store.get(key);
    if (raw === undefined) return undefined;
    if (
      store.keyPath !== null &&
      typeof raw === 'object' &&
      raw !== null &&
      !(raw instanceof Blob) &&
      'value' in raw
    ) {
      return (raw as { value: T }).value;
    }
    return raw as T;
  }

  /**
   * Deterministic seed helper retained strictly for automated test suites (src/__tests__/*).
   * Never invoked automatically in production startup.
   */
  public async seedDatabase(_force = false): Promise<void> {
    const seed = await generateDeterministicSeedBundle();

    if (this.usingMemoryFallback || !this.db) {
      this.mem.clearAll();
      this.mem.accounts.set(seed.account.email.toLowerCase(), seed.account);
      for (const m of seed.mounts) this.mem.mounts.set(m.id, m);
      for (const n of seed.nodes) this.mem.nodes.set(n.id, n);
      for (const b of seed.blobs) this.mem.blobs.set(`${b.mountId}:${b.key}`, b.blob);
      for (const t of seed.thumbs) this.mem.thumbs.set(t.nodeId, t.blob);
      for (const a of seed.activity) this.mem.addActivity(a);
      this.mem.meta.set('settings', seed.settings);
      this.mem.meta.set('inFlightUploads', []);
      this.mem.meta.set('seeded', true);
      return;
    }

    const tx = this.db.transaction(
      ['meta', 'accounts', 'mounts', 'nodes', 'blobs', 'thumbs', 'activity'],
      'readwrite'
    );

    await Promise.all([
      tx.objectStore('meta').clear(),
      tx.objectStore('accounts').clear(),
      tx.objectStore('mounts').clear(),
      tx.objectStore('nodes').clear(),
      tx.objectStore('blobs').clear(),
      tx.objectStore('thumbs').clear(),
      tx.objectStore('activity').clear(),
    ]);

    await tx.objectStore('accounts').put(seed.account);
    for (const m of seed.mounts) {
      await tx.objectStore('mounts').put(m);
    }
    for (const n of seed.nodes) {
      await tx.objectStore('nodes').put(n);
    }
    const blobsStore = tx.objectStore('blobs');
    for (const b of seed.blobs) {
      const bKey = `${b.mountId}:${b.key}`;
      if (blobsStore.keyPath !== null) {
        const kp = typeof blobsStore.keyPath === 'string' ? blobsStore.keyPath : 'key';
        await blobsStore.put({ [kp]: bKey, value: b.blob });
      } else {
        await blobsStore.put(b.blob, bKey);
      }
    }
    const thumbsStore = tx.objectStore('thumbs');
    for (const t of seed.thumbs) {
      if (thumbsStore.keyPath !== null) {
        const kp = typeof thumbsStore.keyPath === 'string' ? thumbsStore.keyPath : 'key';
        await thumbsStore.put({ [kp]: t.nodeId, value: t.blob });
      } else {
        await thumbsStore.put(t.blob, t.nodeId);
      }
    }
    for (const a of seed.activity) {
      await tx.objectStore('activity').add(a);
    }

    const metaStore = tx.objectStore('meta');
    if (metaStore.keyPath !== null) {
      const kp = typeof metaStore.keyPath === 'string' ? metaStore.keyPath : 'key';
      await metaStore.put({ [kp]: 'settings', value: seed.settings });
      await metaStore.put({ [kp]: 'inFlightUploads', value: [] });
      await metaStore.put({ [kp]: 'seeded', value: true });
    } else {
      await metaStore.put(seed.settings, 'settings');
      await metaStore.put([], 'inFlightUploads');
      await metaStore.put(true, 'seeded');
    }
    await tx.done;
  }

  public async purgeExpiredTrash(): Promise<void> {
    const retentionCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const allNodes = await this.getAllNodes();
    const expiredRoots = allNodes.filter(
      (n) => n.trashedAt !== null && n.trashedAt < retentionCutoff
    );
    if (expiredRoots.length === 0) return;

    const allIdsToDelete = new Set<string>();
    const allFilesToDelete: FileNode[] = [];

    for (const root of expiredRoots) {
      const { nodeIds, fileNodes } = collectSubtreeIds(root.id, allNodes);
      for (const id of nodeIds) allIdsToDelete.add(id);
      for (const f of fileNodes) allFilesToDelete.push(f);
    }

    await this.deleteNodesAndBlobs(Array.from(allIdsToDelete), allFilesToDelete);
  }

  public async getMeta<T>(key: string): Promise<T | undefined> {
    if (this.usingMemoryFallback || !this.db) {
      return this.mem.meta.get(key) as T | undefined;
    }
    return await this.getKeyValueStore<T>('meta', key);
  }

  public async setMeta<T>(key: string, value: T): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.mem.meta.set(key, value);
      return;
    }
    await this.putKeyValueStore('meta', key, value);
  }

  public async getAccount(email: string): Promise<Account | undefined> {
    const key = email.trim().toLowerCase();
    if (this.usingMemoryFallback || !this.db) {
      return this.mem.accounts.get(key);
    }
    return await this.db.get('accounts', key);
  }

  public async putAccount(account: Account): Promise<void> {
    const normalized: Account = {
      ...account,
      email: account.email.trim().toLowerCase(),
    };
    if (this.usingMemoryFallback || !this.db) {
      this.mem.accounts.set(normalized.email, normalized);
      return;
    }
    await this.db.put('accounts', normalized);
  }

  public async getAllMounts(): Promise<ProviderMount[]> {
    if (this.usingMemoryFallback || !this.db) {
      return Array.from(this.mem.mounts.values()).sort((a, b) => a.createdAt - b.createdAt);
    }
    const list = (await this.db.getAll('mounts')) as ProviderMount[];
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }

  public async putMount(mount: ProviderMount): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.mem.mounts.set(mount.id, mount);
      return;
    }
    await this.db.put('mounts', mount);
  }

  public async deleteMount(id: string): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.mem.mounts.delete(id);
      return;
    }
    await this.db.delete('mounts', id);
  }

  public async getAllNodes(): Promise<VaultNode[]> {
    if (this.usingMemoryFallback || !this.db) {
      return Array.from(this.mem.nodes.values());
    }
    return (await this.db.getAll('nodes')) as VaultNode[];
  }

  public async getNode(id: string): Promise<VaultNode | undefined> {
    if (this.usingMemoryFallback || !this.db) {
      return this.mem.nodes.get(id);
    }
    return (await this.db.get('nodes', id)) as VaultNode | undefined;
  }

  public async putNode(node: VaultNode): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.mem.nodes.set(node.id, node);
      return;
    }
    await this.db.put('nodes', node);
  }

  public async putNodes(nodes: VaultNode[]): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      for (const n of nodes) this.mem.nodes.set(n.id, n);
      return;
    }
    const tx = this.db.transaction('nodes', 'readwrite');
    for (const n of nodes) {
      await tx.store.put(n);
    }
    await tx.done;
  }

  public async deleteNodesAndBlobs(nodeIds: string[], files: FileNode[]): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      for (const id of nodeIds) {
        this.mem.nodes.delete(id);
        this.mem.thumbs.delete(id);
      }
      for (const f of files) {
        this.mem.blobs.delete(`${f.providerId}:${f.id}`);
        this.mem.thumbs.delete(f.id);
      }
      return;
    }

    const tx = this.db.transaction(['nodes', 'blobs', 'thumbs'], 'readwrite');
    for (const id of nodeIds) {
      await tx.objectStore('nodes').delete(id);
      await tx.objectStore('thumbs').delete(id);
    }
    for (const f of files) {
      await tx.objectStore('blobs').delete(`${f.providerId}:${f.id}`);
      await tx.objectStore('thumbs').delete(f.id);
    }
    await tx.done;
  }

  public async deleteMountAndFiles(mountId: string, files: FileNode[]): Promise<void> {
    await this.deleteMount(mountId);
    if (files.length > 0) {
      await this.deleteNodesAndBlobs(
        files.map((f) => f.id),
        files
      );
    }
  }

  public async getBlob(providerId: string, fileId: string): Promise<Blob | undefined> {
    const key = `${providerId}:${fileId}`;
    if (this.usingMemoryFallback || !this.db) {
      return this.mem.blobs.get(key);
    }
    return await this.getKeyValueStore<Blob>('blobs', key);
  }

  public async putBlob(providerId: string, fileId: string, blob: Blob): Promise<void> {
    const key = `${providerId}:${fileId}`;
    if (this.usingMemoryFallback || !this.db) {
      this.mem.blobs.set(key, blob);
      return;
    }
    await this.putKeyValueStore('blobs', key, blob);
  }

  public async deleteBlob(providerId: string, fileId: string): Promise<void> {
    const key = `${providerId}:${fileId}`;
    if (this.usingMemoryFallback || !this.db) {
      this.mem.blobs.delete(key);
      return;
    }
    await this.db.delete('blobs', key);
  }

  public async getThumb(fileId: string): Promise<Blob | undefined> {
    if (this.usingMemoryFallback || !this.db) {
      return this.mem.thumbs.get(fileId);
    }
    return await this.getKeyValueStore<Blob>('thumbs', fileId);
  }

  public async getAllActivity(): Promise<ActivityEvent[]> {
    if (this.usingMemoryFallback || !this.db) {
      return [...this.mem.activity];
    }
    return (await this.db.getAll('activity')) as ActivityEvent[];
  }

  public async addActivity(ev: Omit<ActivityEvent, 'id'>): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.mem.addActivity(ev);
      return;
    }
    await this.db.add('activity', ev);
  }

  public async commitCompletedUpload(params: {
    fileNode: FileNode;
    blob: Blob;
    thumbBlob: Blob | null;
    activity: Omit<ActivityEvent, 'id'>;
    remainingInFlight: PersistedInFlightUpload[];
  }): Promise<void> {
    const blobKey = `${params.fileNode.providerId}:${params.fileNode.id}`;

    if (this.usingMemoryFallback || !this.db) {
      this.mem.blobs.set(blobKey, params.blob);
      if (params.thumbBlob) {
        this.mem.thumbs.set(params.fileNode.id, params.thumbBlob);
      }
      this.mem.nodes.set(params.fileNode.id, params.fileNode);
      this.mem.addActivity(params.activity);
      this.mem.meta.set('inFlightUploads', params.remainingInFlight);
      return;
    }

    const tx = this.db.transaction(
      ['nodes', 'blobs', 'thumbs', 'activity', 'meta'],
      'readwrite'
    );
    const blobsStore = tx.objectStore('blobs');
    if (blobsStore.keyPath !== null) {
      const kp = typeof blobsStore.keyPath === 'string' ? blobsStore.keyPath : 'key';
      await blobsStore.put({ [kp]: blobKey, value: params.blob });
    } else {
      await blobsStore.put(params.blob, blobKey);
    }

    if (params.thumbBlob) {
      const thumbsStore = tx.objectStore('thumbs');
      if (thumbsStore.keyPath !== null) {
        const kp = typeof thumbsStore.keyPath === 'string' ? thumbsStore.keyPath : 'key';
        await thumbsStore.put({ [kp]: params.fileNode.id, value: params.thumbBlob });
      } else {
        await thumbsStore.put(params.thumbBlob, params.fileNode.id);
      }
    }

    await tx.objectStore('nodes').put(params.fileNode);
    await tx.objectStore('activity').add(params.activity);

    const metaStore = tx.objectStore('meta');
    if (metaStore.keyPath !== null) {
      const kp = typeof metaStore.keyPath === 'string' ? metaStore.keyPath : 'key';
      await metaStore.put({ [kp]: 'inFlightUploads', value: params.remainingInFlight });
    } else {
      await metaStore.put(params.remainingInFlight, 'inFlightUploads');
    }
    await tx.done;
  }
}

export const vaultRepository = new VaultRepository();
