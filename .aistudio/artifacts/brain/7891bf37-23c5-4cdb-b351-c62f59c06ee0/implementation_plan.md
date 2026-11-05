# TeleVault — Client-Only Multi-Cloud File Manager (v2 Specification + Audit)

TeleVault (`APP_NAME = 'TeleVault'`) is a dark-mode, keyboard-first multi-cloud file manager built as a client-only single-page application. Every cloud connector (`s3`, `r2`, `gcs`, `webdav`) is deterministically simulated alongside a real browser-native IndexedDB storage engine (`local-vault`), with zero backend calls and transparent prototype labeling throughout the interface.

---

### Engineering Audit of the v2 Spec (Mistakes & Edge Cases Resolved)

> [!IMPORTANT]
> A thorough technical review of the v2 specification identified **7 subtle inconsistencies and browser runtime traps**. Each is resolved cleanly in this plan so execution is rock-solid:

1. **IndexedDB Auto-Commit Trap During Upload Finalization (`§3` vs. `§4` & `§5`)**:
   - *Issue Found*: `§3` requires committing an upload's blob, node, and activity event in a single atomic IndexedDB transaction, while `§5` requires computing SHA-256 (`crypto.subtle.digest`) and generating a 320px PNG canvas thumbnail on completion. In browser IndexedDB, awaiting a WebCrypto or Canvas promise *inside* an active IDB transaction causes the transaction to auto-commit prematurely and throw `TransactionInactiveError`.
   - *Fix*: Pre-compute the SHA-256 hash and 320px PNG thumbnail `Blob` immediately after the final `uploadPart` resolves, and *then* open a single atomic readwrite transaction across `['blobs', 'thumbs', 'nodes', 'activity', 'meta']` to commit everything together before updating Zustand state.
2. **Reload-Interrupted Uploads vs. In-Memory `UploadJob` (`§2` vs. `§5`)**:
   - *Issue Found*: `§2` states `UploadJob` is *"in memory only"*, while `§5` requires *"After a page reload, any non-completed job becomes a failed job: 'Interrupted by reload — upload again'"*. Pure RAM state disappears on page reload.
   - *Fix*: Persist a lightweight list of active upload descriptors (job ID, fileName, fileSize, targetFolderId, targetProviderId, partSizeBytes, totalParts — **never** file blobs, speeds, or ETAs, and never in `localStorage`) inside the IndexedDB `meta` store (`activeUploads`). On startup, any unfinished descriptors are hydrated into memory as `status: 'error'` with `errorMessage: 'Interrupted by reload — upload again'` and cleared from `meta`.
3. **Inherited Trash State Across Views, Search & Purge (`§2`, `§4`, `§6`)**:
   - *Issue Found*: `§2` specifies that `trashedAt` is set *only* on the node the user explicitly trashed, while descendants inherit trash state. If Starred, Overview ("10 newest files"), Command Palette (`cmdk`), or `deleteObject` during "Empty Trash" only check `node.trashedAt !== null`, children inside a trashed folder would leak into active views or fail to delete their underlying blobs on purge.
   - *Fix*: Implement an `isEffectivelyTrashed(nodeId, nodesMap)` helper that walks `parentId` chains. All non-trash views (`Starred`, `Overview`, `cmdk` search, move target validation) exclude nodes where `isEffectivelyTrashed` is true. Conversely, `purge` and `emptyTrash` recursively traverse all descendants of a trashed folder and invoke `adapter.deleteObject` for every child `FileNode` before removing the records.
4. **Section Cross-Reference Typos (`§0` & `§3`)**:
   - *Issue Found*: `§0` references "the phase order of §13" (actually `§12 Build order`, while `§13` is the Acceptance Checklist), and `§3` references "seed once (§12)" (actually `§11 Seed data`).
   - *Fix*: Mapped all build phases to `§12` and deterministic `mulberry32(42)` seeding to `§11`.
5. **React 19 Workspace Compatibility (`§1`)**:
   - *Issue Found*: `§1` mentions React 18, whereas the workspace is initialized with React 19 (`^19.0.1`).
   - *Fix*: Install `react-router-dom`, `zustand`, `idb`, `@tanstack/react-virtual`, `cmdk`, `recharts`, and `react-markdown` with React 19 compatibility, and ensure focus management, portals, and ref forwarding work cleanly without React 19 warnings.
6. **SI Decimal Units vs. Multipart MiB Boundaries (`§2` vs. `§4`)**:
   - *Issue Found*: `§2` mandates SI units everywhere (`1 GB = 10⁹ bytes`, `1 TB = 1,000 GB`), while `§4` specifies binary `MiB` multipart chunk sizes (`8 MiB`, `4 MiB`, `1 MiB`).
   - *Fix*: Use exact binary byte counts (`8 * 1024 * 1024`, `4 * 1024 * 1024`, `1 * 1024 * 1024`) strictly for `adapter.partSizeBytes` chunk slicing, and use strict SI powers of 10 (`10^3`, `10^6`, `10^9`, `10^12`) across all UI formatters, capacity allocations, and pricing formulas.
7. **PBKDF2 Iteration Responsiveness in Preview Environments (`§7` & `§11`)**:
   - *Issue Found*: `§7` specifies PBKDF2-SHA256 with `600,000` iterations via WebCrypto. For the seeded demo account (`§11`), running 600,000 iterations synchronously during initial DB seed could block first paint by ~400ms on slower devices.
   - *Fix*: Pre-compute or asynchronously generate the deterministic demo account's WebCrypto PBKDF2 hash during the seed routine without blocking the UI thread, while full account creation/sign-in/password-reset uses standard `crypto.subtle.deriveBits` with 600,000 iterations.

---

### 1. Overview & Honesty Ground Rules

- **Constant Brand Name**: Defined once in `src/lib/constants.ts` as `export const APP_NAME = 'TeleVault';`.
- **Permanent Prototype Transparency**:
  - A permanent badge **`Prototype · simulated connectors · data stays in this browser`** is displayed in the application shell and landing page.
  - Every non-local mount (`s3`, `r2`, `gcs`, `webdav`) displays an explicit **`Simulated`** tag.
  - Copy never implies real cloud connectivity, encryption, billing, or email delivery, and strictly avoids banned terms (`"production-grade"`, `"SLA"`, `"SOC 2"`, `"data sovereignty"`).
- **Out of Scope**: Sharing/ACLs, audit logs, client-side encryption, real network auth/cloud/payment calls, folder drag-upload, and i18n.

---

### 2. User Experience, Design System & Routing

- **Routes (`HashRouter` with Lazy Loading)**:
  - `#/` — Responsive Landing Page (Hero with static non-interactive explorer preview, 6-card Bento Grid, "How it works" adapter-layer diagram with prototype note, interactive Pricing Estimator, Footer, and CTAs for *"Launch demo workspace"* and *"Sign in"*).
  - `#/auth` — Local Demo Auth Portal (Sign in, Create account, Reset password locally without email, Instant demo workspace entry, labelled *"Local demo account — not a real login"*).
  - `#/app/overview` — KPI cards (managed storage used / plan limit, connected mounts, egress this month, estimated monthly egress savings), mount list with usage bars/status/latency, 10 newest files, pinned (starred) folders, active-transfer summary, and upload drop zone.
  - `#/app/files/:folderId?` — Virtualized Linear-style Table (`40px` rows) and Google Drive-style Card Grid, folder tree sidebar, collapsing breadcrumb, category chips, provider filter, batch selection bar, context menu, and 320px Inspector + Preview modal. Unknown or trashed `folderId` redirects to `#/app/files` with a toast.
  - `#/app/starred` — Starred folders and files (excluding effectively trashed items).
  - `#/app/trash` — Top-level trashed nodes with Restore, Delete forever, and Empty trash confirmation dialogs.
  - `#/app/providers` — Provider Mount cards + Add/Edit Mount modal with per-provider bucket/URL validation and a 3-step (~1.5s) simulated connection handshake.
  - `#/app/analytics` — Real capacity breakdown by file type and provider, 7D / 30D ingress/egress area chart (*"Includes sample history"*), and zero-egress savings card.
  - `#/app/pricing` — Plan comparison table (`Starter`, `Pro Vault`, `Enterprise Mesh`), Monthly/Annual (20% off) toggle, interactive Storage (`0–50 TB`) & Egress (`0–20 TB`) sliders highlighting the cheapest fitting plan, downgrade validation guard, and demo invoice history.
  - `#/app/settings` — Profile editor, demo API tokens (generate/copy/revoke), IndexedDB storage status (`navigator.storage.estimate()` + persistence flag), Developer simulation panel (Failure rate `0% / 10% / 50%` + `Offline` toggle), Reset to sample workspace, and Sign out.

- **Visual Tokens & Typography (`color-scheme: dark`)**:
  - **Canvas**: `#090A0F` (app outer), `#0E1017` (workspace viewport).
  - **Surface & Borders**: `#131620` (elevated surface), `#1E2230` and `rgba(255,255,255,0.07)` (1px hairlines, single elevation level, no nested shadow cards).
  - **Typography**: `DM Sans` (400/500/700, `-0.02em` headings with `text-wrap: balance`, `13px–15px` UI copy) and `JetBrains Mono` (`tabular-nums` for all byte counts, speeds, checksums, latencies, and dates).
  - **Accents & Status (Always with Text Label)**: Primary button `#4F46E5` with white text; active/links/focus ring `#818CF8` (`2px` ring with `2px` offset); Connected/Completed `#10B981`; Syncing/High usage `#F59E0B`; Disconnected/Failed `#F43F5E`.

---

### 3. Technical Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     React UI Routes & Zustand Store                        │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Landing /    │  │ File Explorer    │  │ Transfer Tray│  │ Command    │  │
│  │ Local Auth   │  │ (Virtual Table & │  │ (Bottom-Right│  │ Palette    │  │
│  │ (PBKDF2)     │  │  Grid + Preview) │  │  3-Job Queue)│  │ (cmdk ⌘K)  │  │
│  └──────┬───────┘  └────────┬─────────┘  └──────┬───────┘  └─────┬──────┘  │
└─────────┼───────────────────┼───────────────────┼────────────────┼─────────┘
          ▼                   ▼                   ▼                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           StorageOrchestrator                              │
│  - Enforces sibling name uniqueness, auto-suffixing (1)/(2), move guards   │
│  - Manages 3-concurrent multipart upload queue, 3s sliding window speed,   │
│    exponential backoff retries (500ms · 2^n), SHA-256 & 320px thumbnails   │
│  - BroadcastChannel('televault') cross-tab synchronization                 │
└─────────┬───────────────────────────────────────┬──────────────────────────┘
          ▼                                       ▼
┌───────────────────────────────────┐   ┌────────────────────────────────────┐
│  IndexedDB Repository (idb)       │   │  StorageProviderAdapter Registry   │
│  Database: televault_db           │   │  ├─ IndexedDBStorageAdapter (local)│
│  Stores: meta, accounts, mounts,  │◀──│  └─ SimulatedCloudAdapter          │
│          nodes, blobs, thumbs,    │   │     ├─ S3Adapter (8MiB, 80ms)      │
│          activity                 │   │     ├─ R2Adapter (8MiB, 60ms, $0)  │
│  + In-Memory Fallback Banner      │   │     ├─ GCSAdapter (8MiB, 100ms)    │
└───────────────────────────────────┘   │     └─ WebDAVAdapter (4MiB, 140ms) │
                                        └────────────────────────────────────┘
```

---

### 4. Phased Implementation Order (§12) & Verification (§13)

1. **Phase 1 — Foundation**: CSS variables, Tailwind setup, Google Fonts (`DM Sans` + `JetBrains Mono`), SI formatters (`lib/format.ts`), pricing math (`lib/pricing.ts`), strict domain types, IndexedDB repository with in-memory fallback and `BroadcastChannel('televault')`, deterministic `mulberry32(42)` seed generator (5 mounts, 3-level folder hierarchy, ~24 real generated PNG/WAV/Markdown/Code/CSV/JSON files with true SHA-256 & thumbnails + ~12 large placeholders totalling ~135 GB, 30 days of ingress/egress history), and `StorageOrchestrator`.
2. **Phase 2 — Shell**: `HashRouter` with lazy routes, Auth guard & PBKDF2-SHA256 local auth screens, responsive App Layout (`256px` full sidebar at `≥1280px`, `64px` icon rail at `768–1279px`, slide-over drawer at `<768px`), 3-zone Top Bar, permanent Prototype badge, and `cmdk` Command Palette + `?` Shortcuts modal.
3. **Phase 3 — File Explorer**: Virtualized Linear table (`@tanstack/react-virtual`, 40px rows, `role="grid"`, `aria-sort`), Drive card grid, `role="tree"` sidebar folder tree, collapsing breadcrumb (>4 segments), multi-select (Click, Shift, Ctrl/⌘, Esc) + batch toolbar, full keyboard navigation (`↑/↓/J/K`, `Enter`, `Space`, `F2`, `S`, `Del`, `/`, `?`), right-click context menu, Trash view with 6s Undo toast, and 320px Inspector + safe Preview modal (`react-markdown`, line-numbered code, `<object>` PDF, plain-text HTML, `<img>` SVG, audio/video/image object URLs revoked on close).
4. **Phase 4 — Upload Engine**: `IndexedDBStorageAdapter` and `SimulatedCloudAdapter` (`s3`, `r2`, `gcs`, `webdav`) honoring Developer failure rate (`0/10/50%`) and Offline mode; Upload Configurator modal (200 MB cap, free-space guard); 3-concurrent multipart engine with 100ms progress ticks, 3s sliding window speed, Pause/Resume/Cancel/Retry; and collapsible bottom-right Transfer Tray (`aria-live="polite"`).
5. **Phase 5 — Providers & Overview**: Overview dashboard KPIs, mount status bars, 10 newest files, pinned folders, dropzone; Providers page with Test Connection (1.5s 3-step handshake), Add/Edit Mount modal (strict S3/R2/GCS bucket regex & WebDAV URL validation, zero secret collection), Disconnect/Reconnect, and Remove Mount confirmation.
6. **Phase 6 — Analytics, Pricing & Settings**: Recharts capacity & 7D/30D ingress/egress area charts, interactive Pricing Estimator & plan switcher with downgrade guards, Settings profile/tokens/storage estimate/Developer panel/Reset workspace.
7. **Phase 7 — Landing Page & Final Polish**: Responsive marketing page reusing the Pricing Estimator, static hero explorer preview, adapter diagram, and full 15-point acceptance checklist verification (`§13`).
