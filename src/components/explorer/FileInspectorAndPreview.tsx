import {
  AlertCircle,
  Download,
  Eye,
  FileCode,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  Info,
  MoveRight,
  Music,
  Pencil,
  Star,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { MAX_TEXT_PREVIEW_BYTES, PROVIDER_KIND_META } from '../../lib/constants';
import {
  formatBytes,
  formatFullTimestamp,
  formatRelativeOrShortDate,
} from '../../lib/format';
import { storageOrchestrator } from '../../storage/orchestrator';
import { buildBreadcrumbChain, useVaultStore } from '../../store/useVaultStore';
import type { FileNode, VaultNode } from '../../types/domain';

export function getNodeIcon(node: VaultNode) {
  if (node.type === 'folder') return Folder;
  const ext = node.extension.toLowerCase();
  const mime = node.mimeType.toLowerCase();
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    return ImageIcon;
  }
  if (mime.startsWith('audio/') || ['wav', 'mp3', 'ogg', 'flac'].includes(ext)) {
    return Music;
  }
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) {
    return Video;
  }
  if (['csv', 'parquet', 'xls', 'xlsx'].includes(ext)) {
    return FileSpreadsheet;
  }
  if (['ts', 'tsx', 'js', 'py', 'sql', 'json', 'html', 'css', 'sh'].includes(ext)) {
    return FileCode;
  }
  return FileText;
}

export function FileInspector({ node }: { node: VaultNode | null }) {
  const nodes = useVaultStore((s) => s.nodes);
  const mounts = useVaultStore((s) => s.mounts);
  const toggleInspectorOpen = useVaultStore((s) => s.toggleInspectorOpen);
  const setPreviewFileId = useVaultStore((s) => s.setPreviewFileId);
  const setRenameNodeId = useVaultStore((s) => s.setRenameNodeId);
  const setMoveModalNodeIds = useVaultStore((s) => s.setMoveModalNodeIds);
  const addToast = useVaultStore((s) => s.addToast);

  const mount = useMemo(() => {
    if (!node || node.type !== 'file') return null;
    return mounts.find((m) => m.id === node.providerId) ?? null;
  }, [node, mounts]);

  const pathString = useMemo(() => {
    if (!node) return '';
    const crumbs = buildBreadcrumbChain(node.parentId, nodes);
    return `${crumbs.map((c) => c.name).join(' / ')} / ${node.name}`;
  }, [node, nodes]);

  if (!node) {
    return (
      <aside
        aria-label="File inspector"
        className="w-80 border-l border-[#1E2230] bg-[#090A0F] p-5 flex flex-col justify-between shrink-0"
      >
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-[#1E2230]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#8A94A6]">
              Inspector
            </h2>
            <button
              type="button"
              onClick={() => toggleInspectorOpen(false)}
              aria-label="Close inspector"
              className="p-1 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="py-12 text-center">
            <Info className="w-7 h-7 text-[#8A94A6] mx-auto mb-2.5 opacity-60" />
            <p className="text-[13px] font-medium text-[#F3F4F6]">No item selected</p>
            <p className="text-xs text-[#8A94A6] mt-1">
              Click a file or folder to inspect its metadata, provider mount, and SHA-256 digest.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const Icon = getNodeIcon(node);
  const isFile = node.type === 'file';
  const isDisconnected = isFile && mount?.status === 'disconnected';
  const isPlaceholder = isFile && !node.hasBlob;
  const canPreviewOrDownload = isFile && node.hasBlob && !isDisconnected;

  const handleTrash = async () => {
    const { previousStates } = await storageOrchestrator.trash([node.id]);
    if (previousStates.length > 0) {
      addToast({
        title: `Moved "${node.name}" to Trash`,
        variant: 'default',
        durationMs: 6000,
        actionLabel: 'Undo',
        onAction: () => {
          storageOrchestrator.restore([node.id]);
        },
      });
    }
  };

  return (
    <aside
      aria-label="File inspector"
      className="w-80 border-l border-[#1E2230] bg-[#090A0F] flex flex-col shrink-0 overflow-y-auto"
    >
      <div className="h-12 px-4 flex items-center justify-between border-b border-[#1E2230] shrink-0">
        <span className="text-xs font-bold text-[#8A94A6]">Item Details</span>
        <button
          type="button"
          onClick={() => toggleInspectorOpen(false)}
          aria-label="Close inspector"
          className="p-1 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5 text-[13px]">
        {/* Header Card */}
        <div className="p-3.5 rounded-lg bg-[#131620] border border-[#1E2230]">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-[#0E1017] border border-[#1E2230] shrink-0">
              <Icon className="w-5 h-5 text-[#818CF8]" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-[#F3F4F6] break-words leading-snug">
                {node.name}
              </h3>
              <p className="text-xs text-[#8A94A6] mt-1">
                {node.type === 'folder'
                  ? 'Virtual Folder'
                  : `${node.extension.toUpperCase() || 'FILE'} · ${formatBytes(node.sizeBytes)}`}
              </p>
            </div>
          </div>

          {isDisconnected && (
            <div className="mt-3 p-2.5 rounded bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-xs text-[#F43F5E] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Mount <strong>{mount?.name}</strong> is disconnected. Preview and download are disabled until reconnected.
              </span>
            </div>
          )}

          {isPlaceholder && (
            <div className="mt-3 p-2.5 rounded bg-[#1E2230]/70 border border-[#1E2230] text-xs text-[#8A94A6] flex items-start gap-2">
              <Info className="w-4 h-4 text-[#818CF8] shrink-0 mt-0.5" />
              <span>
                Placeholder asset (<code className="font-mono">hasBlob: false</code>) — size is claimed for multi-GB quota modeling; no bytes exist in IndexedDB.
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          {isFile && (
            <>
              <button
                type="button"
                disabled={!canPreviewOrDownload}
                title={
                  isDisconnected
                    ? 'Mount is disconnected'
                    : isPlaceholder
                    ? 'Placeholder file has no previewable bytes'
                    : 'Open preview modal (Space)'
                }
                onClick={() => setPreviewFileId(node.id)}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>

              <button
                type="button"
                disabled={!canPreviewOrDownload}
                title={
                  isDisconnected
                    ? 'Mount is disconnected'
                    : isPlaceholder
                    ? 'Placeholder file has no downloadable bytes'
                    : 'Download file'
                }
                onClick={async () => {
                  try {
                    await storageOrchestrator.downloadFile(node.id);
                    addToast({
                      title: `Downloaded "${node.name}"`,
                      variant: 'success',
                    });
                  } catch (err) {
                    addToast({
                      title: 'Download failed',
                      description: err instanceof Error ? err.message : undefined,
                      variant: 'error',
                    });
                  }
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#131620] hover:bg-[#1E2230] border border-[#1E2230] text-[#F3F4F6] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setRenameNodeId(node.id)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#131620] hover:bg-[#1E2230] border border-[#1E2230] text-[#F3F4F6] text-xs font-medium"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Rename</span>
          </button>

          <button
            type="button"
            onClick={() => storageOrchestrator.toggleStar([node.id])}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#131620] hover:bg-[#1E2230] border border-[#1E2230] text-[#F3F4F6] text-xs font-medium"
          >
            <Star
              className={`w-3.5 h-3.5 ${
                node.starred ? 'text-[#F59E0B] fill-[#F59E0B]' : 'text-[#8A94A6]'
              }`}
            />
            <span>{node.starred ? 'Starred' : 'Star'}</span>
          </button>

          <button
            type="button"
            onClick={() => setMoveModalNodeIds([node.id])}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#131620] hover:bg-[#1E2230] border border-[#1E2230] text-[#F3F4F6] text-xs font-medium"
          >
            <MoveRight className="w-3.5 h-3.5" />
            <span>Move to…</span>
          </button>

          <button
            type="button"
            onClick={handleTrash}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#131620] hover:bg-[#F43F5E]/20 border border-[#1E2230] text-[#F43F5E] text-xs font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Trash</span>
          </button>
        </div>

        {/* Metadata Properties */}
        <dl className="space-y-3 pt-3 border-t border-[#1E2230] text-xs">
          <div>
            <dt className="text-[#8A94A6]">Location Path</dt>
            <dd className="text-[#F3F4F6] mt-0.5 break-all">{pathString}</dd>
          </div>

          {isFile && (
            <>
              <div>
                <dt className="text-[#8A94A6]">Storage Mount</dt>
                <dd className="text-[#F3F4F6] mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>{mount?.name ?? node.providerId}</span>
                  {mount && PROVIDER_KIND_META[mount.kind].isSimulated && (
                    <span className="text-[11px] font-mono text-[#8A94A6]">
                      · Simulated
                    </span>
                  )}
                  {isDisconnected && (
                    <span className="text-[11px] font-mono text-[#F43F5E]">
                      · Disconnected
                    </span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-[#8A94A6]">MIME Type</dt>
                <dd className="font-mono text-[#F3F4F6] mt-0.5">{node.mimeType}</dd>
              </div>

              <div>
                <dt className="text-[#8A94A6]">Size (SI)</dt>
                <dd className="font-mono text-[#F3F4F6] mt-0.5 tabular-nums">
                  {formatBytes(node.sizeBytes)} ({node.sizeBytes.toLocaleString()} B)
                </dd>
              </div>

              <div>
                <dt className="text-[#8A94A6]">SHA-256 Checksum</dt>
                <dd className="font-mono text-[11px] text-[#F3F4F6] mt-0.5 break-all bg-[#131620] p-2 rounded border border-[#1E2230]">
                  {node.checksumSha256 ?? 'Not computed'}
                </dd>
              </div>
            </>
          )}

          <div>
            <dt className="text-[#8A94A6]">Modified</dt>
            <dd
              title={formatFullTimestamp(node.updatedAt)}
              className="font-mono text-[#F3F4F6] mt-0.5 tabular-nums"
            >
              {formatRelativeOrShortDate(node.updatedAt)} ({formatFullTimestamp(node.updatedAt)})
            </dd>
          </div>

          <div>
            <dt className="text-[#8A94A6]">Created</dt>
            <dd
              title={formatFullTimestamp(node.createdAt)}
              className="font-mono text-[#F3F4F6] mt-0.5 tabular-nums"
            >
              {formatRelativeOrShortDate(node.createdAt)} ({formatFullTimestamp(node.createdAt)})
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}

export function FilePreviewModal() {
  const previewFileId = useVaultStore((s) => s.previewFileId);
  const setPreviewFileId = useVaultStore((s) => s.setPreviewFileId);
  const nodes = useVaultStore((s) => s.nodes);
  const mounts = useVaultStore((s) => s.mounts);
  const addToast = useVaultStore((s) => s.addToast);

  const fileNode = useMemo(() => {
    if (!previewFileId) return null;
    const found = nodes.find((n) => n.id === previewFileId);
    return found && found.type === 'file' ? (found as FileNode) : null;
  }, [nodes, previewFileId]);

  const mount = useMemo(() => {
    if (!fileNode) return null;
    return mounts.find((m) => m.id === fileNode.providerId) ?? null;
  }, [fileNode, mounts]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textTruncated, setTextTruncated] = useState(false);

  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Create object URL on open and revoke on close (§6)
  useEffect(() => {
    let activeUrl: string | null = null;
    let cancelled = false;

    if (!fileNode) {
      setObjectUrl(null);
      setTextContent(null);
      setError(null);
      if (prevFocusRef.current) {
        prevFocusRef.current.focus();
        prevFocusRef.current = null;
      }
      return;
    }

    prevFocusRef.current = document.activeElement as HTMLElement | null;
    setTimeout(() => closeBtnRef.current?.focus(), 15);

    if (!fileNode.hasBlob) {
      setLoading(false);
      setError('Placeholder asset — size is claimed, no bytes exist in browser storage.');
      return;
    }

    if (mount?.status === 'disconnected') {
      setLoading(false);
      setError(`Mount "${mount.name}" is disconnected. Reconnect to preview.`);
      return;
    }

    setLoading(true);
    setError(null);
    setObjectUrl(null);
    setTextContent(null);
    setTextTruncated(false);

    (async () => {
      try {
        const { url, blob } = await storageOrchestrator.getObjectUrl(fileNode.id);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        activeUrl = url;
        setObjectUrl(url);

        const ext = fileNode.extension.toLowerCase();
        const mime = fileNode.mimeType.toLowerCase();
        const isTextLike =
          mime.startsWith('text/') ||
          [
            'md',
            'txt',
            'json',
            'csv',
            'ts',
            'tsx',
            'js',
            'jsx',
            'py',
            'sql',
            'html',
            'css',
            'log',
            'yaml',
            'yml',
            'xml',
            'sh',
          ].includes(ext);

        if (isTextLike && ext !== 'svg') {
          const slice = blob.slice(0, MAX_TEXT_PREVIEW_BYTES);
          const text = await slice.text();
          if (!cancelled) {
            setTextContent(text);
            setTextTruncated(blob.size > MAX_TEXT_PREVIEW_BYTES);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load preview.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [fileNode, mount]);

  if (!fileNode) return null;

  const ext = fileNode.extension.toLowerCase();
  const mime = fileNode.mimeType.toLowerCase();
  const isSvg = ext === 'svg' || mime === 'image/svg+xml';
  const isImage =
    isSvg || mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);
  const isAudio = mime.startsWith('audio/') || ['wav', 'mp3', 'ogg', 'flac'].includes(ext);
  const isVideo = mime.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext);
  const isPdf = ext === 'pdf' || mime === 'application/pdf';
  const isMarkdown = ext === 'md' || mime.includes('markdown');
  // Note (§6): HTML files shown as plain text, never rendered; SVG only through <img>

  const canDownload = fileNode.hasBlob && mount?.status !== 'disconnected';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setPreviewFileId(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setPreviewFileId(null);
        }
      }}
    >
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[#1E2230] bg-[#090A0F]">
          <div className="min-w-0">
            <h2 id="preview-modal-title" className="text-[15px] font-bold text-[#F3F4F6] truncate">
              {fileNode.name}
            </h2>
            <p className="text-xs text-[#8A94A6] mt-0.5 font-mono tabular-nums">
              {mount?.name ?? fileNode.providerId} · {formatBytes(fileNode.sizeBytes)} · SHA-256:{' '}
              {fileNode.checksumSha256 ? `${fileNode.checksumSha256.slice(0, 16)}…` : 'Not computed'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!canDownload}
              onClick={async () => {
                try {
                  await storageOrchestrator.downloadFile(fileNode.id);
                  addToast({ title: `Downloaded "${fileNode.name}"`, variant: 'success' });
                } catch (err) {
                  addToast({
                    title: 'Download failed',
                    description: err instanceof Error ? err.message : undefined,
                    variant: 'error',
                  });
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>

            <button
              ref={closeBtnRef}
              type="button"
              onClick={() => setPreviewFileId(null)}
              aria-label="Close preview"
              className="p-1.5 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-[320px] overflow-y-auto p-6 bg-[#0E1017] flex flex-col">
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-48 h-4 bg-[#1E2230] rounded animate-pulse" />
              <p className="text-xs text-[#8A94A6]">Reading object bytes from mount…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
              <AlertCircle className="w-8 h-8 text-[#F59E0B] mb-3" />
              <p className="text-sm font-medium text-[#F3F4F6]">{error}</p>
            </div>
          )}

          {!loading && !error && objectUrl && (
            <>
              {isImage && (
                <div className="flex-1 flex items-center justify-center">
                  <img
                    src={objectUrl}
                    alt={fileNode.name}
                    className="max-h-[65vh] max-w-full object-contain rounded border border-[#1E2230]"
                  />
                </div>
              )}

              {isAudio && (
                <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="p-5 rounded-full bg-[#131620] border border-[#1E2230]">
                    <Music className="w-8 h-8 text-[#818CF8]" />
                  </div>
                  <p className="text-sm font-medium text-[#F3F4F6]">{fileNode.name}</p>
                  <audio controls src={objectUrl} className="w-full max-w-md" />
                </div>
              )}

              {isVideo && (
                <div className="flex-1 flex items-center justify-center">
                  <video
                    controls
                    src={objectUrl}
                    className="max-h-[65vh] max-w-full rounded border border-[#1E2230]"
                  />
                </div>
              )}

              {isPdf && (
                <object
                  data={objectUrl}
                  type="application/pdf"
                  className="w-full h-[65vh] rounded border border-[#1E2230]"
                >
                  <div className="p-8 text-center">
                    <p className="text-sm text-[#8A94A6] mb-3">
                      Inline PDF viewer is not available in this browser frame.
                    </p>
                  </div>
                </object>
              )}

              {!isImage && !isAudio && !isVideo && !isPdf && textContent !== null && (
                <div className="w-full">
                  {textTruncated && (
                    <div className="mb-3 px-3 py-2 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-xs text-[#F59E0B]">
                      Showing first 1.0 MB of file content. Download the file to view the full contents.
                    </div>
                  )}

                  {isMarkdown ? (
                    <div className="p-5 rounded-lg bg-[#131620] border border-[#1E2230] space-y-3 text-[14px] leading-relaxed text-[#F3F4F6] [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_h3]:font-bold [&_code]:font-mono [&_code]:bg-[#090A0F] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-[#090A0F] [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5 [&_table]:w-full [&_th]:text-left [&_th]:border-b [&_th]:border-[#1E2230] [&_th]:pb-1.5 [&_td]:py-1.5 [&_td]:border-b [&_td]:border-[#1E2230]/50">
                      {/* Markdown rendered without raw HTML (§6) */}
                      <Markdown skipHtml>{textContent}</Markdown>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-[#090A0F] border border-[#1E2230] overflow-x-auto">
                      {ext === 'html' && (
                        <div className="px-3.5 py-1.5 bg-[#131620] border-b border-[#1E2230] text-[11px] font-mono text-[#8A94A6]">
                          HTML file shown as plain text (never executed)
                        </div>
                      )}
                      <pre className="p-4 font-mono text-xs leading-relaxed text-[#F3F4F6] tabular-nums">
                        {textContent.split('\n').map((line, i) => (
                          <div key={i} className="table-row">
                            <span className="table-cell pr-4 text-right text-[#8A94A6]/60 select-none">
                              {i + 1}
                            </span>
                            <span className="table-cell whitespace-pre">{line}</span>
                          </div>
                        ))}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {!isImage && !isAudio && !isVideo && !isPdf && textContent === null && (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="w-10 h-10 text-[#818CF8] mb-3" />
                  <p className="text-sm font-medium text-[#F3F4F6]">
                    Binary file ({fileNode.mimeType})
                  </p>
                  <p className="text-xs text-[#8A94A6] mt-1">
                    Use the Download button above to save this object to your device.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
