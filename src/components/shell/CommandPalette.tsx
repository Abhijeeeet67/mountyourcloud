import { Command } from 'cmdk';
import {
  BarChart3,
  CreditCard,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  LayoutDashboard,
  LayoutGrid,
  List,
  Search,
  Settings,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PROVIDER_KIND_META } from '../../lib/constants';
import { formatBytes } from '../../lib/format';
import { isEffectivelyTrashed } from '../../storage/repository';
import { useVaultStore } from '../../store/useVaultStore';

export function CommandPalette() {
  const navigate = useNavigate();
  const open = useVaultStore((s) => s.commandPaletteOpen);
  const setOpen = useVaultStore((s) => s.setCommandPaletteOpen);
  const nodes = useVaultStore((s) => s.nodes);
  const mounts = useVaultStore((s) => s.mounts);
  const explorerView = useVaultStore((s) => s.settings.explorerView);
  const setExplorerView = useVaultStore((s) => s.setExplorerView);
  const openUploadModal = useVaultStore((s) => s.openUploadModal);
  const setNewFolderModalOpen = useVaultStore((s) => s.setNewFolderModalOpen);
  const setPreviewFileId = useVaultStore((s) => s.setPreviewFileId);
  const setSelectedNodeIds = useVaultStore((s) => s.setSelectedNodeIds);
  const setProviderFilter = useVaultStore((s) => s.setProviderFilter);

  const [search, setSearch] = useState('');
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 15);
    } else if (prevFocusRef.current) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [open]);

  // Fuzzy match active (non-trashed) files and folders, max 8 (§7)
  const matchedNodes = useMemo(() => {
    const map = new Map(nodes.map((n) => [n.id, n]));
    const active = nodes.filter((n) => !isEffectivelyTrashed(n, map));
    const q = search.trim().toLowerCase();

    if (!q) {
      return active
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8);
    }

    // Score fuzzy match: substring match first, then sequential character match
    const scored: { node: (typeof active)[number]; score: number }[] = [];
    for (const node of active) {
      const nameLower = node.name.toLowerCase();
      if (nameLower.startsWith(q)) {
        scored.push({ node, score: 100 - nameLower.length });
      } else if (nameLower.includes(q)) {
        scored.push({ node, score: 70 - nameLower.indexOf(q) });
      } else {
        let qi = 0;
        for (let i = 0; i < nameLower.length && qi < q.length; i++) {
          if (nameLower[i] === q[qi]) qi++;
        }
        if (qi === q.length) {
          scored.push({ node, score: 30 });
        }
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((s) => s.node);
  }, [nodes, search]);

  if (!open) return null;

  const closeAndRun = (fn: () => void) => {
    setOpen(false);
    setTimeout(fn, 10);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-[12vh] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setOpen(false);
        }
      }}
    >
      <div className="w-full max-w-xl rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden">
        <Command
          label="Command Palette"
          shouldFilter={false}
          className="flex flex-col w-full"
        >
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#1E2230]">
            <Search className="w-4 h-4 text-[#8A94A6] shrink-0" aria-hidden="true" />
            <Command.Input
              ref={inputRef}
              value={search}
              onValueChange={setSearch}
              placeholder="Jump to files, folders, mounts, pages, or actions…"
              className="w-full bg-transparent text-[14px] text-[#F3F4F6] placeholder-[#8A94A6] focus:outline-none"
            />
            <kbd className="font-mono text-[11px] text-[#8A94A6] bg-[#0E1017] border border-[#1E2230] px-1.5 py-0.5 rounded shrink-0">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[380px] overflow-y-auto p-2 space-y-2 text-[13px]">
            <Command.Empty className="py-8 text-center text-[#8A94A6]">
              No matching files, mounts, or actions found.
            </Command.Empty>

            {matchedNodes.length > 0 && (
              <Command.Group
                heading="Files & Folders (Max 8)"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[#8A94A6]"
              >
                {matchedNodes.map((node) => (
                  <Command.Item
                    key={node.id}
                    value={`node-${node.id}-${node.name}`}
                    onSelect={() =>
                      closeAndRun(() => {
                        if (node.type === 'folder') {
                          navigate(`/app/files/${node.id}`);
                        } else {
                          if (node.parentId) {
                            navigate(`/app/files/${node.parentId}`);
                          } else {
                            navigate('/app/files');
                          }
                          setSelectedNodeIds([node.id], node.id);
                          if (node.hasBlob) {
                            setPreviewFileId(node.id);
                          }
                        }
                      })
                    }
                    className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-md cursor-pointer text-[#F3F4F6] data-[selected=true]:bg-[#4F46E5] data-[selected=true]:text-white"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {node.type === 'folder' ? (
                        <Folder className="w-4 h-4 text-[#818CF8] shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-[#8A94A6] shrink-0" />
                      )}
                      <span className="truncate">{node.name}</span>
                    </div>
                    <span className="font-mono text-xs text-[#8A94A6] shrink-0 tabular-nums">
                      {node.type === 'folder' ? 'Folder' : formatBytes(node.sizeBytes)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group
              heading="Quick Actions"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[#8A94A6]"
            >
              <Command.Item
                value="action-upload-files"
                onSelect={() => closeAndRun(() => openUploadModal())}
                className="flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer text-[#F3F4F6] data-[selected=true]:bg-[#4F46E5] data-[selected=true]:text-white"
              >
                <div className="flex items-center gap-2.5">
                  <Upload className="w-4 h-4 text-[#818CF8]" />
                  <span>Upload files…</span>
                </div>
                <span className="text-xs text-[#8A94A6]">Multipart Queue</span>
              </Command.Item>

              <Command.Item
                value="action-new-folder"
                onSelect={() => closeAndRun(() => setNewFolderModalOpen(true))}
                className="flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer text-[#F3F4F6] data-[selected=true]:bg-[#4F46E5] data-[selected=true]:text-white"
              >
                <div className="flex items-center gap-2.5">
                  <FolderPlus className="w-4 h-4 text-[#818CF8]" />
                  <span>New folder…</span>
                </div>
                <span className="text-xs text-[#8A94A6]">Current directory</span>
              </Command.Item>

              <Command.Item
                value="action-toggle-view"
                onSelect={() =>
                  closeAndRun(() =>
                    setExplorerView(explorerView === 'table' ? 'grid' : 'table')
                  )
                }
                className="flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer text-[#F3F4F6] data-[selected=true]:bg-[#4F46E5] data-[selected=true]:text-white"
              >
                <div className="flex items-center gap-2.5">
                  {explorerView === 'table' ? (
                    <LayoutGrid className="w-4 h-4 text-[#818CF8]" />
                  ) : (
                    <List className="w-4 h-4 text-[#818CF8]" />
                  )}
                  <span>
                    Toggle explorer view (Switch to {explorerView === 'table' ? 'Grid' : 'Table'})
                  </span>
                </div>
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="Storage Provider Mounts"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[#8A94A6]"
            >
              {mounts
                .filter(
                  (m) =>
                    !search.trim() ||
                    m.name.toLowerCase().includes(search.trim().toLowerCase()) ||
                    m.kind.toLowerCase().includes(search.trim().toLowerCase())
                )
                .map((m) => (
                  <Command.Item
                    key={m.id}
                    value={`mount-${m.id}-${m.name}`}
                    onSelect={() =>
                      closeAndRun(() => {
                        setProviderFilter(m.id);
                        navigate('/app/files');
                      })
                    }
                    className="flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer text-[#F3F4F6] data-[selected=true]:bg-[#4F46E5] data-[selected=true]:text-white"
                  >
                    <div className="flex items-center gap-2.5">
                      <HardDrive className="w-4 h-4 text-[#8A94A6]" />
                      <span>Filter by mount: {m.name}</span>
                    </div>
                    <span className="font-mono text-xs text-[#8A94A6]">
                      {PROVIDER_KIND_META[m.kind].shortLabel}
                    </span>
                  </Command.Item>
                ))}
            </Command.Group>

            <Command.Group
              heading="Workspace Pages"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[#8A94A6]"
            >
              {[
                { label: 'Overview Dashboard', path: '/app/overview', icon: LayoutDashboard },
                { label: 'All Files Explorer', path: '/app/files', icon: Folder },
                { label: 'Starred Items', path: '/app/starred', icon: Star },
                { label: 'Trash Bin', path: '/app/trash', icon: Trash2 },
                { label: 'Provider Mounts Hub', path: '/app/providers', icon: HardDrive },
                { label: 'Storage & Egress Analytics', path: '/app/analytics', icon: BarChart3 },
                { label: 'Pricing & Subscription Plans', path: '/app/pricing', icon: CreditCard },
                { label: 'Workspace Settings & Dev Panel', path: '/app/settings', icon: Settings },
              ].map((page) => {
                const Icon = page.icon;
                return (
                  <Command.Item
                    key={page.path}
                    value={`page-${page.label}`}
                    onSelect={() => closeAndRun(() => navigate(page.path))}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer text-[#F3F4F6] data-[selected=true]:bg-[#4F46E5] data-[selected=true]:text-white"
                  >
                    <Icon className="w-4 h-4 text-[#8A94A6]" />
                    <span>{page.label}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
