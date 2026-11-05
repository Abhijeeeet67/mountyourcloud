import { Activity, HardDrive, Layers, TrendingDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FILE_CATEGORIES,
  PROVIDER_KIND_META,
  getFileCategory,
} from '../lib/constants';
import { SI_GB, formatBytes } from '../lib/format';
import {
  PROVIDER_EGRESS_RATES_USD_PER_GB,
  calculateZeroEgressSavingsUsd,
} from '../lib/pricing';
import { computeMountUsedBytesMap, useVaultStore } from '../store/useVaultStore';

export function AnalyticsPage() {
  const nodes = useVaultStore((s) => s.nodes);
  const mounts = useVaultStore((s) => s.mounts);
  const activity = useVaultStore((s) => s.activity);

  const [windowDays, setWindowDays] = useState<7 | 30>(30);

  const mountUsageMap = useMemo(() => computeMountUsedBytesMap(nodes), [nodes]);
  const mountMap = useMemo(() => new Map(mounts.map((m) => [m.id, m])), [mounts]);

  // Capacity by File Type & Total Used (computed from real nodes, §7, §13)
  const { totalUsedBytes, byCategory, byProvider } = useMemo(() => {
    let total = 0;
    const catTotals = new Map<string, { bytes: number; count: number }>();
    for (const c of FILE_CATEGORIES) {
      if (c.id !== 'all') catTotals.set(c.id, { bytes: 0, count: 0 });
    }

    for (const n of nodes) {
      if (n.type === 'file') {
        total += n.sizeBytes;
        const cat = getFileCategory(n.mimeType, n.extension);
        const rec = catTotals.get(cat) ?? { bytes: 0, count: 0 };
        rec.bytes += n.sizeBytes;
        rec.count += 1;
        catTotals.set(cat, rec);
      }
    }

    const catArray = Array.from(catTotals.entries())
      .map(([id, data]) => ({
        id,
        label: FILE_CATEGORIES.find((c) => c.id === id)?.label ?? id,
        bytes: data.bytes,
        count: data.count,
        ratio: total > 0 ? data.bytes / total : 0,
      }))
      .sort((a, b) => b.bytes - a.bytes);

    const provArray = mounts
      .map((m) => {
        const u = mountUsageMap.get(m.id) ?? { usedBytes: 0, fileCount: 0 };
        return {
          mount: m,
          bytes: u.usedBytes,
          count: u.fileCount,
          ratio: total > 0 ? u.usedBytes / total : 0,
        };
      })
      .sort((a, b) => b.bytes - a.bytes);

    return {
      totalUsedBytes: total,
      byCategory: catArray,
      byProvider: provArray,
    };
  }, [nodes, mounts, mountUsageMap]);

  // Daily Ingress/Egress chart data for 7D or 30D (§7)
  const { chartData, totalIngressBytes, totalEgressBytes, zeroEgressBytes, savingsUsd } =
    useMemo(() => {
      const dayMs = 24 * 60 * 60 * 1000;
      const now = Date.now();
      const buckets: {
        dateKey: string;
        label: string;
        startTs: number;
        endTs: number;
        ingressBytes: number;
        egressBytes: number;
      }[] = [];

      for (let i = windowDays - 1; i >= 0; i--) {
        const d = new Date(now - i * dayMs);
        d.setHours(0, 0, 0, 0);
        const startTs = d.getTime();
        const endTs = startTs + dayMs;
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        buckets.push({
          dateKey: d.toISOString().slice(0, 10),
          label,
          startTs,
          endTs,
          ingressBytes: 0,
          egressBytes: 0,
        });
      }

      const cutoff = now - 30 * dayMs;
      let monthZeroEgress = 0;
      let winIngress = 0;
      let winEgress = 0;

      for (const ev of activity) {
        if (ev.ts >= cutoff && ev.kind === 'egress') {
          const m = mountMap.get(ev.providerId);
          if (m?.zeroEgress) {
            monthZeroEgress += ev.bytes;
          }
        }

        for (const b of buckets) {
          if (ev.ts >= b.startTs && ev.ts < b.endTs) {
            if (ev.kind === 'ingress') {
              b.ingressBytes += ev.bytes;
              winIngress += ev.bytes;
            } else {
              b.egressBytes += ev.bytes;
              winEgress += ev.bytes;
            }
            break;
          }
        }
      }

      const data = buckets.map((b) => ({
        date: b.label,
        ingressGB: Number((b.ingressBytes / SI_GB).toFixed(2)),
        egressGB: Number((b.egressBytes / SI_GB).toFixed(2)),
      }));

      return {
        chartData: data,
        totalIngressBytes: winIngress,
        totalEgressBytes: winEgress,
        zeroEgressBytes: monthZeroEgress,
        savingsUsd: calculateZeroEgressSavingsUsd(monthZeroEgress),
      };
    }, [activity, windowDays, mountMap]);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#F3F4F6]">Storage & Bandwidth Analytics</h1>
          <p className="text-xs text-[#8A94A6] mt-0.5">
            Real-time capacity distribution across file types and mounts, plus bandwidth activity trends.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs bg-[#131620] border border-[#1E2230] px-3 py-1.5 rounded-md tabular-nums">
          <span className="text-[#8A94A6]">Total Managed Storage:</span>
          <span className="font-bold text-[#F3F4F6]">{formatBytes(totalUsedBytes)}</span>
        </div>
      </div>

      {/* Zero-Egress Savings Card (§7) */}
      <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#10B981]">
            <TrendingDown className="w-4 h-4" />
            <span>Zero-Egress Routing Savings (30-Day Window)</span>
          </div>
          <p className="text-[14px] text-[#F3F4F6]">
            Routing <strong className="font-mono">{formatBytes(zeroEgressBytes)}</strong> of egress through zero-egress mounts (Cloudflare R2, WebDAV, Local Vault) saved an estimated{' '}
            <strong className="font-mono text-[#10B981]">${savingsUsd.toFixed(2)}</strong> this month compared to standard S3 egress (${PROVIDER_EGRESS_RATES_USD_PER_GB.s3}/GB illustrative rate).
          </p>
        </div>

        <div className="shrink-0 p-3.5 rounded-lg bg-[#0E1017] border border-[#1E2230] text-right font-mono tabular-nums">
          <p className="text-[11px] text-[#8A94A6]">Estimated 30D Savings</p>
          <p className="text-2xl font-bold text-[#10B981]">${savingsUsd.toFixed(2)}</p>
        </div>
      </div>

      {/* Capacity Breakdown Grid: By File Type & By Provider (§7) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Capacity by File Type */}
        <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#818CF8]" />
              <h2 className="text-[15px] font-bold text-[#F3F4F6]">Capacity by File Type</h2>
            </div>
            <span className="font-mono text-xs text-[#8A94A6] tabular-nums">
              {formatBytes(totalUsedBytes)} total
            </span>
          </div>

          <div className="space-y-3">
            {byCategory.map((item) => (
              <div key={item.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#F3F4F6]">
                    {item.label}{' '}
                    <span className="text-[#8A94A6] font-mono">({item.count} files)</span>
                  </span>
                  <span className="font-mono text-[#F3F4F6] tabular-nums">
                    {formatBytes(item.bytes)} · {(item.ratio * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#090A0F] rounded-full overflow-hidden border border-[#1E2230]">
                  <div
                    className="h-full bg-[#4F46E5] origin-left tv-transition"
                    style={{ transform: `scaleX(${item.ratio})` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Capacity by Storage Provider Mount */}
        <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#818CF8]" />
              <h2 className="text-[15px] font-bold text-[#F3F4F6]">Capacity by Provider Mount</h2>
            </div>
            <span className="font-mono text-xs text-[#8A94A6] tabular-nums">
              {mounts.length} mounts
            </span>
          </div>

          <div className="space-y-3.5">
            {byProvider.map(({ mount, bytes, count, ratio }) => {
              const meta = PROVIDER_KIND_META[mount.kind];
              return (
                <div key={mount.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium text-[#F3F4F6] truncate">{mount.name}</span>
                      <span className="text-[#8A94A6] font-mono">
                        · {meta.shortLabel} ({count})
                      </span>
                      {meta.isSimulated && (
                        <span className="text-[10px] font-mono text-[#8A94A6]">
                          · Simulated
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[#F3F4F6] tabular-nums shrink-0">
                      {formatBytes(bytes)} · {(ratio * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#090A0F] rounded-full overflow-hidden border border-[#1E2230]">
                    <div
                      className="h-full bg-[#818CF8] origin-left tv-transition"
                      style={{ transform: `scaleX(${ratio})` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ingress / Egress Area Chart with 7D / 30D Toggle (§7: labelled "Includes sample history") */}
      <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <Activity className="w-4 h-4 text-[#818CF8]" />
              <h2 className="text-[15px] font-bold text-[#F3F4F6]">
                Ingress & Egress Bandwidth Volume
              </h2>
              <span className="px-2 py-0.5 text-[11px] font-mono text-[#8A94A6] bg-[#0E1017] border border-[#1E2230] rounded">
                Includes sample history
              </span>
            </div>
            <p className="text-xs text-[#8A94A6] mt-1 font-mono tabular-nums">
              {windowDays}D Window — Ingress: {formatBytes(totalIngressBytes)} · Egress:{' '}
              {formatBytes(totalEgressBytes)}
            </p>
          </div>

          {/* 7 D / 30 D Segmented Toggle */}
          <div
            role="group"
            aria-label="Chart time range"
            className="inline-flex p-0.5 rounded-md bg-[#0E1017] border border-[#1E2230] self-start sm:self-auto"
          >
            <button
              type="button"
              onClick={() => setWindowDays(7)}
              className={`px-3 py-1 rounded text-xs font-mono font-medium ${
                windowDays === 7
                  ? 'bg-[#4F46E5] text-white'
                  : 'text-[#8A94A6] hover:text-[#F3F4F6]'
              }`}
            >
              7 D
            </button>
            <button
              type="button"
              onClick={() => setWindowDays(30)}
              className={`px-3 py-1 rounded text-xs font-mono font-medium ${
                windowDays === 30
                  ? 'bg-[#4F46E5] text-white'
                  : 'text-[#8A94A6] hover:text-[#F3F4F6]'
              }`}
            >
              30 D
            </button>
          </div>
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ingressGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818CF8" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#818CF8" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="egressGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1E2230" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#8A94A6"
                tick={{ fill: '#8A94A6', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
              />
              <YAxis
                stroke="#8A94A6"
                tick={{ fill: '#8A94A6', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                unit=" GB"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#090A0F',
                  borderColor: '#1E2230',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono',
                  color: '#F3F4F6',
                }}
              />
              <Area
                type="monotone"
                dataKey="ingressGB"
                name="Ingress (GB)"
                stroke="#818CF8"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#ingressGrad)"
              />
              <Area
                type="monotone"
                dataKey="egressGB"
                name="Egress (GB)"
                stroke="#10B981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#egressGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
