import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Cloud,
  CreditCard,
  Folder,
  FolderOpen,
  HardDrive,
  Keyboard,
  LayoutDashboard,
  LayoutGrid,
  List,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME } from '../../lib/constants';
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
  const isAdmin = useVaultStore((s) => s.isAdmin);
  const nodes = useVaultStore((s) => s.nodes);
  const mounts = useVaultStore((s) => s.mounts);
  const activity = useVaultStore((s) => s.activity);
  const settings = useVaultStore((s) => s.settings);
  const setTheme = useVaultStore((s) => s.setTheme);
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

  // Global keyboard shortcuts: Ctrl/⌘+K, ?, /
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

  // OS Drag-and-Drop onto workspace
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

  const totalUsedBytes = useMemo(
    () => nodes.reduce((sum, n) => (n.type === 'file' ? sum + n.sizeBytes : sum), 0),
    [nodes]
  );
  const totalAllocatedBytes = useMemo(
    () => mounts.reduce((sum, m) => sum + m.allocatedBytes, 0),
    [mounts]
  );
  const externalCloudCount = Math.max(
    0,
    mounts.filter((m) => m.id !== 'local-vault').length
  );

  const plans = useMemo(() => getEffectivePlans(settings.customPlans), [settings.customPlans]);
  const activePlanId = normalizePlanId(settings.subscription.planId);
  const currentPlan = plans[activePlanId];

  const quotaUsage = useMemo(
    () => computeTransferQuotaUsage(activity, currentPlan),
    [activity, currentPlan]
  );

  const storageRatio = Math.min(1, totalUsedBytes / Math.max(1, totalAllocatedBytes));

  const breadcrumbs = useMemo(() => {
    if (location.pathname.startsWith('/app/files')) {
      return buildBreadcrumbChain(currentFolderId, nodes);
    }
    const routeTitles: Record<string, string> = {
      '/app/overview': 'Overview',
      '/app/starred': 'Starred',
      '/app/trash': 'Trash',
      '/app/providers': 'Cloud Providers',
      '/app/analytics': 'Storage Analytics',
      '/app/pricing': 'Pricing & Billing',
      '/app/settings': 'Settings',
      '/app/admin': 'Admin Console',
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
            className={`group flex items-center gap-1.5 pr-2.5 py-1.5 rounded-lg text-[13px] cursor-pointer select-none ${
              isActive
                ? 'bg-[#0071E3]/15 text-[#0071E3] dark:text-[#0A84FF] font-semibold'
                : 'text-[#6E6E73] dark:text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
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
                className="p-0.5 text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white rounded"
              >
                <ChevronRight
                  className={`w-3.5 h-3.5 tv-transition ${isExpanded ? 'rotate-90' : ''}`}
                />
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            {isActive ? (
              <FolderOpen className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF] shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-[#6E6E73] group-hover:text-[#1D1D1F] dark:group-hover:text-[#F5F5F7] shrink-0" />
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
    { to: '/app/providers', label: 'Cloud Providers', icon: HardDrive },
    { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/app/pricing', label: 'Plans & Billing', icon: CreditCard },
    { to: '/app/settings', label: 'Settings', icon: Settings },
    ...(isAdmin
      ? [{ to: '/app/admin', label: 'Admin Console', icon: ShieldCheck }]
      : []),
  ];

  const isCollapsedDesktop = settings.sidebarCollapsed;
  const mod = modKeySymbol();
  const isDarkTheme = settings.theme === 'dark';

  return (
    <div
      className="min-h-screen flex flex-col bg-[#F5F5F7] dark:bg-[#0B0C10] text-[#1D1D1F] dark:text-[#F5F5F7] tv-transition"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <a
        href="#main-workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#0071E3] focus:text-white focus:rounded-md"
      >
        Skip to main workspace content
      </a>

      {usingMemoryFallback && (
        <div
          role="alert"
          className="bg-[#FF9F0A]/15 border-b border-[#FF9F0A]/40 px-4 py-2 text-xs text-[#D97706] dark:text-[#FFD60A] flex items-center justify-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Storage unavailable — changes won’t survive a reload.</span>
        </div>
      )}

      {versionChangeDetected && (
        <div
          role="alert"
          className="bg-[#FF9F0A]/15 border-b border-[#FF9F0A]/40 px-4 py-2 text-xs text-[#D97706] dark:text-[#FFD60A] flex items-center justify-center gap-3"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Database schema updated in another tab. Please reload to continue.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-2.5 py-0.5 bg-[#FF9F0A] text-black font-medium rounded"
          >
            Reload now
          </button>
        </div>
      )}

      <div className="flex-1 flex min-h-0 relative">
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Sidebar Navigation */}
        <aside
          aria-label="Workspace navigation"
          className={`fixed md:static inset-y-0 left-0 z-40 flex flex-col bg-white/95 dark:bg-[#15171E]/95 backdrop-blur-xl border-r border-black/[0.08] dark:border-white/[0.08] shrink-0 tv-transition ${
            mobileSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'
          } ${isCollapsedDesktop ? 'md:w-16' : 'md:w-16 xl:w-64'}`}
        >
          {/* Brand Row */}
          <div className="h-14 px-3.5 flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08]">
            <Link
              to="/"
              className="flex items-center gap-2.5 text-[#1D1D1F] dark:text-[#F5F5F7] font-semibold tracking-tight whitespace-nowrap overflow-hidden"
            >
              <div className="w-7 h-7 rounded-lg bg-[#0071E3] flex items-center justify-center text-white shadow-xs shrink-0">
                <Cloud className="w-4 h-4" />
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
              className="hidden xl:flex p-1.5 text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] rounded-lg"
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
              className="md:hidden p-1 text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] rounded"
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
                    `flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap tv-transition ${
                      isActive
                        ? 'bg-[#0071E3] text-white shadow-xs'
                        : 'text-[#6E6E73] dark:text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
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
            className={`flex-1 min-h-0 flex flex-col border-t border-black/[0.06] dark:border-white/[0.08] px-2 py-3 overflow-y-auto ${
              isCollapsedDesktop ? 'md:hidden' : 'md:hidden xl:flex'
            }`}
          >
            <div className="px-2 mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6E6E73] dark:text-[#86868B]">
                Folders
              </span>
            </div>
            <div role="tree" aria-label="Folder hierarchy" className="space-y-0.5">
              {renderFolderTreeNodes(null, 0)}
            </div>
          </div>

          {/* Storage & Subscription Footer */}
          <div
            className={`mt-auto border-t border-black/[0.06] dark:border-white/[0.08] p-3.5 bg-[#F5F5F7]/70 dark:bg-[#0B0C10]/70 space-y-2.5 ${
              isCollapsedDesktop ? 'md:hidden' : 'md:hidden xl:block'
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#6E6E73] dark:text-[#86868B] font-medium">
                  Mounted Storage
                </span>
                <span className="font-mono text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
                  {formatBytes(totalUsedBytes)} / {formatBytes(totalAllocatedBytes)}
                </span>
              </div>
              <div className="w-full h-1.5 bg-black/[0.08] dark:bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0071E3] origin-left tv-transition"
                  style={{ transform: `scaleX(${storageRatio})` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-[#6E6E73] dark:text-[#86868B] pt-1 border-t border-black/[0.06] dark:border-white/[0.08] tabular-nums">
              <span>
                <strong className="text-[#1D1D1F] dark:text-[#F5F5F7]">{currentPlan.name}</strong> ·{' '}
                {externalCloudCount}/{currentPlan.maxMounts} clouds
              </span>
              <span>{formatBytes(quotaUsage.dailyRemainingBytes)} left</span>
            </div>

            {currentAccount && (
              <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                    {currentAccount.displayName}
                  </p>
                  <p className="text-[#6E6E73] dark:text-[#86868B] text-[11px] truncate">
                    {currentAccount.email}
                  </p>
                </div>
                <Link
                  to="/app/pricing"
                  className="text-[11px] font-semibold text-[#0071E3] dark:text-[#0A84FF] hover:underline shrink-0"
                >
                  {activePlanId === 'ultra' ? 'Manage' : 'Upgrade'}
                </Link>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#F5F5F7] dark:bg-[#0B0C10]">
          {/* Top Bar */}
          <header className="h-14 px-4 lg:px-6 border-b border-black/[0.08] dark:border-white/[0.08] bg-white/85 dark:bg-[#15171E]/85 backdrop-blur-xl flex items-center justify-between gap-4 shrink-0">
            {/* Zone 1: Mobile Menu Trigger + Breadcrumb */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open navigation drawer"
                className="md:hidden p-1.5 text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] rounded"
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
                          className="w-3.5 h-3.5 text-[#6E6E73] shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      {crumb.isEllipsis ? (
                        <span className="px-1.5 text-[#6E6E73] select-none">…</span>
                      ) : isLast ? (
                        <span
                          className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate max-w-[180px] sm:max-w-[260px]"
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
                          className="text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] truncate max-w-[140px] whitespace-nowrap"
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
                  className="w-3.5 h-3.5 text-[#6E6E73] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
                  className="w-full h-8 pl-8 pr-14 rounded-lg bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] text-[13px] text-[#1D1D1F] dark:text-[#F5F5F7] placeholder-[#6E6E73]"
                />
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  title="Open Command Palette"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[11px] font-mono text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.1] rounded"
                >
                  {mod}K
                </button>
              </div>

              <div
                role="group"
                aria-label="Explorer layout view"
                className="hidden sm:flex items-center p-0.5 rounded-lg bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setExplorerView('table')}
                  aria-label="Table view"
                  aria-pressed={settings.explorerView === 'table'}
                  className={`p-1.5 rounded-md ${
                    settings.explorerView === 'table'
                      ? 'bg-white dark:bg-[#15171E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-2xs'
                      : 'text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setExplorerView('grid')}
                  aria-label="Grid view"
                  aria-pressed={settings.explorerView === 'grid'}
                  className={`p-1.5 rounded-md ${
                    settings.explorerView === 'grid'
                      ? 'bg-white dark:bg-[#15171E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-2xs'
                      : 'text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Zone 3: Theme Toggle + Shortcuts + Upload Button */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
                title="Toggle Light / Dark appearance"
                className="p-2 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              >
                {isDarkTheme ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setShortcutsModalOpen(true)}
                title="Keyboard shortcuts (?)"
                className="hidden sm:flex p-2 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              >
                <Keyboard className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => openUploadModal()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-[13px] font-semibold whitespace-nowrap shrink-0 shadow-xs"
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

        {/* Full-Window Drag-and-Drop Overlay */}
        {isDraggingOverWindow && (
          <div className="fixed inset-0 z-50 bg-black/75 border-2 border-dashed border-[#0071E3] flex flex-col items-center justify-center p-6 pointer-events-none">
            <div className="p-4 rounded-full bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.1] mb-3">
              <Upload className="w-8 h-8 text-[#0071E3]" />
            </div>
            <p className="text-lg font-bold text-white">Drop files to open Upload Configurator</p>
            <p className="text-sm text-gray-300 mt-1">
              Target folder and storage provider mount can be chosen before transfer starts
            </p>
          </div>
        )}

        {/* Global Upgrade Prompt Modal */}
        {upgradePromptReason && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-modal-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setUpgradePromptReason(null);
            }}
          >
            <div className="w-full max-w-lg apple-card overflow-hidden">
              <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#0071E3]" />
                  <h2
                    id="upgrade-modal-title"
                    className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]"
                  >
                    Plan Limit Reached — Upgrade Your Subscription
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setUpgradePromptReason(null)}
                  aria-label="Close upgrade prompt"
                  className="p-1 text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="p-3.5 rounded-xl bg-[#FF9F0A]/15 border border-[#FF9F0A]/30 text-xs text-[#D97706] dark:text-[#FFD60A] leading-relaxed">
                  {upgradePromptReason}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* PRO Recommendation */}
                  <div className="p-4 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-[#0071E3] flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                          {plans.pro.name}
                        </span>
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0071E3] text-white">
                          Most Popular
                        </span>
                      </div>
                      <p className="font-mono text-lg font-bold text-[#0071E3] mt-1">
                        ₹{plans.pro.baseMonthlyInr}/mo
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-[#6E6E73] dark:text-[#86868B]">
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#28CD41] shrink-0" />
                          <span>Up to {plans.pro.maxMounts} cloud accounts</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#28CD41] shrink-0" />
                          <span>{plans.pro.dailyTransferLimitGB} GB/day transfers</span>
                        </li>
                      </ul>
                    </div>
                    {activePlanId !== 'pro' && activePlanId !== 'ultra' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await switchSubscriptionPlan('pro', settings.subscription.billingCycle);
                          setUpgradePromptReason(null);
                        }}
                        className="w-full py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold"
                      >
                        Upgrade to PRO
                      </button>
                    )}
                  </div>

                  {/* ULTRA Premium */}
                  <div className="p-4 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-[#FF9F0A]/50 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                          {plans.ultra.name}
                        </span>
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#FF9F0A]/20 text-[#D97706] dark:text-[#FFD60A]">
                          Premium Tier
                        </span>
                      </div>
                      <p className="font-mono text-lg font-bold text-[#D97706] dark:text-[#FFD60A] mt-1">
                        ₹{plans.ultra.baseMonthlyInr}/mo
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-[#6E6E73] dark:text-[#86868B]">
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#28CD41] shrink-0" />
                          <span>Up to {plans.ultra.maxMounts} cloud accounts</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#28CD41] shrink-0" />
                          <span>{plans.ultra.dailyTransferLimitGB} GB/day transfers</span>
                        </li>
                      </ul>
                    </div>
                    {activePlanId !== 'ultra' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await switchSubscriptionPlan('ultra', settings.subscription.billingCycle);
                          setUpgradePromptReason(null);
                        }}
                        className="w-full py-2 rounded-xl bg-[#FF9F0A] hover:bg-[#D97706] text-black text-xs font-bold"
                      >
                        Upgrade to ULTRA
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setUpgradePromptReason(null)}
                    className="text-xs text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUpgradePromptReason(null);
                      navigate('/app/pricing');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0071E3] hover:underline"
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
