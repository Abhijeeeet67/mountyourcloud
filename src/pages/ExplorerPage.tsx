import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Download,
  Eye,
  FolderPlus,
  MoveRight,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FileInspector,
  getNodeIcon,
} from '../components/explorer/FileInspectorAndPreview';
import {
  FILE_CATEGORIES,
  PROVIDER_KIND_META,
  getFileCategory,
} from '../lib/constants';
import {
  formatBytes,
  formatFullTimestamp,
  formatRelativeOrShortDate,
} from '../lib/format';
import { storageOrchestrator } from '../storage/orchestrator';
import { isEffectivelyTrashed, vaultRepository } from '../storage/repository';
import { useVaultStore } from '../store/useVaultStore';
import type { FileNode, SortField, VaultNode } from '../types/domain';

function GridCardThumbnail({ node }: { node: VaultNode }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const Icon = getNodeIcon(node);

  useEffect(() => {
    let activeUrl: string | null = null;
    let cancelled = false;
    if (node.type === 'file' && node.hasThumb) {
      vaultRepository.getThumb(node.id).then((blob) => {
        if (!cancelled && blob) {
          activeUrl = URL.createObjectURL(blob);
          setThumbUrl(activeUrl);
        }
      });
    } else {
      setThumbUrl(null);
    }
    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [node]);

  if (thumbUrl) {
    return (
      <div className="h-28 w-full bg-[#090A0F] border-b border-[#1E2230] overflow-hidden flex items-center justify-center">
        <img
          src={thumbUrl}
          alt={node.name}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="h-28 w-full bg-[#090A0F] border-b border-[#1E2230] flex items-center justify-center">
      <Icon
        className={`w-9 h-9 ${
          node.type === 'folder' ? 'text-[#818CF8]' : 'text-[#8A94A6]'
        }`}
      />
    </div>
  );
}

export function ExplorerPage({ mode }: { mode: 'files' | 'starred' | 'trash' }) {
  const { folderId } = useParams<{ folderId?: string }>();
  const navigate = useNavigate();

  const nodes = useVaultStore((s) => s.nodes);
  const mounts = useVaultStore((s) => s.mounts);
  const settings = useVaultStore((s) => s.settings);
  const selectedNodeIds = useVaultStore((s) => s.selectedNodeIds);
  const focusedNodeId = useVaultStore((s) => s.focusedNodeId);
  const searchQuery = useVaultStore((s) => s.searchQuery);
  const categoryFilter = useVaultStore((s) => s.categoryFilter);
  const providerFilter = useVaultStore((s) => s.providerFilter);

  const setCurrentFolderId = useVaultStore((s) => s.setCurrentFolderId);
  const setSelectedNodeIds = useVaultStore((s) => s.setSelectedNodeIds);
  const setFocusedNodeId = useVaultStore((s) => s.setFocusedNodeId);
  const setCategoryFilter = useVaultStore((s) => s.setCategoryFilter);
  const setProviderFilter = useVaultStore((s) => s.setProviderFilter);
  const setSorting = useVaultStore((s) => s.setSorting);
  const toggleInspectorOpen = useVaultStore((s) => s.toggleInspectorOpen);
  const openUploadModal = useVaultStore((s) => s.openUploadModal);
  const setNewFolderModalOpen = useVaultStore((s) => s.setNewFolderModalOpen);
  const setRenameNodeId = useVaultStore((s) => s.setRenameNodeId);
  const setMoveModalNodeIds = useVaultStore((s) => s.setMoveModalNodeIds);
  const setPreviewFileId = useVaultStore((s) => s.setPreviewFileId);
  const addToast = useVaultStore((s) => s.addToast);

  // 300ms minimum loading skeleton on navigation (§6)
  const [navLoading, setNavLoading] = useState(true);
  const [confirmPurgeIds, setConfirmPurgeIds] = useState<string[] | null>(null);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [transferCloudNodeIds, setTransferCloudNodeIds] = useState<string[] | null>(null);
  const [transferTargetProviderId, setTransferTargetProviderId] = useState<string>('mega-vault');
  const [organizing, setOrganizing] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: VaultNode;
  } | null>(null);

  const lastClickedIdRef = useRef<string | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Validate folderId in 'files' mode: unknown or trashed folderId redirects to root with toast (§1)
  useEffect(() => {
    setNavLoading(true);
    const timer = setTimeout(() => setNavLoading(false), 310);

    if (mode === 'files') {
      if (folderId) {
        const map = new Map(nodes.map((n) => [n.id, n]));
        const target = map.get(folderId);
        if (!target || target.type !== 'folder' || isEffectivelyTrashed(target, map)) {
          addToast({
            title: 'Folder not found or in Trash',
            description: 'Redirected to All Files root.',
            variant: 'warning',
          });
          setCurrentFolderId(null);
          navigate('/app/files', { replace: true });
        } else {
          setCurrentFolderId(folderId);
        }
      } else {
        setCurrentFolderId(null);
      }
    } else {
      setCurrentFolderId(null);
    }

    return () => clearTimeout(timer);
  }, [mode, folderId, nodes, navigate, setCurrentFolderId, addToast]);

  // Close context menu on outside click or scroll
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  const mountMap = useMemo(() => new Map(mounts.map((m) => [m.id, m])), [mounts]);

  // Filter & Sort visible items (Folders sort first, §6)
  const visibleNodes = useMemo(() => {
    const map = new Map(nodes.map((n) => [n.id, n]));
    let list: VaultNode[] = [];

    if (mode === 'trash') {
      // Trash view lists nodes that have trashedAt set directly (§4)
      list = nodes.filter((n) => n.trashedAt !== null);
    } else if (mode === 'starred') {
      list = nodes.filter((n) => n.starred && !isEffectivelyTrashed(n, map));
    } else {
      const targetParent = folderId ?? null;
      list = nodes.filter((n) => {
        if (isEffectivelyTrashed(n, map)) return false;
        // When searchQuery is active in files view, search across all non-trashed items; otherwise current folder
        if (searchQuery.trim().length > 0) return true;
        return n.parentId === targetParent;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((n) => n.name.toLowerCase().includes(q));
    }

    if (categoryFilter !== 'all') {
      list = list.filter((n) => {
        if (n.type === 'folder') return false;
        return getFileCategory(n.mimeType, n.extension) === categoryFilter;
      });
    }

    if (providerFilter !== 'all') {
      list = list.filter((n) => n.type === 'file' && n.providerId === providerFilter);
    }

    const { sortField, sortDirection } = settings;
    const dirMul = sortDirection === 'asc' ? 1 : -1;

    return list.slice().sort((a, b) => {
      // Folders always sort first (§6)
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;

      if (sortField === 'name') {
        return a.name.localeCompare(b.name, undefined, { numeric: true }) * dirMul;
      }
      if (sortField === 'provider') {
        const pa = a.type === 'file' ? mountMap.get(a.providerId)?.name ?? a.providerId : '';
        const pb = b.type === 'file' ? mountMap.get(b.providerId)?.name ?? b.providerId : '';
        return pa.localeCompare(pb) * dirMul;
      }
      if (sortField === 'size') {
        const sa = a.type === 'file' ? a.sizeBytes : 0;
        const sb = b.type === 'file' ? b.sizeBytes : 0;
        return (sa - sb) * dirMul;
      }
      if (sortField === 'modified') {
        return (a.updatedAt - b.updatedAt) * dirMul;
      }
      return 0;
    });
  }, [
    nodes,
    mode,
    folderId,
    searchQuery,
    categoryFilter,
    providerFilter,
    settings,
    mountMap,
  ]);

  // Virtualizer for 40px table rows (§6)
  const rowVirtualizer = useVirtualizer({
    count: visibleNodes.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 40,
    overscan: 12,
  });

  // Selection handler (Click, Shift-click range, Ctrl/⌘-click toggle)
  const handleSelectItem = (
    node: VaultNode,
    e: React.MouseEvent | React.KeyboardEvent
  ) => {
    const isMeta = 'metaKey' in e && (e.metaKey || e.ctrlKey);
    const isShift = 'shiftKey' in e && e.shiftKey;

    if (isShift && lastClickedIdRef.current) {
      const startIdx = visibleNodes.findIndex((n) => n.id === lastClickedIdRef.current);
      const endIdx = visibleNodes.findIndex((n) => n.id === node.id);
      if (startIdx !== -1 && endIdx !== -1) {
        const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const rangeIds = visibleNodes.slice(lo, hi + 1).map((n) => n.id);
        setSelectedNodeIds(rangeIds, node.id);
        return;
      }
    }

    if (isMeta) {
      const exists = selectedNodeIds.includes(node.id);
      const next = exists
        ? selectedNodeIds.filter((id) => id !== node.id)
        : [...selectedNodeIds, node.id];
      lastClickedIdRef.current = node.id;
      setSelectedNodeIds(next, node.id);
      return;
    }

    lastClickedIdRef.current = node.id;
    setSelectedNodeIds([node.id], node.id);
  };

  const handleOpenItem = (node: VaultNode) => {
    if (mode === 'trash') return;
    if (node.type === 'folder') {
      navigate(`/app/files/${node.id}`);
    } else {
      setSelectedNodeIds([node.id], node.id);
      toggleInspectorOpen(true);
    }
  };

  const handleTrashNodes = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { previousStates } = await storageOrchestrator.trash(ids);
    setSelectedNodeIds([], null);
    if (previousStates.length > 0) {
      addToast({
        title: `Moved ${previousStates.length} item(s) to Trash`,
        variant: 'default',
        durationMs: 6000,
        actionLabel: 'Undo',
        onAction: () => {
          storageOrchestrator.restore(previousStates.map((p) => p.id));
        },
      });
    }
  };

  // Multi-file download runs one file at a time, no zip (§6)
  const handleBatchDownload = async (ids: string[]) => {
    const map = new Map(nodes.map((n) => [n.id, n]));
    const downloadableFiles = ids
      .map((id) => map.get(id))
      .filter(
        (n): n is FileNode =>
          Boolean(n) &&
          n!.type === 'file' &&
          (n as FileNode).hasBlob &&
          mountMap.get((n as FileNode).providerId)?.status !== 'disconnected'
      );

    if (downloadableFiles.length === 0) {
      addToast({
        title: 'No downloadable files selected',
        description: 'Placeholder files and disconnected mounts cannot be downloaded.',
        variant: 'warning',
      });
      return;
    }

    for (const file of downloadableFiles) {
      try {
        await storageOrchestrator.downloadFile(file.id);
        await new Promise((r) => setTimeout(r, 250));
      } catch (err) {
        addToast({
          title: `Failed to download "${file.name}"`,
          description: err instanceof Error ? err.message : undefined,
          variant: 'error',
        });
      }
    }

    addToast({
      title: `Downloaded ${downloadableFiles.length} file(s)`,
      variant: 'success',
    });
  };

  // Explorer Keyboard Navigation (§6)
  const visibleNodesRef = useRef(visibleNodes);
  visibleNodesRef.current = visibleNodes;
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  selectedNodeIdsRef.current = selectedNodeIds;
  const focusedNodeIdRef = useRef(focusedNodeId);
  focusedNodeIdRef.current = focusedNodeId;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const mountMapRef = useRef(mountMap);
  mountMapRef.current = mountMap;
  const handleOpenItemRef = useRef(handleOpenItem);
  handleOpenItemRef.current = handleOpenItem;
  const handleTrashNodesRef = useRef(handleTrashNodes);
  handleTrashNodesRef.current = handleTrashNodes;
  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const state = useVaultStore.getState();
      if (
        state.commandPaletteOpen ||
        state.shortcutsModalOpen ||
        state.uploadModalOpen ||
        state.previewFileId ||
        state.newFolderModalOpen ||
        state.renameNodeId ||
        state.moveModalNodeIds
      ) {
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

      const currentSelectedNodeIds = selectedNodeIdsRef.current;
      const currentVisibleNodes = visibleNodesRef.current;
      const currentFocusedNodeId = focusedNodeIdRef.current;
      const currentMode = modeRef.current;
      const currentMountMap = mountMapRef.current;

      if (e.key === 'Escape') {
        if (currentSelectedNodeIds.length > 0) {
          e.preventDefault();
          setSelectedNodeIds([], null);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const allIds = currentVisibleNodes.map((n) => n.id);
        setSelectedNodeIds(allIds, currentVisibleNodes[0]?.id ?? null);
        return;
      }

      if (currentVisibleNodes.length === 0) return;

      const curIdx = currentVisibleNodes.findIndex(
        (n) => n.id === (currentFocusedNodeId ?? currentSelectedNodeIds[0])
      );

      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        const nextIdx = curIdx < currentVisibleNodes.length - 1 ? curIdx + 1 : 0;
        const nextNode = currentVisibleNodes[nextIdx];
        if (nextNode) {
          lastClickedIdRef.current = nextNode.id;
          setSelectedNodeIds([nextNode.id], nextNode.id);
          rowVirtualizerRef.current.scrollToIndex(nextIdx, { align: 'auto' });
        }
        return;
      }

      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const prevIdx = curIdx > 0 ? curIdx - 1 : currentVisibleNodes.length - 1;
        const prevNode = currentVisibleNodes[prevIdx];
        if (prevNode) {
          lastClickedIdRef.current = prevNode.id;
          setSelectedNodeIds([prevNode.id], prevNode.id);
          rowVirtualizerRef.current.scrollToIndex(prevIdx, { align: 'auto' });
        }
        return;
      }

      const activeNode = curIdx >= 0 ? currentVisibleNodes[curIdx] : null;
      if (!activeNode) return;

      if (e.key === 'Enter' && currentMode !== 'trash') {
        e.preventDefault();
        handleOpenItemRef.current(activeNode);
      } else if (e.key === ' ' && currentMode !== 'trash') {
        e.preventDefault();
        if (activeNode.type === 'file') {
          if (!activeNode.hasBlob) {
            addToast({
              title: 'Placeholder asset cannot be previewed',
              description: 'Size is claimed for quota modeling; no bytes exist in IndexedDB.',
              variant: 'warning',
            });
          } else if (currentMountMap.get(activeNode.providerId)?.status === 'disconnected') {
            addToast({
              title: 'Mount is disconnected',
              description: 'Reconnect the mount in Providers to preview.',
              variant: 'warning',
            });
          } else {
            setPreviewFileId(activeNode.id);
          }
        }
      } else if (e.key === 'F2' && currentMode !== 'trash') {
        e.preventDefault();
        setRenameNodeId(activeNode.id);
      } else if (e.key.toLowerCase() === 's' && currentMode !== 'trash') {
        e.preventDefault();
        const targetIds =
          currentSelectedNodeIds.length > 0 ? currentSelectedNodeIds : [activeNode.id];
        storageOrchestrator.toggleStar(targetIds);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && currentMode !== 'trash') {
        e.preventDefault();
        const targetIds =
          currentSelectedNodeIds.length > 0 ? currentSelectedNodeIds : [activeNode.id];
        handleTrashNodesRef.current(targetIds);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addToast, setPreviewFileId, setRenameNodeId, setSelectedNodeIds]);

  const inspectedNode = useMemo(() => {
    const id = focusedNodeId ?? selectedNodeIds[0] ?? null;
    if (!id) return null;
    return nodes.find((n) => n.id === id) ?? null;
  }, [nodes, focusedNodeId, selectedNodeIds]);

  const getAriaSort = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (settings.sortField !== field) return 'none';
    return settings.sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <div className="flex-1 flex min-h-0 relative">
      {/* Main Explorer Center Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar: Category Filter Chips + Provider Filter + Action Buttons */}
        <div className="px-4 lg:px-6 py-3 border-b border-[#1E2230] bg-[#090A0F]/60 flex flex-wrap items-center justify-between gap-3">
          {/* Category Chips (§6) */}
          <div
            role="group"
            aria-label="Filter by file category"
            className="flex items-center gap-1 overflow-x-auto pb-0.5"
          >
            {FILE_CATEGORIES.map((cat) => {
              const active = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#4F46E5] text-white'
                      : 'text-[#8A94A6] hover:text-[#F3F4F6] hover:bg-[#131620]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Right Controls: Provider Select + New Folder / Empty Trash + Inspector Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Filter by storage provider mount"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="h-8 px-2.5 rounded-md bg-[#131620] border border-[#1E2230] text-xs text-[#F3F4F6]"
            >
              <option value="all">All Mounts</option>
              {mounts.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({PROVIDER_KIND_META[m.kind].shortLabel})
                </option>
              ))}
            </select>

            {mode === 'files' && (
              <>
                <button
                  type="button"
                  disabled={organizing}
                  onClick={async () => {
                    setOrganizing(true);
                    try {
                      const res = await storageOrchestrator.autoOrganizeFolder(
                        folderId ?? null
                      );
                      if (res.movedCount === 0) {
                        addToast({
                          title: 'Folder is already organized',
                          description: 'No unorganized loose files found in this folder.',
                          variant: 'default',
                        });
                      } else {
                        addToast({
                          title: `Auto-organized ${res.movedCount} file(s)`,
                          description: `Sorted into category folders (${res.createdFolders} new folder(s) created).`,
                          variant: 'success',
                        });
                      }
                    } catch {
                      // Upgrade modal is triggered automatically by StorageOrchestrator
                    } finally {
                      setOrganizing(false);
                    }
                  }}
                  title="Automatically sort files in this folder by category (PRO & ULTRA)"
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#131620] hover:bg-[#1E2230] border border-[#818CF8]/40 text-xs font-medium text-[#818CF8] whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Auto-Organize</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewFolderModalOpen(true)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#131620] hover:bg-[#1E2230] border border-[#1E2230] text-xs font-medium text-[#F3F4F6] whitespace-nowrap shrink-0"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-[#818CF8]" />
                  <span>New Folder</span>
                </button>
              </>
            )}

            {mode === 'trash' && visibleNodes.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmEmptyTrash(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#F43F5E]/15 hover:bg-[#F43F5E]/25 border border-[#F43F5E]/40 text-xs font-medium text-[#F43F5E] whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Empty Trash</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => toggleInspectorOpen()}
              aria-label={settings.inspectorOpen ? 'Hide inspector' : 'Show inspector'}
              title="Toggle File Inspector"
              className={`h-8 px-2.5 rounded-md border border-[#1E2230] flex items-center gap-1.5 text-xs ${
                settings.inspectorOpen
                  ? 'bg-[#131620] text-[#818CF8]'
                  : 'text-[#8A94A6] hover:text-[#F3F4F6]'
              }`}
            >
              {settings.inspectorOpen ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Inspector</span>
            </button>
          </div>
        </div>

        {/* Contextual Batch Selection Toolbar (§6) */}
        {selectedNodeIds.length > 0 && (
          <div className="px-4 lg:px-6 py-2 bg-[#131620] border-b border-[#1E2230] flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-[#818CF8] tabular-nums">
                {selectedNodeIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedNodeIds([], null)}
                className="text-[#8A94A6] hover:text-[#F3F4F6] underline"
              >
                Clear (Esc)
              </button>
            </div>

            {mode === 'trash' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await storageOrchestrator.restore(selectedNodeIds);
                    addToast({
                      title: `Restored ${selectedNodeIds.length} item(s)`,
                      variant: 'success',
                    });
                    setSelectedNodeIds([], null);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0E1017] hover:bg-[#1E2230] border border-[#1E2230] text-[#10B981] font-medium"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPurgeIds(selectedNodeIds)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F43F5E]/15 hover:bg-[#F43F5E]/25 border border-[#F43F5E]/40 text-[#F43F5E] font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete forever</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const firstConn =
                      mounts.find((m) => m.status === 'connected' && m.id !== 'local-vault') ??
                      mounts[0];
                    if (firstConn) setTransferTargetProviderId(firstConn.id);
                    setTransferCloudNodeIds(selectedNodeIds);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#4F46E5]/20 hover:bg-[#4F46E5]/30 border border-[#818CF8]/50 text-[#818CF8] font-medium"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Transfer to Cloud…</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMoveModalNodeIds(selectedNodeIds)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0E1017] hover:bg-[#1E2230] border border-[#1E2230] text-[#F3F4F6]"
                >
                  <MoveRight className="w-3.5 h-3.5" />
                  <span>Move</span>
                </button>
                <button
                  type="button"
                  onClick={() => storageOrchestrator.toggleStar(selectedNodeIds)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0E1017] hover:bg-[#1E2230] border border-[#1E2230] text-[#F3F4F6]"
                >
                  <Star className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Star</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchDownload(selectedNodeIds)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0E1017] hover:bg-[#1E2230] border border-[#1E2230] text-[#F3F4F6]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTrashNodes(selectedNodeIds)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0E1017] hover:bg-[#F43F5E]/20 border border-[#1E2230] text-[#F43F5E]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Trash</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading Skeleton (300ms minimum on navigation, §6) */}
        {navLoading ? (
          <div className="flex-1 p-4 lg:p-6 space-y-2" aria-busy="true" aria-label="Loading files">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-10 w-full rounded bg-[#131620] border border-[#1E2230] animate-pulse"
              />
            ))}
          </div>
        ) : visibleNodes.length === 0 ? (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-[#131620] border border-[#1E2230] flex items-center justify-center mb-3">
              {mode === 'trash' ? (
                <Trash2 className="w-5 h-5 text-[#8A94A6]" />
              ) : mode === 'starred' ? (
                <Star className="w-5 h-5 text-[#8A94A6]" />
              ) : (
                <Upload className="w-5 h-5 text-[#818CF8]" />
              )}
            </div>
            <h2 className="text-[15px] font-bold text-[#F3F4F6]">
              {mode === 'trash'
                ? 'Trash is empty'
                : mode === 'starred'
                ? 'No starred items match your filters'
                : 'No items in this view'}
            </h2>
            <p className="text-xs text-[#8A94A6] mt-1 max-w-sm">
              {mode === 'trash'
                ? 'Items moved to Trash stay here for 30 days before automatic permanent deletion.'
                : mode === 'starred'
                ? 'Press S on any file or folder to pin it to Starred for quick access.'
                : 'Upload files to any connected mount or create a virtual folder to organize your workspace.'}
            </p>
            {mode === 'files' && (
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openUploadModal()}
                  className="px-3.5 py-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium"
                >
                  Upload Files
                </button>
                <button
                  type="button"
                  onClick={() => setNewFolderModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-md bg-[#131620] hover:bg-[#1E2230] border border-[#1E2230] text-xs font-medium text-[#F3F4F6]"
                >
                  New Folder
                </button>
              </div>
            )}
          </div>
        ) : settings.explorerView === 'table' ? (
          /* Linear-Style Virtualized Table View (40px rows, role="grid", aria-sort, §6, §10) */
          <div
            ref={tableScrollRef}
            role="grid"
            aria-label="Files and folders"
            className="flex-1 overflow-y-auto select-none"
          >
            {/* Sticky Table Header */}
            <div
              role="row"
              className="sticky top-0 z-10 h-9 px-4 lg:px-6 bg-[#090A0F] border-b border-[#1E2230] grid grid-cols-[1fr_96px] md:grid-cols-[1fr_180px_110px_130px_44px] items-center text-[11px] font-medium text-[#8A94A6]"
            >
              <div role="columnheader" aria-sort={getAriaSort('name')}>
                <button
                  type="button"
                  onClick={() => setSorting('name')}
                  className="flex items-center gap-1 hover:text-[#F3F4F6]"
                >
                  <span>Name</span>
                  {settings.sortField === 'name' &&
                    (settings.sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-[#818CF8]" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-[#818CF8]" />
                    ))}
                </button>
              </div>

              <div
                role="columnheader"
                aria-sort={getAriaSort('provider')}
                className="hidden md:block"
              >
                <button
                  type="button"
                  onClick={() => setSorting('provider')}
                  className="flex items-center gap-1 hover:text-[#F3F4F6]"
                >
                  <span>Provider Mount</span>
                  {settings.sortField === 'provider' &&
                    (settings.sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-[#818CF8]" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-[#818CF8]" />
                    ))}
                </button>
              </div>

              <div
                role="columnheader"
                aria-sort={getAriaSort('size')}
                className="text-right"
              >
                <button
                  type="button"
                  onClick={() => setSorting('size')}
                  className="inline-flex items-center justify-end gap-1 hover:text-[#F3F4F6]"
                >
                  <span>Size</span>
                  {settings.sortField === 'size' &&
                    (settings.sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-[#818CF8]" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-[#818CF8]" />
                    ))}
                </button>
              </div>

              <div
                role="columnheader"
                aria-sort={getAriaSort('modified')}
                className="hidden md:block text-right"
              >
                <button
                  type="button"
                  onClick={() => setSorting('modified')}
                  className="inline-flex items-center justify-end gap-1 hover:text-[#F3F4F6]"
                >
                  <span>Modified</span>
                  {settings.sortField === 'modified' &&
                    (settings.sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-[#818CF8]" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-[#818CF8]" />
                    ))}
                </button>
              </div>

              <div role="columnheader" className="hidden md:flex justify-end">
                <span className="sr-only">Starred</span>
              </div>
            </div>

            {/* Virtualized Rows Container */}
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const node = visibleNodes[virtualRow.index];
                if (!node) return null;

                const Icon = getNodeIcon(node);
                const isSelected = selectedNodeIds.includes(node.id);
                const isFocused =
                  (focusedNodeId ?? visibleNodes[0]?.id) === node.id;
                const mount =
                  node.type === 'file' ? mountMap.get(node.providerId) : null;
                const isDisconnected =
                  node.type === 'file' && mount?.status === 'disconnected';
                const isPlaceholder = node.type === 'file' && !node.hasBlob;

                return (
                  <div
                    key={node.id}
                    role="row"
                    aria-selected={isSelected}
                    tabIndex={isFocused ? 0 : -1}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={(e) => handleSelectItem(node, e)}
                    onDoubleClick={() => handleOpenItem(node)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!selectedNodeIds.includes(node.id)) {
                        setSelectedNodeIds([node.id], node.id);
                      }
                      setContextMenu({ x: e.clientX, y: e.clientY, node });
                    }}
                    className={`px-4 lg:px-6 grid grid-cols-[1fr_96px] md:grid-cols-[1fr_180px_110px_130px_44px] items-center border-b border-[#1E2230]/60 text-[13px] cursor-pointer ${
                      isSelected
                        ? 'bg-[#4F46E5]/20 text-white'
                        : 'hover:bg-[#131620] text-[#F3F4F6]'
                    } ${isDisconnected ? 'opacity-50' : ''}`}
                  >
                    {/* Name Cell */}
                    <div role="gridcell" className="flex items-center gap-2.5 min-w-0 pr-3">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          node.type === 'folder'
                            ? 'text-[#818CF8]'
                            : 'text-[#8A94A6]'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium">{node.name}</span>
                      {isPlaceholder && (
                        <span className="text-[11px] font-mono text-[#8A94A6] shrink-0">
                          · Placeholder
                        </span>
                      )}
                      {isDisconnected && (
                        <span className="text-[11px] font-mono text-[#F43F5E] shrink-0">
                          · Disconnected
                        </span>
                      )}
                    </div>

                    {/* Provider Cell (Hidden on <768px per §10) */}
                    <div
                      role="gridcell"
                      className="hidden md:flex items-center gap-1.5 text-xs text-[#8A94A6] truncate pr-2"
                    >
                      {node.type === 'folder' ? (
                        <span>Virtual folder</span>
                      ) : (
                        <span className="truncate">
                          {mount?.name ?? node.providerId}
                          {mount && PROVIDER_KIND_META[mount.kind].isSimulated
                            ? ' · Simulated'
                            : ''}
                        </span>
                      )}
                    </div>

                    {/* Size Cell */}
                    <div
                      role="gridcell"
                      className="text-right font-mono text-xs text-[#8A94A6] tabular-nums"
                    >
                      {node.type === 'folder' ? '—' : formatBytes(node.sizeBytes)}
                    </div>

                    {/* Modified Cell (Hidden on <768px per §10) */}
                    <div
                      role="gridcell"
                      title={formatFullTimestamp(node.updatedAt)}
                      className="hidden md:block text-right font-mono text-xs text-[#8A94A6] tabular-nums"
                    >
                      {formatRelativeOrShortDate(node.updatedAt)}
                    </div>

                    {/* Star Cell (Hidden on <768px per §10) */}
                    <div role="gridcell" className="hidden md:flex justify-end">
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={
                          node.starred
                            ? `Unstar ${node.name}`
                            : `Star ${node.name}`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          storageOrchestrator.toggleStar([node.id]);
                        }}
                        className="p-1 rounded hover:bg-[#1E2230]"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            node.starred
                              ? 'text-[#F59E0B] fill-[#F59E0B]'
                              : 'text-[#8A94A6]/50 hover:text-[#F3F4F6]'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Google Drive-Style Visual Card Grid (<768px 2 columns per §10) */
          <div
            role="grid"
            aria-label="Files and folders grid"
            className="flex-1 overflow-y-auto p-4 lg:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 content-start select-none"
          >
            {visibleNodes.map((node, index) => {
              const isSelected = selectedNodeIds.includes(node.id);
              const isFocused =
                (focusedNodeId ?? visibleNodes[0]?.id) === node.id ||
                (focusedNodeId === null && index === 0);
              const mount =
                node.type === 'file' ? mountMap.get(node.providerId) : null;
              const isDisconnected =
                node.type === 'file' && mount?.status === 'disconnected';
              const isPlaceholder = node.type === 'file' && !node.hasBlob;

              return (
                <div
                  key={node.id}
                  role="gridcell"
                  aria-selected={isSelected}
                  tabIndex={isFocused ? 0 : -1}
                  onClick={(e) => handleSelectItem(node, e)}
                  onDoubleClick={() => handleOpenItem(node)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!selectedNodeIds.includes(node.id)) {
                      setSelectedNodeIds([node.id], node.id);
                    }
                    setContextMenu({ x: e.clientX, y: e.clientY, node });
                  }}
                  className={`rounded-lg border overflow-hidden flex flex-col cursor-pointer tv-transition ${
                    isSelected
                      ? 'bg-[#4F46E5]/15 border-[#818CF8]'
                      : 'bg-[#131620] border-[#1E2230] hover:border-[#8A94A6]/50'
                  } ${isDisconnected ? 'opacity-50' : ''}`}
                >
                  <GridCardThumbnail node={node} />

                  <div className="p-3 flex-1 flex flex-col justify-between gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium text-[#F3F4F6] truncate">
                        {node.name}
                      </p>
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={
                          node.starred ? `Unstar ${node.name}` : `Star ${node.name}`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          storageOrchestrator.toggleStar([node.id]);
                        }}
                        className="p-0.5 text-[#8A94A6] hover:text-[#F3F4F6] shrink-0"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            node.starred
                              ? 'text-[#F59E0B] fill-[#F59E0B]'
                              : 'text-[#8A94A6]/50'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Unboxed inline metadata with middots (§9) */}
                    <p className="text-[11px] font-mono text-[#8A94A6] truncate tabular-nums">
                      {node.type === 'folder'
                        ? `Folder · ${formatRelativeOrShortDate(node.updatedAt)}`
                        : `${formatBytes(node.sizeBytes)} · ${
                            mount?.name ?? node.providerId
                          }${isPlaceholder ? ' · Placeholder' : ''}${
                            isDisconnected ? ' · Disconnected' : ''
                          }`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right-Hand 320px Inspector (§6, §9, §10: inline on ≥1280px, overlay on <1280px) */}
      {settings.inspectorOpen && (
        <div className="fixed xl:static inset-y-0 right-0 z-30 flex">
          <FileInspector node={inspectedNode} />
        </div>
      )}

      {/* Right-Click Context Menu (§6) */}
      {contextMenu && (
        <div
          role="menu"
          style={{
            top: Math.max(8, Math.min(window.innerHeight - 260, contextMenu.y)),
            left: Math.max(8, Math.min(window.innerWidth - 200, contextMenu.x)),
          }}
          className="fixed z-50 w-48 rounded-lg bg-[#131620] border border-[#1E2230] py-1 text-[13px] text-[#F3F4F6]"
        >
          {mode === 'trash' ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  const targetIds = selectedNodeIds.length > 0 ? selectedNodeIds : [contextMenu.node.id];
                  setContextMenu(null);
                  await storageOrchestrator.restore(targetIds);
                  addToast({ title: `Restored ${targetIds.length} item(s)`, variant: 'success' });
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#4F46E5] hover:text-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const targetIds = selectedNodeIds.length > 0 ? selectedNodeIds : [contextMenu.node.id];
                  setContextMenu(null);
                  setConfirmPurgeIds(targetIds);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-[#F43F5E] hover:bg-[#F43F5E] hover:text-white"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete forever</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  handleOpenItem(n);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#4F46E5] hover:text-white"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Open</span>
              </button>

              {contextMenu.node.type === 'file' && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={
                    !contextMenu.node.hasBlob ||
                    mountMap.get(contextMenu.node.providerId)?.status === 'disconnected'
                  }
                  onClick={() => {
                    const n = contextMenu.node;
                    setContextMenu(null);
                    setPreviewFileId(n.id);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#4F46E5] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  setRenameNodeId(n.id);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#4F46E5] hover:text-white"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Rename</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  storageOrchestrator.toggleStar([n.id]);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#4F46E5] hover:text-white"
              >
                <Star className="w-3.5 h-3.5" />
                <span>{contextMenu.node.starred ? 'Unstar' : 'Star'}</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const targetIds =
                    selectedNodeIds.length > 0 ? selectedNodeIds : [contextMenu.node.id];
                  setContextMenu(null);
                  setMoveModalNodeIds(targetIds);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#4F46E5] hover:text-white"
              >
                <MoveRight className="w-3.5 h-3.5" />
                <span>Move to…</span>
              </button>

              {contextMenu.node.type === 'file' && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={
                    !contextMenu.node.hasBlob ||
                    mountMap.get(contextMenu.node.providerId)?.status === 'disconnected'
                  }
                  onClick={() => {
                    const n = contextMenu.node;
                    setContextMenu(null);
                    handleBatchDownload([n.id]);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#4F46E5] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              )}

              <div className="my-1 border-t border-[#1E2230]" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const targetIds =
                    selectedNodeIds.length > 0 ? selectedNodeIds : [contextMenu.node.id];
                  setContextMenu(null);
                  handleTrashNodes(targetIds);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-[#F43F5E] hover:bg-[#F43F5E] hover:text-white"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Move to Trash</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Confirmation Dialog for Delete Forever / Empty Trash (§4) */}
      {(confirmPurgeIds !== null || confirmEmptyTrash) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="purge-confirm-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setConfirmPurgeIds(null);
              setConfirmEmptyTrash(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#F43F5E] shrink-0 mt-0.5" />
              <div>
                <h2 id="purge-confirm-title" className="text-[15px] font-bold text-[#F3F4F6]">
                  {confirmEmptyTrash
                    ? 'Empty Trash permanently?'
                    : `Delete ${confirmPurgeIds?.length} item(s) forever?`}
                </h2>
                <p className="text-xs text-[#8A94A6] mt-1 leading-relaxed">
                  This action permanently deletes the selected items and invokes{' '}
                  <code className="font-mono text-[#F3F4F6]">deleteObject</code> on their storage mounts, freeing allocated mount capacity. This cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmPurgeIds(null);
                  setConfirmEmptyTrash(false);
                }}
                className="px-3.5 py-1.5 rounded-md border border-[#1E2230] text-xs font-medium text-[#8A94A6] hover:text-[#F3F4F6]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirmEmptyTrash) {
                    await storageOrchestrator.emptyTrash();
                    addToast({ title: 'Emptied Trash permanently', variant: 'success' });
                  } else if (confirmPurgeIds) {
                    await storageOrchestrator.purge(confirmPurgeIds);
                    addToast({
                      title: `Permanently deleted ${confirmPurgeIds.length} item(s)`,
                      variant: 'success',
                    });
                  }
                  setSelectedNodeIds([], null);
                  setConfirmPurgeIds(null);
                  setConfirmEmptyTrash(false);
                }}
                className="px-4 py-1.5 rounded-md bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-medium"
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cross-Cloud Transfer Modal */}
      {transferCloudNodeIds !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-cloud-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setTransferCloudNodeIds(null);
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-4">
            <div className="flex items-start gap-3">
              <ArrowLeftRight className="w-5 h-5 text-[#818CF8] shrink-0 mt-0.5" />
              <div className="w-full">
                <h2 id="transfer-cloud-title" className="text-[15px] font-bold text-[#F3F4F6]">
                  Transfer {transferCloudNodeIds.length} Item(s) to Another Cloud
                </h2>
                <p className="text-xs text-[#8A94A6] mt-1">
                  Migrate selected files across connected cloud storage providers. Counts toward your plan’s daily and monthly cross-cloud transfer quota.
                </p>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-[#8A94A6] mb-1.5">
                    Destination Connected Cloud Mount
                  </label>
                  <select
                    value={transferTargetProviderId}
                    onChange={(e) => setTransferTargetProviderId(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] text-xs text-[#F3F4F6]"
                  >
                    {mounts
                      .filter((m) => m.status === 'connected')
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({PROVIDER_KIND_META[m.kind].shortLabel})
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E2230]">
              <button
                type="button"
                onClick={() => setTransferCloudNodeIds(null)}
                className="px-3.5 py-1.5 rounded-md border border-[#1E2230] text-xs font-medium text-[#8A94A6] hover:text-[#F3F4F6]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ids = transferCloudNodeIds;
                  const targetId = transferTargetProviderId;
                  setTransferCloudNodeIds(null);
                  try {
                    const res = await storageOrchestrator.transferBetweenClouds(ids, targetId);
                    const destMount = mounts.find((m) => m.id === targetId);
                    addToast({
                      title: `Transferred ${res.transferredCount} file(s) (${formatBytes(
                        res.totalBytes
                      )})`,
                      description: `Migrated to ${destMount?.name ?? targetId}.`,
                      variant: 'success',
                    });
                    setSelectedNodeIds([], null);
                  } catch (err) {
                    addToast({
                      title: 'Cross-cloud transfer blocked',
                      description: err instanceof Error ? err.message : undefined,
                      variant: 'error',
                    });
                  }
                }}
                className="px-4 py-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium"
              >
                Start Cross-Cloud Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
