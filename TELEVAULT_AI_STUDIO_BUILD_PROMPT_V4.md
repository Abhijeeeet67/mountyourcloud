# MountYourClouds — Google AI Studio Master Build Prompt (v4 Production SaaS Spec)

> **Prompt Instructions for Google AI Studio / Gemini Code Assist:**
> Act as a Principal Full-Stack SaaS Architect and Senior Front-End Engineer. Build **MountYourClouds**, a modern, dark-mode, keyboard-first multi-cloud file management SaaS application, as a **hybrid single-page application (SPA)**:
> - Operates out-of-the-box with **zero required external keys** using browser-native IndexedDB and deterministic cloud simulators.
> - Supports **real live cloud connections** (Google Drive REST API v3, S3/R2-compatible object storage, and WebDAV) whenever users supply credentials or OAuth tokens via the in-app UI or environment variables.
> - Preserves all verified architectural guarantees: atomic single-transaction IndexedDB commits (eliminating double-write I/O), cycle-safe tree traversal, zero keyboard listener thrashing, viewport-clamped context menus, failed upload dismissal, and Vite chunk splitting.
>
> Follow this specification strictly. All code must be complete, runnable, type-safe (TypeScript strict mode, no `any`), and contain zero placeholders or missing imports.

---

## 0. Product Vision & Hybrid SaaS Architecture

MountYourClouds is a keyboard-first, zero-egress multi-cloud file manager and storage aggregator that unifies storage across **39 cloud providers** alongside a local browser IndexedDB vault.

### Hybrid Operation Model (Real Cloud + Local Simulator)
1. **Dual Mount Modes (`mode: 'real' | 'simulated'`)**:
   - Every provider mount explicitly tracks whether it is connected to a live cloud API or running in simulated mode.
   - **`mode: 'real'`**: The mount connects to the actual cloud provider API (e.g. Google Drive v3 REST API, S3 presigned endpoint, or WebDAV server) and displays a green **`Live API`** badge.
   - **`mode: 'simulated'`**: The mount uses the deterministic local simulator with realistic latency and bandwidth modeling, displaying a purple/blue **`Simulated`** badge. The application remains 100% testable out-of-the-box in Google AI Studio without requiring any API keys.
2. **Permanent Transparency Strip**:
   Render a permanent top bar on the landing page and app shell:
   `"MountYourClouds Hybrid Multi-Cloud SaaS · Real Cloud APIs + Local Simulator Fallback"`
3. **Honesty in Provider Capabilities**:
   - Explicitly classify providers that lack public browser OAuth REST APIs (e.g., MEGA, TeraBox, Proton Drive, Apple iCloud, Sync.com) as `integrationStatus: 'api_restricted'`, with a transparent notice explaining why browser web apps cannot connect directly without a private client daemon.
   - Explicitly mark network protocols (SFTP, SMB, FTP) with `requiresBackendProxy: true`, noting that browser web runtimes cannot open raw TCP sockets without a CORS bridge or WebSocket proxy.
4. **Standard Units**:
   - Use strict **SI standard decimal units** everywhere in user interfaces and pricing formulas (`1 KB = 1,000 B`, `1 MB = 1,000,000 B`, `1 GB = 10^9 B`, `1 TB = 10^12 B`).
   - Use binary `MiB` multiples (`1024 * 1024`) strictly for multipart chunk slicing (`partSizeBytes`).
5. **Brand Constant**: Defined once in `src/lib/constants.ts`: `export const APP_NAME = 'MountYourClouds';`.

---

## 1. Verified Stack & Clean `package.json`

Ensure all dependencies use verified, published npm package versions:

```json
{
  "name": "mountyourclouds",
  "private": true,
  "version": "4.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@tanstack/react-virtual": "^3.13.2",
    "cmdk": "^1.1.1",
    "idb": "^8.0.3",
    "lucide-react": "^0.475.0",
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
    "@vitejs/plugin-react": "^4.3.4",
    "esbuild": "^0.28.0",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.8.0",
    "vite": "^6.2.0",
    "vitest": "^3.0.7"
  }
}
```

### Build & Chunking Configuration (`vite.config.ts`)
```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom', 'zustand', 'idb'],
          'vendor-charts': ['recharts', 'react-is'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
```

---

## 2. 39-Provider Catalogue & Metadata Architecture

MountYourClouds organizes 39 cloud and network storage providers across 3 distinct categories, plus the built-in local IndexedDB vault.

```ts
// 39 External Cloud Providers + Built-in Local Vault
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

export type ProviderCategory =
  | 'Built-In Browser'
  | 'Consumer & Personal Cloud'
  | 'Object & Infrastructure Cloud'
  | 'Self-Hosted & Protocol';

export type IntegrationStatus =
  | 'fully_integrated'      // Live browser API adapter implemented (e.g. Google Drive, S3, R2, WebDAV)
  | 'partially_integrated'  // REST API supported; requires credentials
  | 'awaiting_credentials'  // Open OAuth/REST supported; awaiting user credentials
  | 'api_restricted'        // Provider has no public CORS/OAuth REST API for browsers (MEGA, Proton, iCloud)
  | 'proxy_required'        // Raw TCP protocol (SFTP, SMB, FTP) requiring CORS/WebSocket bridge
  | 'simulated';            // Running in deterministic client-side simulation

export type AuthMethod =
  | 'oauth2_pkce'
  | 'oauth2_code'
  | 's3_credentials'
  | 'sas_token'
  | 'webdav_basic'
  | 'ssh_key'
  | 'restricted_sdk'
  | 'simulated';

export interface ProviderMetaInfo {
  label: string;
  shortLabel: string;
  category: ProviderCategory;
  integrationStatus: IntegrationStatus;
  authMethod: AuthMethod;
  defaultZeroEgress: boolean;
  requiresBackendProxy: boolean;
  badgeColor: string;
  defaultEndpoint: string;
  defaultRegion: string;
  defaultAllocatedGB: number;
  baseLatencyMs: number;
  minBwMBps: number;
  maxBwMBps: number;
  partSizeMiB: number;
  description: string;
  apiNote?: string;
}
```

### Complete Provider Metadata Registry (`src/lib/constants.ts`)

```ts
export const PROVIDER_KIND_META: Record<ProviderKind, ProviderMetaInfo> = {
  // Built-in Local Vault
  local: {
    label: 'IndexedDB Local Vault',
    shortLabel: 'Local Vault',
    category: 'Built-In Browser',
    integrationStatus: 'fully_integrated',
    authMethod: 'simulated',
    defaultZeroEgress: true,
    requiresBackendProxy: false,
    badgeColor: '#10B981',
    defaultEndpoint: 'indexeddb://mountyourclouds_db/blobs',
    defaultRegion: 'browser-local',
    defaultAllocatedGB: 20,
    baseLatencyMs: 4,
    minBwMBps: 45,
    maxBwMBps: 120,
    partSizeMiB: 1,
    description: 'Hardware-backed IndexedDB storage persisted inside this browser sandbox.',
  },

  // Category A: Consumer Cloud (18)
  gdrive: {
    label: 'Google Drive',
    shortLabel: 'GDrive',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'fully_integrated',
    authMethod: 'oauth2_pkce',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#34A853',
    defaultEndpoint: 'https://www.googleapis.com/drive/v3',
    defaultRegion: 'global',
    defaultAllocatedGB: 15,
    baseLatencyMs: 95,
    minBwMBps: 15,
    maxBwMBps: 38,
    partSizeMiB: 8,
    description: 'Live Google Drive v3 REST API integration using browser OAuth 2.0 PKCE.',
  },
  onedrive: {
    label: 'Microsoft OneDrive',
    shortLabel: 'OneDrive',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'oauth2_pkce',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#0078D4',
    defaultEndpoint: 'https://graph.microsoft.com/v1.0/me/drive',
    defaultRegion: 'global',
    defaultAllocatedGB: 100,
    baseLatencyMs: 110,
    minBwMBps: 12,
    maxBwMBps: 32,
    partSizeMiB: 8,
    description: 'Microsoft Graph API for OneDrive personal and business vaults.',
  },
  dropbox: {
    label: 'Dropbox',
    shortLabel: 'Dropbox',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'oauth2_pkce',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#0061FF',
    defaultEndpoint: 'https://api.dropboxapi.com/2',
    defaultRegion: 'global',
    defaultAllocatedGB: 2000,
    baseLatencyMs: 85,
    minBwMBps: 18,
    maxBwMBps: 40,
    partSizeMiB: 8,
    description: 'Dropbox API v2 client-side integration via OAuth 2.0 PKCE.',
  },
  box: {
    label: 'Box',
    shortLabel: 'Box',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'oauth2_code',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#0061D5',
    defaultEndpoint: 'https://api.box.com/2.0',
    defaultRegion: 'global',
    defaultAllocatedGB: 100,
    baseLatencyMs: 120,
    minBwMBps: 10,
    maxBwMBps: 28,
    partSizeMiB: 8,
    description: 'Box Content Cloud REST API integration.',
  },
  mega: {
    label: 'MEGA',
    shortLabel: 'MEGA',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'api_restricted',
    authMethod: 'restricted_sdk',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#D9272E',
    defaultEndpoint: 'https://g.api.mega.co.nz',
    defaultRegion: 'nz-cloud',
    defaultAllocatedGB: 2000,
    baseLatencyMs: 130,
    minBwMBps: 10,
    maxBwMBps: 26,
    partSizeMiB: 8,
    description: 'Encrypted consumer cloud storage. Runs in simulated mode (no public browser OAuth REST API).',
    apiNote: 'MEGA uses a proprietary end-to-end encryption protocol without open CORS REST endpoints. Simulated in browser.',
  },
  terabox: {
    label: 'TeraBox',
    shortLabel: 'TeraBox',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'api_restricted',
    authMethod: 'restricted_sdk',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#2B70F7',
    defaultEndpoint: 'https://data.terabox.com',
    defaultRegion: 'jp-tokyo',
    defaultAllocatedGB: 1024,
    baseLatencyMs: 160,
    minBwMBps: 8,
    maxBwMBps: 22,
    partSizeMiB: 8,
    description: 'High-capacity personal storage. Runs in simulated mode (no open developer REST API).',
    apiNote: 'TeraBox does not provide open third-party OAuth APIs for browser applications. Simulated in browser.',
  },
  pcloud: {
    label: 'pCloud',
    shortLabel: 'pCloud',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'oauth2_code',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#0D99FF',
    defaultEndpoint: 'https://api.pcloud.com',
    defaultRegion: 'eu-lux',
    defaultAllocatedGB: 500,
    baseLatencyMs: 105,
    minBwMBps: 14,
    maxBwMBps: 34,
    partSizeMiB: 8,
    description: 'Swiss-based cloud storage supporting browser OAuth 2.0.',
  },
  proton: {
    label: 'Proton Drive',
    shortLabel: 'Proton',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'api_restricted',
    authMethod: 'restricted_sdk',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#6D4AFF',
    defaultEndpoint: 'https://drive.proton.me/api',
    defaultRegion: 'ch-geneva',
    defaultAllocatedGB: 500,
    baseLatencyMs: 145,
    minBwMBps: 8,
    maxBwMBps: 22,
    partSizeMiB: 8,
    description: 'End-to-end encrypted Swiss drive. Runs in simulated mode.',
    apiNote: 'Proton Drive uses proprietary client-side SRP + OpenPGP key rings without public OAuth API access. Simulated in browser.',
  },
  icloud: {
    label: 'Apple iCloud Drive',
    shortLabel: 'iCloud',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'api_restricted',
    authMethod: 'restricted_sdk',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#5AC8FA',
    defaultEndpoint: 'https://api.apple-cloudkit.com',
    defaultRegion: 'us-west',
    defaultAllocatedGB: 200,
    baseLatencyMs: 115,
    minBwMBps: 12,
    maxBwMBps: 30,
    partSizeMiB: 8,
    description: 'Apple iCloud ecosystem storage. Runs in simulated mode.',
    apiNote: 'Apple CloudKit requires native Apple developer container provisioning and does not allow open third-party drive browsing in SPAs.',
  },
  sync: {
    label: 'Sync.com',
    shortLabel: 'Sync',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'api_restricted',
    authMethod: 'restricted_sdk',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#1791FF',
    defaultEndpoint: 'https://api.sync.com',
    defaultRegion: 'ca-central',
    defaultAllocatedGB: 2000,
    baseLatencyMs: 135,
    minBwMBps: 10,
    maxBwMBps: 25,
    partSizeMiB: 8,
    description: 'Canadian zero-knowledge storage. Runs in simulated mode.',
    apiNote: 'Sync.com does not offer public CORS-enabled REST APIs for browser applications. Simulated in browser.',
  },
  kdrive: {
    label: 'Infomaniak kDrive',
    shortLabel: 'kDrive',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'oauth2_code',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#0098FF',
    defaultEndpoint: 'https://api.infomaniak.com/1/drive',
    defaultRegion: 'ch-zurich',
    defaultAllocatedGB: 2000,
    baseLatencyMs: 100,
    minBwMBps: 14,
    maxBwMBps: 32,
    partSizeMiB: 8,
    description: 'Sovereign European cloud storage by Infomaniak.',
  },
  koofr: {
    label: 'Koofr',
    shortLabel: 'Koofr',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'fully_integrated',
    authMethod: 'webdav_basic',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#0F70B7',
    defaultEndpoint: 'https://app.koofr.net/dav/Koofr',
    defaultRegion: 'eu-si',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 110,
    minBwMBps: 12,
    maxBwMBps: 28,
    partSizeMiB: 4,
    description: 'Privacy-oriented European cloud with native WebDAV password access.',
  },
  filen: {
    label: 'Filen',
    shortLabel: 'Filen',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'api_restricted',
    authMethod: 'restricted_sdk',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#1A73E8',
    defaultEndpoint: 'https://gateway.filen.io',
    defaultRegion: 'de-frankfurt',
    defaultAllocatedGB: 500,
    baseLatencyMs: 125,
    minBwMBps: 11,
    maxBwMBps: 28,
    partSizeMiB: 8,
    description: 'Zero-knowledge encrypted cloud storage. Simulated in browser.',
  },
  internxt: {
    label: 'Internxt',
    shortLabel: 'Internxt',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'oauth2_code',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#2B59FF',
    defaultEndpoint: 'https://api.internxt.com',
    defaultRegion: 'eu-spain',
    defaultAllocatedGB: 2000,
    baseLatencyMs: 115,
    minBwMBps: 12,
    maxBwMBps: 30,
    partSizeMiB: 8,
    description: 'Decentralized and encrypted European cloud storage.',
  },
  jottacloud: {
    label: 'Jottacloud',
    shortLabel: 'Jotta',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'oauth2_code',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#009688',
    defaultEndpoint: 'https://jottacloud.com/api',
    defaultRegion: 'no-oslo',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 120,
    minBwMBps: 12,
    maxBwMBps: 28,
    partSizeMiB: 8,
    description: 'Norwegian cloud storage governed by strict Nordic privacy laws.',
  },
  zoho: {
    label: 'Zoho WorkDrive',
    shortLabel: 'Zoho',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'oauth2_code',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#E42528',
    defaultEndpoint: 'https://workdrive.zoho.com/api/v1',
    defaultRegion: 'in-chennai',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 130,
    minBwMBps: 10,
    maxBwMBps: 26,
    partSizeMiB: 8,
    description: 'Enterprise team storage and collaboration drive by Zoho.',
  },
  yandex: {
    label: 'Yandex Disk',
    shortLabel: 'Yandex',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'oauth2_code',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#FC3F1D',
    defaultEndpoint: 'https://cloud-api.yandex.net/v1/disk',
    defaultRegion: 'ru-moscow',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 140,
    minBwMBps: 10,
    maxBwMBps: 26,
    partSizeMiB: 8,
    description: 'High-speed cloud drive with REST and WebDAV support.',
  },
  mediafire: {
    label: 'MediaFire',
    shortLabel: 'MediaFire',
    category: 'Consumer & Personal Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'oauth2_code',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#129BF4',
    defaultEndpoint: 'https://www.mediafire.com/api/1.5',
    defaultRegion: 'us-texas',
    defaultAllocatedGB: 50,
    baseLatencyMs: 110,
    minBwMBps: 14,
    maxBwMBps: 32,
    partSizeMiB: 8,
    description: 'Direct file hosting and consumer cloud storage.',
  },

  // Category B: Object & Developer Storage (12)
  s3: {
    label: 'Amazon S3',
    shortLabel: 'AWS S3',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'fully_integrated',
    authMethod: 's3_credentials',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#FF9900',
    defaultEndpoint: 'https://s3.amazonaws.com',
    defaultRegion: 'us-east-1',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 75,
    minBwMBps: 18,
    maxBwMBps: 45,
    partSizeMiB: 8,
    description: 'Industry-standard object storage. Real S3 REST / presigned upload adapter.',
  },
  r2: {
    label: 'Cloudflare R2',
    shortLabel: 'R2',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'fully_integrated',
    authMethod: 's3_credentials',
    defaultZeroEgress: true,
    requiresBackendProxy: false,
    badgeColor: '#F38020',
    defaultEndpoint: 'https://<accountId>.r2.cloudflarestorage.com',
    defaultRegion: 'auto',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 55,
    minBwMBps: 22,
    maxBwMBps: 52,
    partSizeMiB: 8,
    description: 'S3-compatible zero-egress object storage at Cloudflare edge locations.',
  },
  gcs: {
    label: 'Google Cloud Storage',
    shortLabel: 'GCS',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'oauth2_code',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#4285F4',
    defaultEndpoint: 'https://storage.googleapis.com',
    defaultRegion: 'us-central1',
    defaultAllocatedGB: 2000,
    baseLatencyMs: 80,
    minBwMBps: 18,
    maxBwMBps: 42,
    partSizeMiB: 8,
    description: 'Google Cloud enterprise object storage with interoperable S3 XML API.',
  },
  azure: {
    label: 'Azure Blob Storage',
    shortLabel: 'Azure Blob',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 'sas_token',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#0089D6',
    defaultEndpoint: 'https://<account>.blob.core.windows.net',
    defaultRegion: 'eastus',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 85,
    minBwMBps: 16,
    maxBwMBps: 40,
    partSizeMiB: 8,
    description: 'Microsoft Azure scalable cloud object storage using Shared Access Signatures.',
  },
  b2: {
    label: 'Backblaze B2',
    shortLabel: 'B2',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'fully_integrated',
    authMethod: 's3_credentials',
    defaultZeroEgress: true,
    requiresBackendProxy: false,
    badgeColor: '#E01A22',
    defaultEndpoint: 'https://s3.us-west-002.backblazeb2.com',
    defaultRegion: 'us-west-002',
    defaultAllocatedGB: 2000,
    baseLatencyMs: 90,
    minBwMBps: 16,
    maxBwMBps: 38,
    partSizeMiB: 8,
    description: 'Affordable S3-compatible cloud storage with free egress to Cloudflare.',
  },
  wasabi: {
    label: 'Wasabi Hot Cloud Storage',
    shortLabel: 'Wasabi',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'fully_integrated',
    authMethod: 's3_credentials',
    defaultZeroEgress: true,
    requiresBackendProxy: false,
    badgeColor: '#28A745',
    defaultEndpoint: 'https://s3.wasabisys.com',
    defaultRegion: 'us-east-1',
    defaultAllocatedGB: 3000,
    baseLatencyMs: 85,
    minBwMBps: 18,
    maxBwMBps: 40,
    partSizeMiB: 8,
    description: 'Zero-egress fee hot cloud storage with standard S3 API support.',
  },
  do_spaces: {
    label: 'DigitalOcean Spaces',
    shortLabel: 'DO Spaces',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'fully_integrated',
    authMethod: 's3_credentials',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#0080FF',
    defaultEndpoint: 'https://nyc3.digitaloceanspaces.com',
    defaultRegion: 'nyc3',
    defaultAllocatedGB: 500,
    baseLatencyMs: 78,
    minBwMBps: 16,
    maxBwMBps: 38,
    partSizeMiB: 8,
    description: 'S3-compatible object storage with built-in CDN distribution.',
  },
  oracle_os: {
    label: 'Oracle Cloud Object Storage',
    shortLabel: 'Oracle OS',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'awaiting_credentials',
    authMethod: 's3_credentials',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#F80000',
    defaultEndpoint: 'https://<namespace>.compat.objectstorage.<region>.oraclecloud.com',
    defaultRegion: 'us-ashburn-1',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 95,
    minBwMBps: 15,
    maxBwMBps: 36,
    partSizeMiB: 8,
    description: 'Oracle Cloud Infrastructure high-performance object storage.',
  },
  scaleway: {
    label: 'Scaleway Object Storage',
    shortLabel: 'Scaleway',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'fully_integrated',
    authMethod: 's3_credentials',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#4F0599',
    defaultEndpoint: 'https://s3.fr-par.scw.cloud',
    defaultRegion: 'fr-par',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 90,
    minBwMBps: 16,
    maxBwMBps: 38,
    partSizeMiB: 8,
    description: 'European S3-compatible cloud storage with multi-datacenter redundancy.',
  },
  linode: {
    label: 'Linode / Akamai Object Storage',
    shortLabel: 'Linode OS',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'fully_integrated',
    authMethod: 's3_credentials',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#00A95C',
    defaultEndpoint: 'https://us-east-1.linodeobjects.com',
    defaultRegion: 'us-east-1',
    defaultAllocatedGB: 500,
    baseLatencyMs: 82,
    minBwMBps: 16,
    maxBwMBps: 36,
    partSizeMiB: 8,
    description: 'Akamai edge-connected S3-compatible developer storage.',
  },
  vultr: {
    label: 'Vultr Object Storage',
    shortLabel: 'Vultr OS',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'fully_integrated',
    authMethod: 's3_credentials',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#007BFC',
    defaultEndpoint: 'https://ewr1.vultrobjects.com',
    defaultRegion: 'ewr1',
    defaultAllocatedGB: 500,
    baseLatencyMs: 80,
    minBwMBps: 16,
    maxBwMBps: 36,
    partSizeMiB: 8,
    description: 'Global S3-compatible developer storage spanning 32+ cloud locations.',
  },
  storj: {
    label: 'Storj DCS',
    shortLabel: 'Storj',
    category: 'Object & Infrastructure Cloud',
    integrationStatus: 'fully_integrated',
    authMethod: 's3_credentials',
    defaultZeroEgress: false,
    requiresBackendProxy: false,
    badgeColor: '#2F80ED',
    defaultEndpoint: 'https://gateway.storjshare.io',
    defaultRegion: 'global',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 120,
    minBwMBps: 14,
    maxBwMBps: 34,
    partSizeMiB: 8,
    description: 'Decentralized, encrypted object storage via S3 gateway.',
  },

  // Category C: Self-Hosted & Network Storage (9)
  nextcloud: {
    label: 'Nextcloud',
    shortLabel: 'Nextcloud',
    category: 'Self-Hosted & Protocol',
    integrationStatus: 'fully_integrated',
    authMethod: 'webdav_basic',
    defaultZeroEgress: true,
    requiresBackendProxy: false,
    badgeColor: '#0082C9',
    defaultEndpoint: 'https://cloud.example.com/remote.php/dav/files/user',
    defaultRegion: 'self-hosted',
    defaultAllocatedGB: 2000,
    baseLatencyMs: 110,
    minBwMBps: 12,
    maxBwMBps: 32,
    partSizeMiB: 4,
    description: 'Self-hosted private cloud hub supporting WebDAV and OCS sharing APIs.',
  },
  owncloud: {
    label: 'ownCloud',
    shortLabel: 'ownCloud',
    category: 'Self-Hosted & Protocol',
    integrationStatus: 'fully_integrated',
    authMethod: 'webdav_basic',
    defaultZeroEgress: true,
    requiresBackendProxy: false,
    badgeColor: '#1D2D44',
    defaultEndpoint: 'https://owncloud.example.com/remote.php/webdav',
    defaultRegion: 'self-hosted',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 115,
    minBwMBps: 12,
    maxBwMBps: 30,
    partSizeMiB: 4,
    description: 'Enterprise open-source file platform with standard WebDAV integration.',
  },
  synology: {
    label: 'Synology NAS',
    shortLabel: 'Synology',
    category: 'Self-Hosted & Protocol',
    integrationStatus: 'fully_integrated',
    authMethod: 'webdav_basic',
    defaultZeroEgress: true,
    requiresBackendProxy: false,
    badgeColor: '#222222',
    defaultEndpoint: 'https://nas.local:5006/webdav',
    defaultRegion: 'lan-local',
    defaultAllocatedGB: 8000,
    baseLatencyMs: 35,
    minBwMBps: 25,
    maxBwMBps: 80,
    partSizeMiB: 4,
    description: 'Synology DiskStation NAS with WebDAV Server package enabled.',
  },
  qnap: {
    label: 'QNAP NAS',
    shortLabel: 'QNAP',
    category: 'Self-Hosted & Protocol',
    integrationStatus: 'fully_integrated',
    authMethod: 'webdav_basic',
    defaultZeroEgress: true,
    requiresBackendProxy: false,
    badgeColor: '#004B93',
    defaultEndpoint: 'https://qnap.local:5001/webdav',
    defaultRegion: 'lan-local',
    defaultAllocatedGB: 8000,
    baseLatencyMs: 35,
    minBwMBps: 25,
    maxBwMBps: 80,
    partSizeMiB: 4,
    description: 'QNAP Turbo NAS with native WebDAV network protocol service.',
  },
  webdav: {
    label: 'Generic WebDAV',
    shortLabel: 'WebDAV',
    category: 'Self-Hosted & Protocol',
    integrationStatus: 'fully_integrated',
    authMethod: 'webdav_basic',
    defaultZeroEgress: true,
    requiresBackendProxy: false,
    badgeColor: '#6B7280',
    defaultEndpoint: 'https://dav.example.com/webdav',
    defaultRegion: 'custom',
    defaultAllocatedGB: 4000,
    baseLatencyMs: 120,
    minBwMBps: 8,
    maxBwMBps: 24,
    partSizeMiB: 4,
    description: 'RFC 4918 standard WebDAV network storage endpoint.',
  },
  hetzner: {
    label: 'Hetzner Storage Box',
    shortLabel: 'Hetzner',
    category: 'Self-Hosted & Protocol',
    integrationStatus: 'fully_integrated',
    authMethod: 'webdav_basic',
    defaultZeroEgress: true,
    requiresBackendProxy: false,
    badgeColor: '#D50C22',
    defaultEndpoint: 'https://u<user>.your-storagebox.de',
    defaultRegion: 'eu-hel1',
    defaultAllocatedGB: 5000,
    baseLatencyMs: 85,
    minBwMBps: 18,
    maxBwMBps: 45,
    partSizeMiB: 4,
    description: 'High-capacity German storage box with HTTPS WebDAV endpoint.',
  },
  sftp: {
    label: 'SFTP / SSH Server',
    shortLabel: 'SFTP',
    category: 'Self-Hosted & Protocol',
    integrationStatus: 'proxy_required',
    authMethod: 'ssh_key',
    defaultZeroEgress: true,
    requiresBackendProxy: true,
    badgeColor: '#4E5D6C',
    defaultEndpoint: 'sftp://ssh.example.com:22',
    defaultRegion: 'custom-ssh',
    defaultAllocatedGB: 2000,
    baseLatencyMs: 95,
    minBwMBps: 12,
    maxBwMBps: 30,
    partSizeMiB: 4,
    description: 'Secure File Transfer Protocol over SSH. Requires WebSocket or CORS proxy bridge.',
    apiNote: 'Browsers cannot open direct raw TCP SSH/SFTP sockets. Simulated in browser unless connected through a proxy bridge.',
  },
  smb: {
    label: 'SMB / Windows Network Share',
    shortLabel: 'SMB/CIFS',
    category: 'Self-Hosted & Protocol',
    integrationStatus: 'proxy_required',
    authMethod: 'webdav_basic',
    defaultZeroEgress: true,
    requiresBackendProxy: true,
    badgeColor: '#00A4EF',
    defaultEndpoint: 'smb://fileserver.local/shared',
    defaultRegion: 'lan-smb',
    defaultAllocatedGB: 4000,
    baseLatencyMs: 40,
    minBwMBps: 20,
    maxBwMBps: 60,
    partSizeMiB: 4,
    description: 'Server Message Block (SMB/CIFS) network share. Requires backend TCP proxy.',
    apiNote: 'Browsers cannot open raw port 445 SMB TCP sockets. Simulated in browser unless connected via a proxy bridge.',
  },
  ftp: {
    label: 'FTP / FTPS Server',
    shortLabel: 'FTP/FTPS',
    category: 'Self-Hosted & Protocol',
    integrationStatus: 'proxy_required',
    authMethod: 'webdav_basic',
    defaultZeroEgress: true,
    requiresBackendProxy: true,
    badgeColor: '#5C6BC0',
    defaultEndpoint: 'ftp://ftp.example.com:21',
    defaultRegion: 'custom-ftp',
    defaultAllocatedGB: 1000,
    baseLatencyMs: 120,
    minBwMBps: 8,
    maxBwMBps: 22,
    partSizeMiB: 4,
    description: 'Classic File Transfer Protocol. Requires backend TCP proxy.',
    apiNote: 'Browsers cannot establish raw FTP command/data TCP connections. Simulated in browser.',
  },
};

export const MOUNTABLE_PROVIDER_KINDS = (
  Object.keys(PROVIDER_KIND_META) as ProviderKind[]
).filter((k) => k !== 'local');
```

---

## 3. Data Models & Credentials Architecture

```ts
export type MountMode = 'real' | 'simulated';

export interface ProviderCredentials {
  // OAuth 2.0 (Google Drive, Dropbox, OneDrive, Box)
  oauthToken?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    clientId?: string;
  };
  // S3-Compatible (AWS S3, Cloudflare R2, B2, Wasabi, MinIO)
  s3Keys?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
    bucket: string;
    endpoint?: string;
  };
  // WebDAV / Self-Hosted (Nextcloud, ownCloud, Koofr, Synology, Hetzner)
  webdavAuth?: {
    username: string;
    password?: string;
    url: string;
    basePath?: string;
  };
}

export interface ProviderMount {
  id: string;                  // 'local-vault' is built-in; custom mounts use UUIDs or slugs
  kind: ProviderKind;
  mode: MountMode;             // 'real' (live API) or 'simulated' (local simulator)
  name: string;                // Display name (unique, case-insensitive)
  endpoint: string | null;
  region: string | null;
  bucket: string | null;
  status: MountStatus;
  allocatedBytes: number;      // Allocated capacity in SI bytes
  latencyMs: number | null;
  zeroEgress: boolean;
  credentials?: ProviderCredentials;
  lastSyncedAt: number | null;
  createdAt: number;
}
```

---

## 4. Dual-Mode Storage Architecture (Live Adapters + Simulator)

The UI never communicates with raw fetch or storage SDKs directly. All calls flow through the singleton `StorageOrchestrator`, which resolves the mount's `mode` and routes to either a real adapter or the simulator.

```
┌─────────────────────────────────────────────────────────────┐
│                       React 19 UI                           │
│   (Explorer, Transfer Tray, Overview, Providers, Analytics) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                ┌──────────────▼─────────────┐
                │    StorageOrchestrator     │
                │  (Atomic IDB Tx, Quotas)   │
                └──────┬──────────────┬──────┘
                       │              │
    ┌──────────────────▼──┐        ┌──▼──────────────────┐
    │     Real Adapters   │        │  Simulated Adapters │
    │ (Google Drive v3,   │        │(Deterministic local │
    │  S3/R2 REST, WebDAV)│        │ simulator with IDB) │
    └─────────────────────┘        └─────────────────────┘
```

### 1. `ICloudStorageAdapter` Interface
```ts
export interface ConnectionReport {
  ok: boolean;
  latencyMs: number;
  canList: boolean;
  canRead: boolean;
  canWrite: boolean;
  message: string;
  liveApi?: boolean;
}

export interface ICloudStorageAdapter {
  readonly kind: ProviderKind;
  readonly partSizeBytes: number;
  testConnection(m: ProviderMount, signal?: AbortSignal): Promise<ConnectionReport>;
  createMultipartUpload(m: ProviderMount, key: string, contentType: string): Promise<{ uploadId: string }>;
  uploadPart(m: ProviderMount, key: string, uploadId: string, partNumber: number, data: Blob, signal?: AbortSignal): Promise<{ etag: string }>;
  completeMultipartUpload(m: ProviderMount, key: string, uploadId: string, parts: { partNumber: number; etag: string }[], source: Blob): Promise<void>;
  abortMultipartUpload(m: ProviderMount, key: string, uploadId: string): Promise<void>;
  getObject(m: ProviderMount, key: string): Promise<Blob>;
  deleteObject(m: ProviderMount, key: string): Promise<void>;
  getUsage(m: ProviderMount): Promise<{ usedBytes: number; objectCount: number }>;
}
```

### 2. Live `GoogleDriveAdapter` (Real API Integration)
Uses Google Drive REST API v3 with browser OAuth 2.0 Access Tokens:
- **Directory Listing & Search**:
  `GET https://www.googleapis.com/drive/v3/files?q='{folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,modifiedTime,md5Checksum)`
- **Quota & Usage**:
  `GET https://www.googleapis.com/drive/v3/about?fields=storageQuota`
- **Upload**:
  `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` with metadata JSON and binary chunk.
- **Download**:
  `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media`
- **Delete / Trash**:
  `PATCH https://www.googleapis.com/drive/v3/files/{fileId}` with `{ trashed: true }` or `DELETE /files/{fileId}` for permanent purge.

### 3. Live `WebDAVAdapter` (Real Protocol Integration)
Uses standard fetch with HTTP Basic or Bearer Authentication:
- **Listing**: `PROPFIND` request with `Depth: 1` header, parsing XML `multistatus` responses to extract filenames, content lengths, and last-modified dates.
- **Upload**: `PUT` request with raw binary body.
- **Download**: `GET` request returning response blob.
- **Folder Creation**: `MKCOL` request.
- **Delete**: `DELETE` request.

### 4. `SimulatedCloudAdapter` (Zero-Config Default)
Provides instant out-of-the-box operation for all 39 providers without requiring API keys:
- Deterministic jittered latency (`baseLatencyMs ± 30%`).
- Simulated bandwidth transfer curves (`minBwMBps` to `maxBwMBps`).
- Developer fault injection (0%, 10%, 50% simulated failure rates and offline mode switch).
- Stored bytes persist in the browser's IndexedDB `blobs` store so uploads remain viewable and downloadable across reloads.

---

## 5. In-App Environment & Credentials Configurator

Because Google AI Studio runs inside a sandboxed web preview where `.env` files are not easily editable, MountYourClouds provides an in-app **API Credentials & OAuth Keys** configurator:

1. **`SettingsPage.tsx` → API & OAuth Keys Section**:
   - Allows users to paste their `GOOGLE_DRIVE_CLIENT_ID`, `DROPBOX_APP_KEY`, or `ONEDRIVE_CLIENT_ID` directly into UI inputs.
   - Values are stored in IndexedDB (`meta` store under key `apiCredentials`) and automatically pre-fill connection dialogs.
2. **"Add Provider Mount" Modal Real vs. Simulated Toggle**:
   - Every provider card in the Add Mount modal displays a segmented switch:
     `[ ⚡ Live Cloud API Mode ]` vs `[ 🧪 Simulated Mode ]`
   - If **Live Cloud API Mode** is active:
     - For Google Drive / Dropbox / OneDrive: Displays an **"Authorize with OAuth 2.0"** button (or an Access Token input field for instant manual testing).
     - For S3 / R2 / Wasabi / B2: Displays S3 Access Key ID, Secret Access Key, Region, and Bucket Name inputs.
     - For WebDAV / Nextcloud: Displays Server URL, Username, and Password inputs.
   - If **Simulated Mode** is active:
     - Prompts for Mount Name and Simulated Capacity (GB). Bypasses credentials and connects immediately.

---

## 6. Preserved Core Architectural Guarantees (From v3)

All critical bug fixes and stability safeguards from v3 must be strictly maintained:

1. **Atomic Single-Transaction Commit (Double-Write Eliminated)**:
   - Neither `IndexedDBStorageAdapter` nor `SimulatedCloudAdapter` calls `repo.putBlob` in `completeMultipartUpload`.
   - `StorageOrchestrator` executes a single atomic IndexedDB transaction across `['nodes', 'blobs', 'thumbs', 'activity', 'meta']` via `vaultRepository.commitCompletedUpload`.
2. **Cycle-Safe Tree Collection**:
   - `collectSubtreeIds(rootId, allNodes)` must maintain a `visited = new Set<string>()` to guarantee termination on cyclic or corrupted parent pointers.
3. **Recursive Cross-Cloud Transfers**:
   - `transferBetweenClouds(nodeIds, targetMountId)` must recursively discover all descendant files of any selected folders using `collectSubtreeIds`, deducting quota and migrating blobs cleanly.
4. **Zero Keyboard Listener Thrashing**:
   - In `ExplorerPage.tsx`, global keyboard navigation must read volatile state (`visibleNodes`, `selectedNodeIds`, `focusedNodeId`, `mode`, `mountMap`) through stable React refs (`useRef`). The keydown `useEffect` must bind to `[]` dependencies, completely eliminating window listener churn.
5. **Context Menu Viewport Clamping**:
   - Context menus must be clamped to viewport bounds with `Math.max(8, ...)` and `Math.min(viewport - size, ...)`.
6. **Failed Upload Dismissal**:
   - `TransferTray.tsx` must provide individual `X` dismiss buttons on failed tasks and a `"Clear finished"` header button using `storageOrchestrator.clearCompletedUploads(true)` and `storageOrchestrator.dismissUpload(jobId)`.

---

## 7. Subscription Tiers & Quota Management

MountYourClouds enforces concrete multi-cloud platform tiers modeled in INR (₹) with annual billing discounts:

| Tier | Base Monthly | Annual Billing (20% off) | Cloud Accounts Cap | Daily Ingress/Egress Quota | Monthly Cross-Cloud Bandwidth | Max Bulk Batch |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FREE** | ₹0 | ₹0 | **2 mounts** | 5 GB / day | 25 GB / month | 3 files |
| **PRO** | ₹199 | ₹159 / month (₹1,908/yr) | **7 mounts** | 50 GB / day | 500 GB / month | 25 files |
| **ULTRA** | ₹499 | ₹399 / month (₹4,788/yr) | **20 mounts** | 250 GB / day | 2,500 GB / month | 100 files |

- **Storage Engine Authorization**:
  Before any upload, download, or cross-cloud transfer initiates, `enforceTransferQuotaAuthorization` validates cumulative usage over 24-hour and 30-day sliding windows.
- **Downgrade Safety**:
  Downgrades are blocked with a clear error message if currently connected mounts exceed the target tier limit.

---

## 8. Vitest Test Suite Specifications

The application must include 5 comprehensive test suites using Vitest:

1. **`src/__tests__/format.test.ts` (15 tests)**:
   - Verifies SI byte formatting (`formatBytes`), transfer speed notation (`formatSpeed`), ETA formatting (`formatEta`), and relative timestamp representations (`formatRelativeOrShortDate`).
2. **`src/__tests__/pricing.test.ts` (11 tests)**:
   - Verifies tier normalization (`normalizePlanId`), annual discount calculations (`getEffectiveMonthlyInr`, `getBilledTotalInr`), plan switch restrictions (`checkPlanSwitchAllowed`), 24h/30d transfer quota bucketing (`computeTransferQuotaUsage`), and plan recommendation math (`estimateAllPlans`).
3. **`src/__tests__/orchestrator.test.ts` (17 tests)**:
   - Verifies node name validation (`validateNodeName`), file extension splitting (`splitNameAndExt`), conflict-free sibling deduplication (`resolveUniqueSiblingName`), cascading trash logic (`isEffectivelyTrashed`), and cycle-safe hierarchy collection (`collectSubtreeIds`).
4. **`src/__tests__/providers.test.ts` (10 tests)**:
   - Verifies S3, R2, GCS bucket name regex rules; WebDAV URL validation; metadata flags across all 39 providers (`requiresBackendProxy`, `authMethod`, `integrationStatus`).
5. **`src/__tests__/crypto.test.ts` (9 tests)**:
   - Verifies 16-byte random hex salt generation (`generateSaltHex`), deterministic WebCrypto PBKDF2-SHA256 password hashing (256-bit hex), and chunk SHA-256 digests (`computeBlobSha256`).

### Verification Commands
```bash
npm run lint   # tsc --noEmit (0 errors)
npm test       # vitest run (all tests passing)
npm run build  # vite build (compiles in < 1.2s with zero chunk size warnings)
```

---

## 9. Phased Implementation Roadmap for AI Studio

When building or updating MountYourClouds in Google AI Studio, proceed in the following order:

1. **Phase 1 — Constants & Data Models**:
   Expand `ProviderKind` to all 39 providers. Update `PROVIDER_KIND_META` in `src/lib/constants.ts` with complete integration metadata, categories, proxy flags, and honesty notes.
2. **Phase 2 — Dual-Mode Storage Architecture**:
   Update `ProviderMount` with `mode: 'real' | 'simulated'` and `credentials`. Update `StorageOrchestrator` to route to live adapters when credentials are present, falling back to `SimulatedCloudAdapter`.
3. **Phase 3 — Live Adapters (Google Drive v3 + WebDAV)**:
   Implement clean fetch-based `GoogleDriveAdapter` and `WebDAVAdapter` alongside `IndexedDBStorageAdapter` and `SimulatedCloudAdapter`.
4. **Phase 4 — In-App API Configurator & Provider Modal**:
   Add the API Credentials & OAuth Keys section to `SettingsPage.tsx`. Update the Add Mount modal in `ProvidersPage.tsx` with category tabs, 39-provider search filter, and the Real vs. Simulated toggle.
5. **Phase 5 — Quality Assurance & Verification**:
   Run `npm run lint`, `npm test`, and `npm run build`. Confirm all 39 providers display correctly, live/simulated badges render accurately, and zero TypeScript errors exist.
