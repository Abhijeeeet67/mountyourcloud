import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  Folder,
  HardDrive,
  Keyboard,
  Layers,
  Lock,
  Menu,
  Moon,
  ShieldCheck,
  Star,
  Sun,
  UploadCloud,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProviderLogo } from '../components/icons/ProviderLogo';
import { PricingEstimator } from '../components/pricing/PricingEstimator';
import { APP_NAME, APP_TAGLINE } from '../lib/constants';
import { PublicFooter } from './PublicPages';
import { useVaultStore } from '../store/useVaultStore';
import type { BillingCycle, ProviderKind } from '../types/domain';

export function LandingPage() {
  const currentAccount = useVaultStore((s) => s.currentAccount);
  const theme = useVaultStore((s) => s.settings.theme);
  const setTheme = useVaultStore((s) => s.setTheme);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isDark = theme === 'dark';

  const featuredProviders: Array<{ kind: ProviderKind; label: string; mode: string }> = [
    { kind: 'gdrive', label: 'Google Drive', mode: 'OAuth 2.0 PKCE' },
    { kind: 'onedrive', label: 'Microsoft OneDrive', mode: 'OAuth 2.0 PKCE' },
    { kind: 'dropbox', label: 'Dropbox', mode: 'OAuth 2.0 PKCE' },
    { kind: 'box', label: 'Box Cloud', mode: 'OAuth 2.0' },
    { kind: 'pcloud', label: 'pCloud', mode: 'OAuth 2.0' },
    { kind: 's3', label: 'Amazon S3', mode: 'Direct Endpoint' },
    { kind: 'r2', label: 'Cloudflare R2', mode: 'Zero-Egress S3' },
    { kind: 'b2', label: 'Backblaze B2', mode: 'S3 Compatible' },
    { kind: 'webdav', label: 'WebDAV / Nextcloud', mode: 'Direct WebDAV' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F7] dark:bg-[#0B0C10] text-[#1D1D1F] dark:text-[#F5F5F7] tv-transition">
      {/* Sticky Apple-Inspired Top Bar */}
      <header className="sticky top-0 z-30 bg-white/85 dark:bg-[#15171E]/85 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-lg font-semibold tracking-tight whitespace-nowrap shrink-0"
          >
            <div className="w-8 h-8 rounded-xl bg-[#0071E3] flex items-center justify-center text-white shadow-xs">
              <Cloud className="w-4 h-4" />
            </div>
            <span>{APP_NAME}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-[#6E6E73] dark:text-[#86868B]">
            <Link to="/features" className="hover:text-[#1D1D1F] dark:hover:text-white">
              Features
            </Link>
            <Link to="/integrations" className="hover:text-[#1D1D1F] dark:hover:text-white">
              Integrations
            </Link>
            <Link to="/how-it-works" className="hover:text-[#1D1D1F] dark:hover:text-white">
              How It Works
            </Link>
            <Link to="/pricing" className="hover:text-[#1D1D1F] dark:hover:text-white">
              Pricing
            </Link>
            <Link to="/security" className="hover:text-[#1D1D1F] dark:hover:text-white">
              Security
            </Link>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              aria-label="Toggle Light or Dark mode"
              className="p-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {currentAccount ? (
              <Link
                to="/app/overview"
                className="px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <span>Open Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  to="/auth"
                  className="hidden sm:inline-flex px-3.5 py-2 rounded-xl text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                >
                  Sign In
                </Link>
                <Link
                  to="/auth"
                  className="px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold shadow-xs"
                >
                  Get Started Free
                </Link>
              </>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="md:hidden p-2 rounded-xl text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white border border-black/[0.08] dark:border-white/[0.1]"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav
            aria-label="Mobile navigation"
            className="md:hidden border-t border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#15171E] px-4 py-3 space-y-2 text-xs font-medium"
          >
            <Link
              to="/features"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#6E6E73]"
            >
              Features
            </Link>
            <Link
              to="/integrations"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#6E6E73]"
            >
              Integrations
            </Link>
            <Link
              to="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#6E6E73]"
            >
              Pricing
            </Link>
            <Link
              to="/security"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#6E6E73]"
            >
              Security
            </Link>
            <Link
              to="/auth"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#0071E3] font-semibold"
            >
              Sign In / Create Account
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-8 pt-14 pb-16 space-y-10">
          <div className="max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0071E3]/10 text-[#0071E3] dark:text-[#0A84FF] text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{APP_TAGLINE} · AES-256-GCM Encrypted Cloud Vault</span>
            </div>

            <h1
              className="font-bold tracking-tight leading-[1.1]"
              style={{ fontSize: 'clamp(2.25rem, 4.2vw, 3.75rem)' }}
            >
              Every cloud. One place.
            </h1>

            <p className="text-[15px] text-[#6E6E73] dark:text-[#86868B] leading-relaxed max-w-2xl">
              Connect Google Drive, Microsoft OneDrive, Dropbox, Box, pCloud, Amazon S3, Cloudflare
              R2, Backblaze B2, and WebDAV in one high-speed workspace. Authenticate with Google or
              Apple, navigate with <code className="font-mono">⌘K</code>, and orchestrate multipart
              transfers with cryptographic verification.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to={currentAccount ? '/app/overview' : '/auth'}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-sm font-semibold shadow-sm tv-transition"
              >
                <span>{currentAccount ? 'Go to Workspace' : 'Start Free Workspace'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/integrations"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white dark:bg-[#15171E] hover:bg-black/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-sm font-medium tv-transition"
              >
                <span>Explore Cloud Integrations</span>
              </Link>
            </div>
          </div>

          {/* Provider Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2.5">
            {featuredProviders.map((p) => (
              <div
                key={p.kind}
                className="apple-card p-3 flex flex-col items-center text-center gap-1.5"
              >
                <div className="w-8 h-8 rounded-lg bg-[#F5F5F7] dark:bg-[#0B0C10] flex items-center justify-center">
                  <ProviderLogo kind={p.kind} className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold truncate w-full">{p.label}</span>
                <span className="text-[10px] font-mono text-[#28CD41]">{p.mode}</span>
              </div>
            ))}
          </div>

          {/* Workspace Interface Preview */}
          <div
            aria-hidden="true"
            className="apple-card overflow-hidden select-none pointer-events-none"
          >
            <div className="px-4 py-2.5 bg-[#F5F5F7] dark:bg-[#0B0C10] border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-xs text-[#6E6E73]">
              <div className="flex items-center gap-2 font-mono">
                <span className="text-[#1D1D1F] dark:text-[#F5F5F7] font-bold">{APP_NAME}</span>
                <span>/</span>
                <span>All Files</span>
                <span>/</span>
                <span className="text-[#0071E3]">Connected Clouds</span>
              </div>
              <span className="font-mono text-[11px]">
                40px High-Density Virtualized Explorer
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-black/[0.06] dark:divide-white/[0.08]">
              <div className="p-3 space-y-1 text-xs">
                <div className="px-2.5 py-1.5 rounded-lg bg-[#0071E3] text-white font-medium flex items-center gap-2">
                  <Folder className="w-3.5 h-3.5" />
                  <span>All Files</span>
                </div>
                <div className="px-2.5 py-1.5 text-[#6E6E73] flex items-center gap-2">
                  <Star className="w-3.5 h-3.5" />
                  <span>Starred</span>
                </div>
                <div className="px-2.5 py-1.5 text-[#6E6E73] flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Connected OAuth Drives</span>
                </div>
              </div>

              <div className="lg:col-span-3 divide-y divide-black/[0.06] dark:divide-white/[0.08] text-xs">
                {[
                  {
                    name: 'Production Backups',
                    mount: 'Cloudflare R2 Edge',
                    size: '—',
                    date: 'Active',
                  },
                  {
                    name: 'Q4-Architecture-Review.pdf',
                    mount: 'Google Drive (OAuth 2.0)',
                    size: '4.2 MB',
                    date: 'Synced',
                  },
                  {
                    name: 'Release-Assets-v4.tar.gz',
                    mount: 'Amazon S3 Bucket',
                    size: '1.8 GB',
                    date: 'Verified SHA-256',
                  },
                  {
                    name: 'Team-Shared-Contracts.docx',
                    mount: 'Microsoft OneDrive',
                    size: '840 KB',
                    date: 'Synced',
                  },
                ].map((row) => (
                  <div
                    key={row.name}
                    className="h-10 px-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Folder className="w-3.5 h-3.5 text-[#0071E3]" />
                      <span className="font-medium truncate">{row.name}</span>
                    </div>
                    <div className="flex items-center gap-6 font-mono text-[#6E6E73] tabular-nums shrink-0">
                      <span className="hidden sm:inline">{row.mount}</span>
                      <span className="w-16 text-right">{row.size}</span>
                      <span className="hidden md:inline w-24 text-right text-[#28CD41]">
                        {row.date}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Core Capabilities Bento Grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-8 py-14 space-y-8 border-t border-black/[0.06] dark:border-white/[0.08]">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-bold">Built for Multi-Cloud Precision</h2>
            <p className="text-sm text-[#6E6E73] dark:text-[#86868B]">
              Real OAuth 2.0 PKCE connections, AES-256-GCM token encryption, and keyboard-first file
              management.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="apple-card p-6 space-y-2">
              <div className="flex items-center gap-2 text-[#0071E3] text-xs font-mono font-semibold">
                <Layers className="w-4 h-4" />
                <span>UNIFIED EXPLORER</span>
              </div>
              <h3 className="text-base font-bold">
                High-Density Table & Visual Grid
              </h3>
              <p className="text-xs text-[#6E6E73] dark:text-[#86868B] leading-relaxed">
                Browse files across Google Drive, OneDrive, Dropbox, Box, pCloud, S3, R2, and
                WebDAV with instant sorting, filtering, and previewing.
              </p>
            </div>

            <div className="apple-card p-6 space-y-2">
              <div className="flex items-center gap-2 text-[#28CD41] text-xs font-mono font-semibold">
                <Lock className="w-4 h-4" />
                <span>ZERO-LEAK SECURITY</span>
              </div>
              <h3 className="text-base font-bold">
                AES-256-GCM Encrypted Token Vault
              </h3>
              <p className="text-xs text-[#6E6E73] dark:text-[#86868B] leading-relaxed">
                OAuth refresh tokens and payment gateway secrets are encrypted server-side with
                unique 96-bit IVs and strict user-scoped authorization checks.
              </p>
            </div>

            <div className="apple-card p-6 space-y-2">
              <div className="flex items-center gap-2 text-[#0071E3] text-xs font-mono font-semibold">
                <UploadCloud className="w-4 h-4" />
                <span>MULTIPART ORCHESTRATOR</span>
              </div>
              <h3 className="text-base font-bold">
                Pause, Resume & SHA-256 Checksums
              </h3>
              <p className="text-xs text-[#6E6E73] dark:text-[#86868B] leading-relaxed">
                Concurrent multipart uploads with sliding-window speed telemetry, exponential
                backoff retry, and scheduled cross-cloud replication.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section
          id="pricing"
          className="max-w-7xl mx-auto px-4 sm:px-8 py-14 space-y-6 border-t border-black/[0.06] dark:border-white/[0.08]"
        >
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-bold">Simple, Transparent INR Pricing</h2>
            <p className="text-sm text-[#6E6E73] dark:text-[#86868B]">
              Start on the FREE plan (₹0/month for up to 2 cloud accounts), or upgrade to PRO and
              ULTRA with Razorpay.
            </p>
          </div>

          <PricingEstimator
            billingCycle={billingCycle}
            onBillingCycleChange={setBillingCycle}
            isLanding
          />
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
