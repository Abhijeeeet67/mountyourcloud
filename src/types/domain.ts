export type ProviderKind =
  | 'local'
  // Category A: Consumer Cloud (18)
  | 'gdrive'
  | 'onedrive'
  | 'dropbox'
  | 'box'
  | 'mega'
  | 'terabox'
  | 'pcloud'
  | 'proton'
  | 'icloud'
  | 'sync'
  | 'kdrive'
  | 'koofr'
  | 'filen'
  | 'internxt'
  | 'jottacloud'
  | 'zoho'
  | 'yandex'
  | 'mediafire'
  // Category B: Object & Developer Storage (12)
  | 's3'
  | 'r2'
  | 'gcs'
  | 'azure'
  | 'b2'
  | 'wasabi'
  | 'do_spaces'
  | 'oracle_os'
  | 'scaleway'
  | 'linode'
  | 'vultr'
  | 'storj'
  // Category C: Self-Hosted & Network Storage (9)
  | 'nextcloud'
  | 'owncloud'
  | 'synology'
  | 'qnap'
  | 'webdav'
  | 'hetzner'
  | 'sftp'
  | 'smb'
  | 'ftp';

export type MountStatus = 'connected' | 'syncing' | 'disconnected' | 'error';
export type MountMode = 'real' | 'simulated';

export type ProviderCategory =
  | 'Built-In Browser'
  | 'Consumer & Personal Cloud'
  | 'Object & Infrastructure Cloud'
  | 'Self-Hosted & Protocol';

export type IntegrationStatus =
  | 'fully_integrated'
  | 'partially_integrated'
  | 'awaiting_credentials'
  | 'api_restricted'
  | 'proxy_required'
  | 'simulated';

export type AuthMethod =
  | 'oauth2_pkce'
  | 'oauth2_code'
  | 's3_credentials'
  | 'sas_token'
  | 'webdav_basic'
  | 'ssh_key'
  | 'restricted_sdk'
  | 'simulated';

export type ConnectedAccountStatus = 'active' | 'expired' | 'error' | 'revoked' | 'disconnected';

export interface ConnectedCloudAccount {
  id: string;
  userId: string;
  provider: ProviderKind;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  status: ConnectedAccountStatus;
  scopes: string[];
  tokenExpiresAt: number | null;
  lastSyncedAt: number | null;
  errorMessage?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderCredentials {
  oauthToken?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    clientId?: string;
    connectedAccountId?: string;
  };
  s3Keys?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
    bucket: string;
    endpoint?: string;
  };
  webdavAuth?: {
    username: string;
    password?: string;
    url: string;
    basePath?: string;
  };
}

export interface ProviderMount {
  id: string;                  // 'local-vault' is built in: cannot be disconnected or removed
  kind: ProviderKind;
  mode?: MountMode;            // 'real' (live API) or 'simulated' (local simulator); defaults to 'simulated'
  name: string;                // unique, case-insensitive
  endpoint: string | null;
  region: string | null;
  bucket: string | null;
  status: MountStatus;
  allocatedBytes: number;      // simulated or configured capacity in SI bytes
  latencyMs: number | null;    // from the last handshake
  zeroEgress: boolean;         // true for zero-egress providers
  connectedAccountId?: string; // ID of the linked server-managed OAuth account
  credentials?: ProviderCredentials;
  lastSyncedAt: number | null;
  createdAt: number;
}                              // usedBytes is DERIVED from files, never stored

export interface NodeBase {
  id: string;
  parentId: string | null;
  name: string;
  starred: boolean;
  trashedAt: number | null;    // set only on the node the user trashed; descendants inherit
  trashedFromParentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface FolderNode extends NodeBase {
  type: 'folder';              // virtual; may hold files from any mount
}

export interface FileNode extends NodeBase {
  type: 'file';
  providerId: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksumSha256: string | null;
  hasBlob: boolean;            // false = placeholder asset: size is claimed, no bytes exist
  hasThumb: boolean;
}

export type VaultNode = FolderNode | FileNode;

export type UploadStatus = 'queued' | 'uploading' | 'paused' | 'completed' | 'cancelled' | 'error';

export interface UploadJob {   // in memory only; speed and ETA are computed, never persisted
  id: string;
  fileName: string;
  fileSize: number;
  targetFolderId: string | null;
  targetProviderId: string;
  status: UploadStatus;
  partSizeBytes: number;
  totalParts: number;
  completedParts: number;
  uploadedBytes: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  errorMessage: string | null;
  createdAt: number;
}

export interface PersistedInFlightUpload {
  id: string;
  fileName: string;
  fileSize: number;
  targetFolderId: string | null;
  targetProviderId: string;
  partSizeBytes: number;
  totalParts: number;
  createdAt: number;
}

export interface ActivityEvent {
  id?: number;
  ts: number;
  kind: 'ingress' | 'egress';
  bytes: number;
  providerId: string;
}

export interface Account {
  email: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
}

export type PlanId = 'free' | 'pro' | 'ultra';
export type BillingCycle = 'monthly' | 'annual';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  audience: string;
  baseMonthlyInr: number;
  annualDiscountPercent: number;
  maxMounts: number;                  // Concrete account connection limit (2 / 7 / 20)
  dailyTransferLimitGB: number;       // Daily upload + download platform quota in GB
  monthlyTransferLimitGB: number;     // Monthly cross-cloud & bandwidth platform quota in GB
  maxBulkFiles: number;               // Max files per bulk operation
  priorityLabel: string;
  badgeText?: string;
  isPopular?: boolean;
  isPremium?: boolean;
  features: string[];
  allowBulkOperations: boolean;
  allowAdvancedSearch: boolean;
  allowAutoOrganize: boolean;
  allowScheduledTransfers: boolean;
  allowCrossCloudSync: boolean;
}

export interface InvoiceRecord {
  id: string;
  issuedAt: number;
  description: string;
  amountInr: number;           // demo only
  amountUsd?: number;          // backwards compatibility for older seeded records
}

export interface ScheduledTransferJob {
  id: string;
  name: string;
  sourceMountId: string;
  targetMountId: string;
  schedule: 'hourly' | 'daily' | 'weekly';
  lastRunAt: number | null;
  enabled: boolean;
  createdAt: number;
}

export interface SubscriptionState {
  planId: PlanId;
  billingCycle: BillingCycle;
  cancelledAt?: number | null;
  invoices: InvoiceRecord[];
}

export interface DemoApiToken {
  id: string;
  name: string;
  prefix: string;
  tokenValue: string;
  createdAt: number;
}

export type FailureRatePercent = 0 | 10 | 50;

export interface DeveloperSettings {
  failureRate: FailureRatePercent;
  offline: boolean;
}

export type ExplorerViewMode = 'table' | 'grid';
export type FileCategory = 'all' | 'images' | 'documents' | 'audio' | 'video' | 'code' | 'archives' | 'other';
export type SortField = 'name' | 'provider' | 'size' | 'modified';
export type SortDirection = 'asc' | 'desc';

export interface WorkspaceSettings {
  explorerView: ExplorerViewMode;
  sortField: SortField;
  sortDirection: SortDirection;
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
  subscription: SubscriptionState;
  customPlans?: Record<PlanId, PlanDefinition>;
  scheduledTransfers?: ScheduledTransferJob[];
  telegramWebhookSim?: {
    enabled: boolean;
    botHandle: string;
    notifyOnUpload: boolean;
    notifyOnQuotaWarn: boolean;
  };
  devSettings: DeveloperSettings;
  demoTokens: DemoApiToken[];
  apiCredentials?: Record<string, string>;
  activeAccountEmail: string | null;
}

export interface ConnectionReport {
  ok: boolean;
  latencyMs: number;
  canList: boolean;
  canRead: boolean;
  canWrite: boolean;
  message: string;
  liveApi?: boolean;
}

export type StorageErrorCode =
  | 'NETWORK'
  | 'AUTH'
  | 'QUOTA_EXCEEDED'
  | 'PLAN_LIMIT_REACHED'
  | 'NOT_FOUND'
  | 'DISCONNECTED'
  | 'ABORTED';

export class StorageError extends Error {
  public code: StorageErrorCode;
  public retryable: boolean;

  constructor(code: StorageErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface RemoteFileItem {
  id: string;
  name: string;
  isFolder: boolean;
  sizeBytes: number;
  modifiedTime: number;
  mimeType?: string;
  parentId?: string | null;
}

export interface StorageProviderAdapter {
  readonly kind: ProviderKind;
  readonly partSizeBytes: number;
  testConnection(m: ProviderMount, signal?: AbortSignal): Promise<ConnectionReport>;
  createMultipartUpload(m: ProviderMount, key: string, contentType: string): Promise<{ uploadId: string }>;
  uploadPart(m: ProviderMount, key: string, uploadId: string, partNumber: number, data: Blob, signal: AbortSignal): Promise<{ etag: string }>;
  completeMultipartUpload(m: ProviderMount, key: string, uploadId: string, parts: { partNumber: number; etag: string }[], source: Blob): Promise<void>;
  abortMultipartUpload(m: ProviderMount, key: string, uploadId: string): Promise<void>;
  getObject(m: ProviderMount, key: string): Promise<Blob>;
  deleteObject(m: ProviderMount, key: string): Promise<void>;
  getUsage(m: ProviderMount): Promise<{ usedBytes: number; objectCount: number }>;
  listFiles?(m: ProviderMount, folderId?: string | null): Promise<RemoteFileItem[]>;
  createFolder?(m: ProviderMount, name: string, parentFolderId?: string | null): Promise<RemoteFileItem>;
  renameObject?(m: ProviderMount, id: string, newName: string): Promise<void>;
  moveObject?(m: ProviderMount, id: string, newParentFolderId: string): Promise<void>;
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: 'default' | 'success' | 'warning' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}
