// SI units everywhere: 1 KB = 10^3, 1 MB = 10^6, 1 GB = 10^9, 1 TB = 10^12
export const SI_KB = 1_000;
export const SI_MB = 1_000_000;
export const SI_GB = 1_000_000_000;
export const SI_TB = 1_000_000_000_000;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < SI_KB) return `${Math.round(bytes)} B`;
  if (bytes < SI_MB) return `${(bytes / SI_KB).toFixed(1)} KB`;
  if (bytes < SI_GB) return `${(bytes / SI_MB).toFixed(1)} MB`;
  if (bytes < SI_TB) return `${(bytes / SI_GB).toFixed(1)} GB`;
  return `${(bytes / SI_TB).toFixed(1)} TB`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0.0 MB/s';
  const mbps = bytesPerSec / SI_MB;
  if (mbps < 0.1) {
    return `${(bytesPerSec / SI_KB).toFixed(0)} KB/s`;
  }
  return `${mbps.toFixed(1)} MB/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const rounded = Math.ceil(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (mins < 60) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatRelativeOrShortDate(ts: number, now: number = Date.now()): string {
  const diffMs = now - ts;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  if (diffMs >= 0 && diffMs < sevenDaysMs) {
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  }

  const d = new Date(ts);
  const month = MONTHS_SHORT[d.getMonth()] ?? 'Jan';
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

export function formatFullTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform || navigator.userAgent || '';
  return /Mac|iPhone|iPod|iPad/i.test(platform);
}

export function modKeySymbol(): string {
  return isApplePlatform() ? '⌘' : 'Ctrl+';
}
