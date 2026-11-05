import {
  DEMO_ACCOUNT_DEFAULT_PASSWORD,
  DEMO_ACCOUNT_EMAIL,
  DEMO_ACCOUNT_NAME,
} from '../lib/constants';
import { computeBlobSha256, hashPasswordPBKDF2 } from '../lib/crypto';
import { SI_GB, SI_MB } from '../lib/format';
import type {
  Account,
  ActivityEvent,
  FileNode,
  FolderNode,
  ProviderMount,
  VaultNode,
  WorkspaceSettings,
} from '../types/domain';

// Deterministic Mulberry32 PRNG (seed = 42)
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate a real PNG Blob and 320px thumbnail using an offscreen/DOM canvas
async function createGeneratedPngAsset(
  width: number,
  height: number,
  palette: [string, string, string],
  title: string,
  subtitle: string
): Promise<{ blob: Blob; thumb: Blob }> {
  const renderCanvas = async (w: number, h: number): Promise<Blob> => {
    if (typeof document === 'undefined') {
      return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    }

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, palette[0]);
    grad.addColorStop(0.55, palette[1]);
    grad.addColorStop(1, palette[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = Math.max(1, w / 600);
    const step = Math.max(24, Math.round(w / 14));
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = Math.max(2, w / 220);
    ctx.beginPath();
    ctx.arc(w * 0.76, h * 0.36, Math.min(w, h) * 0.22, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#F3F4F6';
    ctx.font = `700 ${Math.max(14, Math.round(w * 0.048))}px "DM Sans", sans-serif`;
    ctx.fillText(title, w * 0.07, h * 0.74);

    ctx.fillStyle = 'rgba(243, 244, 246, 0.72)';
    ctx.font = `500 ${Math.max(10, Math.round(w * 0.026))}px "JetBrains Mono", monospace`;
    ctx.fillText(subtitle, w * 0.07, h * 0.83);

    return new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (b) => resolve(b ?? new Blob([], { type: 'image/png' })),
        'image/png'
      );
    });
  };

  const fullBlob = await renderCanvas(width, height);
  const scale = Math.min(1, 320 / width);
  const thumbW = Math.max(1, Math.round(width * scale));
  const thumbH = Math.max(1, Math.round(height * scale));
  const thumbBlob = await renderCanvas(thumbW, thumbH);
  return { blob: fullBlob, thumb: thumbBlob };
}

function createWavToneBlob(freqHz: number, secondFreqHz: number, durationSec: number): Blob {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 8) * Math.exp(-t * 1.4);
    const wave =
      0.55 * Math.sin(2 * Math.PI * freqHz * t) +
      0.35 * Math.sin(2 * Math.PI * secondFreqHz * t);
    const sample = Math.max(-1, Math.min(1, wave * envelope));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export interface SeedBundle {
  account: Account;
  settings: WorkspaceSettings;
  mounts: ProviderMount[];
  nodes: VaultNode[];
  blobs: { mountId: string; key: string; blob: Blob }[];
  thumbs: { nodeId: string; blob: Blob }[];
  activity: ActivityEvent[];
}

export async function generateDeterministicSeedBundle(now: number = Date.now()): Promise<SeedBundle> {
  const rand = mulberry32(42);
  const dayMs = 24 * 60 * 60 * 1000;

  // 1. Demo Account
  const demoSalt = '74656c657661756c745f64656d6f5f73';
  const passwordHash = await hashPasswordPBKDF2(DEMO_ACCOUNT_DEFAULT_PASSWORD, demoSalt, 600_000);
  const account: Account = {
    email: DEMO_ACCOUNT_EMAIL,
    displayName: DEMO_ACCOUNT_NAME,
    passwordHash,
    salt: demoSalt,
    createdAt: now - 45 * dayMs,
  };

  // 2. Mounts (Includes local-vault + MEGA, TeraBox, AWS S3, Cloudflare R2, GCS, WebDAV)
  const mounts: ProviderMount[] = [
    {
      id: 'local-vault',
      kind: 'local',
      mode: 'real',
      name: 'Local Browser Vault',
      endpoint: 'idb://mountyourclouds_db',
      region: 'local-browser',
      bucket: 'local-vault',
      status: 'connected',
      allocatedBytes: 10 * SI_GB,
      latencyMs: 4,
      zeroEgress: true,
      lastSyncedAt: now - 120_000,
      createdAt: now - 45 * dayMs,
    },
    {
      id: 'mega-vault',
      kind: 'mega',
      mode: 'simulated',
      name: 'MEGA Cloud Drive',
      endpoint: 'https://g.api.mega.co.nz',
      region: 'eu-central-lux',
      bucket: 'mega-pro-drive',
      status: 'connected',
      allocatedBytes: 2000 * SI_GB,
      latencyMs: 64,
      zeroEgress: true,
      lastSyncedAt: now - 150_000,
      createdAt: now - 42 * dayMs,
    },
    {
      id: 'terabox-cloud',
      kind: 'terabox',
      mode: 'simulated',
      name: 'TeraBox 1TB Cloud',
      endpoint: 'https://www.terabox.com/rest/2.0/pcs',
      region: 'ap-northeast-1',
      bucket: '/terabox-media-vault',
      status: 'connected',
      allocatedBytes: 1024 * SI_GB,
      latencyMs: 112,
      zeroEgress: true,
      lastSyncedAt: now - 210_000,
      createdAt: now - 38 * dayMs,
    },
    {
      id: 's3-prod',
      kind: 's3',
      mode: 'simulated',
      name: 'AWS S3 Production',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      region: 'us-east-1',
      bucket: 'mountyourclouds-prod-assets',
      status: 'connected',
      allocatedBytes: 500 * SI_GB,
      latencyMs: 78,
      zeroEgress: false,
      lastSyncedAt: now - 300_000,
      createdAt: now - 40 * dayMs,
    },
    {
      id: 'r2-edge',
      kind: 'r2',
      mode: 'simulated',
      name: 'Cloudflare R2 Edge',
      endpoint: 'https://88f19c2a.r2.cloudflarestorage.com',
      region: 'wnam',
      bucket: 'mountyourclouds-cdn-edge',
      status: 'connected',
      allocatedBytes: 400 * SI_GB,
      latencyMs: 56,
      zeroEgress: true,
      lastSyncedAt: now - 180_000,
      createdAt: now - 35 * dayMs,
    },
    {
      id: 'gcs-archive',
      kind: 'gcs',
      mode: 'simulated',
      name: 'GCS Coldline Archive',
      endpoint: 'https://storage.googleapis.com',
      region: 'us-central1',
      bucket: 'mountyourclouds-vault-snapshots',
      status: 'connected',
      allocatedBytes: 800 * SI_GB,
      latencyMs: 104,
      zeroEgress: false,
      lastSyncedAt: now - 900_000,
      createdAt: now - 30 * dayMs,
    },
    {
      id: 'webdav-nas',
      kind: 'webdav',
      mode: 'simulated',
      name: 'Studio WebDAV NAS',
      endpoint: 'https://dav.internal-studio.example/remote.php/webdav',
      region: 'eu-central',
      bucket: '/shared-media',
      status: 'connected',
      allocatedBytes: 250 * SI_GB,
      latencyMs: 138,
      zeroEgress: true,
      lastSyncedAt: now - 600_000,
      createdAt: now - 25 * dayMs,
    },
  ];

  // 3. Folders
  const makeFolder = (
    id: string,
    parentId: string | null,
    name: string,
    starred: boolean,
    daysAgo: number
  ): FolderNode => ({
    id,
    parentId,
    name,
    type: 'folder',
    starred,
    trashedAt: null,
    trashedFromParentId: null,
    createdAt: now - daysAgo * dayMs,
    updatedAt: now - Math.max(1, daysAgo - 3) * dayMs,
  });

  const folders: FolderNode[] = [
    makeFolder('fld-engineering', null, 'Engineering', true, 30),
    makeFolder('fld-eng-releases', 'fld-engineering', 'Releases', true, 26),
    makeFolder('fld-eng-backups', 'fld-engineering', 'Backups', false, 25),
    makeFolder('fld-eng-docs', 'fld-engineering', 'Docs', false, 24),

    makeFolder('fld-design', null, 'Design', true, 28),
    makeFolder('fld-des-brand', 'fld-design', 'Brand', false, 22),
    makeFolder('fld-des-shots', 'fld-design', 'Product Shots', true, 20),

    makeFolder('fld-finance', null, 'Finance', false, 27),
    makeFolder('fld-fin-invoices', 'fld-finance', 'Invoices', false, 18),

    makeFolder('fld-media', null, 'Media', false, 21),
    makeFolder('fld-med-audio', 'fld-media', 'Audio', false, 16),

    makeFolder('fld-archive', null, 'Archive', false, 29),
    makeFolder('fld-arc-2024', 'fld-archive', '2024', false, 29),
  ];

  const blobs: { mountId: string; key: string; blob: Blob }[] = [];
  const thumbs: { nodeId: string; blob: Blob }[] = [];
  const files: FileNode[] = [];

  const addRealFile = async (
    id: string,
    parentId: string | null,
    name: string,
    providerId: string,
    mimeType: string,
    extension: string,
    blob: Blob,
    starred: boolean,
    daysAgo: number,
    thumbBlob?: Blob | null
  ) => {
    const checksumSha256 = await computeBlobSha256(blob);
    blobs.push({ mountId: providerId, key: id, blob });
    if (thumbBlob) {
      thumbs.push({ nodeId: id, blob: thumbBlob });
    }
    const createdAt = Math.round(now - daysAgo * dayMs - rand() * 3600_000 * 6);
    files.push({
      id,
      parentId,
      name,
      type: 'file',
      providerId,
      mimeType,
      extension,
      sizeBytes: blob.size,
      checksumSha256,
      hasBlob: true,
      hasThumb: Boolean(thumbBlob),
      starred,
      trashedAt: null,
      trashedFromParentId: null,
      createdAt,
      updatedAt: createdAt + Math.round(rand() * 3600_000 * 2),
    });
  };

  const addPlaceholderFile = (
    id: string,
    parentId: string | null,
    name: string,
    providerId: string,
    mimeType: string,
    extension: string,
    sizeBytes: number,
    starred: boolean,
    daysAgo: number
  ) => {
    const createdAt = Math.round(now - daysAgo * dayMs - rand() * 3600_000 * 8);
    files.push({
      id,
      parentId,
      name,
      type: 'file',
      providerId,
      mimeType,
      extension,
      sizeBytes,
      checksumSha256: null,
      hasBlob: false,
      hasThumb: false,
      starred,
      trashedAt: null,
      trashedFromParentId: null,
      createdAt,
      updatedAt: createdAt,
    });
  };

  // --- 24 REAL GENERATED FILES ---
  const pngSpecs: {
    id: string;
    folder: string | null;
    name: string;
    mount: string;
    palette: [string, string, string];
    title: string;
    sub: string;
    starred: boolean;
    days: number;
  }[] = [
    {
      id: 'file-img-hero-keyart',
      folder: 'fld-des-shots',
      name: 'mountyourclouds-interface-overview.png',
      mount: 'mega-vault',
      palette: ['#090A0F', '#1E1B4B', '#4F46E5'],
      title: 'MountYourClouds Explorer',
      sub: '1280x720 · MEGA Cloud · Dark UI',
      starred: true,
      days: 1.2,
    },
    {
      id: 'file-img-brand-grid',
      folder: 'fld-des-brand',
      name: 'brand-monogram-construction.png',
      mount: 'r2-edge',
      palette: ['#0E1017', '#131620', '#6366F1'],
      title: 'Monogram Grid System',
      sub: 'Optical Geometry · 1px Hairline',
      starred: true,
      days: 3.5,
    },
    {
      id: 'file-img-dark-tokens',
      folder: 'fld-des-brand',
      name: 'color-contrast-matrix.png',
      mount: 'local-vault',
      palette: ['#090A0F', '#064E3B', '#10B981'],
      title: 'WCAG Contrast Tokens',
      sub: '#090A0F Canvas · #4F46E5 Primary',
      starred: false,
      days: 5.0,
    },
    {
      id: 'file-img-topology',
      folder: 'fld-des-shots',
      name: 'multi-mount-adapter-diagram.png',
      mount: 'terabox-cloud',
      palette: ['#0F172A', '#1E293B', '#38BDF8'],
      title: 'Adapter Layer Topology',
      sub: 'MEGA · TeraBox · S3 · R2 · GCS',
      starred: false,
      days: 6.4,
    },
    {
      id: 'file-img-mobile-sheet',
      folder: 'fld-des-shots',
      name: 'mobile-responsive-spec.png',
      mount: 'webdav-nas',
      palette: ['#18181B', '#27272A', '#A78BFA'],
      title: 'Responsive Breakpoints',
      sub: '1440px · 1024px · 390px',
      starred: false,
      days: 9.1,
    },
  ];

  for (const spec of pngSpecs) {
    const { blob, thumb } = await createGeneratedPngAsset(
      960,
      540,
      spec.palette,
      spec.title,
      spec.sub
    );
    await addRealFile(
      spec.id,
      spec.folder,
      spec.name,
      spec.mount,
      'image/png',
      'png',
      blob,
      spec.starred,
      spec.days,
      thumb
    );
  }

  // 3 Real WAV Audio files
  await addRealFile(
    'file-wav-complete-chime',
    'fld-med-audio',
    'transfer-complete-chime.wav',
    'mega-vault',
    'audio/wav',
    'wav',
    createWavToneBlob(523.25, 659.25, 1.8),
    true,
    2.1
  );
  await addRealFile(
    'file-wav-alert-pulse',
    'fld-med-audio',
    'quota-warning-pulse.wav',
    'terabox-cloud',
    'audio/wav',
    'wav',
    createWavToneBlob(440.0, 554.37, 2.0),
    false,
    8.3
  );
  await addRealFile(
    'file-wav-sync-synth',
    'fld-med-audio',
    'mount-handshake-tone.wav',
    'local-vault',
    'audio/wav',
    'wav',
    createWavToneBlob(392.0, 587.33, 1.5),
    false,
    11.0
  );

  // 16 Real Text / Markdown / Code / JSON / CSV / SVG / HTML files
  const textFiles: {
    id: string;
    folder: string | null;
    name: string;
    mount: string;
    mime: string;
    ext: string;
    starred: boolean;
    days: number;
    content: string;
  }[] = [
    {
      id: 'file-md-readme',
      folder: null,
      name: 'WORKSPACE-README.md',
      mount: 'local-vault',
      mime: 'text/markdown',
      ext: 'md',
      starred: true,
      days: 0.4,
      content: `# MountYourClouds Universal Cloud Storage Workspace

Welcome to **MountYourClouds**, a multi-cloud file manager supporting 39+ mountable storage providers including **MEGA**, **TeraBox**, **Google Drive**, **Dropbox**, **OneDrive**, **Box**, **pCloud**, **Proton Drive**, **AWS S3**, **Cloudflare R2**, **Google Cloud Storage**, **Azure Blob**, **Backblaze B2**, **Wasabi**, **Nextcloud**, and **WebDAV**.

## Subscription Tiers
- **FREE (₹0/month)**: Up to 2 cloud accounts · 5 GB/day · 25 GB/month cross-cloud transfers.
- **PRO (₹199/month)**: Up to 7 cloud accounts · 50 GB/day · 500 GB/month cross-cloud transfers · Automated organization & scheduled transfers.
- **ULTRA (₹499/month)**: Up to 20 cloud accounts · 250 GB/day · 2.5 TB/month cross-cloud transfers · Cross-cloud sync & maximum priority.
`,
    },
    {
      id: 'file-md-arch-rfc',
      folder: 'fld-eng-docs',
      name: 'RFC-014-multipart-orchestrator.md',
      mount: 's3-prod',
      mime: 'text/markdown',
      ext: 'md',
      starred: true,
      days: 1.8,
      content: `# RFC-014: Multipart Storage Orchestrator

## Summary
Defines the \`StorageProviderAdapter\` contract so browser-local IndexedDB storage and simulated cloud mounts (MEGA, TeraBox, S3, R2, GCS, WebDAV) share identical multipart lifecycle semantics.
`,
    },
    {
      id: 'file-md-release-notes',
      folder: 'fld-eng-releases',
      name: 'v2.5.0-changelog.md',
      mount: 'r2-edge',
      mime: 'text/markdown',
      ext: 'md',
      starred: false,
      days: 4.2,
      content: `# Release v2.5.0 — Universal Cloud & Subscription Engine

### Added
- 22 mountable cloud storage connectors including MEGA, TeraBox, Google Drive, Dropbox, OneDrive, Box, pCloud, iCloud, Proton Drive, Sync.com, kDrive, Nextcloud, Hetzner, Wasabi, and Backblaze B2.
- FREE (₹0/mo), PRO (₹199/mo), and ULTRA (₹499/mo) subscription engine with backend orchestrator enforcement and Admin Plan Configurator.
`,
    },
    {
      id: 'file-ts-adapter',
      folder: 'fld-eng-docs',
      name: 'storage-adapter-contract.ts',
      mount: 's3-prod',
      mime: 'text/typescript',
      ext: 'ts',
      starred: true,
      days: 2.5,
      content: `export type ProviderKind = 'local' | 'mega' | 'terabox' | 'gdrive' | 'dropbox' | 'onedrive' | 's3' | 'r2' | 'gcs' | 'webdav';

export interface MultipartPartReceipt {
  partNumber: number;
  etag: string;
}
`,
    },
    {
      id: 'file-py-sync-worker',
      folder: 'fld-eng-backups',
      name: 'verify_checksums.py',
      mount: 'gcs-archive',
      mime: 'text/x-python',
      ext: 'py',
      starred: false,
      days: 7.0,
      content: `#!/usr/bin/env python3
"""Verify SHA-256 manifest digests across exported MountYourClouds archive blobs."""

import hashlib
from pathlib import Path

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
`,
    },
    {
      id: 'file-sql-schema',
      folder: 'fld-eng-backups',
      name: 'catalog_index_snapshot.sql',
      mount: 's3-prod',
      mime: 'application/sql',
      ext: 'sql',
      starred: false,
      days: 10.5,
      content: `-- MountYourClouds Metadata Catalog Reference Schema
CREATE TABLE provider_mounts (
  id VARCHAR(64) PRIMARY KEY,
  kind VARCHAR(24) NOT NULL,
  name VARCHAR(120) NOT NULL UNIQUE,
  allocated_bytes BIGINT NOT NULL
);
`,
    },
    {
      id: 'file-json-mounts',
      folder: 'fld-eng-releases',
      name: 'mount-endpoints.json',
      mount: 'local-vault',
      mime: 'application/json',
      ext: 'json',
      starred: false,
      days: 3.1,
      content: JSON.stringify(
        {
          schemaVersion: 2,
          mounts: [
            { id: 'local-vault', kind: 'local', simulated: false },
            { id: 'mega-vault', kind: 'mega', simulated: true },
            { id: 'terabox-cloud', kind: 'terabox', simulated: true },
            { id: 's3-prod', kind: 's3', simulated: true },
            { id: 'r2-edge', kind: 'r2', simulated: true },
            { id: 'gcs-archive', kind: 'gcs', simulated: true },
            { id: 'webdav-nas', kind: 'webdav', simulated: true },
          ],
        },
        null,
        2
      ),
    },
    {
      id: 'file-json-tokens',
      folder: 'fld-des-brand',
      name: 'design-system-tokens.json',
      mount: 'r2-edge',
      mime: 'application/json',
      ext: 'json',
      starred: false,
      days: 6.0,
      content: JSON.stringify(
        {
          colorScheme: 'dark',
          canvas: { app: '#090A0F', workspace: '#0E1017', surface: '#131620' },
          border: { hairline: '#1E2230', subtle: 'rgba(255,255,255,0.07)' },
        },
        null,
        2
      ),
    },
    {
      id: 'file-csv-invoices-q3',
      folder: 'fld-fin-invoices',
      name: '2026-q3-cloud-egress-ledger.csv',
      mount: 's3-prod',
      mime: 'text/csv',
      ext: 'csv',
      starred: true,
      days: 2.9,
      content: `Date,MountID,ProviderKind,IngressGB,EgressGB
2026-08-01,mega-vault,mega,42.5,118.0
2026-08-15,terabox-cloud,terabox,88.2,210.4
2026-09-01,r2-edge,r2,120.0,314.5
`,
    },
    {
      id: 'file-csv-seat-allocation',
      folder: 'fld-fin-invoices',
      name: 'department-storage-quotas.csv',
      mount: 'gcs-archive',
      mime: 'text/csv',
      ext: 'csv',
      starred: false,
      days: 12.4,
      content: `Department,Owner,AllocatedGB,PrimaryMount
Engineering,alex.rivera@mountyourclouds.demo,850,s3-prod
Design,maya.chen@mountyourclouds.demo,1200,mega-vault
Media,sam.patel@mountyourclouds.demo,1024,terabox-cloud
`,
    },
    {
      id: 'file-log-handshake',
      folder: 'fld-eng-docs',
      name: 'connector-handshake-trace.log',
      mount: 'webdav-nas',
      mime: 'text/plain',
      ext: 'log',
      starred: false,
      days: 4.8,
      content: `[2026-11-01T09:14:02.110Z] INFO  orchestrator: Starting mount probe for mega-vault (eu-central-lux)
[2026-11-01T09:14:02.174Z] INFO  mega-adapter: Simulated handshake OK (latency=64ms)
[2026-11-01T09:14:02.286Z] INFO  terabox-adapter: Simulated handshake OK (latency=112ms)
`,
    },
    {
      id: 'file-svg-logo',
      folder: 'fld-des-brand',
      name: 'mountyourclouds-badge-vector.svg',
      mount: 'local-vault',
      mime: 'image/svg+xml',
      ext: 'svg',
      starred: false,
      days: 5.7,
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <rect width="240" height="240" rx="36" fill="#0E1017" stroke="#4F46E5" stroke-width="6"/>
  <path d="M64 84h112M120 84v88" stroke="#818CF8" stroke-width="16" stroke-linecap="round"/>
  <circle cx="120" cy="126" r="46" fill="none" stroke="#10B981" stroke-width="6" stroke-dasharray="12 8"/>
</svg>`,
    },
    {
      id: 'file-html-landing-snippet',
      folder: 'fld-des-brand',
      name: 'embed-status-banner.html',
      mount: 'r2-edge',
      mime: 'text/html',
      ext: 'html',
      starred: false,
      days: 7.9,
      content: `<!doctype html>
<div class="mountyourclouds-production-banner" role="status">
  <span class="badge">Production Vault · Multi-Cloud Aggregator · Secure Local & Cloud Storage</span>
</div>
`,
    },
    {
      id: 'file-md-archive-manifest',
      folder: 'fld-arc-2024',
      name: '2024-cold-storage-index.md',
      mount: 'gcs-archive',
      mime: 'text/markdown',
      ext: 'md',
      starred: false,
      days: 22.0,
      content: `# 2024 Coldline Archive Manifest

This directory tracks historical snapshots stored across simulated mounts.
`,
    },
    {
      id: 'file-ts-format-spec',
      folder: 'fld-eng-releases',
      name: 'si-byte-formatter.ts',
      mount: 'local-vault',
      mime: 'text/typescript',
      ext: 'ts',
      starred: false,
      days: 1.5,
      content: `export function formatSiBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex++;
  }
  return unitIndex === 0 ? \`\${value} B\` : \`\${value.toFixed(1)} \${units[unitIndex]}\`;
}
`,
    },
    {
      id: 'file-json-invoice-summary',
      folder: 'fld-fin-invoices',
      name: 'pro-subscription-receipt.json',
      mount: 'local-vault',
      mime: 'application/json',
      ext: 'json',
      starred: false,
      days: 14.0,
      content: JSON.stringify(
        {
          invoiceId: 'INV-2026-1001',
          plan: 'PRO (₹199/month Demo)',
          maxMounts: 7,
          dailyTransferQuota: '50 GB/day',
          monthlyTransferQuota: '500 GB/month',
          amountInr: 199,
          note: 'Demo receipt only — no real billing occurs.',
        },
        null,
        2
      ),
    },
  ];

  for (const tf of textFiles) {
    const blob = new Blob([tf.content], { type: tf.mime });
    await addRealFile(
      tf.id,
      tf.folder,
      tf.name,
      tf.mount,
      tf.mime,
      tf.ext,
      blob,
      tf.starred,
      tf.days
    );
  }

  // --- 12 PLACEHOLDER FILES ---
  const placeholderSpecs: {
    id: string;
    folder: string | null;
    name: string;
    mount: string;
    mime: string;
    ext: string;
    sizeBytes: number;
    starred: boolean;
    days: number;
  }[] = [
    {
      id: 'file-ph-prod-snapshot-zip',
      folder: 'fld-eng-backups',
      name: 'prod-cluster-volume-snapshot-2026-10.zip',
      mount: 'gcs-archive',
      mime: 'application/zip',
      ext: 'zip',
      sizeBytes: Math.round(38.4 * SI_GB),
      starred: false,
      days: 15,
    },
    {
      id: 'file-ph-k8s-state-zip',
      folder: 'fld-eng-backups',
      name: 'etcd-multi-region-backup.zip',
      mount: 's3-prod',
      mime: 'application/zip',
      ext: 'zip',
      sizeBytes: Math.round(14.2 * SI_GB),
      starred: false,
      days: 9,
    },
    {
      id: 'file-ph-release-bundle-zip',
      folder: 'fld-eng-releases',
      name: 'mountyourclouds-desktop-universal-symbols.zip',
      mount: 'mega-vault',
      mime: 'application/zip',
      ext: 'zip',
      sizeBytes: Math.round(6.8 * SI_GB),
      starred: true,
      days: 4,
    },
    {
      id: 'file-ph-keynote-mp4',
      folder: 'fld-media',
      name: 'architecture-walkthrough-4k60.mp4',
      mount: 'terabox-cloud',
      mime: 'video/mp4',
      ext: 'mp4',
      sizeBytes: Math.round(18.6 * SI_GB),
      starred: true,
      days: 5,
    },
    {
      id: 'file-ph-raw-reel-mp4',
      folder: 'fld-media',
      name: 'product-launch-broll-prores.mp4',
      mount: 'mega-vault',
      mime: 'video/mp4',
      ext: 'mp4',
      sizeBytes: Math.round(11.5 * SI_GB),
      starred: false,
      days: 13,
    },
    {
      id: 'file-ph-hero-master-psd',
      folder: 'fld-des-shots',
      name: 'dashboard-composite-16bit-master.psd',
      mount: 's3-prod',
      mime: 'image/vnd.adobe.photoshop',
      ext: 'psd',
      sizeBytes: Math.round(4.4 * SI_GB),
      starred: false,
      days: 8,
    },
    {
      id: 'file-ph-brand-billboard-psd',
      folder: 'fld-des-brand',
      name: 'conference-booth-environmental.psd',
      mount: 'webdav-nas',
      mime: 'image/vnd.adobe.photoshop',
      ext: 'psd',
      sizeBytes: Math.round(3.1 * SI_GB),
      starred: false,
      days: 17,
    },
    {
      id: 'file-ph-telemetry-parquet',
      folder: 'fld-arc-2024',
      name: '2024-storage-events-partitioned.parquet',
      mount: 'gcs-archive',
      mime: 'application/vnd.apache.parquet',
      ext: 'parquet',
      sizeBytes: Math.round(22.0 * SI_GB),
      starred: false,
      days: 26,
    },
    {
      id: 'file-ph-billing-warehouse-parquet',
      folder: 'fld-arc-2024',
      name: '2024-egress-cost-rollup.parquet',
      mount: 's3-prod',
      mime: 'application/vnd.apache.parquet',
      ext: 'parquet',
      sizeBytes: Math.round(12.8 * SI_GB),
      starred: false,
      days: 24,
    },
    {
      id: 'file-ph-q1-audit-pdf',
      folder: 'fld-fin-invoices',
      name: '2026-annual-infrastructure-budget.pdf',
      mount: 's3-prod',
      mime: 'application/pdf',
      ext: 'pdf',
      sizeBytes: Math.round(420 * SI_MB),
      starred: false,
      days: 11,
    },
    {
      id: 'file-ph-vendor-contract-pdf',
      folder: 'fld-fin-invoices',
      name: 'multi-cloud-bandwidth-schedule.pdf',
      mount: 'gcs-archive',
      mime: 'application/pdf',
      ext: 'pdf',
      sizeBytes: Math.round(380 * SI_MB),
      starred: false,
      days: 19,
    },
    {
      id: 'file-ph-legacy-tar-zip',
      folder: 'fld-arc-2024',
      name: '2024-q4-legacy-assets-bundle.zip',
      mount: 'terabox-cloud',
      mime: 'application/zip',
      ext: 'zip',
      sizeBytes: Math.round(4.2 * SI_GB),
      starred: false,
      days: 27,
    },
  ];

  for (const ph of placeholderSpecs) {
    addPlaceholderFile(
      ph.id,
      ph.folder,
      ph.name,
      ph.mount,
      ph.mime,
      ph.ext,
      ph.sizeBytes,
      ph.starred,
      ph.days
    );
  }

  // 4. 30 Days of Sample Ingress/Egress Activity (Scaled cleanly so monthly total is ~42 GB, well within PRO 500 GB quota)
  const activity: ActivityEvent[] = [];
  const mountIds = ['mega-vault', 'terabox-cloud', 's3-prod', 'r2-edge', 'gcs-archive', 'webdav-nas', 'local-vault'];

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const dayTimestamp = now - dayOffset * dayMs;
    for (const mId of mountIds) {
      const ingressBytes = Math.round((45 + rand() * 95) * SI_MB);
      const egressMultiplier = mId === 'r2-edge' || mId === 'mega-vault' ? 1.8 : 0.9;
      const egressBytes = Math.round((35 + rand() * 80) * egressMultiplier * SI_MB);

      activity.push({
        ts: dayTimestamp - Math.round(rand() * 3600_000 * 4),
        kind: 'ingress',
        bytes: ingressBytes,
        providerId: mId,
      });
      activity.push({
        ts: dayTimestamp - Math.round(rand() * 3600_000 * 2),
        kind: 'egress',
        bytes: egressBytes,
        providerId: mId,
      });
    }
  }

  // 5. Default Settings (Demo account starts on PRO ₹199/month)
  const settings: WorkspaceSettings = {
    explorerView: 'table',
    sortField: 'name',
    sortDirection: 'asc',
    sidebarCollapsed: false,
    inspectorOpen: true,
    subscription: {
      planId: 'pro',
      billingCycle: 'monthly',
      cancelledAt: null,
      invoices: [
        {
          id: 'INV-2026-001',
          issuedAt: now - 14 * dayMs,
          description: 'PRO Plan — Monthly Subscription (Demo)',
          amountInr: 199,
        },
      ],
    },
    scheduledTransfers: [
      {
        id: 'sched-seed-1',
        name: 'Nightly Releases Mirror (S3 → R2)',
        sourceMountId: 's3-prod',
        targetMountId: 'r2-edge',
        schedule: 'daily',
        lastRunAt: now - 6 * 3600_000,
        enabled: true,
        createdAt: now - 10 * dayMs,
      },
      {
        id: 'sched-seed-2',
        name: 'Media Vault Offload (MEGA → TeraBox)',
        sourceMountId: 'mega-vault',
        targetMountId: 'terabox-cloud',
        schedule: 'weekly',
        lastRunAt: now - 2 * dayMs,
        enabled: true,
        createdAt: now - 8 * dayMs,
      },
    ],
    telegramWebhookSim: {
      enabled: true,
      botHandle: '@MountYourCloudsAlertsBot',
      notifyOnUpload: true,
      notifyOnQuotaWarn: true,
    },
    devSettings: {
      failureRate: 0,
      offline: false,
    },
    demoTokens: [
      {
        id: 'tok-seed-1',
        name: 'CLI Sync Worker (Demo)',
        prefix: 'myc_demo_99a4',
        tokenValue: 'tv_demo_99a4_f81c2e09b74a11d3850c',
        createdAt: now - 10 * dayMs,
      },
    ],
    activeAccountEmail: null,
  };

  return {
    account,
    settings,
    mounts,
    nodes: [...folders, ...files],
    blobs,
    thumbs,
    activity,
  };
}
