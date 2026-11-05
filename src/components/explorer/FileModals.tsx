import { Folder, FolderPlus, MoveRight, Pencil, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { storageOrchestrator } from '../../storage/orchestrator';
import { collectSubtreeIds, isEffectivelyTrashed } from '../../storage/repository';
import { useVaultStore } from '../../store/useVaultStore';
import type { FolderNode } from '../../types/domain';

export function NewFolderModal() {
  const open = useVaultStore((s) => s.newFolderModalOpen);
  const setOpen = useVaultStore((s) => s.setNewFolderModalOpen);
  const currentFolderId = useVaultStore((s) => s.currentFolderId);
  const addToast = useVaultStore((s) => s.addToast);

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      setName('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 15);
    } else if (prevFocusRef.current) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await storageOrchestrator.createFolder(currentFolderId, name);
      addToast({
        title: `Created folder "${created.name}"`,
        variant: 'success',
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create folder.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-folder-title"
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
      <div className="w-full max-w-md rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E2230]">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-[#818CF8]" />
            <h2 id="new-folder-title" className="text-[15px] font-bold text-[#F3F4F6]">
              New Folder
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close dialog"
            className="p-1 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label htmlFor="new-folder-name" className="block text-xs font-medium text-[#8A94A6] mb-1.5">
              Folder name
            </label>
            <input
              ref={inputRef}
              id="new-folder-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Architecture Specs"
              className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] text-[14px] text-[#F3F4F6] placeholder-[#8A94A6]"
            />
            {error && (
              <p role="alert" className="mt-1.5 text-xs text-[#F43F5E]">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3.5 py-1.5 rounded-md border border-[#1E2230] text-xs font-medium text-[#8A94A6] hover:text-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium disabled:opacity-50"
            >
              Create folder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RenameModal() {
  const renameNodeId = useVaultStore((s) => s.renameNodeId);
  const setRenameNodeId = useVaultStore((s) => s.setRenameNodeId);
  const nodes = useVaultStore((s) => s.nodes);
  const addToast = useVaultStore((s) => s.addToast);

  const targetNode = useMemo(
    () => nodes.find((n) => n.id === renameNodeId) ?? null,
    [nodes, renameNodeId]
  );

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (targetNode) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      setName(targetNode.name);
      setError(null);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const dotIdx = targetNode.type === 'file' ? targetNode.name.lastIndexOf('.') : -1;
          if (dotIdx > 0) {
            inputRef.current.setSelectionRange(0, dotIdx);
          } else {
            inputRef.current.select();
          }
        }
      }, 15);
    } else if (prevFocusRef.current) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [targetNode]);

  if (!targetNode) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const updated = await storageOrchestrator.rename(targetNode.id, name);
      addToast({
        title: `Renamed to "${updated.name}"`,
        variant: 'success',
      });
      setRenameNodeId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setRenameNodeId(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setRenameNodeId(null);
        }
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E2230]">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-[#818CF8]" />
            <h2 id="rename-modal-title" className="text-[15px] font-bold text-[#F3F4F6]">
              Rename {targetNode.type === 'folder' ? 'Folder' : 'File'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setRenameNodeId(null)}
            aria-label="Close dialog"
            className="p-1 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label htmlFor="rename-input" className="block text-xs font-medium text-[#8A94A6] mb-1.5">
              New name
            </label>
            <input
              ref={inputRef}
              id="rename-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] text-[14px] text-[#F3F4F6]"
            />
            {error && (
              <p role="alert" className="mt-1.5 text-xs text-[#F43F5E]">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setRenameNodeId(null)}
              className="px-3.5 py-1.5 rounded-md border border-[#1E2230] text-xs font-medium text-[#8A94A6] hover:text-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium disabled:opacity-50"
            >
              Save name
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function MoveModal() {
  const moveModalNodeIds = useVaultStore((s) => s.moveModalNodeIds);
  const setMoveModalNodeIds = useVaultStore((s) => s.setMoveModalNodeIds);
  const nodes = useVaultStore((s) => s.nodes);
  const currentFolderId = useVaultStore((s) => s.currentFolderId);
  const addToast = useVaultStore((s) => s.addToast);

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (moveModalNodeIds && moveModalNodeIds.length > 0) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      setSelectedTargetId(currentFolderId);
      setError(null);
    } else if (prevFocusRef.current) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [moveModalNodeIds, currentFolderId]);

  const { folderOptions, invalidIds } = useMemo(() => {
    if (!moveModalNodeIds || moveModalNodeIds.length === 0) {
      return { folderOptions: [] as { id: string | null; name: string; depth: number }[], invalidIds: new Set<string>() };
    }

    const map = new Map(nodes.map((n) => [n.id, n]));
    const invalid = new Set<string>();
    for (const movingId of moveModalNodeIds) {
      invalid.add(movingId);
      const { nodeIds } = collectSubtreeIds(movingId, nodes);
      for (const subId of nodeIds) invalid.add(subId);
    }

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

    const options: { id: string | null; name: string; depth: number }[] = [
      { id: null, name: 'All Files (Root)', depth: 0 },
    ];

    const walk = (parentId: string | null, depth: number) => {
      const kids = byParent.get(parentId) ?? [];
      for (const k of kids) {
        options.push({ id: k.id, name: k.name, depth });
        walk(k.id, depth + 1);
      }
    };
    walk(null, 1);

    return { folderOptions: options, invalidIds: invalid };
  }, [nodes, moveModalNodeIds]);

  if (!moveModalNodeIds || moveModalNodeIds.length === 0) return null;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await storageOrchestrator.move(moveModalNodeIds, selectedTargetId);
      const destName =
        folderOptions.find((f) => f.id === selectedTargetId)?.name ?? 'All Files';
      addToast({
        title: `Moved ${moveModalNodeIds.length} item(s) to "${destName}"`,
        variant: 'success',
      });
      setMoveModalNodeIds(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setMoveModalNodeIds(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setMoveModalNodeIds(null);
        }
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E2230]">
          <div className="flex items-center gap-2">
            <MoveRight className="w-4 h-4 text-[#818CF8]" />
            <h2 id="move-modal-title" className="text-[15px] font-bold text-[#F3F4F6]">
              Move {moveModalNodeIds.length} Item{moveModalNodeIds.length > 1 ? 's' : ''}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setMoveModalNodeIds(null)}
            aria-label="Close dialog"
            className="p-1 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-[#8A94A6]">
            Select a destination folder. Files remain on the storage provider mount they were uploaded to.
          </p>

          <div
            role="listbox"
            aria-label="Destination folder"
            className="max-h-64 overflow-y-auto rounded-md border border-[#1E2230] bg-[#0E1017] p-1.5 space-y-0.5"
          >
            {folderOptions.map((opt) => {
              const isInvalid = opt.id !== null && invalidIds.has(opt.id);
              const isSelected = selectedTargetId === opt.id;
              return (
                <button
                  key={opt.id ?? 'root'}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isInvalid}
                  onClick={() => setSelectedTargetId(opt.id)}
                  style={{ paddingLeft: `${10 + opt.depth * 16}px` }}
                  className={`w-full flex items-center justify-between pr-3 py-1.5 rounded text-[13px] text-left ${
                    isInvalid
                      ? 'opacity-40 cursor-not-allowed text-[#8A94A6]'
                      : isSelected
                      ? 'bg-[#4F46E5] text-white font-medium'
                      : 'text-[#F3F4F6] hover:bg-[#131620]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{opt.name}</span>
                  </div>
                  {isInvalid && (
                    <span className="text-[11px] font-mono shrink-0">Cannot move into self</span>
                  )}
                </button>
              );
            })}
          </div>

          {error && (
            <p role="alert" className="text-xs text-[#F43F5E]">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMoveModalNodeIds(null)}
              className="px-3.5 py-1.5 rounded-md border border-[#1E2230] text-xs font-medium text-[#8A94A6] hover:text-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || (selectedTargetId !== null && invalidIds.has(selectedTargetId))}
              className="px-4 py-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium disabled:opacity-50"
            >
              Move here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
