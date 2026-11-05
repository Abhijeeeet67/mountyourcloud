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

// Lazy-loaded routes (§1)
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

function RouteLoadingFallback() {
  return (
    <div className="p-6 space-y-3" aria-busy="true" aria-label="Loading page">
      <div className="h-7 w-48 bg-[#131620] border border-[#1E2230] rounded animate-pulse" />
      <div className="h-64 w-full bg-[#131620] border border-[#1E2230] rounded animate-pulse" />
    </div>
  );
}

// Everything under /app redirects to #/auth without a session (§1)
function RequireSession({ children }: { children: React.ReactNode }) {
  const currentAccount = useVaultStore((s) => s.currentAccount);
  if (!currentAccount) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const initialized = useVaultStore((s) => s.initialized);
  const initApp = useVaultStore((s) => s.initApp);

  useEffect(() => {
    initApp();
  }, [initApp]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-[#F3F4F6] flex flex-col items-center justify-center p-6">
        <div className="w-9 h-9 rounded-md bg-[#4F46E5] flex items-center justify-center text-white font-mono text-sm font-bold mb-3">
          MYC
        </div>
        <p className="text-sm font-medium text-[#F3F4F6]">Initializing MountYourClouds Workspace…</p>
        <p className="text-xs font-mono text-[#8A94A6] mt-1">
          Opening IndexedDB (mountyourclouds_db) & verifying deterministic seed
        </p>
      </div>
    );
  }

  return (
    <HashRouter>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />

          {/* Protected /app routes (§1) */}
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
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <ToastViewport />
    </HashRouter>
  );
}
