import {
  FILE_CATEGORIES,
  MOUNTABLE_PROVIDER_KINDS,
  getFileCategory,
} from '../lib/constants';
import { computeBlobSha256, generateImageThumbnailBlob } from '../lib/crypto';
import { formatBytes } from '../lib/format';
import {
  computeTransferQuotaUsage,
  getEffectivePlans,
  normalizePlanId,
} from '../lib/pricing';
import {
  StorageError,
  type ActivityEvent,
  type ConnectionReport,
  type DeveloperSettings,
  type FileNode,
  type FolderNode,
  type PersistedInFlightUpload,
  type PlanDefinition,
  type ProviderKind,
  type ProviderMount,
  type StorageProviderAdapter,
  type UploadJob,
  type VaultNode,
  type WorkspaceSettings,
} from '../types/domain';
import {
  DropboxAdapter,
  GoogleDriveAdapter,
  IndexedDBStorageAdapter,
  OneDriveAdapter,
  S3CompatibleAdapter,
  SimulatedCloudAdapter,
  WebDAVAdapter,
} from './adapters';
import { collectSubtreeIds, isEffectivelyTrashed, vaultRepository } from './repository';

interface InternalUploadTask {
  job: UploadJob;
  file: File;
  uploadId: string | null;
  completedPartsReceipt: { partNumber: number; etag: string }[];
  inFlightPartBytes: number;
  abortController: AbortController | null;
  byteSamples: { ts: number; totalBytes: number }[];
}

export function validateNodeName(rawName: string): { valid: boolean; trimmed: string; error: string | null } {
  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    return { valid: false, trimmed, error: 'Name cannot be empty.' };
  }
  if (trimmed.length > 255) {
    return { valid: false, trimmed, error: 'Name must be 255 characters or fewer.' };
  }
  if (trimmed.includes('/')) {
    return { valid: false, trimmed, error: 'Name cannot contain "/" characters.' };
  }
  return { valid: true, trimmed: trimmed, error: null };
}

export function splitNameAndExt(name: string, isFolder: boolean): { base: string; extWithDot: string } {
  if (isFolder) return { base: name, extWithDot: '' };
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) return { base: name, extWithDot: '' };
  return {
    base: name.slice(0, lastDot),
    extWithDot: name.slice(lastDot),
  };
}

export function resolveUniqueSiblingName(
  desiredName: string,
  isFolder: boolean,
  siblingNamesLower: Set<string>
): string {
  const clean = desiredName.trim();
  if (!siblingNamesLower.has(clean.toLowerCase())) {
    return clean;
  }
  const { base, extWithDot } = splitNameAndExt(clean, isFolder);
  let counter = 1;
  while (true) {
    const candidate = `${base} (${counter})${extWithDot}`;
    if (!siblingNamesLower.has(candidate.toLowerCase())) {
      return candidate;
    }
    counter++;
  }
}

export class StorageOrchestrator {
  private adapters: Record<ProviderKind, StorageProviderAdapter>;
  private liveGdriveAdapter: GoogleDriveAdapter;
  private liveOnedriveAdapter: OneDriveAdapter;
  private liveDropboxAdapter: DropboxAdapter;
  private liveWebdavAdapter: WebDAVAdapter;
  private liveS3Adapter: S3CompatibleAdapter;
  private tasks = new Map<string, InternalUploadTask>();
  private activeCount = 0;
  private readonly maxConcurrency = 3;
  private devSettingsGetter: () => DeveloperSettings = () => ({ failureRate: 0, offline: false });
  private stateMutatedCallback: () => void = () => {};
  private limitReachedCallback: (reason: string) => void = () => {};
  private uploadTickTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const onPartTick = (uploadId: string, _partNumber: number, bytesInPart: number) => {
      for (const task of this.tasks.values()) {
        if (task.uploadId === uploadId && task.job.status === 'uploading') {
          task.inFlightPartBytes = bytesInPart;
          this.recomputeTaskProgress(task);
          this.stateMutatedCallback();
          break;
        }
      }
    };

    const localAdapter = new IndexedDBStorageAdapter(vaultRepository);
    localAdapter.setPartProgressListener(onPartTick);

    this.liveGdriveAdapter = new GoogleDriveAdapter(vaultRepository);
    this.liveGdriveAdapter.setPartProgressListener(onPartTick);

    this.liveOnedriveAdapter = new OneDriveAdapter(vaultRepository);
    this.liveOnedriveAdapter.setPartProgressListener(onPartTick);

    this.liveDropboxAdapter = new DropboxAdapter(vaultRepository);
    this.liveDropboxAdapter.setPartProgressListener(onPartTick);

    this.liveWebdavAdapter = new WebDAVAdapter(vaultRepository);
    this.liveWebdavAdapter.setPartProgressListener(onPartTick);

    this.liveS3Adapter = new S3CompatibleAdapter(vaultRepository);
    this.liveS3Adapter.setPartProgressListener(onPartTick);

    const map: Partial<Record<ProviderKind, StorageProviderAdapter>> = {
      local: localAdapter,
    };

    for (const kind of MOUNTABLE_PROVIDER_KINDS) {
      const sim = new SimulatedCloudAdapter(kind, vaultRepository, () => this.devSettingsGetter());
      sim.setPartProgressListener(onPartTick);
      map[kind] = sim;
    }

    this.adapters = map as Record<ProviderKind, StorageProviderAdapter>;
  }

  public bindStoreCallbacks(params: {
    getDevSettings: () => DeveloperSettings;
    onMutated: () => void;
    onPlanLimitReached?: (reason: string) => void;
  }): void {
    this.devSettingsGetter = params.getDevSettings;
    this.stateMutatedCallback = params.onMutated;
    if (params.onPlanLimitReached) {
      this.limitReachedCallback = params.onPlanLimitReached;
    }
  }

  // Backend/Service-Layer Subscription Authorization Enforcement (Requirement 9)
  public async getActivePlanDefinition(): Promise<PlanDefinition> {
    const settings = await vaultRepository.getMeta<WorkspaceSettings>('settings');
    const plansMap = getEffectivePlans(settings?.customPlans);
    const planId = normalizePlanId(settings?.subscription?.planId);
    return plansMap[planId];
  }

  private async enforceTransferQuotaAuthorization(
    bytesRequired: number,
    operationLabel: string
  ): Promise<void> {
    const [plan, activity] = await Promise.all([
      this.getActivePlanDefinition(),
      vaultRepository.getAllActivity(),
    ]);
    const usage = computeTransferQuotaUsage(activity, plan);

    if (usage.dailyUsedBytes + bytesRequired > usage.dailyLimitBytes) {
      const msg = `${operationLabel} blocked by ${plan.name} plan authorization: requires ${formatBytes(bytesRequired)}, which exceeds your remaining daily transfer quota (${formatBytes(usage.dailyRemainingBytes)} left of ${plan.dailyTransferLimitGB} GB/day). Upgrade your plan to continue.`;
      this.limitReachedCallback(msg);
      throw new StorageError('PLAN_LIMIT_REACHED', msg, false);
    }

    if (usage.monthlyUsedBytes + bytesRequired > usage.monthlyLimitBytes) {
      const msg = `${operationLabel} blocked by ${plan.name} plan authorization: requires ${formatBytes(bytesRequired)}, which exceeds your remaining monthly transfer quota (${formatBytes(usage.monthlyRemainingBytes)} left of ${plan.monthlyTransferLimitGB} GB/month). Upgrade your plan to continue.`;
      this.limitReachedCallback(msg);
      throw new StorageError('PLAN_LIMIT_REACHED', msg, false);
    }
  }

  public getAdapterForMount(mount: ProviderMount): StorageProviderAdapter {
    if (mount.kind === 'local') {
      return this.adapters.local;
    }
    if (mount.mode === 'real') {
      if (mount.kind === 'gdrive') {
        return this.liveGdriveAdapter;
      }
      if (mount.kind === 'onedrive') {
        return this.liveOnedriveAdapter;
      }
      if (mount.kind === 'dropbox') {
        return this.liveDropboxAdapter;
      }
      if (['webdav', 'nextcloud', 'owncloud', 'synology', 'qnap', 'hetzner', 'koofr'].includes(mount.kind)) {
        return this.liveWebdavAdapter;
      }
      if (['s3', 'r2', 'b2', 'wasabi', 'do_spaces', 'scaleway', 'linode', 'vultr', 'storj', 'oracle_os'].includes(mount.kind)) {
        return this.liveS3Adapter;
      }
    }
    return this.adapters[mount.kind] ?? this.adapters.s3;
  }

  public getAdapterForKind(kind: ProviderKind): StorageProviderAdapter {
    return this.adapters[kind] ?? this.adapters.s3;
  }

  public getUploadJobs(): UploadJob[] {
    return Array.from(this.tasks.values())
      .map((t) => ({ ...t.job }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  public seedInterruptedUploads(interrupted: PersistedInFlightUpload[]): void {
    for (const item of interrupted) {
      const failedJob: UploadJob = {
        id: item.id,
        fileName: item.fileName,
        fileSize: item.fileSize,
        targetFolderId: item.targetFolderId,
        targetProviderId: item.targetProviderId,
        status: 'error',
        partSizeBytes: item.partSizeBytes,
        totalParts: item.totalParts,
        completedParts: 0,
        uploadedBytes: 0,
        speedBytesPerSec: 0,
        etaSeconds: null,
        errorMessage: 'Interrupted by reload — upload again',
        createdAt: item.createdAt,
      };
      this.tasks.set(item.id, {
        job: failedJob,
        file: new File([], item.fileName),
        uploadId: null,
        completedPartsReceipt: [],
        inFlightPartBytes: 0,
        abortController: null,
        byteSamples: [],
      });
    }
  }

  private async syncInFlightToMeta(): Promise<void> {
    const active: PersistedInFlightUpload[] = [];
    for (const t of this.tasks.values()) {
      if (t.job.status === 'queued' || t.job.status === 'uploading' || t.job.status === 'paused') {
        active.push({
          id: t.job.id,
          fileName: t.job.fileName,
          fileSize: t.job.fileSize,
          targetFolderId: t.job.targetFolderId,
          targetProviderId: t.job.targetProviderId,
          partSizeBytes: t.job.partSizeBytes,
          totalParts: t.job.totalParts,
          createdAt: t.job.createdAt,
        });
      }
    }
    await vaultRepository.setMeta('inFlightUploads', active);
  }

  private ensureSpeedTicker(): void {
    if (this.uploadTickTimer) return;
    this.uploadTickTimer = setInterval(() => {
      let anyUploading = false;
      for (const task of this.tasks.values()) {
        if (task.job.status === 'uploading') {
          anyUploading = true;
          this.recomputeTaskProgress(task);
        }
      }
      if (anyUploading) {
        this.stateMutatedCallback();
      } else if (this.uploadTickTimer) {
        clearInterval(this.uploadTickTimer);
        this.uploadTickTimer = null;
      }
    }, 200);
  }

  private recomputeTaskProgress(task: InternalUploadTask): void {
    const now = performance.now();
    const completedBytes = task.job.completedParts * task.job.partSizeBytes;
    const rawUploaded = Math.min(task.job.fileSize, completedBytes + task.inFlightPartBytes);
    task.job.uploadedBytes = rawUploaded;

    task.byteSamples.push({ ts: now, totalBytes: rawUploaded });
    const cutoff = now - 3000;
    while (task.byteSamples.length > 2 && task.byteSamples[0].ts < cutoff) {
      task.byteSamples.shift();
    }

    if (task.byteSamples.length >= 2) {
      const oldest = task.byteSamples[0];
      const newest = task.byteSamples[task.byteSamples.length - 1];
      const dtSec = (newest.ts - oldest.ts) / 1000;
      const dBytes = Math.max(0, newest.totalBytes - oldest.totalBytes);
      const speed = dtSec > 0.08 ? dBytes / dtSec : 0;
      task.job.speedBytesPerSec = speed;
      const remaining = Math.max(0, task.job.fileSize - rawUploaded);
      task.job.etaSeconds = speed > 0 ? remaining / speed : null;
    } else {
      task.job.speedBytesPerSec = 0;
      task.job.etaSeconds = null;
    }
  }

  // --- File & Folder Operations ---

  public async listChildren(folderId: string | null): Promise<VaultNode[]> {
    const allNodes = await vaultRepository.getAllNodes();
    const map = new Map(allNodes.map((n) => [n.id, n]));
    return allNodes.filter(
      (n) => n.parentId === folderId && !isEffectivelyTrashed(n, map)
    );
  }

  public async createFolder(
    parentId: string | null,
    rawName: string
  ): Promise<FolderNode> {
    const check = validateNodeName(rawName);
    if (!check.valid) {
      throw new Error(check.error ?? 'Invalid folder name.');
    }

    const siblings = await this.listChildren(parentId);
    const collision = siblings.some(
      (s) => s.name.toLowerCase() === check.trimmed.toLowerCase()
    );
    if (collision) {
      throw new Error(`An item named "${check.trimmed}" already exists in this folder.`);
    }

    const now = Date.now();
    const folder: FolderNode = {
      id: `fld-${crypto.randomUUID()}`,
      parentId,
      name: check.trimmed,
      type: 'folder',
      starred: false,
      trashedAt: null,
      trashedFromParentId: null,
      createdAt: now,
      updatedAt: now,
    };

    await vaultRepository.putNode(folder);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
    return folder;
  }

  public async rename(nodeId: string, rawNewName: string): Promise<VaultNode> {
    const check = validateNodeName(rawNewName);
    if (!check.valid) {
      throw new Error(check.error ?? 'Invalid name.');
    }

    const allNodes = await vaultRepository.getAllNodes();
    const target = allNodes.find((n) => n.id === nodeId);
    if (!target) {
      throw new Error('Item not found.');
    }

    const map = new Map(allNodes.map((n) => [n.id, n]));
    const siblings = allNodes.filter(
      (n) =>
        n.parentId === target.parentId &&
        n.id !== target.id &&
        !isEffectivelyTrashed(n, map)
    );

    const collision = siblings.some(
      (s) => s.name.toLowerCase() === check.trimmed.toLowerCase()
    );
    if (collision) {
      throw new Error(`An item named "${check.trimmed}" already exists in this folder.`);
    }

    const updated: VaultNode =
      target.type === 'file'
        ? {
            ...target,
            name: check.trimmed,
            extension: check.trimmed.includes('.')
              ? check.trimmed.split('.').pop()!.toLowerCase()
              : target.extension,
            updatedAt: Date.now(),
          }
        : {
            ...target,
            name: check.trimmed,
            updatedAt: Date.now(),
          };

    await vaultRepository.putNode(updated);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
    return updated;
  }

  public async move(nodeIds: string[], targetFolderId: string | null): Promise<void> {
    const allNodes = await vaultRepository.getAllNodes();
    const map = new Map(allNodes.map((n) => [n.id, n]));

    if (targetFolderId !== null) {
      const dest = map.get(targetFolderId);
      if (!dest || dest.type !== 'folder' || isEffectivelyTrashed(dest, map)) {
        throw new Error('Target folder does not exist or is in Trash.');
      }
    }

    for (const id of nodeIds) {
      if (id === targetFolderId) {
        throw new Error('Cannot move a folder into itself.');
      }
      const { nodeIds: subtree } = collectSubtreeIds(id, allNodes);
      if (targetFolderId !== null && subtree.includes(targetFolderId)) {
        throw new Error('Cannot move a folder into one of its own descendants.');
      }
    }

    const destSiblings = allNodes.filter(
      (n) =>
        n.parentId === targetFolderId &&
        !nodeIds.includes(n.id) &&
        !isEffectivelyTrashed(n, map)
    );
    const siblingNamesLower = new Set(destSiblings.map((s) => s.name.toLowerCase()));

    const updates: VaultNode[] = [];
    const now = Date.now();

    for (const id of nodeIds) {
      const node = map.get(id);
      if (!node) continue;
      const safeName = resolveUniqueSiblingName(
        node.name,
        node.type === 'folder',
        siblingNamesLower
      );
      siblingNamesLower.add(safeName.toLowerCase());
      updates.push({
        ...node,
        parentId: targetFolderId,
        name: safeName,
        updatedAt: now,
      });
    }

    await vaultRepository.putNodes(updates);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
  }

  // Premium Feature (PRO / ULTRA): Automated File Organization by Category
  public async autoOrganizeFolder(parentId: string | null): Promise<{ movedCount: number; createdFolders: number }> {
    const plan = await this.getActivePlanDefinition();
    if (!plan.allowAutoOrganize) {
      const msg = `Automated file organization requires the PRO or ULTRA plan (currently on ${plan.name}).`;
      this.limitReachedCallback(msg);
      throw new StorageError('PLAN_LIMIT_REACHED', msg, false);
    }

    const allNodes = await vaultRepository.getAllNodes();
    const map = new Map(allNodes.map((n) => [n.id, n]));
    const children = allNodes.filter(
      (n) => n.parentId === parentId && !isEffectivelyTrashed(n, map)
    );

    const looseFiles = children.filter((n): n is FileNode => n.type === 'file');
    if (looseFiles.length === 0) {
      return { movedCount: 0, createdFolders: 0 };
    }

    const existingFoldersByLower = new Map<string, FolderNode>();
    for (const c of children) {
      if (c.type === 'folder') {
        existingFoldersByLower.set(c.name.toLowerCase(), c);
      }
    }

    const now = Date.now();
    const nodesToPut: VaultNode[] = [];
    let createdFolders = 0;
    let movedCount = 0;

    for (const file of looseFiles) {
      const catId = getFileCategory(file.mimeType, file.extension);
      const catLabel = FILE_CATEGORIES.find((c) => c.id === catId)?.label ?? 'Other';
      let catFolder = existingFoldersByLower.get(catLabel.toLowerCase());

      if (!catFolder) {
        catFolder = {
          id: `fld-${crypto.randomUUID()}`,
          parentId,
          name: catLabel,
          type: 'folder',
          starred: false,
          trashedAt: null,
          trashedFromParentId: null,
          createdAt: now,
          updatedAt: now,
        };
        existingFoldersByLower.set(catLabel.toLowerCase(), catFolder);
        nodesToPut.push(catFolder);
        createdFolders++;
      }

      nodesToPut.push({
        ...file,
        parentId: catFolder.id,
        updatedAt: now,
      });
      movedCount++;
    }

    await vaultRepository.putNodes(nodesToPut);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
    return { movedCount, createdFolders };
  }

  // Cross-Cloud Transfer Operation (Enforces subscription transfer quotas & mount free space)
  public async transferBetweenClouds(
    nodeIds: string[],
    targetMountId: string
  ): Promise<{ transferredCount: number; totalBytes: number }> {
    const [plan, mounts, allNodes] = await Promise.all([
      this.getActivePlanDefinition(),
      vaultRepository.getAllMounts(),
      vaultRepository.getAllNodes(),
    ]);

    const targetMount = mounts.find((m) => m.id === targetMountId);
    if (!targetMount || targetMount.status !== 'connected') {
      throw new Error('Target cloud storage mount is not connected.');
    }

    // Expand selected nodes to include descendant files of any selected folders
    const candidateFileMap = new Map<string, FileNode>();
    for (const id of nodeIds) {
      const node = allNodes.find((n) => n.id === id);
      if (!node) continue;
      if (node.type === 'file') {
        if (node.providerId !== targetMountId) {
          candidateFileMap.set(node.id, node);
        }
      } else {
        const { fileNodes } = collectSubtreeIds(id, allNodes);
        for (const f of fileNodes) {
          if (f.providerId !== targetMountId) {
            candidateFileMap.set(f.id, f);
          }
        }
      }
    }

    const filesToTransfer = Array.from(candidateFileMap.values());

    if (filesToTransfer.length === 0) {
      throw new Error('Selected items are already on that storage mount or contain no files.');
    }

    if (filesToTransfer.length > plan.maxBulkFiles) {
      const msg = `Bulk cross-cloud transfer of ${filesToTransfer.length} files exceeds the ${plan.name} plan limit of ${plan.maxBulkFiles} files per batch.`;
      this.limitReachedCallback(msg);
      throw new StorageError('PLAN_LIMIT_REACHED', msg, false);
    }

    const totalBytes = filesToTransfer.reduce((sum, f) => sum + f.sizeBytes, 0);
    await this.enforceTransferQuotaAuthorization(totalBytes, 'Cross-cloud transfer');

    // Check target mount free space
    const currentMountUsed = allNodes.reduce(
      (sum, n) => (n.type === 'file' && n.providerId === targetMountId ? sum + n.sizeBytes : sum),
      0
    );
    if (currentMountUsed + totalBytes > targetMount.allocatedBytes) {
      throw new Error(
        `Insufficient free space on "${targetMount.name}" for ${formatBytes(totalBytes)}.`
      );
    }

    const now = Date.now();
    const updatedNodes: VaultNode[] = [];

    for (const file of filesToTransfer) {
      if (file.hasBlob) {
        const existingBlob = await vaultRepository.getBlob(file.providerId, file.id);
        if (existingBlob) {
          await vaultRepository.putBlob(targetMountId, file.id, existingBlob);
          await vaultRepository.deleteBlob(file.providerId, file.id);
        }
      }

      updatedNodes.push({
        ...file,
        providerId: targetMountId,
        updatedAt: now,
      });

      await vaultRepository.addActivity({
        ts: now,
        kind: 'egress',
        bytes: file.sizeBytes,
        providerId: file.providerId,
      });
      await vaultRepository.addActivity({
        ts: now,
        kind: 'ingress',
        bytes: file.sizeBytes,
        providerId: targetMountId,
      });
    }

    await vaultRepository.putNodes(updatedNodes);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
    return { transferredCount: filesToTransfer.length, totalBytes };
  }

  public async trash(nodeIds: string[]): Promise<{ previousStates: VaultNode[] }> {
    const allNodes = await vaultRepository.getAllNodes();
    const map = new Map(allNodes.map((n) => [n.id, n]));
    const now = Date.now();
    const previousStates: VaultNode[] = [];
    const updates: VaultNode[] = [];

    for (const id of nodeIds) {
      const node = map.get(id);
      if (!node || node.trashedAt !== null) continue;
      previousStates.push({ ...node });
      updates.push({
        ...node,
        trashedAt: now,
        trashedFromParentId: node.parentId,
        updatedAt: now,
      });
    }

    await vaultRepository.putNodes(updates);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
    return { previousStates };
  }

  public async restore(nodeIds: string[]): Promise<void> {
    const allNodes = await vaultRepository.getAllNodes();
    const map = new Map(allNodes.map((n) => [n.id, n]));
    const updates: VaultNode[] = [];
    const now = Date.now();

    for (const id of nodeIds) {
      const node = map.get(id);
      if (!node || node.trashedAt === null) continue;

      let destParentId: string | null = node.trashedFromParentId;
      if (destParentId !== null) {
        const parentNode = map.get(destParentId);
        if (!parentNode || parentNode.type !== 'folder' || isEffectivelyTrashed(parentNode, map)) {
          destParentId = null;
        }
      }

      const destSiblings = allNodes.filter(
        (n) =>
          n.parentId === destParentId &&
          n.id !== node.id &&
          !isEffectivelyTrashed(n, map)
      );
      const siblingNamesLower = new Set(destSiblings.map((s) => s.name.toLowerCase()));
      for (const u of updates) {
        if (u.parentId === destParentId) {
          siblingNamesLower.add(u.name.toLowerCase());
        }
      }

      const safeName = resolveUniqueSiblingName(
        node.name,
        node.type === 'folder',
        siblingNamesLower
      );

      const restored: VaultNode = {
        ...node,
        parentId: destParentId,
        name: safeName,
        trashedAt: null,
        trashedFromParentId: null,
        updatedAt: now,
      };
      map.set(restored.id, restored);
      updates.push(restored);
    }

    await vaultRepository.putNodes(updates);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
  }

  public async purge(nodeIds: string[]): Promise<void> {
    const allNodes = await vaultRepository.getAllNodes();
    const mounts = await vaultRepository.getAllMounts();
    const mountMap = new Map(mounts.map((m) => [m.id, m]));

    const allNodeIdsToDelete = new Set<string>();
    const allFilesToDelete = new Map<string, FileNode>();

    for (const id of nodeIds) {
      const { nodeIds: subIds, fileNodes } = collectSubtreeIds(id, allNodes);
      for (const sId of subIds) allNodeIdsToDelete.add(sId);
      for (const f of fileNodes) allFilesToDelete.set(f.id, f);
    }

    for (const file of allFilesToDelete.values()) {
      const mount = mountMap.get(file.providerId);
      if (mount && file.hasBlob) {
        const adapter = this.getAdapterForMount(mount);
        await adapter.deleteObject(mount, file.id).catch(() => {});
      }
    }

    await vaultRepository.deleteNodesAndBlobs(
      Array.from(allNodeIdsToDelete),
      Array.from(allFilesToDelete.values())
    );
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
  }

  public async emptyTrash(): Promise<void> {
    const allNodes = await vaultRepository.getAllNodes();
    const trashedRootIds = allNodes.filter((n) => n.trashedAt !== null).map((n) => n.id);
    if (trashedRootIds.length === 0) return;
    await this.purge(trashedRootIds);
  }

  public async toggleStar(nodeIds: string[], forcedValue?: boolean): Promise<void> {
    const allNodes = await vaultRepository.getAllNodes();
    const map = new Map(allNodes.map((n) => [n.id, n]));
    const updates: VaultNode[] = [];
    const now = Date.now();

    for (const id of nodeIds) {
      const node = map.get(id);
      if (!node) continue;
      const nextStarred = forcedValue !== undefined ? forcedValue : !node.starred;
      updates.push({
        ...node,
        starred: nextStarred,
        updatedAt: now,
      });
    }

    await vaultRepository.putNodes(updates);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
  }

  // --- Multipart Upload Queue Engine (with Plan Authorization) ---

  public async startUpload(
    files: File[],
    targetFolderId: string | null,
    targetProviderId: string
  ): Promise<string[]> {
    const [plan, mounts] = await Promise.all([
      this.getActivePlanDefinition(),
      vaultRepository.getAllMounts(),
    ]);

    if (files.length > plan.maxBulkFiles) {
      const msg = `Bulk upload of ${files.length} files exceeds the ${plan.name} plan limit of ${plan.maxBulkFiles} files per batch. Upgrade to PRO or ULTRA for larger bulk uploads.`;
      this.limitReachedCallback(msg);
      throw new StorageError('PLAN_LIMIT_REACHED', msg, false);
    }

    const totalIncoming = files.reduce((acc, f) => acc + f.size, 0);
    await this.enforceTransferQuotaAuthorization(totalIncoming, 'Upload');

    const mount = mounts.find((m) => m.id === targetProviderId);
    if (!mount) {
      throw new Error('Selected storage provider mount does not exist.');
    }
    if (mount.status !== 'connected') {
      throw new StorageError('DISCONNECTED', `Mount "${mount.name}" is not connected.`, false);
    }

    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        if (est.quota && est.usage !== undefined) {
          if (est.usage + totalIncoming > est.quota) {
            throw new StorageError(
              'QUOTA_EXCEEDED',
              'Insufficient browser IndexedDB quota for selected file(s).',
              false
            );
          }
        }
      } catch (err) {
        if (err instanceof StorageError) throw err;
      }
    }

    const adapter = this.getAdapterForMount(mount);
    const partSizeBytes = adapter.partSizeBytes;
    const createdIds: string[] = [];
    const now = Date.now();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const totalParts = Math.max(1, Math.ceil(file.size / partSizeBytes));
      const id = `job-${crypto.randomUUID()}`;
      const job: UploadJob = {
        id,
        fileName: file.name,
        fileSize: file.size,
        targetFolderId,
        targetProviderId,
        status: 'queued',
        partSizeBytes,
        totalParts,
        completedParts: 0,
        uploadedBytes: 0,
        speedBytesPerSec: 0,
        etaSeconds: null,
        errorMessage: null,
        createdAt: now + i,
      };

      this.tasks.set(id, {
        job,
        file,
        uploadId: null,
        completedPartsReceipt: [],
        inFlightPartBytes: 0,
        abortController: null,
        byteSamples: [],
      });
      createdIds.push(id);
    }

    await this.syncInFlightToMeta();
    this.stateMutatedCallback();
    this.pumpUploadQueue();
    return createdIds;
  }

  private pumpUploadQueue(): void {
    while (this.activeCount < this.maxConcurrency) {
      const nextTask = Array.from(this.tasks.values()).find(
        (t) => t.job.status === 'queued'
      );
      if (!nextTask) break;
      this.runUploadTask(nextTask);
    }
  }

  private async runUploadTask(task: InternalUploadTask): Promise<void> {
    this.activeCount++;
    task.job.status = 'uploading';
    task.job.errorMessage = null;
    task.abortController = new AbortController();
    task.byteSamples = [{ ts: performance.now(), totalBytes: task.job.uploadedBytes }];
    this.ensureSpeedTicker();
    this.stateMutatedCallback();

    try {
      const mounts = await vaultRepository.getAllMounts();
      const mount = mounts.find((m) => m.id === task.job.targetProviderId);
      if (!mount) {
        throw new StorageError('NOT_FOUND', 'Target provider mount no longer exists.', false);
      }

      const adapter = this.getAdapterForMount(mount);
      const objectKey = `file-${crypto.randomUUID()}`;

      if (!task.uploadId) {
        const res = await adapter.createMultipartUpload(
          mount,
          objectKey,
          task.file.type || 'application/octet-stream'
        );
        task.uploadId = res.uploadId;
      }

      for (let partNum = task.job.completedParts + 1; partNum <= task.job.totalParts; partNum++) {
        if (task.job.status !== 'uploading' || !task.abortController) {
          return;
        }

        const startByte = (partNum - 1) * task.job.partSizeBytes;
        const endByte = Math.min(task.job.fileSize, startByte + task.job.partSizeBytes);
        const partBlob = task.file.slice(startByte, endByte);

        let attempt = 0;
        let partReceipt: { etag: string } | null = null;
        while (true) {
          try {
            task.inFlightPartBytes = 0;
            partReceipt = await adapter.uploadPart(
              mount,
              objectKey,
              task.uploadId,
              partNum,
              partBlob,
              task.abortController.signal
            );
            break;
          } catch (err) {
            if (err instanceof StorageError && err.code === 'ABORTED') {
              throw err;
            }
            const isRetryable = err instanceof StorageError && err.retryable;
            if (isRetryable && attempt < 3) {
              const backoffMs = 500 * Math.pow(2, attempt);
              attempt++;
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
            throw err;
          }
        }

        task.completedPartsReceipt.push({ partNumber: partNum, etag: partReceipt.etag });
        task.job.completedParts = partNum;
        task.inFlightPartBytes = 0;
        this.recomputeTaskProgress(task);
        this.stateMutatedCallback();
      }

      const [checksumSha256, thumbBlob] = await Promise.all([
        computeBlobSha256(task.file),
        generateImageThumbnailBlob(task.file, 320),
      ]);

      await adapter.completeMultipartUpload(
        mount,
        objectKey,
        task.uploadId,
        task.completedPartsReceipt,
        task.file
      );

      const allNodes = await vaultRepository.getAllNodes();
      const map = new Map(allNodes.map((n) => [n.id, n]));
      let targetFolderId = task.job.targetFolderId;
      if (targetFolderId !== null) {
        const folder = map.get(targetFolderId);
        if (!folder || folder.type !== 'folder' || isEffectivelyTrashed(folder, map)) {
          targetFolderId = null;
        }
      }
      const siblings = allNodes.filter(
        (n) => n.parentId === targetFolderId && !isEffectivelyTrashed(n, map)
      );
      const siblingNamesLower = new Set(siblings.map((s) => s.name.toLowerCase()));
      const safeName = resolveUniqueSiblingName(task.job.fileName, false, siblingNamesLower);
      const ext = safeName.includes('.') ? safeName.split('.').pop()!.toLowerCase() : '';
      const now = Date.now();

      const fileNode: FileNode = {
        id: objectKey,
        parentId: targetFolderId,
        name: safeName,
        type: 'file',
        providerId: mount.id,
        mimeType: task.file.type || 'application/octet-stream',
        extension: ext,
        sizeBytes: task.file.size,
        checksumSha256,
        hasBlob: true,
        hasThumb: Boolean(thumbBlob),
        starred: false,
        trashedAt: null,
        trashedFromParentId: null,
        createdAt: now,
        updatedAt: now,
      };

      const activity: ActivityEvent = {
        ts: now,
        kind: 'ingress',
        bytes: task.file.size,
        providerId: mount.id,
      };

      task.job.status = 'completed';
      task.job.uploadedBytes = task.job.fileSize;
      task.job.speedBytesPerSec = 0;
      task.job.etaSeconds = 0;

      const remainingInFlight: PersistedInFlightUpload[] = [];
      for (const t of this.tasks.values()) {
        if (
          t.job.id !== task.job.id &&
          (t.job.status === 'queued' || t.job.status === 'uploading' || t.job.status === 'paused')
        ) {
          remainingInFlight.push({
            id: t.job.id,
            fileName: t.job.fileName,
            fileSize: t.job.fileSize,
            targetFolderId: t.job.targetFolderId,
            targetProviderId: t.job.targetProviderId,
            partSizeBytes: t.job.partSizeBytes,
            totalParts: t.job.totalParts,
            createdAt: t.job.createdAt,
          });
        }
      }

      await vaultRepository.commitCompletedUpload({
        fileNode,
        blob: task.file,
        thumbBlob,
        activity,
        remainingInFlight,
      });

      vaultRepository.notifyBroadcast();
    } catch (err) {
      const currentStatus: string = task.job.status;
      if (currentStatus === 'paused' || currentStatus === 'cancelled') {
        // Handled by pauseUpload or cancelUpload
      } else {
        task.job.status = 'error';
        task.inFlightPartBytes = 0;
        task.job.uploadedBytes = task.job.completedParts * task.job.partSizeBytes;
        task.job.speedBytesPerSec = 0;
        task.job.etaSeconds = null;
        task.job.errorMessage =
          err instanceof Error ? err.message : 'Upload failed due to an unexpected error.';
        await this.syncInFlightToMeta();
      }
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.stateMutatedCallback();
      this.pumpUploadQueue();
    }
  }

  public pauseUpload(jobId: string): void {
    const task = this.tasks.get(jobId);
    if (!task || task.job.status !== 'uploading') return;

    task.job.status = 'paused';
    task.abortController?.abort();
    task.abortController = null;
    task.inFlightPartBytes = 0;
    task.job.uploadedBytes = task.job.completedParts * task.job.partSizeBytes;
    task.job.speedBytesPerSec = 0;
    task.job.etaSeconds = null;
    this.syncInFlightToMeta().catch(() => {});
    this.stateMutatedCallback();
  }

  public resumeUpload(jobId: string): void {
    const task = this.tasks.get(jobId);
    if (!task || task.job.status !== 'paused') return;

    task.job.status = 'queued';
    task.job.errorMessage = null;
    this.syncInFlightToMeta().catch(() => {});
    this.stateMutatedCallback();
    this.pumpUploadQueue();
  }

  public retryUpload(jobId: string): void {
    const task = this.tasks.get(jobId);
    if (!task || task.job.status !== 'error') return;
    if (task.file.size === 0 && task.job.fileSize > 0) {
      return;
    }

    task.job.status = 'queued';
    task.job.errorMessage = null;
    this.syncInFlightToMeta().catch(() => {});
    this.stateMutatedCallback();
    this.pumpUploadQueue();
  }

  public async cancelUpload(jobId: string): Promise<void> {
    const task = this.tasks.get(jobId);
    if (!task) return;
    if (
      task.job.status !== 'uploading' &&
      task.job.status !== 'queued' &&
      task.job.status !== 'paused'
    ) {
      return;
    }

    task.job.status = 'cancelled';
    task.abortController?.abort();
    task.abortController = null;
    task.inFlightPartBytes = 0;
    task.job.speedBytesPerSec = 0;
    task.job.etaSeconds = null;

    if (task.uploadId) {
      const mounts = await vaultRepository.getAllMounts();
      const mount = mounts.find((m) => m.id === task.job.targetProviderId);
      if (mount) {
        const adapter = this.getAdapterForMount(mount);
        await adapter.abortMultipartUpload(mount, task.job.id, task.uploadId).catch(() => {});
      }
    }

    await this.syncInFlightToMeta();
    this.stateMutatedCallback();
    this.pumpUploadQueue();
  }

  public clearCompletedUploads(includeErrors: boolean = false): void {
    for (const [id, task] of this.tasks.entries()) {
      if (
        task.job.status === 'completed' ||
        task.job.status === 'cancelled' ||
        (includeErrors && task.job.status === 'error')
      ) {
        this.tasks.delete(id);
      }
    }
    this.syncInFlightToMeta().catch(() => {});
    this.stateMutatedCallback();
  }

  public dismissUpload(jobId: string): void {
    const task = this.tasks.get(jobId);
    if (!task) return;
    if (
      task.job.status === 'completed' ||
      task.job.status === 'cancelled' ||
      task.job.status === 'error'
    ) {
      this.tasks.delete(jobId);
      this.syncInFlightToMeta().catch(() => {});
      this.stateMutatedCallback();
    }
  }

  // --- Object Download & Preview URL (with Plan Quota Authorization) ---

  public async getObjectUrl(fileId: string): Promise<{ url: string; blob: Blob }> {
    const allNodes = await vaultRepository.getAllNodes();
    const node = allNodes.find((n) => n.id === fileId);
    if (!node || node.type !== 'file') {
      throw new StorageError('NOT_FOUND', 'File not found.', false);
    }
    if (!node.hasBlob) {
      throw new StorageError('NOT_FOUND', 'Placeholder file has no stored bytes.', false);
    }

    const mounts = await vaultRepository.getAllMounts();
    const mount = mounts.find((m) => m.id === node.providerId);
    if (!mount) {
      throw new StorageError('NOT_FOUND', 'Mount not found.', false);
    }
    if (mount.status === 'disconnected') {
      throw new StorageError('DISCONNECTED', `Mount "${mount.name}" is disconnected.`, false);
    }

    const adapter = this.getAdapterForMount(mount);
    const blob = await adapter.getObject(mount, node.id);
    const url = URL.createObjectURL(blob);
    return { url, blob };
  }

  public async downloadFile(fileId: string): Promise<void> {
    const allNodes = await vaultRepository.getAllNodes();
    const node = allNodes.find((n) => n.id === fileId);
    if (!node || node.type !== 'file') {
      throw new Error('File not found.');
    }

    await this.enforceTransferQuotaAuthorization(node.sizeBytes, 'Download');

    const { url, blob } = await this.getObjectUrl(fileId);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = node.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      await vaultRepository.addActivity({
        ts: Date.now(),
        kind: 'egress',
        bytes: blob.size,
        providerId: node.providerId,
      });
      vaultRepository.notifyBroadcast();
      this.stateMutatedCallback();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  // --- Mount Management (with Plan Account Connection Authorization) ---

  public async testMount(
    mount: ProviderMount,
    signal?: AbortSignal
  ): Promise<ConnectionReport> {
    const adapter = this.getAdapterForMount(mount);
    const report = await adapter.testConnection(mount, signal);
    const updated: ProviderMount = {
      ...mount,
      latencyMs: report.latencyMs,
      lastSyncedAt: Date.now(),
      status: mount.status === 'disconnected' ? 'disconnected' : 'connected',
    };
    await vaultRepository.putMount(updated);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
    return report;
  }

  public async addMount(
    draft: Omit<ProviderMount, 'id' | 'createdAt' | 'lastSyncedAt' | 'status' | 'latencyMs'>,
    latencyMs: number
  ): Promise<ProviderMount> {
    const [plan, mounts] = await Promise.all([
      this.getActivePlanDefinition(),
      vaultRepository.getAllMounts(),
    ]);

    // Enforce subscription account connection limit in the orchestrator layer (Requirement 9)
    const externalMounts = mounts.filter((m) => m.kind !== 'local');
    if (externalMounts.length >= plan.maxMounts) {
      const msg = `${plan.name} plan allows connecting up to ${plan.maxMounts} external cloud storage accounts (currently ${externalMounts.length} connected). Upgrade your subscription to connect more accounts.`;
      this.limitReachedCallback(msg);
      throw new StorageError('PLAN_LIMIT_REACHED', msg, false);
    }

    const cleanName = draft.name.trim();
    if (mounts.some((m) => m.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error(`A mount named "${cleanName}" already exists.`);
    }

    const now = Date.now();
    const newMount: ProviderMount = {
      ...draft,
      id: `${draft.kind}-${crypto.randomUUID().slice(0, 8)}`,
      name: cleanName,
      status: 'connected',
      latencyMs,
      lastSyncedAt: now,
      createdAt: now,
    };

    await vaultRepository.putMount(newMount);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
    return newMount;
  }

  public async updateMount(
    mountId: string,
    updates: Partial<Pick<ProviderMount, 'name' | 'endpoint' | 'region' | 'bucket' | 'allocatedBytes' | 'latencyMs' | 'mode' | 'credentials' | 'connectedAccountId'>>
  ): Promise<ProviderMount> {
    const mounts = await vaultRepository.getAllMounts();
    const target = mounts.find((m) => m.id === mountId);
    if (!target) throw new Error('Mount not found.');

    if (updates.name !== undefined) {
      const cleanName = updates.name.trim();
      if (
        mounts.some(
          (m) => m.id !== mountId && m.name.toLowerCase() === cleanName.toLowerCase()
        )
      ) {
        throw new Error(`A mount named "${cleanName}" already exists.`);
      }
      updates.name = cleanName;
    }

    const updated: ProviderMount = {
      ...target,
      ...updates,
      lastSyncedAt: Date.now(),
    };
    await vaultRepository.putMount(updated);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
    return updated;
  }

  public async disconnectMount(mountId: string): Promise<void> {
    if (mountId === 'local-vault') {
      throw new Error('The built-in Local Browser Vault cannot be disconnected.');
    }
    const mounts = await vaultRepository.getAllMounts();
    const target = mounts.find((m) => m.id === mountId);
    if (!target) return;

    await vaultRepository.putMount({
      ...target,
      status: 'disconnected',
    });
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
  }

  public async reconnectMount(mountId: string, signal?: AbortSignal): Promise<ConnectionReport> {
    const mounts = await vaultRepository.getAllMounts();
    const target = mounts.find((m) => m.id === mountId);
    if (!target) throw new Error('Mount not found.');

    const adapter = this.getAdapterForMount(target);
    const report = await adapter.testConnection({ ...target, status: 'connected' }, signal);

    await vaultRepository.putMount({
      ...target,
      status: 'connected',
      latencyMs: report.latencyMs,
      lastSyncedAt: Date.now(),
    });
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
    return report;
  }

  public async removeMount(mountId: string): Promise<void> {
    if (mountId === 'local-vault') {
      throw new Error('The built-in Local Browser Vault cannot be removed.');
    }
    const allNodes = await vaultRepository.getAllNodes();
    const mountFiles = allNodes.filter(
      (n): n is FileNode => n.type === 'file' && n.providerId === mountId
    );
    await vaultRepository.deleteMountAndFiles(mountId, mountFiles);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
  }

  public async resetWorkspace(): Promise<void> {
    for (const task of this.tasks.values()) {
      task.abortController?.abort();
    }
    this.tasks.clear();
    this.activeCount = 0;
    await vaultRepository.seedDatabase(true);
    vaultRepository.notifyBroadcast();
    this.stateMutatedCallback();
  }
}

export const storageOrchestrator = new StorageOrchestrator();
