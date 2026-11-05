# TeleVault — Google AI Studio Master Build Prompt (v3 Production Spec)

> **Prompt Instructions for Google AI Studio / Gemini Code Assist:**
> Act as a Principal Full-Stack Engineer and SaaS Architect. Build **TeleVault**, a modern, dark-mode, keyboard-first multi-cloud file management SaaS application, as a **client-only single-page application (SPA)**: no backend server, no external API keys required, and all user data persisted locally in browser IndexedDB.
>
> Follow this specification strictly. All code must be complete, runnable, type-safe (TypeScript strict mode, no `any`), and contain zero placeholders or missing imports.

---

## 0. Product Vision & Honesty Ground Rules

TeleVault is a zero-egress multi-cloud file aggregator that unifies storage across 21 cloud storage providers alongside a local IndexedDB vault.

### Core Honesty & Prototype Rules
1. **Permanent Transparency Strip**: Render a permanent top bar on the landing page and app shell:
   `"Prototype · simulated connectors · data stays in this browser"`
2. **Simulated Mount Badges**: Every non-local storage mount must display an explicit `Simulated` tag and realistic latency metrics.
3. **No False Claims**: Never claim real remote server encryption, active cloud API connections, production SLAs, or real email transmission.
4. **Brand Constant**: The application name is defined in one central constant: `export const APP_NAME = 'TeleVault';`.
5. **Units**: Use strict **SI standard decimal units** everywhere in user interfaces and pricing formulas (`1 KB = 1,000 B`, `1 MB = 1,000,000 B`, `1 GB = 10^9 B`, `1 TB = 10^12 B`). Binary `MiB` multiples (`1024 * 1024`) are used strictly for internal multipart chunk slicing (`partSizeBytes`).

---

## 1. Tech Stack & Dependencies

```json
{
  "dependencies": {
    "@tanstack/react-virtual": "^3.13.2",
    "cmdk": "^1.1.1",
    "idb": "^8.0.3",
    "lucide-react": "^1.16.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-is": "^19.0.0",
    "react-markdown": "^10.1.0",
    "react-router-dom": "^7.1.5",
    "recharts": "^2.15.1",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/node": "^22.13.1",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "@vitejs/plugin-react": "^5.0.0",
    "esbuild": "^0.28.0",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.8.0",
    "vite": "^8.3.6",
    "vitest": "^5.1.0"
  }
}
```

> [!CRITICAL]
> - `react-is` (`^19.0.0`) must be explicitly installed to prevent runtime import failures with Recharts on React 19.
> - `vite.config.ts` must use `import.meta.dirname` (avoid deprecated `__dirname`) and implement `manualChunks` splitting (`vendor-react`, `vendor-charts`, `vendor-icons`) to keep production bundle chunks `< 380 kB`.

---

## 2. Complete Domain Data Models

```ts
// 21 Cloud Storage Providers + Local IndexedDB Vault
export type ProviderKind =
  | 'local'
  | 'mega'
  | 'terabox'
  | 'gdrive'
  | 'dropbox'
  | 'onedrive'
  | 'box'
  | 'pcloud'
  | 'icloud'
  | 'proton'
  | 'sync'
  | 'kdrive'
  | 'nextcloud'
  | 's3'
  | 'r2'
  | 'gcs'
  | 'azure'
  | 'b2'
  | 'wasabi'
  | 'do_spaces'
  | 'hetzner'
  | 'webdav';

export type MountStatus = 'connected' | 'syncing' | 'disconnected' | 'error';

export interface ProviderMount {
  id: string;                  // 'local-vault' is the built-in IndexedDB mount (cannot be removed)
  kind: ProviderKind;
  name: string;                // Unique display name (case-insensitive)
  endpoint: string | null;
  region: string | null;
  bucket: string | null;
  status: MountStatus;
  allocatedBytes: number;      // Simulated capacity (SI decimal bytes)
  latencyMs: number | null;
  zeroEgress: boolean;         // True for R2, B2, Wasabi, Hetzner, Local
  lastSyncedAt: number | null;
  createdAt: number;
}

export interface NodeBase {
  id: string;
  parentId: string | null;
  name: string;
  starred: boolean;
  trashedAt: number | null;    // Non-null only on explicitly trashed root; descendants inherit
  trashedFromParentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface FolderNode extends NodeBase {
  type: 'folder';              // Virtual folders can group files across any cloud mount
}

export interface FileNode extends NodeBase {
  type: 'file';
  providerId: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksumSha256: string | null;
  hasBlob: boolean;            // true = real bytes stored in IndexedDB; false = quota placeholder
  hasThumb: boolean;
}

export type VaultNode = FolderNode | FileNode;

export type UploadStatus = 'queued' | 'uploading' | 'paused' | 'completed' | 'cancelled' | 'error';

export interface UploadJob {
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
  passwordHash: string;        // PBKDF2-SHA256 hex digest
  salt: string;                // 16-byte random hex salt
  createdAt: number;
}

export type PlanId = 'free' | 'pro' | 'ultra';
export type BillingCycle = 'monthly' | 'annual';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  audience: string;
  baseMonthlyInr: number;      // Free: ₹0, Pro: ₹199, Ultra: ₹499
  annualDiscountPercent: number;// 20% discount (Pro: ₹159/mo, Ultra: ₹399/mo)
  maxMounts: number;           // Free: 2, Pro: 7, Ultra: 20
  dailyTransferLimitGB: number;// Free: 5 GB, Pro: 50 GB, Ultra: 250 GB
  monthlyTransferLimitGB: number;// Free: 25 GB, Pro: 500 GB, Ultra: 2,500 GB
  maxBulkFiles: number;        // Free: 3, Pro: 25, Ultra: 100
  priorityLabel: string;
  badgeText?: string;
  isPopular?: boolean;
  features: string[];
  allowBulkOperations: boolean;
  allowAdvancedSearch: boolean;
  allowAutoOrganize: boolean;
  allowScheduledTransfers: boolean;
  allowCrossCloudSync: boolean;
}
```

---

## 3. Storage Layer & Atomic IndexedDB Engine

Database name: `televault_db` (version 1) using `idb`.

### Object Stores
1. `meta`: Stores system metadata (`schemaVersion`, `seeded`, `settings`, `activeUploads`).
2. `accounts`: Keyed by `email` (PBKDF2-SHA256 hashed credentials).
3. `mounts`: Keyed by `id`.
4. `nodes`: Keyed by `id`, index on `parentId`.
5. `blobs`: Compound key `[providerId, objectKey]` storing raw binary `Blob` objects.
6. `thumbs`: Keyed by `nodeId` storing 320px PNG thumbnail `Blob` objects.
7. `activity`: Auto-incrementing ID, index on `ts`.

### Critical Architecture Rules
1. **Single-Transaction Commit (Eliminating Double-Write Bug)**:
   - Adapters (`IndexedDBStorageAdapter` and `SimulatedCloudAdapter`) buffer nothing and do **not** invoke `repo.putBlob` inside `completeMultipartUpload`.
   - File metadata, binary blob, thumbnail, activity log, and remaining in-flight tasks are committed together in **one atomic IndexedDB transaction** via `vaultRepository.commitCompletedUpload`:
     ```ts
     const tx = db.transaction(['nodes', 'blobs', 'thumbs', 'activity', 'meta'], 'readwrite');
     await tx.objectStore('nodes').put(fileNode);
     if (blob) await tx.objectStore('blobs').put(blob, [fileNode.providerId, fileNode.id]);
     if (thumbBlob) await tx.objectStore('thumbs').put(thumbBlob, fileNode.id);
     await tx.objectStore('activity').add(activity);
     await tx.objectStore('meta').put(remainingInFlight, 'activeUploads');
     await tx.done;
     ```
2. **Cycle-Safe Tree Traversal**:
   - `collectSubtreeIds` must maintain a `visited = new Set<string>()` to prevent infinite recursion on malformed or circular parent hierarchies:
     ```ts
     export function collectSubtreeIds(rootId: string, allNodes: VaultNode[]): { nodeIds: string[]; fileNodes: FileNode[] } {
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
       if (rootNode?.type === 'file') fileNodes.push(rootNode);

       while (queue.length > 0) {
         const currId = queue.shift()!;
         if (visited.has(currId)) continue;
         visited.add(currId);
         nodeIds.push(currId);
         for (const k of childrenMap.get(currId) ?? []) {
           if (!visited.has(k.id)) {
             queue.push(k.id);
             if (k.type === 'file') fileNodes.push(k);
           }
         }
       }
       return { nodeIds, fileNodes };
     }
     ```
3. **Effective Trash Cascade**:
   - `isEffectivelyTrashed(node, map)` traverses `parentId` chains. If any ancestor has `trashedAt !== null`, the node is effectively trashed. Starred, Explorer non-trash views, overview lists, and search queries must filter with `!isEffectivelyTrashed(node, map)`.
4. **Cross-Tab Synchronization**:
   - Broadcast mutations using `BroadcastChannel('televault')` so changes in one browser tab instantly update all other open tabs.
5. **In-Memory Fallback**:
   - If IndexedDB access fails (e.g. restrictive third-party iframes or incognito sandbox restrictions), fall back seamlessly to an in-memory repository and display an amber banner: *"Storage unavailable in private/restricted mode — changes won't survive a reload."*

---

## 4. Multi-Cloud Adapters & Storage Orchestrator

The UI components never call storage adapters directly; all operations pass through the singleton `StorageOrchestrator`.

### Adapter Specification
- `IndexedDBStorageAdapter` (`kind = 'local'`, chunk size = 1 MiB): Real browser storage.
- `SimulatedCloudAdapter`: Powers all 21 external cloud providers with realistic latency profiles (e.g., S3 ~80ms, R2 ~60ms, Google Drive ~110ms, WebDAV ~140ms with ±30% jitter) and bandwidth profiles (10–35 MB/s).
- **Developer Fault Simulation**: Supports configurable transient network failure rates (0%, 10%, 50%) and an "Offline Mode" switch in Settings.

### Orchestrator Core Responsibilities
- **Recursive Cross-Cloud Transfers**:
  When migrating files/folders across mounts via `transferBetweenClouds(nodeIds, targetMountId)`, expand any selected folders into their descendant files using `collectSubtreeIds`. Validate available space on the target mount, deduct quota, migrate underlying blobs, update `providerId`, and record both egress and ingress activity events.
- **Quota & Tier Authorization**:
  Before starting an upload, download, or cross-cloud transfer, enforce the current plan limits (`enforceTransferQuotaAuthorization`) against the 24-hour rolling daily quota and 30-day rolling monthly quota.
- **Multipart Upload Pipeline**:
  Maximum concurrency: 3 simultaneous tasks. Smooth progress ticks every 100ms. Non-blocking WebCrypto SHA-256 calculation for files ≤ 64 MB. 320px thumbnail rasterization on HTML5 Canvas.
- **Failed Upload Dismissal**:
  Support `dismissUpload(jobId)` and `clearCompletedUploads(includeErrors: boolean = false)` so that failed or reload-interrupted tasks can be dismissed from the Transfer Tray.

---

## 5. UI/UX Design System & Global Interaction

- **Dark Theme Tokens**:
  - App Canvas: `#090A0F`
  - Workspace Background: `#0E1017`
  - Surface Cards: `#131620`
  - Borders/Dividers: `#1E2230`
  - Primary Accent: `#4F46E5` (hover `#4338CA`, active `#818CF8`)
  - Status Colors: `#10B981` (Connected/Completed), `#F59E0B` (Syncing/Paused), `#F43F5E` (Failed/Disconnected)
  - Typography: `DM Sans` for UI copy and headings; `JetBrains Mono` with `tabular-nums` for file sizes, metrics, checksums, and speeds.

### Critical Keyboard & Explorer Event Guidelines
- **Zero Listener Thrashing**:
  In `ExplorerPage`, tie the global `keydown` event listener to `[]` dependencies by reading volatile state (`visibleNodes`, `selectedNodeIds`, `focusedNodeId`, `mode`, `mountMap`) through stable React refs (`useRef`). Never rebind window listeners on keystrokes or selection changes.
- **Context Menu Clamping**:
  Clamp right-click coordinates:
  ```tsx
  style={{
    top: Math.max(8, Math.min(window.innerHeight - 260, contextMenu.y)),
    left: Math.max(8, Math.min(window.innerWidth - 200, contextMenu.x)),
  }}
  ```
- **Keyboard Shortcuts**:
  - `↑` / `↓` or `J` / `K`: Move focus and selection across virtualized rows.
  - `Enter`: Open folder or open file inspector.
  - `Space`: Toggle file preview modal.
  - `Ctrl/⌘ + A`: Select all visible items.
  - `F2`: Trigger rename dialog.
  - `S`: Toggle star on selected item(s).
  - `Delete` / `Backspace`: Move selected item(s) to Trash (with 6s Undo toast).
  - `Ctrl/⌘ + K`: Open Command Palette (`cmdk`).
  - `?`: Open keyboard shortcuts cheat sheet.

---

## 6. Route & Screen Specifications

### 1. Landing Page (`#/`)
- Sticky 3-zone header with **responsive mobile hamburger menu toggle** and backdrop-blurred navigation drawer (Capabilities, Architecture, Pricing Estimator, Sign In).
- Hero section with a static non-interactive explorer preview.
- 6-card bento grid highlighting multi-cloud unification, keyboard speed, and zero egress.
- Architecture workflow diagram explaining client-side storage isolation.
- Embedded interactive Pricing Estimator.
- Primary CTA: *"Launch demo workspace"* (initializes seeded demo account `alex.rivera@televault.demo` on the Pro tier).

### 2. Authentication Page (`#/auth`)
- Tabs: *Sign In*, *Create Account*, *Reset Password*, and *Instant Demo*.
- WebCrypto PBKDF2-SHA256 client-side hashing (16-byte random salt, 600,000 iterations). Plaintext passwords are never stored.
- Explicit notice: *"Local demo account — credentials remain in this browser only."*

### 3. Dashboard Overview (`#/app/overview`)
- KPI summary cards: Total Managed Storage vs. Plan Limit, Connected Cloud Mounts, Monthly Egress, Zero-Egress Savings ($ USD).
- Storage mount health list with real-time capacity progress bars and latency meters.
- 10 newest files list and pinned (starred) folders.
- OS Drag-and-drop file upload zone.

### 4. File Explorer (`#/app/files/:folderId?`, `#/app/starred`, `#/app/trash`)
- View modes: Virtualized 40px table rows (`@tanstack/react-virtual`) and Drive-style card grid.
- Category filter chips: *All*, *Images*, *Documents*, *Audio*, *Video*, *Code*, *Archives*, *Other*.
- Storage mount filter dropdown.
- Batch actions toolbar: *Move*, *Transfer to Mount*, *Star*, *Download*, *Trash*.
- Breadcrumbs with automatic middle-truncation beyond 4 levels.
- 320px slide-over File Inspector and modal preview supporting images, videos, audio, plain text, Markdown (`react-markdown`), JSON, CSV, syntax-highlighted code, and PDF `<object>`.

### 5. Storage Provider Mounts (`#/app/providers`)
- Active cloud accounts vs. plan cap indicator (e.g. `1 / 2 connected on FREE plan`).
- Mount cards with status badge, endpoint, bucket, capacity usage, latency, and simulated tags.
- Actions: *Test Connection* (1.5s simulated 3-step handshake), *Edit Capacity*, *Disconnect/Reconnect*, *Remove Mount*.
- **Add Provider Mount Modal**:
  - Real-time search filter across all 21 cloud providers.
  - Category tabs: *Consumer & Personal Cloud*, *Object & Infrastructure Cloud*, *Self-Hosted & Protocol*.
  - Strict input validation:
    - S3: 3–63 chars, lowercase, digits, dots, hyphens.
    - Cloudflare R2: Account ID (4–40 chars) and bucket name (no dots).
    - Google Cloud Storage: Project ID and bucket name (dots, hyphens, underscores).
    - WebDAV / Nextcloud / Hetzner: Valid HTTP/HTTPS endpoint URL.

### 6. Analytics (`#/app/analytics`)
- Recharts capacity donut/bar charts by file category and by cloud provider.
- 7-Day vs. 30-Day ingress/egress area chart combining seeded history with live activity events.
- Zero-egress financial savings calculation benchmarked against AWS S3 standard egress rates ($0.09/GB).

### 7. Subscription & Pricing (`#/app/pricing`)
- Tier Cards:
  - **FREE**: ₹0 (2 cloud mounts, 5 GB/day transfer, 25 GB/month cross-cloud transfer, 3 files/batch).
  - **PRO**: ₹199/month or ₹159/month annual (7 cloud mounts, 50 GB/day transfer, 500 GB/month cross-cloud, 25 files/batch, automated file organization).
  - **ULTRA**: ₹499/month or ₹399/month annual (20 cloud mounts, 250 GB/day transfer, 2,500 GB/month cross-cloud, 100 files/batch, cross-cloud sync).
- Interactive Sliders: Estimate optimal plan based on required clouds and daily gigabytes.
- Plan downgrade safety check: Prevents switching to a lower tier if connected accounts exceed the target limit.

### 8. Settings & Developer Controls (`#/app/settings`)
- Profile display name management.
- Demo API tokens: Generation, revocation, and robust clipboard copying with fallback (`document.execCommand`) and a 2-second green checkmark confirmation.
- Browser storage diagnostics: `navigator.storage.estimate()` and `navigator.storage.persisted()`.
- Developer Simulation Panel: Transient failure rate (0%, 10%, 50%) and simulated offline mode toggle.
- Dangerous Actions: Reset to sample workspace and sign out.

### 9. Transfer Tray Component (Persistent on all `/app` routes)
- Floating bottom-right panel displaying active transfer count and aggregate bandwidth (`MB/s`).
- Animated progress bar via `transform: scaleX(progress)`.
- Per-task controls: Pause, Resume, Retry, Cancel.
- Dismiss failed uploads (`X` button) and "Clear finished" global button.

---

## 7. Deterministic Seeding Specification (`mulberry32`, Seed 42)

On initial startup, seed the workspace deterministically:
- **Mounts**: `local-vault` (Built-in IndexedDB, 20 GB), `s3-prod` (AWS S3, 500 GB), `r2-edge` (Cloudflare R2, 1,000 GB, Zero Egress), `gcs-archive` (GCS, 2,000 GB), `webdav-nas` (WebDAV, 4,000 GB).
- **Folders**: 3-level folder hierarchy (`Engineering/Releases`, `Engineering/Docs`, `Design/Brand`, `Finance/Invoices`, `Media/Audio`, `Archive/2024`).
- **Files**: ~36 files total. ~24 files have real generated binary blobs (PNG test patterns drawn on canvas, 16-bit PCM WAV audio tones, Markdown docs, TypeScript code, JSON configuration, CSV tables). ~12 files are quota placeholders (large videos, archives, CAD files) claiming 120–150 GB of storage.
- **Activity**: 30 days of seeded ingress and egress activity logs.
- **Account**: `alex.rivera@televault.demo` initialized on the **PRO** plan.

---

## 8. Verification & Automated Test Suites

The application must include Vitest unit and integration test suites:

1. **`src/__tests__/format.test.ts`**: Verifies SI byte formatters (`formatBytes`), transfer speeds (`formatSpeed`), ETA calculators (`formatEta`), and relative timestamps.
2. **`src/__tests__/pricing.test.ts`**: Verifies plan normalization, monthly vs. annual pricing math, quota calculations, downgrade restrictions, and recommendation logic.
3. **`src/__tests__/orchestrator.test.ts`**: Verifies filename validation (`validateNodeName`), unique sibling deduplication (`resolveUniqueSiblingName`), trash cascade logic (`isEffectivelyTrashed`), and cycle-safe subtree collection (`collectSubtreeIds`).
4. **`src/__tests__/providers.test.ts`**: Verifies S3, R2, and GCS bucket name regex rules and WebDAV endpoint URL parsing.
5. **`src/__tests__/crypto.test.ts`**: Verifies 16-byte hex salt generation, deterministic PBKDF2-SHA256 password hashing, and SHA-256 chunk digests.

### Verification Commands
```bash
npm run lint   # tsc --noEmit (must pass with 0 errors)
npm test       # vitest run (all 58 tests must pass)
npm run build  # vite build (must build in < 1.5s with zero chunk size warnings)
```
