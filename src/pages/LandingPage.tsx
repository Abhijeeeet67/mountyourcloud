import {
  ArrowRight,
  Command,
  Database,
  Folder,
  HardDrive,
  Keyboard,
  Layers,
  Menu,
  Star,
  TrendingDown,
  UploadCloud,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PricingEstimator } from '../components/pricing/PricingEstimator';
import { APP_NAME, PROTOTYPE_BADGE_TEXT } from '../lib/constants';
import { useVaultStore } from '../store/useVaultStore';
import type { BillingCycle } from '../types/domain';

export function LandingPage() {
  const navigate = useNavigate();
  const launchDemoWorkspace = useVaultStore((s) => s.launchDemoWorkspace);
  const currentAccount = useVaultStore((s) => s.currentAccount);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [launching, setLaunching] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLaunchDemo = async () => {
    setLaunching(true);
    try {
      if (!currentAccount) {
        await launchDemoWorkspace();
      }
      navigate('/app/overview');
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F] text-[#F3F4F6]">
      {/* Permanent Prototype Honesty Strip (§0) */}
      <div className="bg-[#0E1017] border-b border-[#1E2230] px-4 py-1.5 text-center font-mono text-xs text-[#F3F4F6]">
        <span className="inline-block w-2 h-2 rounded-full bg-[#818CF8] mr-2 align-middle" />
        {PROTOTYPE_BADGE_TEXT}
      </div>

      {/* Sticky 3-Zone Top Bar (§2, §7) */}
      <header className="sticky top-0 z-30 bg-[#090A0F]/90 backdrop-blur border-b border-[#1E2230]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-[#F3F4F6] whitespace-nowrap shrink-0"
          >
            {APP_NAME}
          </Link>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#8A94A6]">
            <a
              href="#capabilities"
              className="hover:text-[#F3F4F6] hover:underline whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#F3F4F6] hover:underline whitespace-nowrap shrink-0"
            >
              Architecture
            </a>
            <a
              href="#pricing"
              className="hover:text-[#F3F4F6] hover:underline whitespace-nowrap shrink-0"
            >
              Pricing Estimator
            </a>
            <Link
              to="/auth"
              className="hover:text-[#F3F4F6] hover:underline whitespace-nowrap shrink-0"
            >
              Sign in
            </Link>
          </nav>

          {/* Zone 3: Primary Action + Mobile Hamburger */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={launching}
              onClick={handleLaunchDemo}
              className="px-4 py-2 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium whitespace-nowrap shrink-0"
            >
              {launching ? 'Launching…' : 'Launch demo workspace'}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="md:hidden p-2 rounded-md text-[#8A94A6] hover:text-[#F3F4F6] hover:bg-[#131620] border border-[#1E2230]"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile navigation"
            className="md:hidden border-t border-[#1E2230] bg-[#090A0F]/95 backdrop-blur px-4 py-3 space-y-2 text-sm font-medium"
          >
            <a
              href="#capabilities"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#8A94A6] hover:text-[#F3F4F6]"
            >
              Capabilities
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#8A94A6] hover:text-[#F3F4F6]"
            >
              Architecture
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#8A94A6] hover:text-[#F3F4F6]"
            >
              Pricing Estimator
            </a>
            <Link
              to="/auth"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#8A94A6] hover:text-[#F3F4F6]"
            >
              Sign in
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">
        {/* Hero Section with Static Non-Interactive Explorer Preview (§7) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-16 space-y-10">
          <div className="max-w-3xl space-y-5">
            <p className="font-mono text-xs text-[#818CF8]">
              KEYBOARD-FIRST MULTI-CLOUD FILE MANAGER PROTOTYPE
            </p>
            <h1
              className="font-bold text-[#F3F4F6] tracking-tight leading-[1.12]"
              style={{ fontSize: 'clamp(2.25rem, 4vw, 3.75rem)' }}
            >
              Organize virtual folders across simulated cloud buckets in one dark workspace.
            </h1>
            <p className="text-[15px] text-[#8A94A6] leading-relaxed max-w-2xl">
              {APP_NAME} unifies a real browser-native IndexedDB vault with simulated AWS S3, Cloudflare R2, Google Cloud Storage, and WebDAV mounts. Navigate with{' '}
              <code className="font-mono text-[#F3F4F6]">J/K</code> and{' '}
              <code className="font-mono text-[#F3F4F6]">⌘K</code>, test multipart uploads with pause and resume, and model zero-egress bandwidth costs.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                disabled={launching}
                onClick={handleLaunchDemo}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-sm font-medium whitespace-nowrap"
              >
                <span>Launch demo workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#131620] hover:bg-[#1E2230] border border-[#1E2230] text-[#F3F4F6] text-sm font-medium whitespace-nowrap"
              >
                Sign in
              </Link>
            </div>
          </div>

          {/* Static, Non-Interactive Explorer Preview (§7) */}
          <div
            aria-hidden="true"
            className="rounded-lg bg-[#0E1017] border border-[#1E2230] overflow-hidden select-none pointer-events-none"
          >
            <div className="px-4 py-2.5 bg-[#090A0F] border-b border-[#1E2230] flex items-center justify-between text-xs text-[#8A94A6]">
              <div className="flex items-center gap-2 font-mono">
                <span className="text-[#F3F4F6] font-bold">{APP_NAME}</span>
                <span>/</span>
                <span>All Files</span>
                <span>/</span>
                <span className="text-[#818CF8]">Engineering</span>
              </div>
              <span className="font-mono text-[11px]">
                Static Interface Preview · 40px High-Density Table
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#1E2230]">
              {/* Static Sidebar Preview */}
              <div className="p-3 bg-[#090A0F] space-y-1 text-xs">
                <div className="px-2.5 py-1.5 rounded bg-[#131620] text-[#818CF8] font-medium flex items-center gap-2">
                  <Folder className="w-3.5 h-3.5" />
                  <span>All Files</span>
                </div>
                <div className="px-2.5 py-1.5 text-[#8A94A6] flex items-center gap-2">
                  <Star className="w-3.5 h-3.5" />
                  <span>Starred</span>
                </div>
                <div className="px-2.5 py-1.5 text-[#8A94A6] flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>5 Mounts Connected</span>
                </div>
              </div>

              {/* Static Table Rows Preview */}
              <div className="lg:col-span-3 divide-y divide-[#1E2230]/70 text-xs">
                {[
                  {
                    name: 'Releases',
                    mount: 'Virtual folder',
                    size: '—',
                    date: '2d ago',
                    isFolder: true,
                  },
                  {
                    name: 'RFC-014-multipart-orchestrator.md',
                    mount: 'AWS S3 Production · Simulated',
                    size: '1.4 KB',
                    date: '1d ago',
                    isFolder: false,
                  },
                  {
                    name: 'mountyourclouds-desktop-universal-symbols.zip',
                    mount: 'Cloudflare R2 Edge · Simulated',
                    size: '6.8 GB',
                    date: '4d ago',
                    isFolder: false,
                  },
                  {
                    name: 'WORKSPACE-README.md',
                    mount: 'Local Browser Vault',
                    size: '1.1 KB',
                    date: '9h ago',
                    isFolder: false,
                  },
                ].map((row) => (
                  <div
                    key={row.name}
                    className="h-10 px-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Folder
                        className={`w-3.5 h-3.5 ${
                          row.isFolder ? 'text-[#818CF8]' : 'text-[#8A94A6]'
                        }`}
                      />
                      <span className="font-medium text-[#F3F4F6] truncate">{row.name}</span>
                    </div>
                    <div className="flex items-center gap-6 font-mono text-[#8A94A6] tabular-nums shrink-0">
                      <span className="hidden sm:inline">{row.mount}</span>
                      <span className="w-16 text-right">{row.size}</span>
                      <span className="hidden md:inline w-16 text-right">{row.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Six-Card Bento Grid (§7) */}
        <section id="capabilities" className="max-w-7xl mx-auto px-4 sm:px-6 py-14 space-y-8 border-t border-[#1E2230]">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-bold text-[#F3F4F6]">
              01. Six Core Workspace Capabilities
            </h2>
            <p className="text-sm text-[#8A94A6]">
              Built for speed, keyboard ergonomics, and transparent multi-mount storage modeling.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 rounded-lg bg-[#131620] border border-[#1E2230] p-6 space-y-2">
              <div className="flex items-center gap-2 text-[#818CF8] text-xs font-mono">
                <Layers className="w-4 h-4" />
                <span>01 · DUAL-MODE VIRTUALIZED EXPLORER</span>
              </div>
              <h3 className="text-lg font-bold text-[#F3F4F6]">
                Linear 40px High-Density Table & Google Drive Visual Grid
              </h3>
              <p className="text-sm text-[#8A94A6] leading-relaxed">
                Switch effortlessly between a virtualized 40px row table with column sorting and a thumbnail card grid. Virtual folders can hold files across any mount without moving underlying bytes.
              </p>
            </div>

            <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-6 space-y-2">
              <div className="flex items-center gap-2 text-[#818CF8] text-xs font-mono">
                <UploadCloud className="w-4 h-4" />
                <span>02 · MULTIPART ENGINE</span>
              </div>
              <h3 className="text-lg font-bold text-[#F3F4F6]">
                Pause, Resume & Backoff Retry
              </h3>
              <p className="text-sm text-[#8A94A6] leading-relaxed">
                3-job concurrent upload queue with 100ms progress ticks, 3-second sliding window speed, SHA-256 verification, and 320px PNG thumbnail generation.
              </p>
            </div>

            <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-6 space-y-2">
              <div className="flex items-center gap-2 text-[#818CF8] text-xs font-mono">
                <Keyboard className="w-4 h-4" />
                <span>03 · KEYBOARD-FIRST</span>
              </div>
              <h3 className="text-lg font-bold text-[#F3F4F6]">
                Full Shortcut & Roving Tabindex Navigation
              </h3>
              <p className="text-sm text-[#8A94A6] leading-relaxed">
                Navigate rows with J/K or arrows, preview with Space, rename with F2, star with S, or press ⌘K to jump to any file, mount, or action.
              </p>
            </div>

            <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-6 space-y-2">
              <div className="flex items-center gap-2 text-[#818CF8] text-xs font-mono">
                <Database className="w-4 h-4" />
                <span>04 · INDEXEDDB PERSISTENCE</span>
              </div>
              <h3 className="text-lg font-bold text-[#F3F4F6]">
                Real Browser Blobs & Cross-Tab Sync
              </h3>
              <p className="text-sm text-[#8A94A6] leading-relaxed">
                Stores real binary Blobs in IndexedDB outside node metadata records so directory traversal stays fast, synced across open tabs via BroadcastChannel.
              </p>
            </div>

            <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-6 space-y-2">
              <div className="flex items-center gap-2 text-[#10B981] text-xs font-mono">
                <TrendingDown className="w-4 h-4" />
                <span>05 · ZERO-EGRESS ANALYTICS</span>
              </div>
              <h3 className="text-lg font-bold text-[#F3F4F6]">
                Bandwidth Trends & Egress Cost Modeling
              </h3>
              <p className="text-sm text-[#8A94A6] leading-relaxed">
                Compare capacity across file categories and mounts, inspect 7D/30D ingress and egress charts, and quantify savings from zero-egress R2 mounts.
              </p>
            </div>

            <div className="md:col-span-3 rounded-lg bg-[#131620] border border-[#1E2230] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[#818CF8] text-xs font-mono">
                  <Command className="w-4 h-4" />
                  <span>06 · DEVELOPER FAULT INJECTION</span>
                </div>
                <h3 className="text-lg font-bold text-[#F3F4F6]">
                  Built-In Latency Jitter, Failure Rates (0 / 10 / 50%) & Offline Toggle
                </h3>
                <p className="text-sm text-[#8A94A6]">
                  Verify error recovery, exponential backoff, and disconnected mount states directly from the Settings Developer Panel.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLaunchDemo}
                className="px-4 py-2 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium shrink-0 self-start md:self-auto"
              >
                Try in Demo Workspace
              </button>
            </div>
          </div>
        </section>

        {/* "How It Works" Adapter-Layer Diagram with Prototype Note (§7) */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 py-14 space-y-6 border-t border-[#1E2230]">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-bold text-[#F3F4F6]">
              02. How It Works — Pluggable Adapter Layer
            </h2>
            <p className="text-sm text-[#8A94A6]">
              The UI never imports an adapter directly. Every operation routes through{' '}
              <code className="font-mono text-[#F3F4F6]">StorageOrchestrator</code>, which pairs virtual folder metadata with S3-style multipart provider adapters.
            </p>
          </div>

          <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-6 space-y-4">
            <pre className="font-mono text-xs text-[#F3F4F6] overflow-x-auto leading-relaxed">
{`┌───────────────────────────────────────────────────────────────────────────┐
│  MountYourClouds React UI (Explorer · Transfer Tray · Overview · ⌘K)      │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  StorageOrchestrator                                                      │
│  • Virtual folder tree & collision-safe sibling naming                    │
│  • 3-concurrent multipart upload queue + 3s sliding window speed          │
│  • SHA-256 WebCrypto digest (≤ 64 MB) & 320px PNG canvas thumbnails       │
└───────────────┬───────────────────────────────────────────┬───────────────┘
                ▼                                           ▼
┌─────────────────────────────────────┐   ┌─────────────────────────────────┐
│  IndexedDBStorageAdapter (Real)     │   │  SimulatedCloudAdapter (Local)  │
│  • local-vault (1 MiB parts)        │   │  • s3-prod     (8 MiB · ~80ms)  │
│  • Persists Blobs in                │   │  • r2-edge     (8 MiB · ~60ms)  │
│    mountyourclouds_db               │   │  • gcs-archive (8 MiB · ~100ms) │
│                                     │   │  • webdav-nas  (4 MiB · ~140ms) │
└─────────────────────────────────────┘   └─────────────────────────────────┘`}
            </pre>
            <p className="text-xs text-[#8A94A6] border-t border-[#1E2230] pt-3 font-mono">
              Prototype note: Simulated adapters do not contact external cloud servers; on multipart completion, they commit the uploaded Blob into the local browser’s <code className="text-[#F3F4F6]">mountyourclouds_db</code> IndexedDB store.
            </p>
          </div>
        </section>

        {/* Pricing Estimator Section (§7, §8) */}
        <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 py-14 space-y-6 border-t border-[#1E2230]">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-bold text-[#F3F4F6]">
              03. Illustrative Pricing & Cost Estimator
            </h2>
            <p className="text-sm text-[#8A94A6]">
              Use the sliders below to estimate monthly storage and egress costs across plans.
            </p>
          </div>

          <PricingEstimator
            billingCycle={billingCycle}
            onBillingCycleChange={setBillingCycle}
            isLanding
          />
        </section>
      </main>

      {/* Quiet Footer (§7) */}
      <footer className="border-t border-[#1E2230] bg-[#090A0F] py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#8A94A6]">
          <div className="flex items-center gap-3">
            <span className="font-bold text-[#F3F4F6]">{APP_NAME}</span>
            <span>·</span>
            <span>{PROTOTYPE_BADGE_TEXT}</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/auth" className="hover:text-[#F3F4F6]">
              Sign in
            </Link>
            <button
              type="button"
              onClick={handleLaunchDemo}
              className="text-[#818CF8] hover:underline"
            >
              Launch Demo Workspace
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
