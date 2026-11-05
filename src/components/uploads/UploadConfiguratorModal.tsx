import { AlertCircle, Folder, HardDrive, Plus, Trash2, Upload, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_UPLOAD_SIZE_BYTES, PROVIDER_KIND_META } from '../../lib/constants';
import { formatBytes } from '../../lib/format';
import { storageOrchestrator } from '../../storage/orchestrator';
import { isEffectivelyTrashed } from '../../storage/repository';
import { computeMountUsedBytesMap, useVaultStore } from '../../store/useVaultStore';
import type { FolderNode } from '../../types/domain';

export function UploadConfiguratorModal() {
  const open = useVaultStore((s) => s.uploadModalOpen);
  const closeUploadModal = useVaultStore((s) => s.closeUploadModal);
  const preselectedFiles = useVaultStore((s) => s.preselectedUploadFiles);
  const currentFolderId = useVaultStore((s) => s.currentFolderId);
  const mounts = useVaultStore((s) => s.mounts);
  const nodes = useVaultStore((s) => s.nodes);
  const addToast = useVaultStore((s) => s.addToast);

  const [files, setFiles] = useState<File[]>([]);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [targetProviderId, setTargetProviderId] = useState<string>('local-vault');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const connectedMounts = useMemo(
    () => mounts.filter((m) => m.status === 'connected'),
    [mounts]
  );

  const mountUsageMap = useMemo(() => computeMountUsedBytesMap(nodes), [nodes]);

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      setFiles(preselectedFiles);
      setTargetFolderId(currentFolderId);
      setError(null);
      if (connectedMounts.length > 0) {
        const defaultMount =
          connectedMounts.find((m) => m.id === 'r2-edge') ?? connectedMounts[0];
        setTargetProviderId(defaultMount.id);
      }
      setTimeout(() => closeBtnRef.current?.focus(), 15);
    } else if (prevFocusRef.current) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [open, preselectedFiles, currentFolderId, connectedMounts]);

  // Folder choices for target folder picker
  const folderOptions = useMemo(() => {
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

    const opts: { id: string | null; label: string }[] = [
      { id: null, label: '/ (All Files Root)' },
    ];
    const walk = (parentId: string | null, prefix: string) => {
      const kids = byParent.get(parentId) ?? [];
      for (const k of kids) {
        const nextPath = `${prefix}/${k.name}`;
        opts.push({ id: k.id, label: nextPath });
        walk(k.id, nextPath);
      }
    };
    walk(null, '');
    return opts;
  }, [nodes]);

  const validFiles = useMemo(
    () => files.filter((f) => f.size <= MAX_UPLOAD_SIZE_BYTES),
    [files]
  );

  const totalValidBytes = useMemo(
    () => validFiles.reduce((sum, f) => sum + f.size, 0),
    [validFiles]
  );

  if (!open) return null;

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const incoming = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...incoming]);
      e.target.value = '';
    }
  };

  const removeFileAt = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const selectedMount = connectedMounts.find((m) => m.id === targetProviderId);
  const selectedMountUsed = selectedMount
    ? mountUsageMap.get(selectedMount.id)?.usedBytes ?? 0
    : 0;
  const selectedMountFree = selectedMount
    ? Math.max(0, selectedMount.allocatedBytes - selectedMountUsed)
    : 0;
  const fitsInSelectedMount =
    Boolean(selectedMount) && totalValidBytes <= selectedMountFree;

  const handleStartUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validFiles.length === 0 || !fitsInSelectedMount) return;

    setSubmitting(true);
    setError(null);
    try {
      await storageOrchestrator.startUpload(
        validFiles,
        targetFolderId,
        targetProviderId
      );
      addToast({
        title: `Queued ${validFiles.length} file(s) for multipart upload`,
        variant: 'default',
      });
      closeUploadModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start upload.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeUploadModal();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeUploadModal();
        }
      }}
    >
      <div className="w-full max-w-xl rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E2230]">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#818CF8]" />
            <h2 id="upload-modal-title" className="text-[15px] font-bold text-[#F3F4F6]">
              Upload Files to Vault
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={closeUploadModal}
            aria-label="Close upload configurator"
            className="p-1 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleStartUpload} className="p-5 space-y-4 overflow-y-auto">
          {/* File Picker Zone */}
          <div className="rounded-lg border border-dashed border-[#1E2230] bg-[#0E1017] p-5 text-center">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />
            <Upload className="w-6 h-6 text-[#818CF8] mx-auto mb-2" />
            <p className="text-[13px] font-medium text-[#F3F4F6]">
              Select files from your computer or drag and drop
            </p>
            <p className="text-xs text-[#8A94A6] mt-0.5">
              Max 200.0 MB (SI) per file · SHA-256 computed automatically for files ≤ 64.0 MB
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#131620] hover:bg-[#1E2230] border border-[#1E2230] text-xs font-medium text-[#F3F4F6]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Choose Files</span>
            </button>
          </div>

          {/* File List (§5: show rejected >200 MB files with reason) */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#8A94A6]">
                <span>Selected files ({files.length})</span>
                <span className="font-mono tabular-nums">
                  Valid total: {formatBytes(totalValidBytes)}
                </span>
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-[#1E2230] rounded-md border border-[#1E2230] bg-[#0E1017]">
                {files.map((file, idx) => {
                  const tooLarge = file.size > MAX_UPLOAD_SIZE_BYTES;
                  return (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate font-medium ${
                            tooLarge ? 'text-[#F43F5E] line-through' : 'text-[#F3F4F6]'
                          }`}
                        >
                          {file.name}
                        </p>
                        {tooLarge && (
                          <p className="text-[11px] text-[#F43F5E] mt-0.5">
                            Rejected: exceeds 200.0 MB per-file limit ({formatBytes(file.size)})
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-[#8A94A6] shrink-0 tabular-nums">
                        {formatBytes(file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFileAt(idx)}
                        aria-label={`Remove ${file.name}`}
                        className="p-1 text-[#8A94A6] hover:text-[#F43F5E] rounded shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Target Folder Select */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="upload-target-folder"
                className="block text-xs font-medium text-[#8A94A6] mb-1.5"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-[#818CF8]" />
                  Target Folder
                </span>
              </label>
              <select
                id="upload-target-folder"
                value={targetFolderId ?? '__root__'}
                onChange={(e) =>
                  setTargetFolderId(e.target.value === '__root__' ? null : e.target.value)
                }
                className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] text-[13px] text-[#F3F4F6]"
              >
                {folderOptions.map((opt) => (
                  <option key={opt.id ?? '__root__'} value={opt.id ?? '__root__'}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Storage Mount Select (connected mounts only, with free space, disabling mounts that don't fit) */}
            <div>
              <label
                htmlFor="upload-target-provider"
                className="block text-xs font-medium text-[#8A94A6] mb-1.5"
              >
                <span className="inline-flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-[#818CF8]" />
                  Target Storage Mount
                </span>
              </label>
              <select
                id="upload-target-provider"
                value={targetProviderId}
                onChange={(e) => setTargetProviderId(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] text-[13px] text-[#F3F4F6]"
              >
                {connectedMounts.map((m) => {
                  const used = mountUsageMap.get(m.id)?.usedBytes ?? 0;
                  const free = Math.max(0, m.allocatedBytes - used);
                  const insufficient = totalValidBytes > 0 && totalValidBytes > free;
                  const simTag = PROVIDER_KIND_META[m.kind].isSimulated ? ' [Simulated]' : '';
                  return (
                    <option key={m.id} value={m.id} disabled={insufficient}>
                      {m.name}
                      {simTag} — {formatBytes(free)} free
                      {insufficient ? ' (Insufficient space)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {!fitsInSelectedMount && totalValidBytes > 0 && (
            <div
              role="alert"
              className="p-2.5 rounded bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-xs text-[#F43F5E] flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Selected files ({formatBytes(totalValidBytes)}) exceed available free capacity on{' '}
                {selectedMount?.name ?? 'this mount'} ({formatBytes(selectedMountFree)} free).
              </span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-2.5 rounded bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-xs text-[#F43F5E]"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E2230]">
            <button
              type="button"
              onClick={closeUploadModal}
              className="px-3.5 py-1.5 rounded-md border border-[#1E2230] text-xs font-medium text-[#8A94A6] hover:text-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || validFiles.length === 0 || !fitsInSelectedMount}
              className="px-4 py-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start Multipart Upload ({validFiles.length})
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
