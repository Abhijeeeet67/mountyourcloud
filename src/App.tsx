/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FilePreviewModal } from './components/explorer/FileInspectorAndPreview';
import {
  MoveModal,
  NewFolderModal,
  RenameModal,
} from './components/explorer/FileModals';
import { AppShell } from './components/shell/AppShell';
import { CommandPalette } from './components/shell/CommandPalette';
import { ShortcutsModal } from './components/shell/ShortcutsModal';
import { ToastViewport } from './components/shell/ToastViewport';
import { TransferTray } from './components/uploads/TransferTray';
import { UploadConfiguratorModal } from './components/uploads/UploadConfiguratorModal';
import { useVaultStore } from './store/useVaultStore';

// Lazy-loaded routes
const LandingPage = lazy(() =>
  import('./pages/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const AuthPage = lazy(() =>
  import('./pages/AuthPage').then((m) => ({ default: m.AuthPage }))
);
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage }))
);
const ExplorerPage = lazy(() =>
  import('./pages/ExplorerPage').then((m) => ({ default: m.ExplorerPage }))
);
const ProvidersPage = lazy(() =>
  import('./pages/ProvidersPage').then((m) => ({ default: m.ProvidersPage }))
);
const AnalyticsPage = lazy(() =>
  import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
);
const PricingPage = lazy(() =>
  import('./pages/PricingPage').then((m) => ({ default: m.PricingPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage }))
);

// Public Marketing, Documentation & Legal Routes
const FeaturesPublicPage = lazy(() =>
  import('./pages/PublicPages').then((m) => ({ default: m.FeaturesPublicPage }))
);
const HowItWorksPublicPage = lazy(() =>
  import('./pages/PublicPages').then((m) => ({ default: m.HowItWorksPublicPage }))
);
const IntegrationsPublicPage = lazy(() =>
  import('./pages/PublicPages').then((m) => ({ default: m.IntegrationsPublicPage }))
);
const PricingPublicPage = lazy(() =>
  import('./pages/PublicPages').then((m) => ({ default: m.PricingPublicPage }))
);
const SecurityPublicPage = lazy(() =>
  import('./pages/PublicPages').then((m) => ({ default: m.SecurityPublicPage }))
);
const FaqPublicPage = lazy(() =>
  import('./pages/PublicPages').then((m) => ({ default: m.FaqPublicPage }))
);
const ContactPublicPage = lazy(() =>
  import('./pages/PublicPages').then((m) => ({ default: m.ContactPublicPage }))
);
const PrivacyPolicyPage = lazy(() =>
  import('./pages/PublicPages').then((m) => ({ default: m.PrivacyPolicyPage }))
);
const TermsOfServicePage = lazy(() =>
  import('./pages/PublicPages').then((m) => ({ default: m.TermsOfServicePage }))
);
const RefundPolicyPage = lazy(() =>
  import('./pages/PublicPages').then((m) => ({ default: m.RefundPolicyPage }))
);

function RouteLoadingFallback() {
  return (
    <div className="p-6 space-y-3" aria-busy="true" aria-label="Loading page">
      <div className="h-7 w-48 bg-black/[0.05] dark:bg-white/[0.05] rounded-xl animate-pulse" />
      <div className="h-64 w-full bg-black/[0.05] dark:bg-white/[0.05] rounded-xl animate-pulse" />
    </div>
  );
}

// Everything under /app redirects to #/auth without an authenticated session
function RequireSession({ children }: { children: React.ReactNode }) {
  const currentAccount = useVaultStore((s) => s.currentAccount);
  if (!currentAccount) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0B0C10] text-[#1D1D1F] dark:text-[#F5F5F7] flex flex-col items-center justify-center p-6">
          <div className="max-w-md w-full apple-card p-6 space-y-4 text-center">
            <h1 className="text-base font-bold">Workspace Recovery</h1>
            <p className="text-xs text-[#6E6E73] dark:text-[#86868B]">
              {this.state.error.message || 'An unexpected UI error occurred.'}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                window.location.hash = '#/';
              }}
              className="px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const initialized = useVaultStore((s) => s.initialized);
  const initApp = useVaultStore((s) => s.initApp);

  useEffect(() => {
    initApp().catch((err) => {
      console.error('Initialization error:', err);
    });
  }, [initApp]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0B0C10] text-[#1D1D1F] dark:text-[#F5F5F7] flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 rounded-xl bg-[#0071E3] flex items-center justify-center text-white font-mono text-sm font-bold mb-3 shadow-sm">
          MYC
        </div>
        <p className="text-sm font-semibold">Initializing MountYourClouds…</p>
        <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-1">
          Every cloud. One place.
        </p>
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <HashRouter>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            {/* Public Website & Legal Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/features" element={<FeaturesPublicPage />} />
            <Route path="/how-it-works" element={<HowItWorksPublicPage />} />
            <Route path="/integrations" element={<IntegrationsPublicPage />} />
            <Route path="/pricing" element={<PricingPublicPage />} />
            <Route path="/security" element={<SecurityPublicPage />} />
            <Route path="/faq" element={<FaqPublicPage />} />
            <Route path="/contact" element={<ContactPublicPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/refund-policy" element={<RefundPolicyPage />} />

            {/* Protected /app routes */}
            <Route
              path="/app"
              element={
                <RequireSession>
                  <AppShell />
                  <CommandPalette />
                  <ShortcutsModal />
                  <UploadConfiguratorModal />
                  <FilePreviewModal />
                  <NewFolderModal />
                  <RenameModal />
                  <MoveModal />
                  <TransferTray />
                </RequireSession>
              }
            >
              <Route index element={<Navigate to="/app/overview" replace />} />
              <Route path="overview" element={<OverviewPage />} />
              <Route path="files" element={<ExplorerPage mode="files" />} />
              <Route path="files/:folderId" element={<ExplorerPage mode="files" />} />
              <Route path="starred" element={<ExplorerPage mode="starred" />} />
              <Route path="trash" element={<ExplorerPage mode="trash" />} />
              <Route path="providers" element={<ProvidersPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="pricing" element={<PricingPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <ToastViewport />
      </HashRouter>
    </AppErrorBoundary>
  );
}
