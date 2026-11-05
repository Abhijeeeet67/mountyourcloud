import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  UploadCloud,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatBytes, formatEta, formatSpeed } from '../../lib/format';
import { storageOrchestrator } from '../../storage/orchestrator';
import { useVaultStore } from '../../store/useVaultStore';

export function TransferTray() {
  const uploadJobs = useVaultStore((s) => s.uploadJobs);
  const mounts = useVaultStore((s) => s.mounts);
  const [collapsed, setCollapsed] = useState(false);

  const mountMap = useMemo(() => new Map(mounts.map((m) => [m.id, m])), [mounts]);

  const { activeCount, aggregateSpeed, hasFinished } = useMemo(() => {
    let active = 0;
    let speed = 0;
    let done = false;
    for (const j of uploadJobs) {
      if (j.status === 'uploading' || j.status === 'queued' || j.status === 'paused') {
        active++;
      }
      if (j.status === 'uploading') {
        speed += j.speedBytesPerSec;
      }
      if (j.status === 'completed' || j.status === 'cancelled' || j.status === 'error') {
        done = true;
      }
    }
    return {
      activeCount: active,
      aggregateSpeed: speed,
      hasFinished: done,
    };
  }, [uploadJobs]);

  if (uploadJobs.length === 0) return null;

  return (
    <section
      aria-label="Multipart transfer queue"
      className="fixed bottom-0 inset-x-0 md:inset-x-auto md:bottom-4 md:right-4 z-40 w-full md:w-[420px] rounded-t-lg md:rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-2.5 bg-[#090A0F] border-b border-[#1E2230] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <UploadCloud className="w-4 h-4 text-[#818CF8] shrink-0" aria-hidden="true" />
          <span className="text-[13px] font-bold text-[#F3F4F6] truncate">
            Transfers ({activeCount} active)
          </span>
          {activeCount > 0 && (
            <span className="font-mono text-xs text-[#10B981] tabular-nums shrink-0">
              · {formatSpeed(aggregateSpeed)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasFinished && (
            <button
              type="button"
              onClick={() => storageOrchestrator.clearCompletedUploads(true)}
              className="text-xs text-[#8A94A6] hover:text-[#F3F4F6] px-2 py-0.5 rounded border border-[#1E2230]"
            >
              Clear finished
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand transfer tray' : 'Collapse transfer tray'}
            className="p-1 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
          >
            {collapsed ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Job List */}
      {!collapsed && (
        <div className="max-h-72 overflow-y-auto divide-y divide-[#1E2230] bg-[#131620]">
          {uploadJobs.map((job) => {
            const mount = mountMap.get(job.targetProviderId);
            const ratio =
              job.fileSize > 0
                ? Math.min(1, Math.max(0, job.uploadedBytes / job.fileSize))
                : job.status === 'completed'
                ? 1
                : 0;

            const currentPartDisplay =
              job.status === 'completed'
                ? `${job.totalParts}/${job.totalParts}`
                : `${Math.min(job.totalParts, job.completedParts + (job.status === 'uploading' ? 1 : 0))}/${job.totalParts}`;

            const statusBadge =
              job.status === 'completed' ? (
                <span className="inline-flex items-center gap-1 text-[#10B981]">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Completed</span>
                </span>
              ) : job.status === 'error' ? (
                <span className="inline-flex items-center gap-1 text-[#F43F5E]">
                  <AlertCircle className="w-3 h-3" />
                  <span>Failed</span>
                </span>
              ) : job.status === 'paused' ? (
                <span className="text-[#F59E0B]">Paused</span>
              ) : job.status === 'cancelled' ? (
                <span className="text-[#8A94A6]">Cancelled</span>
              ) : job.status === 'queued' ? (
                <span className="text-[#8A94A6]">Queued</span>
              ) : (
                <span className="text-[#818CF8]">Uploading</span>
              );

            const isReloadInterrupted =
              job.status === 'error' &&
              job.errorMessage?.includes('Interrupted by reload');

            return (
              <div key={job.id} className="p-3 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[#F3F4F6] truncate">{job.fileName}</p>
                    <p className="text-[11px] text-[#8A94A6] font-mono tabular-nums mt-0.5">
                      {mount?.name ?? job.targetProviderId} · Part {currentPartDisplay} ·{' '}
                      {formatBytes(job.uploadedBytes)} / {formatBytes(job.fileSize)}
                    </p>
                  </div>

                  {/* Controls: Pause / Resume / Cancel / Retry (§5) */}
                  <div className="flex items-center gap-1 shrink-0">
                    {job.status === 'uploading' && (
                      <button
                        type="button"
                        onClick={() => storageOrchestrator.pauseUpload(job.id)}
                        aria-label={`Pause ${job.fileName}`}
                        title="Pause multipart upload"
                        className="p-1 rounded bg-[#0E1017] border border-[#1E2230] text-[#8A94A6] hover:text-[#F3F4F6]"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {job.status === 'paused' && (
                      <button
                        type="button"
                        onClick={() => storageOrchestrator.resumeUpload(job.id)}
                        aria-label={`Resume ${job.fileName}`}
                        title="Resume multipart upload"
                        className="p-1 rounded bg-[#0E1017] border border-[#1E2230] text-[#10B981] hover:text-white"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {job.status === 'error' && !isReloadInterrupted && (
                      <button
                        type="button"
                        onClick={() => storageOrchestrator.retryUpload(job.id)}
                        aria-label={`Retry ${job.fileName}`}
                        title="Retry from first incomplete part"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#4F46E5] text-white font-medium"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    )}

                    {job.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => storageOrchestrator.dismissUpload(job.id)}
                        aria-label={`Dismiss ${job.fileName}`}
                        title="Dismiss failed upload"
                        className="p-1 rounded bg-[#0E1017] border border-[#1E2230] text-[#8A94A6] hover:text-[#F43F5E]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {(job.status === 'uploading' ||
                      job.status === 'queued' ||
                      job.status === 'paused') && (
                      <button
                        type="button"
                        onClick={() => storageOrchestrator.cancelUpload(job.id)}
                        aria-label={`Cancel ${job.fileName}`}
                        title="Cancel and abort multipart upload"
                        className="p-1 rounded bg-[#0E1017] border border-[#1E2230] text-[#8A94A6] hover:text-[#F43F5E]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar animated strictly with transform: scaleX (§5, §9) */}
                <div className="w-full h-1.5 rounded-full bg-[#090A0F] border border-[#1E2230] overflow-hidden">
                  <div
                    className={`h-full origin-left tv-transition ${
                      job.status === 'completed'
                        ? 'bg-[#10B981]'
                        : job.status === 'error'
                        ? 'bg-[#F43F5E]'
                        : job.status === 'paused'
                        ? 'bg-[#F59E0B]'
                        : 'bg-[#4F46E5]'
                    }`}
                    style={{ transform: `scaleX(${ratio})` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#8A94A6]">
                  <div>{statusBadge}</div>
                  {job.status === 'uploading' && (
                    <div>
                      {formatSpeed(job.speedBytesPerSec)} · ETA {formatEta(job.etaSeconds)}
                    </div>
                  )}
                </div>

                {job.errorMessage && (
                  <p className="text-[11px] text-[#F43F5E] bg-[#F43F5E]/10 border border-[#F43F5E]/30 rounded px-2 py-1">
                    {job.errorMessage}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
