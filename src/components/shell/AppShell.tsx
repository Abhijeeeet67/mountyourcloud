import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Folder,
  FolderOpen,
  HardDrive,
  Keyboard,
  LayoutDashboard,
  LayoutGrid,
  List,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME, PROTOTYPE_BADGE_TEXT } from '../../lib/constants';
import { formatBytes, modKeySymbol } from '../../lib/format';
import {
  computeTransferQuotaUsage,
  getEffectivePlans,
  normalizePlanId,
} from '../../lib/pricing';
import { isEffectivelyTrashed } from '../../storage/repository';
import { buildBreadcrumbChain, useVaultStore } from '../../store/useVaultStore';
import type { FolderNode } from '../../types/domain';

export function AppShell({ children }: { children?: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const usingMemoryFallback = useVaultStore((s) => s.usingMemoryFallback);
  const versionChangeDetected = useVaultStore((s) => s.versionChangeDetected);
  const currentAccount = useVaultStore((s) => s.currentAccount);
  const nodes = useVaultStore((s) => s.nodes);
  const mounts = useVaultStore((s) => s.mounts);
  const activity = useVaultStore((s) => s.activity);
  const settings = useVaultStore((s) => s.settings);
  const currentFolderId = useVaultStore((s) => s.currentFolderId);
  const searchQuery = useVaultStore((s) => s.searchQuery);
  const setSearchQuery = useVaultStore((s) => s.setSearchQuery);
  const expandedTreeFolderIds = useVaultStore((s) => s.expandedTreeFolderIds);
  const toggleTreeFolder = useVaultStore((s) => s.toggleTreeFolder);
  const setExplorerView = useVaultStore((s) => s.setExplorerView);
  const toggleSidebarCollapsed = useVaultStore((s) => s.toggleSidebarCollapsed);
  const setCommandPaletteOpen = useVaultStore((s) => s.setCommandPaletteOpen);
  const setShortcutsModalOpen = useVaultStore((s) => s.setShortcutsModalOpen);
  const openUploadModal = useVaultStore((s) => s.openUploadModal);
  const mobileSidebarOpen = useVaultStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useVaultStore((s) => s.setMobileSidebarOpen);
  const upgradePromptReason = useVaultStore((s) => s.upgradePromptReason);
  const setUpgradePromptReason = useVaultStore((s) => s.setUpgradePromptReason);
  const switchSubscriptionPlan = useVaultStore((s) => s.switchSubscriptionPlan);
  const addToast = useVaultStore((s) => s.addToast);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOverWindow, setIsDraggingOverWindow] = useState(false);
  const dragDepthRef = useRef(0);

  // Global keyboard shortcuts: Ctrl/⌘+K, ?, / (§6)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!useVaultStore.getState().commandPaletteOpen);
        return;
      }

      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (inInput) return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsModalOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCommandPaletteOpen, setShortcutsModalOpen]);

  // OS Drag-and-Drop onto workspace (§5)
  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingOverWindow(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingOverWindow(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingOverWindow(false);

    const items = Array.from(e.dataTransfer.items || []);
    const allFiles: File[] = [];

    const traverseFileTree = async (item: any): Promise<File[]> => {
      const files: File[] = [];
      if (!item) return files;
      if (item.isFile) {
        const file: File = await new Promise((resolve, reject) => {
          item.file(resolve, reject);
        });
        files.push(file);
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const readEntries = (): Promise<any[]> => {
          return new Promise((resolve, reject) => {
            dirReader.readEntries(resolve, reject);
          });
        };
        let entries = await readEntries();
        while (entries.length > 0) {
          for (const entry of entries) {
            const subFiles = await traverseFileTree(entry);
            files.push(...subFiles);
          }
          entries = await readEntries();
        }
      }
      return files;
    };

    if (items.length > 0) {
      for (const item of items) {
        if (item.kind === 'file') {
          const entry = (item as unknown as { webkitGetAsEntry?: () => any }).webkitGetAsEntry?.();
          if (entry) {
            const files = await traverseFileTree(entry);
            allFiles.push(...files);
          } else {
            const f = item.getAsFile();
            if (f) allFiles.push(f);
          }
        }
      }
    } else {
      allFiles.push(...Array.from(e.dataTransfer.files));
    }

    if (allFiles.length > 0) {
      addToast({
        title: `Loaded ${allFiles.length} file(s) from drop`,
        variant: 'success',
      });
      openUploadModal(allFiles);
    }
  };

  // Folder tree structure for sidebar (`role="tree"`)
  const activeFoldersByParent = useMemo(() => {
    const map = new Map(nodes.map((n) => [n.id, n]));
    const byParent = new Map<string | null, FolderNode[]>();
    for (const n of nodes) {
      if (n.type === 'folder' && !isEffectivelyTrashed(n, map)) {
        const list = byParent.get(n.parentId) ?? [];
        list.push(n);
        byParent.set(n.parentId, list);
      }
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return byParent;
  }, [nodes]);

  // External Cloud Storage Capacity & Platform Plan Quota calculations
  const totalUsedBytes = useMemo(
    () => nodes.reduce((sum, n) => (n.type === 'file' ? sum + n.sizeBytes : sum), 0),
    [nodes]
  );
  const totalAllocatedBytes = useMemo(
    () => mounts.reduce((sum, m) => sum + m.allocatedBytes, 0),
    [mounts]
  );
  const externalCloudCount = Math.max(0, mounts.length - 1);

  const plans = useMemo(() => getEffectivePlans(settings.customPlans), [settings.customPlans]);
  const activePlanId = normalizePlanId(settings.subscription.planId);
  const currentPlan = plans[activePlanId];

  const quotaUsage = useMemo(
    () => computeTransferQuotaUsage(activity, currentPlan),
    [activity, currentPlan]
  );

  const storageRatio = Math.min(1, totalUsedBytes / Math.max(1, totalAllocatedBytes));

  // Breadcrumb calculation & collapse middle segments beyond 4 (§6)
  const breadcrumbs = useMemo(() => {
    if (location.pathname.startsWith('/app/files')) {
      return buildBreadcrumbChain(currentFolderId, nodes);
    }
    const routeTitles: Record<string, string> = {
      '/app/overview': 'Overview',
      '/app/starred': 'Starred',
      '/app/trash': 'Trash',
      '/app/providers': 'Provider Mounts',
      '/app/analytics': 'Storage Analytics',
      '/app/pricing': 'Pricing & Plans',
      '/app/settings': 'Settings',
    };
    const title = routeTitles[location.pathname] ?? 'Workspace';
    return [{ id: null, name: title }];
  }, [location.pathname, currentFolderId, nodes]);

  const collapsedBreadcrumbs = useMemo(() => {
    if (breadcrumbs.length <= 4) {
      return breadcrumbs.map((b) => ({ ...b, isEllipsis: false }));
    }
    return [
      { ...breadcrumbs[0], isEllipsis: false },
      { id: '__ellipsis__', name: '…', isEllipsis: true },
      { ...breadcrumbs[breadcrumbs.length - 2], isEllipsis: false },
      { ...breadcrumbs[breadcrumbs.length - 1], isEllipsis: false },
    ];
  }, [breadcrumbs]);

  const renderFolderTreeNodes = (parentId: string | null, depth: number) => {
    const folders = activeFoldersByParent.get(parentId) ?? [];
    if (folders.length === 0) return null;

    return folders.map((fld) => {
      const children = activeFoldersByParent.get(fld.id) ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = expandedTreeFolderIds.includes(fld.id);
      const isActive =
        location.pathname === `/app/files/${fld.id}` || currentFolderId === fld.id;

      return (
        <div key={fld.id} role="none">
          <div
            role="treeitem"
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={isActive}
            tabIndex={0}
            style={{ paddingLeft: `${10 + depth * 14}px` }}
            onClick={() => {
              navigate(`/app/files/${fld.id}`);
              setMobileSidebarOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(`/app/files/${fld.id}`);
              } else if (e.key === 'ArrowRight' && hasChildren && !isExpanded) {
                e.preventDefault();
                toggleTreeFolder(fld.id, true);
              } else if (e.key === 'ArrowLeft' && hasChildren && isExpanded) {
                e.preventDefault();
                toggleTreeFolder(fld.id, false);
              }
            }}
            className={`group flex items-center gap-1.5 pr-2.5 py-1.5 rounded-md text-[13px] cursor-pointer select-none ${
              isActive
                ? 'bg-[#1E2230] text-[#F3F4F6] font-medium'
                : 'text-[#8A94A6] hover:text-[#F3F4F6] hover:bg-[#131620]'
            }`}
          >
            {hasChildren ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label={isExpanded ? `Collapse ${fld.name}` : `Expand ${fld.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTreeFolder(fld.id);
                }}
                className="p-0.5 text-[#8A94A6] hover:text-white rounded"
              >
                <ChevronRight
                  className={`w-3.5 h-3.5 tv-transition ${isExpanded ? 'rotate-90' : ''}`}
                />
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            {isActive ? (
              <FolderOpen className="w-3.5 h-3.5 text-[#818CF8] shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-[#8A94A6] group-hover:text-[#F3F4F6] shrink-0" />
            )}
            <span className="truncate">{fld.name}</span>
          </div>
          {hasChildren && isExpanded && (
            <div role="group">{renderFolderTreeNodes(fld.id, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const navItems = [
    { to: '/app/overview', label: 'Overview', icon: LayoutDashboard },
    { to: '/app/files', label: 'All Files', icon: Folder },
    { to: '/app/starred', label: 'Starred', icon: Star },
    { to: '/app/trash', label: 'Trash', icon: Trash2 },
    { to: '/app/providers', label: 'Providers', icon: HardDrive },
    { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/app/pricing', label: 'Pricing & Plans', icon: CreditCard },
    { to: '/app/settings', label: 'Settings', icon: Settings },
  ];

  const isCollapsedDesktop = settings.sidebarCollapsed;
  const mod = modKeySymbol();

  return (
    <div
      className="min-h-screen flex flex-col bg-[#090A0F] text-[#F3F4F6]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Accessibility Skip Link (§10) */}
      <a
        href="#main-workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#4F46E5] focus:text-white focus:rounded-md"
      >
        Skip to main workspace content
      </a>

      {/* Amber Fallback or Version Change Banners (§3) */}
      {usingMemoryFallback && (
        <div
          role="alert"
          className="bg-[#F59E0B]/15 border-b border-[#F59E0B]/40 px-4 py-2 text-xs text-[#F59E0B] flex items-center justify-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Storage unavailable — changes won’t survive a reload.</span>
        </div>
      )}

      {versionChangeDetected && (
        <div
          role="alert"
          className="bg-[#F59E0B]/15 border-b border-[#F59E0B]/40 px-4 py-2 text-xs text-[#F59E0B] flex items-center justify-center gap-3"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Database schema updated in another tab. Please reload to continue.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-2.5 py-0.5 bg-[#F59E0B] text-black font-medium rounded"
          >
            Reload now
          </button>
        </div>
      )}

      {/* Permanent Prototype Honesty Bar (§0) */}
      <div className="bg-[#090A0F] border-b border-[#1E2230] px-4 py-1.5 flex items-center justify-between gap-4 text-[12px]">
        <div className="flex items-center gap-2 text-[#8A94A6] truncate">
          <span className="inline-block w-2 h-2 rounded-full bg-[#818CF8] shrink-0" />
          <span className="font-mono text-[11px] text-[#F3F4F6] truncate">
            {PROTOTYPE_BADGE_TEXT}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-[#8A94A6] shrink-0">
          {settings.devSettings.offline && (
            <span className="text-[#F43F5E] font-mono">Offline Simulation Active</span>
          )}
          {settings.devSettings.failureRate > 0 && (
            <span className="text-[#F59E0B] font-mono">
              Fault Rate: {settings.devSettings.failureRate}%
            </span>
          )}
          <button
            type="button"
            onClick={() => setShortcutsModalOpen(true)}
            className="hover:text-[#F3F4F6] flex items-center gap-1"
            aria-label="Open keyboard shortcuts"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Shortcuts (?)</span>
          </button>
        </div>
      </div>

      {/* Main Flex Shell */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Mobile Slide-Over Backdrop (<768px) */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/70 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Sidebar Navigation */}
        <aside
          aria-label="Workspace navigation"
          className={`fixed md:static inset-y-0 left-0 z-40 flex flex-col bg-[#090A0F] border-r border-[#1E2230] shrink-0 tv-transition ${
            mobileSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'
          } ${isCollapsedDesktop ? 'md:w-16' : 'md:w-16 xl:w-64'}`}
        >
          {/* Brand Row */}
          <div className="h-14 px-3.5 flex items-center justify-between border-b border-[#1E2230]">
            <Link
              to="/"
              className="flex items-center gap-2.5 text-[#F3F4F6] font-bold tracking-tight whitespace-nowrap overflow-hidden"
            >
              <div className="w-7 h-7 rounded-md bg-[#4F46E5] flex items-center justify-center text-white font-mono text-xs font-bold shrink-0">
                MC
              </div>
              <span
                className={`text-[15px] ${
                  isCollapsedDesktop ? 'md:hidden' : 'md:hidden xl:inline'
                }`}
              >
                {APP_NAME}
              </span>
            </Link>

            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              aria-label={isCollapsedDesktop ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden xl:flex p-1.5 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
            >
              {isCollapsedDesktop ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close navigation menu"
              className="md:hidden p-1 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Nav Links */}
          <nav className="p-2 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileSidebarOpen(false)}
                  title={item.label}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-2.5 py-2 rounded-md text-[13px] font-medium whitespace-nowrap ${
                      isActive
                        ? 'bg-[#131620] text-[#818CF8] border border-[#1E2230]'
                        : 'text-[#8A94A6] hover:text-[#F3F4F6] hover:bg-[#131620]/60 border border-transparent'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span
                    className={`${
                      isCollapsedDesktop ? 'md:hidden' : 'md:hidden xl:inline'
                    }`}
                  >
                    {item.label}
                  </span>
                </NavLink>
              );
            })}
          </nav>

          {/* Folder Tree Section */}
          <div
            className={`flex-1 min-h-0 flex flex-col border-t border-[#1E2230] px-2 py-3 overflow-y-auto ${
              isCollapsedDesktop ? 'md:hidden' : 'md:hidden xl:flex'
            }`}
          >
            <div className="px-2 mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#8A94A6]">Folders</span>
            </div>
            <div role="tree" aria-label="Folder hierarchy" className="space-y-0.5">
              {renderFolderTreeNodes(null, 0)}
            </div>
          </div>

          {/* External Cloud Storage & Platform Subscription Footer */}
          <div
            className={`mt-auto border-t border-[#1E2230] p-3 bg-[#0E1017] space-y-2.5 ${
              isCollapsedDesktop ? 'md:hidden' : 'md:hidden xl:block'
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#8A94A6] font-medium">Mounted Storage</span>
                <span className="font-mono text-[#F3F4F6] tabular-nums">
                  {formatBytes(totalUsedBytes)} / {formatBytes(totalAllocatedBytes)}
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#131620] rounded-full overflow-hidden border border-[#1E2230]">
                <div
                  className="h-full bg-[#4F46E5] origin-left tv-transition"
                  style={{ transform: `scaleX(${storageRatio})` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-[#8A94A6] pt-1 border-t border-[#1E2230]/60 tabular-nums">
              <span>
                <strong className="text-[#F3F4F6]">{currentPlan.name}</strong> · {externalCloudCount}/
                {currentPlan.maxMounts} clouds
              </span>
              <span>{formatBytes(quotaUsage.dailyRemainingBytes)} left today</span>
            </div>

            {currentAccount && (
              <div className="pt-2 border-t border-[#1E2230] flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-[#F3F4F6] truncate">
                    {currentAccount.displayName}
                  </p>
                  <p className="text-[#8A94A6] text-[11px] truncate">{currentAccount.email}</p>
                </div>
                <Link
                  to="/app/pricing"
                  className="text-[11px] font-medium text-[#818CF8] hover:underline shrink-0"
                >
                  {activePlanId === 'ultra' ? 'Manage' : 'Upgrade'}
                </Link>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0E1017]">
          {/* 3-Zone Top Bar */}
          <header className="h-14 px-4 lg:px-6 border-b border-[#1E2230] bg-[#090A0F] flex items-center justify-between gap-4 shrink-0">
            {/* Zone 1: Mobile Menu Trigger + Breadcrumb */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open navigation drawer"
                className="md:hidden p-1.5 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
              >
                <Menu className="w-4 h-4" />
              </button>

              <nav aria-label="Breadcrumb" className="flex items-center gap-1 min-w-0 text-[13px]">
                {collapsedBreadcrumbs.map((crumb, idx) => {
                  const isLast = idx === collapsedBreadcrumbs.length - 1;
                  return (
                    <React.Fragment key={`${crumb.id ?? 'root'}-${idx}`}>
                      {idx > 0 && (
                        <ChevronRight
                          className="w-3.5 h-3.5 text-[#8A94A6] shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      {crumb.isEllipsis ? (
                        <span className="px-1.5 text-[#8A94A6] select-none">…</span>
                      ) : isLast ? (
                        <span
                          className="font-medium text-[#F3F4F6] truncate max-w-[180px] sm:max-w-[260px]"
                          aria-current="page"
                        >
                          {crumb.name}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(crumb.id ? `/app/files/${crumb.id}` : '/app/files')
                          }
                          className="text-[#8A94A6] hover:text-[#F3F4F6] truncate max-w-[140px] whitespace-nowrap"
                        >
                          {crumb.name}
                        </button>
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>
            </div>

            {/* Zone 2: Search Input + Explorer View Toggle */}
            <div className="flex items-center gap-2 flex-1 max-w-md justify-center">
              <div className="relative flex-1 min-w-[140px]">
                <Search
                  className="w-3.5 h-3.5 text-[#8A94A6] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (
                      !location.pathname.startsWith('/app/files') &&
                      !location.pathname.startsWith('/app/starred') &&
                      !location.pathname.startsWith('/app/trash')
                    ) {
                      navigate('/app/files');
                    }
                  }}
                  placeholder={`Search files (/) or ${mod}K…`}
                  aria-label="Filter files by name"
                  className="w-full h-8 pl-8 pr-14 rounded-md bg-[#131620] border border-[#1E2230] text-[13px] text-[#F3F4F6] placeholder-[#8A94A6]"
                />
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  title="Open Command Palette"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[11px] font-mono text-[#8A94A6] hover:text-[#F3F4F6] bg-[#090A0F] border border-[#1E2230] rounded"
                >
                  {mod}K
                </button>
              </div>

              <div
                role="group"
                aria-label="Explorer layout view"
                className="hidden sm:flex items-center p-0.5 rounded-md bg-[#131620] border border-[#1E2230] shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setExplorerView('table')}
                  aria-label="Table view"
                  aria-pressed={settings.explorerView === 'table'}
                  className={`p-1.5 rounded ${
                    settings.explorerView === 'table'
                      ? 'bg-[#1E2230] text-[#F3F4F6]'
                      : 'text-[#8A94A6] hover:text-[#F3F4F6]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setExplorerView('grid')}
                  aria-label="Grid view"
                  aria-pressed={settings.explorerView === 'grid'}
                  className={`p-1.5 rounded ${
                    settings.explorerView === 'grid'
                      ? 'bg-[#1E2230] text-[#F3F4F6]'
                      : 'text-[#8A94A6] hover:text-[#F3F4F6]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Zone 3: 1 Primary Action (Upload Button) */}
            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={() => openUploadModal()}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[13px] font-medium whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Upload</span>
              </button>
            </div>
          </header>

          {/* Main Workspace Viewport */}
          <main
            id="main-workspace-content"
            className="flex-1 flex flex-col min-h-0 relative overflow-y-auto"
          >
            {children ?? <Outlet />}
          </main>
        </div>

        {/* Full-Window Drag-and-Drop Overlay (§5) */}
        {isDraggingOverWindow && (
          <div className="fixed inset-0 z-50 bg-[#090A0F]/85 border-2 border-dashed border-[#818CF8] flex flex-col items-center justify-center p-6 pointer-events-none">
            <div className="p-4 rounded-full bg-[#131620] border border-[#1E2230] mb-3">
              <Upload className="w-8 h-8 text-[#818CF8]" />
            </div>
            <p className="text-lg font-bold text-[#F3F4F6]">Drop files to open Upload Configurator</p>
            <p className="text-sm text-[#8A94A6] mt-1">
              Target folder and storage provider mount can be chosen before transfer starts
            </p>
          </div>
        )}

        {/* Global Conversion-Focused Upgrade Prompt Modal (Requirement 8) */}
        {upgradePromptReason && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-modal-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setUpgradePromptReason(null);
            }}
          >
            <div className="w-full max-w-lg rounded-lg bg-[#131620] border border-[#818CF8] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1E2230] flex items-center justify-between bg-[#090A0F]">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#818CF8]" />
                  <h2 id="upgrade-modal-title" className="text-[15px] font-bold text-[#F3F4F6]">
                    Plan Limit Reached — Upgrade Your Subscription
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setUpgradePromptReason(null)}
                  aria-label="Close upgrade prompt"
                  className="p-1 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="p-3.5 rounded-md bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-xs text-[#F59E0B] leading-relaxed">
                  {upgradePromptReason}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* PRO Recommendation */}
                  <div className="p-4 rounded-lg bg-[#0E1017] border border-[#818CF8] flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-[#F3F4F6]">{plans.pro.name}</span>
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#4F46E5] text-white">
                          Most Popular
                        </span>
                      </div>
                      <p className="font-mono text-lg font-bold text-[#818CF8] mt-1">
                        ₹{plans.pro.baseMonthlyInr}/mo
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-[#8A94A6]">
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          <span>Up to {plans.pro.maxMounts} cloud accounts</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          <span>{plans.pro.dailyTransferLimitGB} GB/day transfers</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          <span>Auto-organization & schedules</span>
                        </li>
                      </ul>
                    </div>
                    {activePlanId !== 'pro' && activePlanId !== 'ultra' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await switchSubscriptionPlan('pro', settings.subscription.billingCycle);
                          setUpgradePromptReason(null);
                          addToast({
                            title: 'Upgraded workspace to PRO (₹199/mo)',
                            variant: 'success',
                          });
                        }}
                        className="w-full py-1.5 rounded bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium"
                      >
                        Instant Upgrade to PRO
                      </button>
                    )}
                  </div>

                  {/* ULTRA Premium */}
                  <div className="p-4 rounded-lg bg-[#0E1017] border border-[#F59E0B]/50 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-[#F3F4F6]">{plans.ultra.name}</span>
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40">
                          Premium Tier
                        </span>
                      </div>
                      <p className="font-mono text-lg font-bold text-[#F59E0B] mt-1">
                        ₹{plans.ultra.baseMonthlyInr}/mo
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-[#8A94A6]">
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          <span>Up to {plans.ultra.maxMounts} cloud accounts</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          <span>{plans.ultra.dailyTransferLimitGB} GB/day transfers</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          <span>Cross-cloud sync & max priority</span>
                        </li>
                      </ul>
                    </div>
                    {activePlanId !== 'ultra' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await switchSubscriptionPlan('ultra', settings.subscription.billingCycle);
                          setUpgradePromptReason(null);
                          addToast({
                            title: 'Upgraded workspace to ULTRA (₹499/mo)',
                            variant: 'success',
                          });
                        }}
                        className="w-full py-1.5 rounded bg-[#F59E0B] hover:bg-[#D97706] text-black text-xs font-bold"
                      >
                        Instant Upgrade to ULTRA
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#1E2230]">
                  <button
                    type="button"
                    onClick={() => setUpgradePromptReason(null)}
                    className="text-xs text-[#8A94A6] hover:text-[#F3F4F6]"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUpgradePromptReason(null);
                      navigate('/app/pricing');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#818CF8] hover:underline"
                  >
                    <span>Compare all plans & quotas</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
