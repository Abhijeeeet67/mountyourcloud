import { openDB, type IDBPDatabase } from 'idb';
import { TRASH_RETENTION_MS } from '../lib/constants';
import {
  StorageError,
  type Account,
  type ActivityEvent,
  type FileNode,
  type PersistedInFlightUpload,
  type ProviderMount,
  type VaultNode,
  type WorkspaceSettings,
} from '../types/domain';
import { generateDeterministicSeedBundle } from './seed';

const DB_NAME = 'mountyourclouds_db';
const DB_VERSION = 1;

interface BlobRecord {
  mountId: string;
  objectKey: string;
  blob: Blob;
}

interface ThumbRecord {
  nodeId: string;
  blob: Blob;
}

interface MetaRecord {
  key: string;
  value: unknown;
}

// Recursively check if a node or any of its ancestors has trashedAt !== null
export function isEffectivelyTrashed(
  node: VaultNode,
  nodesById: Map<string, VaultNode>
): boolean {
  let curr: VaultNode | undefined = node;
  const visited = new Set<string>();
  while (curr) {
    if (curr.trashedAt !== null) return true;
    if (!curr.parentId || visited.has(curr.parentId)) break;
    visited.add(curr.parentId);
    curr = nodesById.get(curr.parentId);
  }
  return false;
}

export function collectSubtreeIds(
  rootId: string,
  allNodes: VaultNode[]
): { nodeIds: string[]; fileNodes: FileNode[] } {
  const childrenMap = new Map<string | null, VaultNode[]>();
  for (const n of allNodes) {
    const list = childrenMap.get(n.parentId) ?? [];
    list.push(n);
    childrenMap.set(n.parentId, list);
  }

  const nodeIds: string[] = [];
  const fileNodes: FileNode[] = [];
  const visited = new Set<string>();
  const queue: string[] = [rootId];
  const rootNode = allNodes.find((n) => n.id === rootId);
  if (rootNode?.type === 'file') {
    fileNodes.push(rootNode);
  }

  while (queue.length > 0) {
    const currId = queue.shift()!;
    if (visited.has(currId)) continue;
    visited.add(currId);
    nodeIds.push(currId);
    const kids = childrenMap.get(currId) ?? [];
    for (const k of kids) {
      if (!visited.has(k.id)) {
        queue.push(k.id);
        if (k.type === 'file') {
          fileNodes.push(k);
        }
      }
    }
  }

  return { nodeIds, fileNodes };
}

export class VaultRepository {
  private db: IDBPDatabase | null = null;
  public usingMemoryFallback = false;
  public versionChangeDetected = false;
  private channel: BroadcastChannel | null = null;
  private changeListeners = new Set<() => void>();

  // In-memory fallback stores if IndexedDB is blocked in private/iframe mode
  private memMeta = new Map<string, unknown>();
  private memAccounts = new Map<string, Account>();
  private memMounts = new Map<string, ProviderMount>();
  private memNodes = new Map<string, VaultNode>();
  private memBlobs = new Map<string, Blob>();
  private memThumbs = new Map<string, Blob>();
  private memActivity: ActivityEvent[] = [];

  public onExternalChange(cb: () => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  public notifyBroadcast(): void {
    try {
      this.channel?.postMessage({ type: 'MUTATED', ts: Date.now() });
    } catch {
      // Ignore BroadcastChannel errors in restricted contexts
    }
  }

  public async init(): Promise<{ interruptedUploads: PersistedInFlightUpload[] }> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        await navigator.storage.persist().catch(() => false);
      }
    } catch {
      // Ignore persist errors
    }

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel('mountyourclouds');
        this.channel.onmessage = () => {
          for (const listener of this.changeListeners) {
            listener();
          }
        };
      }
    } catch {
      // BroadcastChannel optional fallback
    }

    try {
      const self = this;
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
          switch (oldVersion) {
            case 0: {
              db.createObjectStore('meta', { keyPath: 'key' });
              db.createObjectStore('accounts', { keyPath: 'email' });
              db.createObjectStore('mounts', { keyPath: 'id' });
              const nodeStore = db.createObjectStore('nodes', { keyPath: 'id' });
              nodeStore.createIndex('parentId', 'parentId', { unique: false });
              db.createObjectStore('blobs', { keyPath: ['mountId', 'objectKey'] });
              db.createObjectStore('thumbs', { keyPath: 'nodeId' });
              const actStore = db.createObjectStore('activity', {
                keyPath: 'id',
                autoIncrement: true,
              });
              actStore.createIndex('ts', 'ts', { unique: false });
            }
          }
        },
        blocked() {
          self.versionChangeDetected = true;
        },
        blocking() {
          self.db?.close();
          self.versionChangeDetected = true;
          for (const listener of self.changeListeners) {
            listener();
          }
        },
      });
    } catch {
      this.usingMemoryFallback = true;
      this.db = null;
    }

    // Check if seeded
    const seeded = await this.getMeta<boolean>('seeded');
    if (!seeded) {
      await this.seedDatabase();
    }

    // Purge anything trashed more than 30 days ago (§3)
    await this.purgeExpiredTrash();

    // Check for interrupted uploads from prior reload (§5)
    const inFlight = (await this.getMeta<PersistedInFlightUpload[]>('inFlightUploads')) ?? [];
    if (inFlight.length > 0) {
      await this.setMeta('inFlightUploads', []);
    }

    return { interruptedUploads: inFlight };
  }

  private wrapQuotaError(err: unknown): never {
    if (
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.code === 22)
    ) {
      throw new StorageError(
        'QUOTA_EXCEEDED',
        'Browser storage quota exceeded while saving to IndexedDB.',
        false
      );
    }
    throw err;
  }

  public async getMeta<T>(key: string): Promise<T | undefined> {
    if (this.usingMemoryFallback || !this.db) {
      return this.memMeta.get(key) as T | undefined;
    }
    const rec = (await this.db.get('meta', key)) as MetaRecord | undefined;
    return rec?.value as T | undefined;
  }

  public async setMeta<T>(key: string, value: T): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.memMeta.set(key, value);
      return;
    }
    try {
      await this.db.put('meta', { key, value });
    } catch (err) {
      this.wrapQuotaError(err);
    }
  }

  public async seedDatabase(preserveAccounts = false): Promise<void> {
    const bundle = await generateDeterministicSeedBundle();

    if (this.usingMemoryFallback || !this.db) {
      if (!preserveAccounts) {
        this.memAccounts.clear();
        this.memAccounts.set(bundle.account.email.toLowerCase(), bundle.account);
      } else if (!this.memAccounts.has(bundle.account.email.toLowerCase())) {
        this.memAccounts.set(bundle.account.email.toLowerCase(), bundle.account);
      }
      const existingActiveEmail = preserveAccounts
        ? (this.memMeta.get('settings') as WorkspaceSettings | undefined)?.activeAccountEmail ??
          bundle.account.email
        : null;
      this.memMeta.set('schemaVersion', DB_VERSION);
      this.memMeta.set('seeded', true);
      this.memMeta.set('settings', {
        ...bundle.settings,
        activeAccountEmail: existingActiveEmail,
      });
      this.memMeta.set('inFlightUploads', []);

      this.memMounts.clear();
      for (const m of bundle.mounts) this.memMounts.set(m.id, m);

      this.memNodes.clear();
      for (const n of bundle.nodes) this.memNodes.set(n.id, n);

      this.memBlobs.clear();
      for (const b of bundle.blobs) this.memBlobs.set(`${b.mountId}::${b.key}`, b.blob);

      this.memThumbs.clear();
      for (const t of bundle.thumbs) this.memThumbs.set(t.nodeId, t.blob);

      this.memActivity = bundle.activity.map((a, idx) => ({ ...a, id: idx + 1 }));
      return;
    }

    try {
      const currentSettings = preserveAccounts
        ? await this.getMeta<WorkspaceSettings>('settings')
        : undefined;

      const tx = this.db.transaction(
        ['meta', 'accounts', 'mounts', 'nodes', 'blobs', 'thumbs', 'activity'],
        'readwrite'
      );

      if (!preserveAccounts) {
        await tx.objectStore('accounts').clear();
      }
      await tx.objectStore('accounts').put(bundle.account);

      await tx.objectStore('mounts').clear();
      for (const m of bundle.mounts) {
        await tx.objectStore('mounts').put(m);
      }

      await tx.objectStore('nodes').clear();
      for (const n of bundle.nodes) {
        await tx.objectStore('nodes').put(n);
      }

      await tx.objectStore('blobs').clear();
      for (const b of bundle.blobs) {
        await tx.objectStore('blobs').put({
          mountId: b.mountId,
          objectKey: b.key,
          blob: b.blob,
        } satisfies BlobRecord);
      }

      await tx.objectStore('thumbs').clear();
      for (const t of bundle.thumbs) {
        await tx.objectStore('thumbs').put({
          nodeId: t.nodeId,
          blob: t.blob,
        } satisfies ThumbRecord);
      }

      await tx.objectStore('activity').clear();
      for (const a of bundle.activity) {
        await tx.objectStore('activity').add(a);
      }

      await tx.objectStore('meta').put({ key: 'schemaVersion', value: DB_VERSION });
      await tx.objectStore('meta').put({ key: 'seeded', value: true });
      await tx.objectStore('meta').put({
        key: 'settings',
        value: {
          ...bundle.settings,
          activeAccountEmail: preserveAccounts
            ? currentSettings?.activeAccountEmail ?? bundle.account.email
            : null,
        },
      });
      await tx.objectStore('meta').put({ key: 'inFlightUploads', value: [] });

      await tx.done;
    } catch (err) {
      this.wrapQuotaError(err);
    }
  }

  public async purgeExpiredTrash(): Promise<void> {
    const cutoff = Date.now() - TRASH_RETENTION_MS;
    const allNodes = await this.getAllNodes();
    const expiredRoots = allNodes.filter((n) => n.trashedAt !== null && n.trashedAt < cutoff);
    if (expiredRoots.length === 0) return;

    for (const root of expiredRoots) {
      const { nodeIds, fileNodes } = collectSubtreeIds(root.id, allNodes);
      await this.deleteNodesAndBlobs(nodeIds, fileNodes);
    }
  }

  public async getAllAccounts(): Promise<Account[]> {
    if (this.usingMemoryFallback || !this.db) {
      return Array.from(this.memAccounts.values());
    }
    return this.db.getAll('accounts');
  }

  public async getAccount(email: string): Promise<Account | undefined> {
    const normalized = email.trim().toLowerCase();
    if (this.usingMemoryFallback || !this.db) {
      return this.memAccounts.get(normalized);
    }
    const all = await this.db.getAll('accounts');
    return all.find((a: Account) => a.email.toLowerCase() === normalized);
  }

  public async putAccount(account: Account): Promise<void> {
    const normalized: Account = { ...account, email: account.email.trim().toLowerCase() };
    if (this.usingMemoryFallback || !this.db) {
      this.memAccounts.set(normalized.email, normalized);
      return;
    }
    try {
      await this.db.put('accounts', normalized);
    } catch (err) {
      this.wrapQuotaError(err);
    }
  }

  public async getAllMounts(): Promise<ProviderMount[]> {
    if (this.usingMemoryFallback || !this.db) {
      return Array.from(this.memMounts.values());
    }
    return this.db.getAll('mounts');
  }

  public async putMount(mount: ProviderMount): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.memMounts.set(mount.id, mount);
      return;
    }
    try {
      await this.db.put('mounts', mount);
    } catch (err) {
      this.wrapQuotaError(err);
    }
  }

  public async deleteMountAndFiles(mountId: string, fileNodes: FileNode[]): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.memMounts.delete(mountId);
      for (const f of fileNodes) {
        this.memNodes.delete(f.id);
        this.memBlobs.delete(`${f.providerId}::${f.id}`);
        this.memThumbs.delete(f.id);
      }
      return;
    }

    const tx = this.db.transaction(['mounts', 'nodes', 'blobs', 'thumbs'], 'readwrite');
    await tx.objectStore('mounts').delete(mountId);
    for (const f of fileNodes) {
      await tx.objectStore('nodes').delete(f.id);
      await tx.objectStore('blobs').delete([f.providerId, f.id]);
      await tx.objectStore('thumbs').delete(f.id);
    }
    await tx.done;
  }

  public async getAllNodes(): Promise<VaultNode[]> {
    if (this.usingMemoryFallback || !this.db) {
      return Array.from(this.memNodes.values());
    }
    return this.db.getAll('nodes');
  }

  public async putNode(node: VaultNode): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.memNodes.set(node.id, node);
      return;
    }
    try {
      await this.db.put('nodes', node);
    } catch (err) {
      this.wrapQuotaError(err);
    }
  }

  public async putNodes(nodes: VaultNode[]): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      for (const n of nodes) this.memNodes.set(n.id, n);
      return;
    }
    try {
      const tx = this.db.transaction('nodes', 'readwrite');
      for (const n of nodes) {
        await tx.store.put(n);
      }
      await tx.done;
    } catch (err) {
      this.wrapQuotaError(err);
    }
  }

  public async deleteNodesAndBlobs(nodeIds: string[], fileNodes: FileNode[]): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      for (const id of nodeIds) {
        this.memNodes.delete(id);
        this.memThumbs.delete(id);
      }
      for (const f of fileNodes) {
        this.memBlobs.delete(`${f.providerId}::${f.id}`);
      }
      return;
    }

    const tx = this.db.transaction(['nodes', 'blobs', 'thumbs'], 'readwrite');
    for (const id of nodeIds) {
      await tx.objectStore('nodes').delete(id);
      await tx.objectStore('thumbs').delete(id);
    }
    for (const f of fileNodes) {
      await tx.objectStore('blobs').delete([f.providerId, f.id]);
    }
    await tx.done;
  }

  public async putBlob(mountId: string, objectKey: string, blob: Blob): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.memBlobs.set(`${mountId}::${objectKey}`, blob);
      return;
    }
    try {
      await this.db.put('blobs', { mountId, objectKey, blob } satisfies BlobRecord);
    } catch (err) {
      this.wrapQuotaError(err);
    }
  }

  public async getBlob(mountId: string, objectKey: string): Promise<Blob | undefined> {
    if (this.usingMemoryFallback || !this.db) {
      return this.memBlobs.get(`${mountId}::${objectKey}`);
    }
    const rec = (await this.db.get('blobs', [mountId, objectKey])) as BlobRecord | undefined;
    return rec?.blob;
  }

  public async deleteBlob(mountId: string, objectKey: string): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.memBlobs.delete(`${mountId}::${objectKey}`);
      return;
    }
    await this.db.delete('blobs', [mountId, objectKey]);
  }

  public async getThumb(nodeId: string): Promise<Blob | undefined> {
    if (this.usingMemoryFallback || !this.db) {
      return this.memThumbs.get(nodeId);
    }
    const rec = (await this.db.get('thumbs', nodeId)) as ThumbRecord | undefined;
    return rec?.blob;
  }

  // Atomic commit for completed upload: blob + optional thumbnail + FileNode + ingress ActivityEvent (§3)
  public async commitCompletedUpload(params: {
    fileNode: FileNode;
    blob: Blob;
    thumbBlob: Blob | null;
    activity: ActivityEvent;
    remainingInFlight: PersistedInFlightUpload[];
  }): Promise<void> {
    const { fileNode, blob, thumbBlob, activity, remainingInFlight } = params;

    if (this.usingMemoryFallback || !this.db) {
      this.memBlobs.set(`${fileNode.providerId}::${fileNode.id}`, blob);
      if (thumbBlob) {
        this.memThumbs.set(fileNode.id, thumbBlob);
      }
      this.memNodes.set(fileNode.id, fileNode);
      this.memActivity.push({ ...activity, id: this.memActivity.length + 1 });
      this.memMeta.set('inFlightUploads', remainingInFlight);
      return;
    }

    try {
      const tx = this.db.transaction(
        ['blobs', 'thumbs', 'nodes', 'activity', 'meta'],
        'readwrite'
      );
      await tx.objectStore('blobs').put({
        mountId: fileNode.providerId,
        objectKey: fileNode.id,
        blob,
      } satisfies BlobRecord);
      if (thumbBlob) {
        await tx.objectStore('thumbs').put({
          nodeId: fileNode.id,
          blob: thumbBlob,
        } satisfies ThumbRecord);
      }
      await tx.objectStore('nodes').put(fileNode);
      await tx.objectStore('activity').add(activity);
      await tx.objectStore('meta').put({
        key: 'inFlightUploads',
        value: remainingInFlight,
      });
      await tx.done;
    } catch (err) {
      this.wrapQuotaError(err);
    }
  }

  public async addActivity(event: ActivityEvent): Promise<void> {
    if (this.usingMemoryFallback || !this.db) {
      this.memActivity.push({ ...event, id: this.memActivity.length + 1 });
      return;
    }
    try {
      await this.db.add('activity', event);
    } catch (err) {
      this.wrapQuotaError(err);
    }
  }

  public async getAllActivity(): Promise<ActivityEvent[]> {
    if (this.usingMemoryFallback || !this.db) {
      return [...this.memActivity];
    }
    return this.db.getAll('activity');
  }
}

export const vaultRepository = new VaultRepository();
