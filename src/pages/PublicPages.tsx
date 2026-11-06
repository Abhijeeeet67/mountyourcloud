import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  HelpCircle,
  Layers,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProviderLogo } from '../components/icons/ProviderLogo';
import { PricingEstimator } from '../components/pricing/PricingEstimator';
import { APP_NAME, APP_TAGLINE, PROVIDER_KIND_META } from '../lib/constants';
import { useVaultStore } from '../store/useVaultStore';
import type { BillingCycle, ProviderKind } from '../types/domain';

const LEGAL_BUSINESS_NAME =
  import.meta.env.VITE_LEGAL_BUSINESS_NAME || 'MountYourClouds Software';
const SUPPORT_EMAIL =
  import.meta.env.VITE_SUPPORT_EMAIL || 'support@mountyourclouds.com';
const PRIVACY_EMAIL =
  import.meta.env.VITE_PRIVACY_EMAIL || 'privacy@mountyourclouds.com';
const REGISTERED_JURISDICTION =
  import.meta.env.VITE_REGISTERED_COUNTRY || 'India';

export function PublicLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const currentAccount = useVaultStore((s) => s.currentAccount);
  const theme = useVaultStore((s) => s.settings.theme);
  const setTheme = useVaultStore((s) => s.setTheme);
  const isDark = theme === 'dark';

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F7] dark:bg-[#0B0C10] text-[#1D1D1F] dark:text-[#F5F5F7] tv-transition">
      <header className="sticky top-0 z-30 h-16 px-4 sm:px-8 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/85 dark:bg-[#15171E]/85 backdrop-blur-xl flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#0071E3] flex items-center justify-center text-white shadow-xs">
            <Cloud className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[15px] font-semibold tracking-tight block leading-none">
              {APP_NAME}
            </span>
            <span className="text-[11px] text-[#6E6E73] dark:text-[#86868B]">
              {APP_TAGLINE}
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-[#6E6E73] dark:text-[#86868B]">
          <Link to="/features" className="hover:text-[#1D1D1F] dark:hover:text-white">
            Features
          </Link>
          <Link to="/integrations" className="hover:text-[#1D1D1F] dark:hover:text-white">
            Integrations
          </Link>
          <Link to="/how-it-works" className="hover:text-[#1D1D1F] dark:hover:text-white">
            Architecture
          </Link>
          <Link to="/pricing" className="hover:text-[#1D1D1F] dark:hover:text-white">
            Pricing
          </Link>
          <Link to="/security" className="hover:text-[#1D1D1F] dark:hover:text-white">
            Security
          </Link>
          <Link to="/faq" className="hover:text-[#1D1D1F] dark:hover:text-white">
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-2.5">
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
            <Link
              to="/auth"
              className="px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold"
            >
              Sign In / Get Started
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-12 space-y-8">
        <div className="space-y-2 border-b border-black/[0.06] dark:border-white/[0.08] pb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0071E3]">
            {APP_NAME} · {APP_TAGLINE}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-[#6E6E73] dark:text-[#86868B] max-w-2xl">{subtitle}</p>
        </div>

        {children}
      </main>

      <PublicFooter />
    </div>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#15171E] py-10 px-4 sm:px-8 text-xs text-[#6E6E73] dark:text-[#86868B]">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 pb-8 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="col-span-2 md:col-span-1 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            <Cloud className="w-4 h-4 text-[#0071E3]" />
            <span>{APP_NAME}</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            {APP_TAGLINE} Unified multi-cloud file explorer, encrypted OAuth 2.0 credential vault,
            and multipart transfer orchestrator.
          </p>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">Product</p>
          <ul className="space-y-1.5">
            <li>
              <Link to="/features" className="hover:underline">
                Features
              </Link>
            </li>
            <li>
              <Link to="/integrations" className="hover:underline">
                Cloud Integrations
              </Link>
            </li>
            <li>
              <Link to="/how-it-works" className="hover:underline">
                How It Works
              </Link>
            </li>
            <li>
              <Link to="/pricing" className="hover:underline">
                Pricing (INR)
              </Link>
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">Security & Support</p>
          <ul className="space-y-1.5">
            <li>
              <Link to="/security" className="hover:underline">
                Security Architecture
              </Link>
            </li>
            <li>
              <Link to="/faq" className="hover:underline">
                Frequently Asked Questions
              </Link>
            </li>
            <li>
              <Link to="/contact" className="hover:underline">
                Contact Support
              </Link>
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">Legal</p>
          <ul className="space-y-1.5">
            <li>
              <Link to="/privacy" className="hover:underline">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link to="/terms" className="hover:underline">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link to="/refund-policy" className="hover:underline">
                Refund & Cancellation Policy
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
        <span>
          © {new Date().getFullYear()} {LEGAL_BUSINESS_NAME}. All rights reserved.
        </span>
        <span>Support: {SUPPORT_EMAIL}</span>
      </div>
    </footer>
  );
}

export function FeaturesPublicPage() {
  return (
    <PublicLayout
      title="Unified Multi-Cloud Capabilities"
      subtitle="Navigate, search, upload, and orchestrate files across all your cloud storage accounts from a single keyboard-first workspace."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[
          {
            title: 'OAuth 2.0 PKCE Cloud Connections',
            desc: 'Connect Google Drive, Microsoft OneDrive, Dropbox, Box, and pCloud with server-side token exchange and automatic background refresh.',
          },
          {
            title: 'S3, Cloudflare R2, Backblaze B2 & WebDAV',
            desc: 'Mount S3-compatible object storage buckets and WebDAV servers with real live endpoint probing before activation.',
          },
          {
            title: 'Virtualized High-Density File Explorer',
            desc: 'Switch between a 40px high-density table view and a visual grid view with keyboard navigation (J/K, Space preview, ⌘K command palette).',
          },
          {
            title: 'Multipart Upload Queue & Integrity Hashing',
            desc: 'Concurrent multipart upload engine with pause/resume, exponential backoff retry, and WebCrypto SHA-256 checksum verification.',
          },
        ].map((f) => (
          <div key={f.title} className="apple-card p-6 space-y-2">
            <h2 className="text-base font-bold">{f.title}</h2>
            <p className="text-xs text-[#6E6E73] dark:text-[#86868B] leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </PublicLayout>
  );
}

export function HowItWorksPublicPage() {
  return (
    <PublicLayout
      title="How MountYourClouds Works"
      subtitle="A transparent look at our client-server storage orchestration and zero-knowledge token vault."
    >
      <div className="apple-card p-6 space-y-4 text-xs leading-relaxed">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Layers className="w-4 h-4 text-[#0071E3]" />
          <span>1. Authenticated Session & Row-Level Isolation</span>
        </div>
        <p className="text-[#6E6E73] dark:text-[#86868B]">
          Users sign in with Email/Password, Google, or Apple via Supabase Auth. Every backend API
          request verifies your JWT or signed session token and scopes database queries strictly to
          your authenticated User ID.
        </p>

        <div className="flex items-center gap-2 font-semibold text-sm pt-2">
          <Lock className="w-4 h-4 text-[#28CD41]" />
          <span>2. Server-Side OAuth 2.0 & AES-256-GCM Token Encryption</span>
        </div>
        <p className="text-[#6E6E73] dark:text-[#86868B]">
          When you link a cloud provider, our backend generates a single-use expiring state
          transaction, exchanges the authorization code server-side, and encrypts your access and
          refresh tokens using AES-256-GCM with unique 96-bit IVs and 128-bit authentication tags.
        </p>

        <div className="flex items-center gap-2 font-semibold text-sm pt-2">
          <Cloud className="w-4 h-4 text-[#0071E3]" />
          <span>3. Pluggable StorageOrchestrator & Real Adapters</span>
        </div>
        <p className="text-[#6E6E73] dark:text-[#86868B]">
          File listings, folder creation, uploads, downloads, and deletions route through
          provider-specific REST/WebDAV/S3 adapters while caching metadata locally in IndexedDB for
          instant search and navigation.
        </p>
      </div>
    </PublicLayout>
  );
}

export function IntegrationsPublicPage() {
  const kinds = Object.keys(PROVIDER_KIND_META) as ProviderKind[];
  return (
    <PublicLayout
      title="Cloud Storage Integrations"
      subtitle="Transparent support matrix across OAuth 2.0 cloud drives, S3-compatible object storage, and protocol mounts."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kinds.map((k) => {
          const meta = PROVIDER_KIND_META[k];
          return (
            <div key={k} className="apple-card p-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center shrink-0">
                  <ProviderLogo kind={k} className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">{meta.label}</h3>
                  <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-0.5">
                    Default endpoint: <code className="font-mono">{meta.defaultEndpoint}</code>
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold shrink-0 ${
                  meta.integrationStatus === 'fully_integrated' ||
                  meta.integrationStatus === 'partially_integrated'
                    ? 'bg-[#28CD41]/15 text-[#28CD41]'
                    : 'bg-[#FF9F0A]/15 text-[#D97706] dark:text-[#FFD60A]'
                }`}
              >
                {meta.integrationStatus === 'fully_integrated'
                  ? 'Live API Integrated'
                  : meta.integrationStatus === 'partially_integrated'
                  ? 'Direct Endpoint Ready'
                  : 'Restricted / Proxy'}
              </span>
            </div>
          );
        })}
      </div>
    </PublicLayout>
  );
}

export function PricingPublicPage() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  return (
    <PublicLayout
      title="Transparent INR Subscription Plans"
      subtitle="Start free with up to 2 connected cloud accounts, or upgrade to PRO and ULTRA via Razorpay."
    >
      <PricingEstimator billingCycle={cycle} onBillingCycleChange={setCycle} isLanding />
    </PublicLayout>
  );
}

export function SecurityPublicPage() {
  return (
    <PublicLayout
      title="Application & Cryptographic Security"
      subtitle="Engineered with strict multi-tenant isolation, authenticated AES-256-GCM encryption, and HMAC-verified payment webhooks."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
        <div className="apple-card p-6 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <ShieldCheck className="w-4 h-4 text-[#28CD41]" />
            <span>AES-256-GCM Credential Vault</span>
          </div>
          <p className="text-[#6E6E73] dark:text-[#86868B] leading-relaxed">
            OAuth refresh tokens and admin payment gateway secrets are encrypted at rest using
            AES-256-GCM with 96-bit random IVs and 128-bit authentication tags. Plaintext secrets
            are never exposed to the browser.
          </p>
        </div>

        <div className="apple-card p-6 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Lock className="w-4 h-4 text-[#0071E3]" />
            <span>PostgreSQL Row Level Security (RLS)</span>
          </div>
          <p className="text-[#6E6E73] dark:text-[#86868B] leading-relaxed">
            Every user table in Supabase PostgreSQL enforces strict <code className="font-mono">auth.uid() = user_id</code>{' '}
            policies so tenants can never read or mutate another user’s cloud mounts, files, or
            invoices.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}

export function FaqPublicPage() {
  return (
    <PublicLayout
      title="Frequently Asked Questions"
      subtitle="Answers about cloud storage quotas, OAuth security, and Razorpay billing."
    >
      <div className="space-y-4">
        {[
          {
            q: 'Does MountYourClouds host my raw cloud storage capacity?',
            a: 'Your raw storage capacity comes directly from your connected Google Drive, OneDrive, Dropbox, Box, pCloud, or S3 accounts. Your MountYourClouds plan governs how many cloud accounts you can mount simultaneously and your daily/monthly orchestration bandwidth.',
          },
          {
            q: 'Can I cancel my PRO or ULTRA subscription at any time?',
            a: 'Yes. You can cancel your subscription with one click from the Plans & Billing page in your workspace.',
          },
          {
            q: 'How are my OAuth tokens protected?',
            a: 'OAuth authorization codes are exchanged strictly on the backend server. Access and refresh tokens are encrypted with AES-256-GCM before storage.',
          },
        ].map((item) => (
          <div key={item.q} className="apple-card p-5 space-y-1.5">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#0071E3]" />
              <span>{item.q}</span>
            </h3>
            <p className="text-xs text-[#6E6E73] dark:text-[#86868B] leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>
    </PublicLayout>
  );
}

export function ContactPublicPage() {
  return (
    <PublicLayout
      title="Contact & Support"
      subtitle="Reach our engineering and billing support team."
    >
      <div className="apple-card p-6 space-y-4 text-xs">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Mail className="w-4 h-4 text-[#0071E3]" />
          <span>Customer & Technical Support</span>
        </div>
        <p className="text-[#6E6E73] dark:text-[#86868B]">
          Legal Entity: <strong>{LEGAL_BUSINESS_NAME}</strong> ({REGISTERED_JURISDICTION})
        </p>
        <p className="text-[#6E6E73] dark:text-[#86868B]">
          General & Billing Support: <code className="font-mono">{SUPPORT_EMAIL}</code>
        </p>
        <p className="text-[#6E6E73] dark:text-[#86868B]">
          Privacy & Data Protection Inquiries: <code className="font-mono">{PRIVACY_EMAIL}</code>
        </p>
      </div>
    </PublicLayout>
  );
}

export function PrivacyPolicyPage() {
  return (
    <PublicLayout
      title="Privacy Policy"
      subtitle={`Effective Date: ${new Date().toISOString().slice(0, 10)} · Operated by ${LEGAL_BUSINESS_NAME}`}
    >
      <div className="apple-card p-6 space-y-4 text-xs text-[#6E6E73] dark:text-[#86868B] leading-relaxed">
        <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
          1. Information We Collect
        </h2>
        <p>
          When you register for {APP_NAME}, we collect your account email address, display name, and
          authentication provider identifier via Supabase Auth. When you connect third-party cloud
          storage accounts via OAuth 2.0, we store encrypted access and refresh tokens strictly to
          perform file listing and transfer operations initiated by you.
        </p>
        <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
          2. How We Protect Your Credentials
        </h2>
        <p>
          All OAuth tokens and API secrets are encrypted at rest using AES-256-GCM before being
          persisted. We never sell or share your personal data or file metadata with third-party
          advertisers.
        </p>
        <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
          3. Data Export & Account Deletion
        </h2>
        <p>
          You may export your workspace metadata as JSON or permanently delete your account and
          revoke all stored OAuth tokens at any time from Workspace Settings, or by contacting{' '}
          {PRIVACY_EMAIL}.
        </p>
      </div>
    </PublicLayout>
  );
}

export function TermsOfServicePage() {
  return (
    <PublicLayout
      title="Terms of Service"
      subtitle={`Governing Law: ${REGISTERED_JURISDICTION} · Operated by ${LEGAL_BUSINESS_NAME}`}
    >
      <div className="apple-card p-6 space-y-4 text-xs text-[#6E6E73] dark:text-[#86868B] leading-relaxed">
        <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
          1. Acceptance of Terms
        </h2>
        <p>
          By accessing or using {APP_NAME}, you agree to be bound by these Terms of Service. You are
          responsible for maintaining the security of your account credentials and for all content
          stored in your connected cloud providers.
        </p>
        <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
          2. Service Quotas & External Cloud Providers
        </h2>
        <p>
          {APP_NAME} provides multi-cloud orchestration software. Raw storage capacity is provided
          by your connected external cloud storage accounts under their respective terms.
        </p>
      </div>
    </PublicLayout>
  );
}

export function RefundPolicyPage() {
  return (
    <PublicLayout
      title="Refund & Cancellation Policy"
      subtitle={`Operated by ${LEGAL_BUSINESS_NAME} · Billing Support: ${SUPPORT_EMAIL}`}
    >
      <div className="apple-card p-6 space-y-4 text-xs text-[#6E6E73] dark:text-[#86868B] leading-relaxed">
        <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
          1. Subscription Cancellation
        </h2>
        <p>
          You may cancel your PRO or ULTRA subscription at any time via Workspace → Plans & Billing.
          Upon cancellation, your workspace will either transition immediately to the FREE tier (if
          within FREE mount limits) or remain active until the end of your current paid billing
          period without further recurring charges.
        </p>
        <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
          2. Refund Eligibility
        </h2>
        <p>
          If you experience a verified technical issue that prevents you from using paid features,
          you may request a refund within 7 days of your initial charge by contacting{' '}
          {SUPPORT_EMAIL} with your Razorpay Payment ID or Invoice ID.
        </p>
      </div>
    </PublicLayout>
  );
}
