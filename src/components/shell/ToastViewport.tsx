import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';

export function ToastViewport() {
  const toasts = useVaultStore((s) => s.toasts);
  const dismissToast = useVaultStore((s) => s.dismissToast);
  const uploadAnnouncement = useVaultStore((s) => s.uploadAnnouncement);

  return (
    <>
      {/* Screen-reader polite announcer for upload completion/failure only (§5) */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {uploadAnnouncement}
      </div>

      {/* Visual + accessible toast notifications */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((toast) => {
          const Icon =
            toast.variant === 'success'
              ? CheckCircle2
              : toast.variant === 'error' || toast.variant === 'warning'
              ? AlertCircle
              : Info;

          const iconColor =
            toast.variant === 'success'
              ? 'text-[#10B981]'
              : toast.variant === 'warning'
              ? 'text-[#F59E0B]'
              : toast.variant === 'error'
              ? 'text-[#F43F5E]'
              : 'text-[#818CF8]';

          return (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex items-start gap-3 rounded-lg bg-[#131620] border border-[#1E2230] px-3.5 py-2.5 text-[#F3F4F6] tv-transition"
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true" />
              <div className="flex-1 min-w-0 text-[13px]">
                <p className="font-medium text-[#F3F4F6] leading-snug">{toast.title}</p>
                {toast.description && (
                  <p className="text-[#8A94A6] text-xs mt-0.5 leading-relaxed">
                    {toast.description}
                  </p>
                )}
              </div>
              {toast.actionLabel && toast.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    toast.onAction?.();
                    dismissToast(toast.id);
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-[#818CF8] hover:text-white bg-[#0E1017] border border-[#1E2230] rounded whitespace-nowrap shrink-0"
                >
                  {toast.actionLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="text-[#8A94A6] hover:text-[#F3F4F6] p-0.5 rounded shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
