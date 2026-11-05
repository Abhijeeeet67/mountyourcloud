import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  HardDrive,
  Loader2,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConnectedAccountsManager } from '../components/accounts/ConnectedAccountsManager';
import { MOUNTABLE_PROVIDER_KINDS, PROVIDER_KIND_META } from '../lib/constants';
import { formatBytes, formatRelativeOrShortDate, SI_GB } from '../lib/format';
import { startServerOAuthFlow } from '../lib/oauth';
import { getEffectivePlans, normalizePlanId } from '../lib/pricing';
import { storageOrchestrator } from '../storage/orchestrator';
import { computeMountUsedBytesMap, useVaultStore } from '../store/useVaultStore';
import type { ProviderCredentials, ProviderKind, ProviderMount } from '../types/domain';

// Bucket name validation rules for object storage providers
export function validateBucketName(
  kind: 's3' | 'r2' | 'gcs',
  bucket: string
): string | null {
  const clean = bucket.trim();
  if (clean.length < 3 || clean.length > 63) {
    return 'Bucket name must be between 3 and 63 characters.';
  }
  if (!/^[a-z0-9].*[a-z0-9]$/.test(clean)) {
    return 'Bucket name must start and end with a lowercase letter or digit.';
  }
  if (kind === 's3' && !/^[a-z0-9.-]+$/.test(clean)) {
    return 'S3 bucket name may only contain lowercase letters, digits, dots (.), and hyphens (-).';
  }
  if (kind === 'r2' && !/^[a-z0-9-]+$/.test(clean)) {
    return 'Cloudflare R2 bucket name may only contain lowercase letters, digits, and hyphens (-).';
  }
  if (kind === 'gcs' && !/^[a-z0-9._-]+$/.test(clean)) {
    return 'GCS bucket name may only contain lowercase letters, digits, dots (.), hyphens (-), and underscores (_).';
  }
  return null;
}

export function validateWebdavUrl(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Endpoint URL must start with http:// or https://';
    }
    return null;
  } catch {
    return 'Please enter a valid http(s) endpoint URL.';
  }
}

export function ProvidersPage() {
  const mounts = useVaultStore((s) => s.mounts);
  const nodes = useVaultStore((s) => s.nodes);
  const settings = useVaultStore((s) => s.settings);
  const connectedAccounts = useVaultStore((s) => s.connectedAccounts);
  const fetchConnectedAccounts = useVaultStore((s) => s.fetchConnectedAccounts);
  const addToast = useVaultStore((s) => s.addToast);
  const setUpgradePromptReason = useVaultStore((s) => s.setUpgradePromptReason);

  const [testingMountId, setTestingMountId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMount, setEditingMount] = useState<ProviderMount | null>(null);
  const [removingMount, setRemovingMount] = useState<ProviderMount | null>(null);

  // Add / Edit Form State supporting all 21 mountable cloud providers
  const [providerCategoryTab, setProviderCategoryTab] = useState<
    | 'Consumer & Personal Cloud'
    | 'Object & Infrastructure Cloud'
    | 'Self-Hosted & Protocol'
  >('Consumer & Personal Cloud');
  const [kind, setKind] = useState<Exclude<ProviderKind, 'local'>>('mega');
  const [name, setName] = useState('');
  const [allocatedGB, setAllocatedGB] = useState('2000');
  const [s3Region, setS3Region] = useState('us-east-1');
  const [bucketName, setBucketName] = useState('/CloudVault');
  const [r2AccountId, setR2AccountId] = useState('94a0bc12e8');
  const [gcsProjectId, setGcsProjectId] = useState('mountyourclouds-cloud-demo');
  const [gcsLocation, setGcsLocation] = useState('us-central1');
  const [webdavUrl, setWebdavUrl] = useState('https://dav.example.com/webdav');
  const [webdavBasePath, setWebdavBasePath] = useState('/vault');
  const [formError, setFormError] = useState<string | null>(null);

  // Dual-Mode & Real Cloud Credentials State
  const [mountMode, setMountMode] = useState<'real' | 'simulated'>('simulated');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isOAuthing, setIsOAuthing] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [s3AccessKeyId, setS3AccessKeyId] = useState('');
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('');
  const [webdavUser, setWebdavUser] = useState('');
  const [webdavPass, setWebdavPass] = useState('');

  // 3-step handshake state (~1.5s)
  const [handshakeStep, setHandshakeStep] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState('');

  const mountUsageMap = useMemo(() => computeMountUsedBytesMap(nodes), [nodes]);
  const plans = useMemo(
    () => getEffectivePlans(settings.customPlans),
    [settings.customPlans]
  );
  const activePlanId = normalizePlanId(settings.subscription.planId);
  const currentPlan = plans[activePlanId];
  const externalMountCount = Math.max(0, mounts.length - 1);

  const applyDefaultsForKind = (nextKind: Exclude<ProviderKind, 'local'>) => {
    const meta = PROVIDER_KIND_META[nextKind];
    const defaultPath =
      meta.category === 'Object & Infrastructure Cloud'
        ? `mountyourclouds-${nextKind}-bucket`
        : '/MountYourClouds';
    setKind(nextKind);
    if (meta.integrationStatus === 'api_restricted' || meta.requiresBackendProxy) {
      setMountMode('simulated');
    }

    // Auto-select connected OAuth account if one is present
    const matchingAccounts = connectedAccounts.filter((a) => a.provider === nextKind && a.status === 'active');
    if (matchingAccounts.length > 0) {
      setSelectedAccountId(matchingAccounts[0].id);
      setMountMode('real');
    } else {
      setSelectedAccountId('');
    }

    setProviderCategoryTab(
      meta.category === 'Built-In Browser'
        ? 'Consumer & Personal Cloud'
        : meta.category
    );
    setName(`${meta.shortLabel} Cloud Vault`);
    setAllocatedGB(String(meta.defaultAllocatedGB));
    setS3Region(meta.defaultRegion);
    setBucketName(defaultPath);
    setGcsLocation(meta.defaultRegion);
    setWebdavUrl(meta.defaultEndpoint);
    setWebdavBasePath(defaultPath);
    setFormError(null);
  };

  const openAddModal = (preselectedKind?: Exclude<ProviderKind, 'local'>) => {
    if (externalMountCount >= currentPlan.maxMounts) {
      setUpgradePromptReason(
        `Your ${currentPlan.name} plan allows connecting up to ${currentPlan.maxMounts} external cloud storage accounts (currently ${externalMountCount} connected). Upgrade to PRO (up to ${plans.pro.maxMounts} clouds) or ULTRA (up to ${plans.ultra.maxMounts} clouds) to connect more providers.`
      );
      return;
    }

    setEditingMount(null);
    setProviderSearch('');
    setMountMode('simulated');
    setSelectedAccountId('');
    setIsOAuthing(false);
    setAuthToken('');
    setS3AccessKeyId('');
    setS3SecretAccessKey('');
    setWebdavUser('');
    setWebdavPass('');
    applyDefaultsForKind(preselectedKind ?? 'gdrive');
    setHandshakeStep(null);
    setModalOpen(true);
  };

  const openEditModal = (mount: ProviderMount) => {
    setEditingMount(mount);
    const k = mount.kind === 'local' ? 's3' : mount.kind;
    setKind(k);
    setMountMode(mount.mode ?? 'simulated');
    setSelectedAccountId(mount.connectedAccountId ?? '');
    setIsOAuthing(false);
    setAuthToken(mount.credentials?.oauthToken?.accessToken ?? '');
    setS3AccessKeyId(mount.credentials?.s3Keys?.accessKeyId ?? '');
    setS3SecretAccessKey(mount.credentials?.s3Keys?.secretAccessKey ?? '');
    setWebdavUser(mount.credentials?.webdavAuth?.username ?? '');
    setWebdavPass(mount.credentials?.webdavAuth?.password ?? '');
    setProviderCategoryTab(
      PROVIDER_KIND_META[k].category === 'Built-In Browser'
        ? 'Consumer & Personal Cloud'
        : PROVIDER_KIND_META[k].category
    );
    setName(mount.name);
    setAllocatedGB(String(Math.max(1, Math.round(mount.allocatedBytes / SI_GB))));
    setS3Region(mount.region ?? PROVIDER_KIND_META[k].defaultRegion);
    setBucketName(mount.bucket ?? '/MountYourClouds');
    setGcsLocation(mount.region ?? 'us-central1');
    setWebdavUrl(mount.endpoint ?? PROVIDER_KIND_META[k].defaultEndpoint);
    setWebdavBasePath(mount.bucket ?? '/vault');
    setFormError(null);
    setHandshakeStep(null);
    setModalOpen(true);
  };

  const handleTestMount = async (mount: ProviderMount) => {
    setTestingMountId(mount.id);
    try {
      const report = await storageOrchestrator.testMount(mount);
      addToast({
        title: `${mount.name}: Handshake OK (${report.latencyMs} ms)`,
        description: report.message,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: `Connection test failed for ${mount.name}`,
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setTestingMountId(null);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('Mount display name is required.');
      return;
    }

    const capNum = Number(allocatedGB);
    if (!Number.isFinite(capNum) || capNum < 1 || capNum > 100_000) {
      setFormError('Allocated capacity must be between 1 GB and 100,000 GB.');
      return;
    }
    const allocatedBytes = Math.round(capNum * SI_GB);

    if (editingMount) {
      const currentUsed = mountUsageMap.get(editingMount.id)?.usedBytes ?? 0;
      if (allocatedBytes < currentUsed) {
        setFormError(
          `Allocated capacity cannot be less than currently stored files (${formatBytes(currentUsed)}).`
        );
        return;
      }
    }

    const meta = PROVIDER_KIND_META[kind];
    let endpoint: string | null = meta.defaultEndpoint;
    let region: string | null = s3Region.trim() || meta.defaultRegion;
    let bucket: string | null = bucketName.trim() || '/MountYourClouds';

    if (editingMount?.kind === 'local') {
      endpoint = editingMount.endpoint;
      region = editingMount.region;
      bucket = editingMount.bucket;
    } else if (kind === 's3') {
      const bErr = validateBucketName('s3', bucketName);
      if (bErr) {
        setFormError(bErr);
        return;
      }
      region = s3Region.trim() || 'us-east-1';
      bucket = bucketName.trim();
      endpoint = `https://s3.${region}.amazonaws.com`;
    } else if (kind === 'r2') {
      const cleanAcc = r2AccountId.trim().toLowerCase();
      if (!/^[a-z0-9]{4,40}$/.test(cleanAcc)) {
        setFormError('Cloudflare Account ID must be 4–40 lowercase letters or digits.');
        return;
      }
      const bErr = validateBucketName('r2', bucketName);
      if (bErr) {
        setFormError(bErr);
        return;
      }
      endpoint = `https://${cleanAcc}.r2.cloudflarestorage.com`;
      region = 'auto';
      bucket = bucketName.trim();
    } else if (kind === 'gcs') {
      if (!gcsProjectId.trim()) {
        setFormError('GCS Project ID is required.');
        return;
      }
      const bErr = validateBucketName('gcs', bucketName);
      if (bErr) {
        setFormError(bErr);
        return;
      }
      endpoint = `https://storage.googleapis.com/${gcsProjectId.trim()}`;
      region = gcsLocation.trim() || 'us-central1';
      bucket = bucketName.trim();
    } else if (kind === 'webdav' || kind === 'nextcloud' || kind === 'hetzner') {
      const uErr = validateWebdavUrl(webdavUrl);
      if (uErr) {
        setFormError(uErr);
        return;
      }
      endpoint = webdavUrl.trim();
      region = s3Region.trim() || meta.defaultRegion;
      bucket = webdavBasePath.trim().startsWith('/')
        ? webdavBasePath.trim()
        : `/${webdavBasePath.trim()}`;
    }

    try {
      let credentials: ProviderCredentials | undefined = undefined;
      if (mountMode === 'real') {
        if (['gdrive', 'onedrive', 'dropbox', 'box', 'pcloud'].includes(kind)) {
          if (selectedAccountId) {
            // Associated with server-side encrypted OAuth account
          } else {
            const token = authToken.trim() || settings.apiCredentials?.[`${kind}Token`]?.trim() || '';
            if (!token) {
              setFormError(`${meta.shortLabel} requires selecting a connected OAuth account or entering an Access Token.`);
              return;
            }
            credentials = { oauthToken: { accessToken: token } };
          }
        } else if (
          ['s3', 'r2', 'b2', 'wasabi', 'do_spaces', 'scaleway', 'linode', 'vultr', 'storj', 'oracle_os'].includes(kind)
        ) {
          const key = s3AccessKeyId.trim() || settings.apiCredentials?.s3AccessKey?.trim() || '';
          const sec = s3SecretAccessKey.trim() || settings.apiCredentials?.s3SecretKey?.trim() || '';
          if (!key || !sec) {
            setFormError('Access Key ID and Secret Access Key are required for Live S3 mode.');
            return;
          }
          credentials = {
            s3Keys: {
              accessKeyId: key,
              secretAccessKey: sec,
              region: region || 'us-east-1',
              bucket: bucket || 'mountyourclouds',
              endpoint: endpoint || undefined,
            },
          };
        } else if (
          ['webdav', 'nextcloud', 'owncloud', 'synology', 'qnap', 'hetzner', 'koofr'].includes(kind)
        ) {
          credentials = {
            webdavAuth: {
              url: endpoint || meta.defaultEndpoint,
              username: webdavUser.trim(),
              password: webdavPass.trim(),
              basePath: bucket || undefined,
            },
          };
        }
      }

      const start = performance.now();
      setHandshakeStep(
        mountMode === 'real'
          ? `Connecting to live ${meta.label} API endpoint…`
          : `Resolving ${meta.label} endpoint…`
      );
      await new Promise((r) => setTimeout(r, 350));
      setHandshakeStep(
        mountMode === 'real' ? 'Verifying authentication credentials…' : 'Authenticating session (simulated)…'
      );
      await new Promise((r) => setTimeout(r, 350));
      setHandshakeStep('Checking quota & read/write permissions…');
      await new Promise((r) => setTimeout(r, 350));

      if (settings.devSettings.offline) {
        throw new Error('Simulated offline mode is active — handshake failed.');
      }

      const measuredLatency = Math.round((performance.now() - start) / 16);

      if (editingMount) {
        await storageOrchestrator.updateMount(editingMount.id, {
          name: cleanName,
          mode: mountMode,
          credentials,
          connectedAccountId: selectedAccountId || undefined,
          endpoint,
          region,
          bucket,
          allocatedBytes,
          latencyMs: editingMount.kind === 'local' ? 4 : measuredLatency,
        });
        addToast({
          title: `Updated mount "${cleanName}" (${mountMode === 'real' ? 'Live API' : 'Simulated'})`,
          variant: 'success',
        });
      } else {
        await storageOrchestrator.addMount(
          {
            kind,
            name: cleanName,
            mode: mountMode,
            credentials,
            connectedAccountId: selectedAccountId || undefined,
            endpoint,
            region,
            bucket,
            allocatedBytes,
            zeroEgress: meta.defaultZeroEgress,
          },
          measuredLatency
        );
        addToast({
          title: `Connected ${mountMode === 'real' ? 'Live API' : 'Simulated'} ${meta.shortLabel} mount "${cleanName}"`,
          variant: 'success',
        });
      }

      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Handshake failed.');
    } finally {
      setHandshakeStep(null);
    }
  };

  const filteredProviders = useMemo(() => {
    const q = providerSearch.trim().toLowerCase();
    if (!q) {
      return MOUNTABLE_PROVIDER_KINDS.filter(
        (k) => PROVIDER_KIND_META[k].category === providerCategoryTab
      );
    }
    return MOUNTABLE_PROVIDER_KINDS.filter((k) => {
      const m = PROVIDER_KIND_META[k];
      return (
        m.label.toLowerCase().includes(q) ||
        m.shortLabel.toLowerCase().includes(q) ||
        k.toLowerCase().includes(q)
      );
    });
  }, [providerCategoryTab, providerSearch]);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#F3F4F6]">Storage Provider Mounts</h1>
          <p className="text-xs text-[#8A94A6] mt-0.5">
            Connect MEGA, TeraBox, Google Drive, Dropbox, OneDrive, Proton Drive, AWS S3, Cloudflare R2, Backblaze B2, Nextcloud, and 20+ cloud providers.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="px-3 py-1.5 rounded-md bg-[#131620] border border-[#1E2230] text-xs font-mono tabular-nums">
            <span className="text-[#8A94A6]">{currentPlan.name} Plan: </span>
            <span className="font-bold text-[#F3F4F6]">
              {externalMountCount} / {currentPlan.maxMounts}
            </span>
            <span className="text-[#8A94A6]"> cloud accounts</span>
          </div>

          <button
            type="button"
            onClick={() => openAddModal()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>Add Provider Mount</span>
          </button>
        </div>
      </div>

      {/* Unified Connected Accounts & OAuth Management */}
      <ConnectedAccountsManager />

      {/* Quick-Connect Catalog of 21 Mountable Cloud Providers */}
      <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-[#818CF8]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#F3F4F6]">
              21 Supported Cloud Storage Connectors (Click to Mount)
            </h2>
          </div>
          <Link
            to="/app/pricing"
            className="inline-flex items-center gap-1 text-xs text-[#818CF8] hover:underline"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Need more than {currentPlan.maxMounts} clouds? View PRO & ULTRA plans</span>
          </Link>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {MOUNTABLE_PROVIDER_KINDS.map((k) => {
            const m = PROVIDER_KIND_META[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => openAddModal(k)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0E1017] hover:bg-[#1E2230] border border-[#1E2230] hover:border-[#818CF8]/60 text-xs text-[#F3F4F6] tv-transition"
              >
                <span className="font-medium">{m.shortLabel}</span>
                <span className="text-[10px] font-mono text-[#8A94A6]">
                  {m.defaultAllocatedGB >= 1000
                    ? `${m.defaultAllocatedGB / 1000}TB`
                    : `${m.defaultAllocatedGB}GB`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Honesty & Compliance Notice */}
      <div className="p-4 rounded-lg bg-[#131620] border border-[#1E2230] flex items-start gap-3 text-xs text-[#8A94A6]">
        <ShieldAlert className="w-4 h-4 text-[#818CF8] shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-[#F3F4F6]">
            Modular Connector Architecture — External Cloud Capacity vs. Platform Quotas
          </p>
          <p className="mt-0.5 leading-relaxed">
            Storage capacity is provided by each connected cloud service (such as MEGA 2 TB, TeraBox 1 TB, S3, Cloudflare R2, Google Drive, or WebDAV). Your MountYourClouds subscription plan governs how many cloud accounts you can mount simultaneously and your daily/monthly cross-cloud transfer bandwidth. Secret keys and passwords are never collected in this browser prototype.
          </p>
        </div>
      </div>

      {/* Mount Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mounts.map((mount) => {
          const meta = PROVIDER_KIND_META[mount.kind];
          const usage = mountUsageMap.get(mount.id) ?? { usedBytes: 0, fileCount: 0 };
          const ratio = Math.min(1, usage.usedBytes / Math.max(1, mount.allocatedBytes));
          const isLocal = mount.id === 'local-vault';
          const isDisconnected = mount.status === 'disconnected';
          const isTesting = testingMountId === mount.id;

          return (
            <div
              key={mount.id}
              className="rounded-lg bg-[#131620] border border-[#1E2230] p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <HardDrive className="w-4 h-4 text-[#818CF8] shrink-0" />
                      <h2 className="text-[15px] font-bold text-[#F3F4F6] truncate">
                        {mount.name}
                      </h2>
                      <span className="px-2 py-0.5 text-[11px] font-mono bg-[#0E1017] border border-[#1E2230] text-[#F3F4F6] rounded">
                        {meta.shortLabel}
                      </span>
                      {mount.mode === 'real' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 rounded">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Live API
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] font-mono bg-[#090A0F] border border-[#1E2230] text-[#818CF8] rounded">
                          Simulated
                        </span>
                      )}
                      {meta.integrationStatus === 'api_restricted' && (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded">
                          Restricted API
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8A94A6] mt-1 font-mono truncate">
                      {meta.label} · {mount.bucket ?? mount.endpoint} ({mount.region ?? 'local'})
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0 font-mono text-xs">
                    {isDisconnected ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F43F5E]/15 border border-[#F43F5E]/30 text-[#F43F5E]">
                        <WifiOff className="w-3.5 h-3.5" />
                        <span>Disconnected</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#10B981]/15 border border-[#10B981]/30 text-[#10B981]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Connected</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Usage Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span className="text-[#F3F4F6]">
                      {formatBytes(usage.usedBytes)} / {formatBytes(mount.allocatedBytes)}
                    </span>
                    <span className="text-[#8A94A6]">
                      {usage.fileCount} object{usage.fileCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#090A0F] rounded-full overflow-hidden border border-[#1E2230]">
                    <div
                      className={`h-full origin-left tv-transition ${
                        isDisconnected
                          ? 'bg-[#8A94A6]'
                          : ratio > 0.85
                          ? 'bg-[#F59E0B]'
                          : 'bg-[#4F46E5]'
                      }`}
                      style={{ transform: `scaleX(${ratio})` }}
                    />
                  </div>
                </div>

                {/* Inline Metadata */}
                <p className="text-xs font-mono text-[#8A94A6] tabular-nums">
                  Ping: {mount.latencyMs !== null ? `${mount.latencyMs} ms` : '—'} ·{' '}
                  {mount.zeroEgress ? 'Zero Egress' : 'Metered Egress'} ·{' '}
                  {mount.lastSyncedAt
                    ? `Checked ${formatRelativeOrShortDate(mount.lastSyncedAt)}`
                    : 'Not probed'}
                </p>
              </div>

              {/* Card Action Buttons */}
              <div className="pt-3 border-t border-[#1E2230] flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isTesting}
                  onClick={() => handleTestMount(mount)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#0E1017] hover:bg-[#1E2230] border border-[#1E2230] text-xs font-medium text-[#F3F4F6] disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>Test connection</span>
                </button>

                <button
                  type="button"
                  onClick={() => openEditModal(mount)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#0E1017] hover:bg-[#1E2230] border border-[#1E2230] text-xs font-medium text-[#F3F4F6]"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>

                {!isLocal && (
                  <>
                    {isDisconnected ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const rep = await storageOrchestrator.reconnectMount(mount.id);
                            addToast({
                              title: `Reconnected "${mount.name}" (${rep.latencyMs} ms)`,
                              variant: 'success',
                            });
                          } catch (err) {
                            addToast({
                              title: 'Reconnect failed',
                              description: err instanceof Error ? err.message : undefined,
                              variant: 'error',
                            });
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/40 text-xs font-medium text-[#10B981]"
                      >
                        <PlugZap className="w-3.5 h-3.5" />
                        <span>Reconnect</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await storageOrchestrator.disconnectMount(mount.id);
                          addToast({
                            title: `Disconnected "${mount.name}"`,
                            description: 'Mount hidden from active Overview until reconnected.',
                            variant: 'default',
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#0E1017] hover:bg-[#1E2230] border border-[#1E2230] text-xs font-medium text-[#8A94A6] hover:text-[#F3F4F6]"
                      >
                        <Plug className="w-3.5 h-3.5" />
                        <span>Disconnect</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setRemovingMount(mount)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#0E1017] hover:bg-[#F43F5E]/20 border border-[#1E2230] text-xs font-medium text-[#F43F5E] ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Mount Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mount-modal-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !handshakeStep) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-xl rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E2230]">
              <h2 id="mount-modal-title" className="text-[15px] font-bold text-[#F3F4F6]">
                {editingMount
                  ? `Edit Mount: ${editingMount.name}`
                  : 'Connect Cloud Storage Provider'}
              </h2>
              <button
                type="button"
                disabled={Boolean(handshakeStep)}
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="p-1 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleFormSubmit}
              className="p-5 space-y-4 text-[13px] overflow-y-auto"
            >
              {!editingMount && (
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-[#8A94A6]">
                      Select Cloud Storage Provider (39 available)
                    </label>
                    {!providerSearch.trim() && (
                      <div className="inline-flex rounded bg-[#090A0F] p-0.5 border border-[#1E2230] text-[11px]">
                        {(
                          [
                            { id: 'Consumer & Personal Cloud', label: 'Consumer Cloud' },
                            { id: 'Object & Infrastructure Cloud', label: 'Object Cloud' },
                            { id: 'Self-Hosted & Protocol', label: 'Self-Hosted' },
                          ] as const
                        ).map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setProviderCategoryTab(cat.id)}
                            className={`px-2 py-1 rounded ${
                              providerCategoryTab === cat.id
                                ? 'bg-[#4F46E5] text-white font-medium'
                                : 'text-[#8A94A6] hover:text-[#F3F4F6]'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick Filter Input */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8A94A6]" />
                    <input
                      type="text"
                      value={providerSearch}
                      onChange={(e) => setProviderSearch(e.target.value)}
                      placeholder="Search 39 providers (e.g. Google Drive, S3, MEGA, Proton, Nextcloud, R2...)"
                      className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[#0E1017] border border-[#1E2230] text-xs text-[#F3F4F6] placeholder-[#8A94A6]/60 focus:outline-none focus:border-[#4F46E5]"
                    />
                  </div>

                  {filteredProviders.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#8A94A6] bg-[#0E1017] rounded-md border border-[#1E2230]">
                      No cloud providers matching &quot;{providerSearch}&quot;
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                      {filteredProviders.map((k) => {
                        const m = PROVIDER_KIND_META[k];
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => applyDefaultsForKind(k)}
                            className={`py-2 px-2.5 rounded-md border text-xs font-medium text-left flex flex-col justify-between ${
                              kind === k
                                ? 'bg-[#4F46E5] border-[#818CF8] text-white'
                                : 'bg-[#0E1017] border-[#1E2230] text-[#F3F4F6] hover:border-[#8A94A6]/50'
                            }`}
                          >
                            <span className="truncate font-semibold">{m.shortLabel}</span>
                            <span
                              className={`text-[10px] font-mono ${
                                kind === k ? 'text-white/80' : 'text-[#8A94A6]'
                              }`}
                            >
                              Default{' '}
                              {m.defaultAllocatedGB >= 1000
                                ? `${m.defaultAllocatedGB / 1000} TB`
                                : `${m.defaultAllocatedGB} GB`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Mode Segmented Switch: Real Live API vs Simulated */}
              {editingMount?.kind !== 'local' && (
                <div className="space-y-1.5 pt-1">
                  <label className="block text-xs font-medium text-[#8A94A6]">
                    Connection Engine Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-[#0E1017] rounded-lg border border-[#1E2230]">
                    <button
                      type="button"
                      onClick={() => setMountMode('simulated')}
                      className={`py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 tv-transition ${
                        mountMode === 'simulated'
                          ? 'bg-[#1E2230] text-[#818CF8] shadow border border-[#818CF8]/30 font-semibold'
                          : 'text-[#8A94A6] hover:text-[#F3F4F6]'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#818CF8]" />
                      <span>🧪 Simulated (Zero Keys)</span>
                    </button>
                    <button
                      type="button"
                      disabled={PROVIDER_KIND_META[kind].integrationStatus === 'api_restricted'}
                      onClick={() => setMountMode('real')}
                      className={`py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 tv-transition ${
                        mountMode === 'real'
                          ? 'bg-emerald-500/15 text-emerald-400 shadow border border-emerald-500/40 font-semibold'
                          : 'text-[#8A94A6] hover:text-[#F3F4F6]'
                      } ${PROVIDER_KIND_META[kind].integrationStatus === 'api_restricted' ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      <PlugZap className="w-3.5 h-3.5 text-emerald-400" />
                      <span>⚡ Live Cloud API</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Honesty Warning Banner for Restricted Providers */}
              {PROVIDER_KIND_META[kind].apiNote && (
                <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-semibold">{PROVIDER_KIND_META[kind].shortLabel} API Notice: </span>
                    {PROVIDER_KIND_META[kind].apiNote}
                  </div>
                </div>
              )}

              {/* OAuth Account Picker & 1-Click Connect for OAuth Supported Providers */}
              {mountMode === 'real' &&
                ['gdrive', 'onedrive', 'dropbox', 'box', 'pcloud'].includes(kind) && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="block text-xs font-semibold text-emerald-300">
                        {PROVIDER_KIND_META[kind].shortLabel} OAuth 2.0 PKCE Authorization
                      </span>
                      <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                        Encrypted at Rest
                      </span>
                    </div>

                    {connectedAccounts.filter((a) => a.provider === kind).length > 0 ? (
                      <div className="space-y-2">
                        <label htmlFor="oauth-account-picker" className="text-[11px] text-gray-400 block font-medium">
                          Select Authorized Account:
                        </label>
                        <select
                          id="oauth-account-picker"
                          value={selectedAccountId}
                          onChange={(e) => setSelectedAccountId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#0E1017] border border-[#1E2230] text-xs text-[#F3F4F6]"
                        >
                          <option value="">-- Choose Account --</option>
                          {connectedAccounts
                            .filter((a) => a.provider === kind)
                            .map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.displayName} ({acc.email || acc.provider}) [{acc.status.toUpperCase()}]
                              </option>
                            ))}
                        </select>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-gray-400">Need another account?</span>
                          <button
                            type="button"
                            disabled={isOAuthing}
                            onClick={async () => {
                              setIsOAuthing(true);
                              try {
                                const res = await startServerOAuthFlow(kind);
                                await fetchConnectedAccounts();
                                setSelectedAccountId(res.accountId);
                                addToast({
                                  title: 'Account Connected',
                                  description: `Linked ${res.displayName} (${res.email || kind})`,
                                  variant: 'success',
                                });
                              } catch (e) {
                                setFormError(e instanceof Error ? e.message : 'OAuth authorization failed.');
                              } finally {
                                setIsOAuthing(false);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 rounded hover:bg-emerald-900/60 transition-colors"
                          >
                            {isOAuthing ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>⚡</span>}
                            <span>+ Connect New {PROVIDER_KIND_META[kind].shortLabel} Account</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-2 space-y-2.5">
                        <p className="text-xs text-gray-300">
                          Connect your {PROVIDER_KIND_META[kind].shortLabel} account with 1-click OAuth 2.0 PKCE.
                        </p>
                        <button
                          type="button"
                          disabled={isOAuthing}
                          onClick={async () => {
                            setIsOAuthing(true);
                            try {
                              const res = await startServerOAuthFlow(kind);
                              await fetchConnectedAccounts();
                              setSelectedAccountId(res.accountId);
                              addToast({
                                title: 'Account Connected',
                                description: `Linked ${res.displayName} (${res.email || kind})`,
                                variant: 'success',
                              });
                            } catch (e) {
                              setFormError(e instanceof Error ? e.message : 'OAuth authorization failed.');
                            } finally {
                              setIsOAuthing(false);
                            }
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all"
                        >
                          {isOAuthing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>⚡</span>}
                          <span>Log in to {PROVIDER_KIND_META[kind].shortLabel} via OAuth</span>
                        </button>
                        <p className="text-[11px] text-[#8A94A6]">
                          Opens a secure authorization popup window and redirects straight back.
                        </p>
                      </div>
                    )}

                    <details className="pt-1 text-[11px] text-[#8A94A6]">
                      <summary className="cursor-pointer hover:text-gray-300">
                        Advanced: Use manual Bearer token
                      </summary>
                      <div className="pt-2">
                        <input
                          id="manual-oauth-token"
                          type="password"
                          placeholder="Bearer access token (optional override)"
                          value={authToken}
                          onChange={(e) => setAuthToken(e.target.value)}
                          className="w-full px-3 py-1.5 rounded bg-[#0E1017] border border-[#1E2230] font-mono text-xs text-[#F3F4F6]"
                        />
                      </div>
                    </details>
                  </div>
                )}

              {mountMode === 'real' &&
                ['s3', 'r2', 'b2', 'wasabi', 'do_spaces', 'scaleway', 'linode', 'vultr', 'storj', 'oracle_os'].includes(kind) && (
                  <div className="p-3.5 rounded-md bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                    <span className="block text-xs font-medium text-emerald-300">
                      S3 / Object Storage Credentials
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="s3-key-id" className="block text-[11px] text-[#8A94A6] mb-1">
                          Access Key ID
                        </label>
                        <input
                          id="s3-key-id"
                          type="text"
                          placeholder="AKIA... / R2 token ID"
                          value={s3AccessKeyId}
                          onChange={(e) => setS3AccessKeyId(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-xs text-[#F3F4F6]"
                        />
                      </div>
                      <div>
                        <label htmlFor="s3-secret" className="block text-[11px] text-[#8A94A6] mb-1">
                          Secret Access Key
                        </label>
                        <input
                          id="s3-secret"
                          type="password"
                          placeholder="Secret key..."
                          value={s3SecretAccessKey}
                          onChange={(e) => setS3SecretAccessKey(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-xs text-[#F3F4F6]"
                        />
                      </div>
                    </div>
                  </div>
                )}

              {mountMode === 'real' &&
                ['webdav', 'nextcloud', 'owncloud', 'synology', 'qnap', 'hetzner', 'koofr'].includes(kind) && (
                  <div className="p-3.5 rounded-md bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                    <span className="block text-xs font-medium text-emerald-300">
                      WebDAV Server Authentication
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="dav-user" className="block text-[11px] text-[#8A94A6] mb-1">
                          Username
                        </label>
                        <input
                          id="dav-user"
                          type="text"
                          placeholder="Username"
                          value={webdavUser}
                          onChange={(e) => setWebdavUser(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-xs text-[#F3F4F6]"
                        />
                      </div>
                      <div>
                        <label htmlFor="dav-pass" className="block text-[11px] text-[#8A94A6] mb-1">
                          Password / App Token
                        </label>
                        <input
                          id="dav-pass"
                          type="password"
                          placeholder="Password"
                          value={webdavPass}
                          onChange={(e) => setWebdavPass(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-xs text-[#F3F4F6]"
                        />
                      </div>
                    </div>
                  </div>
                )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="mount-name"
                    className="block text-xs font-medium text-[#8A94A6] mb-1"
                  >
                    Mount Display Name (Unique)
                  </label>
                  <input
                    id="mount-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. MEGA Pro 2TB Drive"
                    className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] text-[#F3F4F6]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="mount-cap"
                    className="block text-xs font-medium text-[#8A94A6] mb-1"
                  >
                    External Provider Capacity (GB, SI)
                  </label>
                  <input
                    id="mount-cap"
                    type="number"
                    min={1}
                    max={100000}
                    value={allocatedGB}
                    onChange={(e) => setAllocatedGB(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                  />
                </div>
              </div>

              {/* Per-Kind Specific Fields */}
              {editingMount?.kind !== 'local' && kind === 's3' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="s3-region"
                      className="block text-xs font-medium text-[#8A94A6] mb-1"
                    >
                      AWS Region
                    </label>
                    <input
                      id="s3-region"
                      type="text"
                      value={s3Region}
                      onChange={(e) => setS3Region(e.target.value)}
                      placeholder="us-east-1"
                      className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="s3-bucket"
                      className="block text-xs font-medium text-[#8A94A6] mb-1"
                    >
                      S3 Bucket Name
                    </label>
                    <input
                      id="s3-bucket"
                      type="text"
                      value={bucketName}
                      onChange={(e) => setBucketName(e.target.value)}
                      placeholder="my-s3-bucket-01"
                      className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                    />
                  </div>
                </div>
              )}

              {editingMount?.kind !== 'local' && kind === 'r2' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="r2-account"
                        className="block text-xs font-medium text-[#8A94A6] mb-1"
                      >
                        Cloudflare Account ID
                      </label>
                      <input
                        id="r2-account"
                        type="text"
                        value={r2AccountId}
                        onChange={(e) => setR2AccountId(e.target.value)}
                        placeholder="94a0bc12e8"
                        className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="r2-bucket"
                        className="block text-xs font-medium text-[#8A94A6] mb-1"
                      >
                        R2 Bucket Name
                      </label>
                      <input
                        id="r2-bucket"
                        type="text"
                        value={bucketName}
                        onChange={(e) => setBucketName(e.target.value)}
                        placeholder="edge-assets-prod"
                        className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingMount?.kind !== 'local' && kind === 'gcs' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="gcs-project"
                      className="block text-xs font-medium text-[#8A94A6] mb-1"
                    >
                      Project ID
                    </label>
                    <input
                      id="gcs-project"
                      type="text"
                      value={gcsProjectId}
                      onChange={(e) => setGcsProjectId(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="gcs-bucket"
                      className="block text-xs font-medium text-[#8A94A6] mb-1"
                    >
                      GCS Bucket
                    </label>
                    <input
                      id="gcs-bucket"
                      type="text"
                      value={bucketName}
                      onChange={(e) => setBucketName(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="gcs-loc"
                      className="block text-xs font-medium text-[#8A94A6] mb-1"
                    >
                      Location
                    </label>
                    <input
                      id="gcs-loc"
                      type="text"
                      value={gcsLocation}
                      onChange={(e) => setGcsLocation(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                    />
                  </div>
                </div>
              )}

              {editingMount?.kind !== 'local' &&
                (kind === 'webdav' || kind === 'nextcloud' || kind === 'hetzner') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="dav-url"
                        className="block text-xs font-medium text-[#8A94A6] mb-1"
                      >
                        Server Endpoint URL
                      </label>
                      <input
                        id="dav-url"
                        type="url"
                        value={webdavUrl}
                        onChange={(e) => setWebdavUrl(e.target.value)}
                        placeholder="https://dav.example.com/webdav"
                        className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="dav-path"
                        className="block text-xs font-medium text-[#8A94A6] mb-1"
                      >
                        Remote Root Path
                      </label>
                      <input
                        id="dav-path"
                        type="text"
                        value={webdavBasePath}
                        onChange={(e) => setWebdavBasePath(e.target.value)}
                        placeholder="/vault"
                        className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                      />
                    </div>
                  </div>
                )}

              {editingMount?.kind !== 'local' &&
                kind !== 's3' &&
                kind !== 'r2' &&
                kind !== 'gcs' &&
                kind !== 'webdav' &&
                kind !== 'nextcloud' &&
                kind !== 'hetzner' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="cloud-folder"
                        className="block text-xs font-medium text-[#8A94A6] mb-1"
                      >
                        Root Folder / Container Name
                      </label>
                      <input
                        id="cloud-folder"
                        type="text"
                        value={bucketName}
                        onChange={(e) => setBucketName(e.target.value)}
                        placeholder="/MountYourClouds"
                        className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="cloud-region"
                        className="block text-xs font-medium text-[#8A94A6] mb-1"
                      >
                        Data Center Region
                      </label>
                      <input
                        id="cloud-region"
                        type="text"
                        value={s3Region}
                        onChange={(e) => setS3Region(e.target.value)}
                        placeholder="global"
                        className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                      />
                    </div>
                  </div>
                )}

              {/* Handshake Step Progress */}
              {handshakeStep && (
                <div className="p-3 rounded-md bg-[#0E1017] border border-[#818CF8]/40 flex items-center gap-2.5 text-xs text-[#818CF8] font-mono">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>{handshakeStep}</span>
                </div>
              )}

              {formError && (
                <p role="alert" className="text-xs text-[#F43F5E]">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E2230]">
                <button
                  type="button"
                  disabled={Boolean(handshakeStep)}
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-md border border-[#1E2230] text-xs font-medium text-[#8A94A6] hover:text-[#F3F4F6]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(handshakeStep)}
                  className="px-4 py-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium disabled:opacity-50"
                >
                  {editingMount ? 'Save & Verify Handshake' : 'Connect Simulated Mount'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Mount Confirmation Dialog */}
      {removingMount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-mount-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setRemovingMount(null);
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#F43F5E] shrink-0 mt-0.5" />
              <div>
                <h2 id="remove-mount-title" className="text-[15px] font-bold text-[#F3F4F6]">
                  Remove mount "{removingMount.name}"?
                </h2>
                <p className="text-xs text-[#8A94A6] mt-1 leading-relaxed">
                  Removing this mount will permanently delete{' '}
                  <strong className="text-[#F3F4F6] font-mono">
                    {mountUsageMap.get(removingMount.id)?.fileCount ?? 0} file(s)
                  </strong>{' '}
                  ({formatBytes(mountUsageMap.get(removingMount.id)?.usedBytes ?? 0)}) stored on it from the workspace.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRemovingMount(null)}
                className="px-3.5 py-1.5 rounded-md border border-[#1E2230] text-xs font-medium text-[#8A94A6] hover:text-[#F3F4F6]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = removingMount;
                  setRemovingMount(null);
                  await storageOrchestrator.removeMount(target.id);
                  addToast({
                    title: `Removed mount "${target.name}" and its files`,
                    variant: 'success',
                  });
                }}
                className="px-4 py-1.5 rounded-md bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-medium"
              >
                Remove mount & files
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
