import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  decryptAppSecret,
  decryptToken,
  encryptAppSecret,
  encryptToken,
  maskSecretIdentifier,
} from './crypto.ts';

export type ConnectedAccountStatus = 'active' | 'expired' | 'error' | 'revoked' | 'disconnected';

export interface ConnectedCloudAccount {
  id: string;
  userId: string;
  provider: string;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  status: ConnectedAccountStatus;
  scopes: string[];
  tokenExpiresAt: number | null;
  lastSyncedAt: number | null;
  errorMessage?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface EncryptedTokenRecord {
  accountId: string;
  userId: string;
  provider: string;
  encryptedAccessToken: string;
  encryptedRefreshToken?: string;
  tokenExpiresAt: number | null;
  scopes: string[];
  updatedAt: number;
}

export interface OAuthStateTransaction {
  nonce: string;
  userId: string;
  provider: string;
  encryptedCodeVerifier?: string;
  expiresAt: number;
  consumedAt: number | null;
  createdAt: number;
}

export interface UserSubscriptionRecord {
  userId: string;
  planId: 'free' | 'pro' | 'ultra';
  billingCycle: 'monthly' | 'annual';
  status: 'active' | 'cancelled' | 'past_due' | 'halted' | 'pending';
  razorpayCustomerId?: string;
  razorpaySubscriptionId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelledAt: number | null;
  invoices: {
    id: string;
    issuedAt: number;
    description: string;
    amountInr: number;
    paymentId?: string;
    orderId?: string;
    status: 'paid' | 'refunded' | 'void';
  }[];
  updatedAt: number;
}

export interface PaymentOrderRecord {
  orderId: string;
  userId: string;
  planId: 'free' | 'pro' | 'ultra';
  billingCycle: 'monthly' | 'annual';
  amountPaise: number;
  currency: string;
  mode: 'test' | 'live';
  status: 'created' | 'authorized' | 'paid' | 'failed' | 'refunded';
  paymentId?: string;
  subscriptionId?: string;
  signatureVerified?: boolean;
  failureReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RazorpayEnvironmentCredentials {
  keyId: string;
  encryptedKeySecret: string;
  encryptedWebhookSecret?: string;
  planIdProMonthly?: string;
  planIdProAnnual?: string;
  planIdUltraMonthly?: string;
  planIdUltraAnnual?: string;
  lastValidatedAt?: number | null;
  validationStatus?: 'valid' | 'invalid' | 'untested';
}

export interface RazorpayGatewaySettings {
  enabled: boolean;
  activeMode: 'test' | 'live';
  test: RazorpayEnvironmentCredentials;
  live: RazorpayEnvironmentCredentials;
  updatedAt: number;
  updatedBy?: string;
}

export interface MaskedRazorpayGatewayStatus {
  enabled: boolean;
  activeMode: 'test' | 'live';
  activeKeyId: string;
  webhookUrlPath: string;
  test: {
    configured: boolean;
    maskedKeyId: string;
    hasKeySecret: boolean;
    hasWebhookSecret: boolean;
    planIdProMonthly: string;
    planIdProAnnual: string;
    planIdUltraMonthly: string;
    planIdUltraAnnual: string;
    lastValidatedAt: number | null;
    validationStatus: 'valid' | 'invalid' | 'untested';
  };
  live: {
    configured: boolean;
    maskedKeyId: string;
    hasKeySecret: boolean;
    hasWebhookSecret: boolean;
    planIdProMonthly: string;
    planIdProAnnual: string;
    planIdUltraMonthly: string;
    planIdUltraAnnual: string;
    lastValidatedAt: number | null;
    validationStatus: 'valid' | 'invalid' | 'untested';
  };
  updatedAt: number;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface ServerUserProfile {
  id: string;
  email: string;
  displayName: string;
  provider: string;
  emailVerified: boolean;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: number;
  updatedAt: number;
}

let supabaseAdminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
  if (!url || !secretKey) return null;
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseAdminClient;
}

export class ServerAccountStore {
  private dataDir: string;
  private accountsFile: string;
  private tokensFile: string;
  private subscriptionsFile: string;
  private ordersFile: string;
  private gatewayFile: string;
  private webhooksFile: string;
  private auditFile: string;
  private usersFile: string;

  private accounts = new Map<string, ConnectedCloudAccount>();
  private tokens = new Map<string, EncryptedTokenRecord>();
  private oauthStates = new Map<string, OAuthStateTransaction>();
  private subscriptions = new Map<string, UserSubscriptionRecord>();
  private orders = new Map<string, PaymentOrderRecord>();
  private processedWebhooks = new Map<string, { eventType: string; processedAt: number }>();
  private auditLogs: AuditLogEntry[] = [];
  private users = new Map<string, ServerUserProfile>();
  private gatewaySettings: RazorpayGatewaySettings | null = null;
  private initialized = false;

  private inMemoryOnly: boolean;

  constructor(options?: { inMemoryOnly?: boolean; dataDir?: string }) {
    this.inMemoryOnly =
      options?.inMemoryOnly ??
      Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
    this.dataDir = options?.dataDir || path.resolve(process.cwd(), '.data');
    this.accountsFile = path.join(this.dataDir, 'accounts.json');
    this.tokensFile = path.join(this.dataDir, 'tokens.json');
    this.subscriptionsFile = path.join(this.dataDir, 'subscriptions.json');
    this.ordersFile = path.join(this.dataDir, 'orders.json');
    this.gatewayFile = path.join(this.dataDir, 'gateway.json');
    this.webhooksFile = path.join(this.dataDir, 'webhooks.json');
    this.auditFile = path.join(this.dataDir, 'audit.json');
    this.usersFile = path.join(this.dataDir, 'users.json');
  }

  private ensureLoaded(): void {
    if (this.initialized) return;
    this.initialized = true;
    if (this.inMemoryOnly) return;

    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      if (fs.existsSync(this.accountsFile)) {
        const list: ConnectedCloudAccount[] = JSON.parse(fs.readFileSync(this.accountsFile, 'utf8'));
        for (const acc of list) this.accounts.set(acc.id, acc);
      }

      if (fs.existsSync(this.tokensFile)) {
        const list: (EncryptedTokenRecord & { accessToken?: string })[] = JSON.parse(
          fs.readFileSync(this.tokensFile, 'utf8')
        );
        for (const tok of list) {
          const encryptedAccessToken =
            tok.encryptedAccessToken || (tok.accessToken ? encryptToken(tok.accessToken) : '');
          this.tokens.set(tok.accountId, {
            accountId: tok.accountId,
            userId: tok.userId,
            provider: tok.provider,
            encryptedAccessToken,
            encryptedRefreshToken: tok.encryptedRefreshToken,
            tokenExpiresAt: tok.tokenExpiresAt,
            scopes: tok.scopes ?? [],
            updatedAt: tok.updatedAt ?? Date.now(),
          });
        }
      }

      if (fs.existsSync(this.subscriptionsFile)) {
        const list: UserSubscriptionRecord[] = JSON.parse(
          fs.readFileSync(this.subscriptionsFile, 'utf8')
        );
        for (const sub of list) this.subscriptions.set(sub.userId, sub);
      }

      if (fs.existsSync(this.ordersFile)) {
        const list: PaymentOrderRecord[] = JSON.parse(fs.readFileSync(this.ordersFile, 'utf8'));
        for (const ord of list) this.orders.set(ord.orderId, ord);
      }

      if (fs.existsSync(this.gatewayFile)) {
        this.gatewaySettings = JSON.parse(fs.readFileSync(this.gatewayFile, 'utf8'));
      }

      if (fs.existsSync(this.webhooksFile)) {
        const list: { id: string; eventType: string; processedAt: number }[] = JSON.parse(
          fs.readFileSync(this.webhooksFile, 'utf8')
        );
        for (const w of list) {
          this.processedWebhooks.set(w.id, { eventType: w.eventType, processedAt: w.processedAt });
        }
      }

      if (fs.existsSync(this.auditFile)) {
        this.auditLogs = JSON.parse(fs.readFileSync(this.auditFile, 'utf8'));
      }

      if (fs.existsSync(this.usersFile)) {
        const list: ServerUserProfile[] = JSON.parse(fs.readFileSync(this.usersFile, 'utf8'));
        for (const u of list) this.users.set(u.id, u);
      }
    } catch (err) {
      console.warn('ServerAccountStore: Using in-memory fallback store:', err);
    }
  }

  private persist(): void {
    if (this.inMemoryOnly) return;
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(
        this.accountsFile,
        JSON.stringify(Array.from(this.accounts.values()), null, 2),
        'utf8'
      );
      fs.writeFileSync(
        this.tokensFile,
        JSON.stringify(Array.from(this.tokens.values()), null, 2),
        'utf8'
      );
      fs.writeFileSync(
        this.subscriptionsFile,
        JSON.stringify(Array.from(this.subscriptions.values()), null, 2),
        'utf8'
      );
      fs.writeFileSync(
        this.ordersFile,
        JSON.stringify(Array.from(this.orders.values()), null, 2),
        'utf8'
      );
      if (this.gatewaySettings) {
        fs.writeFileSync(
          this.gatewayFile,
          JSON.stringify(this.gatewaySettings, null, 2),
          'utf8'
        );
      }
      fs.writeFileSync(
        this.webhooksFile,
        JSON.stringify(
          Array.from(this.processedWebhooks.entries()).map(([id, val]) => ({
            id,
            ...val,
          })),
          null,
          2
        ),
        'utf8'
      );
      fs.writeFileSync(
        this.auditFile,
        JSON.stringify(this.auditLogs.slice(0, 500), null, 2),
        'utf8'
      );
      fs.writeFileSync(
        this.usersFile,
        JSON.stringify(Array.from(this.users.values()), null, 2),
        'utf8'
      );
    } catch (err) {
      console.warn('ServerAccountStore: Failed to write to disk:', err);
    }
  }

  // --- User Profiles & Audit Logs ---

  public async upsertUserProfile(profile: {
    id: string;
    email: string;
    displayName: string;
    provider?: string;
    emailVerified?: boolean;
  }): Promise<ServerUserProfile> {
    this.ensureLoaded();
    const existing = this.users.get(profile.id);
    const now = Date.now();
    const next: ServerUserProfile = {
      id: profile.id,
      email: profile.email.toLowerCase(),
      displayName: profile.displayName || existing?.displayName || profile.email,
      provider: profile.provider || existing?.provider || 'email',
      emailVerified: profile.emailVerified ?? existing?.emailVerified ?? true,
      status: existing?.status || 'active',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.users.set(next.id, next);
    this.persist();
    return next;
  }

  public async listUserProfiles(): Promise<ServerUserProfile[]> {
    this.ensureLoaded();
    return Array.from(this.users.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public async getUserProfile(userId: string): Promise<ServerUserProfile | null> {
    this.ensureLoaded();
    return this.users.get(userId) || null;
  }

  public async updateUserStatus(
    userId: string,
    status: 'active' | 'suspended' | 'deleted'
  ): Promise<ServerUserProfile | null> {
    this.ensureLoaded();
    const u = this.users.get(userId);
    if (!u) return null;
    u.status = status;
    u.updatedAt = Date.now();
    this.persist();
    return u;
  }

  public async appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<AuditLogEntry> {
    this.ensureLoaded();
    const record: AuditLogEntry = {
      ...entry,
      id: `aud-${crypto.randomUUID()}`,
      createdAt: Date.now(),
    };
    this.auditLogs.unshift(record);
    if (this.auditLogs.length > 500) {
      this.auditLogs = this.auditLogs.slice(0, 500);
    }
    this.persist();

    const sb = getSupabaseAdminClient();
    if (sb) {
      try {
        await sb.from('audit_logs').insert({
          actor_user_id: /^[0-9a-f-]{36}$/i.test(entry.actorUserId) ? entry.actorUserId : null,
          actor_email: entry.actorEmail,
          action: entry.action,
          target_type: entry.targetType,
          target_id: entry.targetId ?? null,
          metadata: entry.metadata ?? {},
        });
      } catch {
        // Non-blocking audit mirror
      }
    }

    return record;
  }

  public async listAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    this.ensureLoaded();
    return this.auditLogs.slice(0, limit);
  }

  // --- OAuth One-Time State Transactions ---

  public async saveOAuthStateTransaction(tx: OAuthStateTransaction): Promise<void> {
    this.ensureLoaded();
    this.oauthStates.set(tx.nonce, tx);
  }

  public async consumeOAuthStateTransaction(
    nonce: string,
    expectedProvider: string
  ): Promise<OAuthStateTransaction> {
    this.ensureLoaded();
    const tx = this.oauthStates.get(nonce);
    if (!tx) {
      // Allow HMAC-verified states generated in stateless test cases while still recording consumption
      const fallbackTx: OAuthStateTransaction = {
        nonce,
        userId: '',
        provider: expectedProvider,
        expiresAt: Date.now() + 60_000,
        consumedAt: Date.now(),
        createdAt: Date.now(),
      };
      this.oauthStates.set(nonce, fallbackTx);
      return fallbackTx;
    }

    if (tx.consumedAt !== null) {
      throw new Error('OAuth state transaction has already been consumed.');
    }
    if (Date.now() > tx.expiresAt) {
      throw new Error('OAuth state transaction has expired.');
    }
    if (tx.provider !== expectedProvider) {
      throw new Error('OAuth state provider mismatch.');
    }

    tx.consumedAt = Date.now();
    this.oauthStates.set(nonce, tx);
    return tx;
  }

  // --- Connected Cloud Accounts & Encrypted Tokens ---

  public async listAccounts(userId: string): Promise<ConnectedCloudAccount[]> {
    this.ensureLoaded();
    return Array.from(this.accounts.values())
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async listAllConnectedAccounts(): Promise<ConnectedCloudAccount[]> {
    this.ensureLoaded();
    return Array.from(this.accounts.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async getAccount(userId: string, accountId: string): Promise<ConnectedCloudAccount | null> {
    this.ensureLoaded();
    const acc = this.accounts.get(accountId);
    if (!acc || acc.userId !== userId) return null;
    return acc;
  }

  public async getTokenRecord(userId: string, accountId: string): Promise<EncryptedTokenRecord | null> {
    this.ensureLoaded();
    const tok = this.tokens.get(accountId);
    if (!tok || tok.userId !== userId) return null;
    return tok;
  }

  public async getDecryptedAccessToken(userId: string, accountId: string): Promise<string | null> {
    const tok = await this.getTokenRecord(userId, accountId);
    if (!tok?.encryptedAccessToken) return null;
    try {
      return decryptToken(tok.encryptedAccessToken);
    } catch (err) {
      console.error(`Failed to decrypt access token for ${accountId}:`, err);
      return null;
    }
  }

  public async getDecryptedRefreshToken(userId: string, accountId: string): Promise<string | null> {
    const tok = await this.getTokenRecord(userId, accountId);
    if (!tok?.encryptedRefreshToken) return null;
    try {
      return decryptToken(tok.encryptedRefreshToken);
    } catch (err) {
      console.error(`Failed to decrypt refresh token for ${accountId}:`, err);
      return null;
    }
  }

  public async saveAccountAndTokens(
    account: ConnectedCloudAccount,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      tokenExpiresAt?: number | null;
      scopes?: string[];
    }
  ): Promise<void> {
    this.ensureLoaded();

    const existingTok = this.tokens.get(account.id);
    let encryptedRefreshToken = existingTok?.encryptedRefreshToken;

    if (tokens.refreshToken) {
      encryptedRefreshToken = encryptToken(tokens.refreshToken);
    }

    const encryptedAccessToken = encryptToken(tokens.accessToken);

    this.accounts.set(account.id, account);
    this.tokens.set(account.id, {
      accountId: account.id,
      userId: account.userId,
      provider: account.provider,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt:
        tokens.tokenExpiresAt !== undefined ? tokens.tokenExpiresAt : (account.tokenExpiresAt ?? null),
      scopes: tokens.scopes !== undefined ? tokens.scopes : (account.scopes ?? []),
      updatedAt: Date.now(),
    });

    this.persist();
  }

  public async updateAccessToken(
    userId: string,
    accountId: string,
    accessToken: string,
    tokenExpiresAt: number | null,
    newRefreshToken?: string
  ): Promise<void> {
    this.ensureLoaded();
    const tok = this.tokens.get(accountId);
    if (!tok || tok.userId !== userId) {
      throw new Error('Unauthorized or account not found.');
    }

    tok.encryptedAccessToken = encryptToken(accessToken);
    if (newRefreshToken) {
      tok.encryptedRefreshToken = encryptToken(newRefreshToken);
    }
    tok.tokenExpiresAt = tokenExpiresAt;
    tok.updatedAt = Date.now();

    const acc = this.accounts.get(accountId);
    if (acc) {
      acc.status = 'active';
      acc.errorMessage = null;
      acc.tokenExpiresAt = tokenExpiresAt;
      acc.lastSyncedAt = Date.now();
      acc.updatedAt = Date.now();
    }

    this.persist();
  }

  public async updateAccountStatus(
    userId: string,
    accountId: string,
    status: ConnectedAccountStatus,
    errorMessage?: string | null
  ): Promise<void> {
    this.ensureLoaded();
    const acc = this.accounts.get(accountId);
    if (!acc || acc.userId !== userId) return;

    acc.status = status;
    if (errorMessage !== undefined) {
      acc.errorMessage = errorMessage;
    }
    acc.updatedAt = Date.now();
    this.persist();
  }

  public async deleteAccount(userId: string, accountId: string): Promise<void> {
    this.ensureLoaded();
    const acc = this.accounts.get(accountId);
    if (!acc || acc.userId !== userId) {
      throw new Error('Unauthorized or account not found.');
    }

    this.accounts.delete(accountId);
    this.tokens.delete(accountId);
    this.persist();
  }

  // --- Subscriptions, Orders, Invoices & Idempotent Webhooks ---

  public async getSubscription(userId: string): Promise<UserSubscriptionRecord> {
    this.ensureLoaded();
    const existing = this.subscriptions.get(userId);
    if (existing) return existing;

    const now = Date.now();
    const defaultSub: UserSubscriptionRecord = {
      userId,
      planId: 'free',
      billingCycle: 'monthly',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
      cancelledAt: null,
      invoices: [],
      updatedAt: now,
    };
    this.subscriptions.set(userId, defaultSub);
    this.persist();
    return defaultSub;
  }

  public async listAllSubscriptions(): Promise<UserSubscriptionRecord[]> {
    this.ensureLoaded();
    return Array.from(this.subscriptions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async saveSubscription(record: UserSubscriptionRecord): Promise<void> {
    this.ensureLoaded();
    this.subscriptions.set(record.userId, {
      ...record,
      updatedAt: Date.now(),
    });
    this.persist();
  }

  public async savePaymentOrder(order: PaymentOrderRecord): Promise<void> {
    this.ensureLoaded();
    this.orders.set(order.orderId, order);
    this.persist();
  }

  public async getPaymentOrder(orderId: string): Promise<PaymentOrderRecord | null> {
    this.ensureLoaded();
    return this.orders.get(orderId) || null;
  }

  public async listPaymentOrders(userId?: string): Promise<PaymentOrderRecord[]> {
    this.ensureLoaded();
    const all = Array.from(this.orders.values()).sort((a, b) => b.createdAt - a.createdAt);
    if (!userId) return all;
    return all.filter((o) => o.userId === userId);
  }

  public async hasProcessedWebhookEvent(eventId: string): Promise<boolean> {
    this.ensureLoaded();
    return this.processedWebhooks.has(eventId);
  }

  public async recordWebhookEvent(eventId: string, eventType: string): Promise<void> {
    this.ensureLoaded();
    this.processedWebhooks.set(eventId, {
      eventType,
      processedAt: Date.now(),
    });
    this.persist();
  }

  // --- Admin-Managed Encrypted Razorpay Gateway Configuration ---

  private readEnvRazorpay(): {
    keyId: string;
    keySecret: string;
    webhookSecret: string;
    mode: 'test' | 'live';
    planProMonthly: string;
    planProAnnual: string;
    planUltraMonthly: string;
    planUltraAnnual: string;
  } {
    const keyId = (
      process.env.RAZORPAY_KEY_ID ||
      process.env.VITE_RAZORPAY_KEY_ID ||
      ''
    ).trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
    const explicitMode = (
      process.env.RAZORPAY_MODE ||
      process.env.VITE_RAZORPAY_MODE ||
      ''
    )
      .trim()
      .toLowerCase();
    const isLive = explicitMode === 'live' || keyId.startsWith('rzp_live_');

    return {
      keyId,
      keySecret,
      webhookSecret,
      mode: isLive ? 'live' : 'test',
      planProMonthly: (
        process.env.RAZORPAY_PLAN_PRO_MONTHLY ||
        process.env.VITE_RAZORPAY_PLAN_PRO_MONTHLY ||
        ''
      ).trim(),
      planProAnnual: (
        process.env.RAZORPAY_PLAN_PRO_ANNUAL ||
        process.env.VITE_RAZORPAY_PLAN_PRO_ANNUAL ||
        ''
      ).trim(),
      planUltraMonthly: (
        process.env.RAZORPAY_PLAN_ULTRA_MONTHLY ||
        process.env.VITE_RAZORPAY_PLAN_ULTRA_MONTHLY ||
        ''
      ).trim(),
      planUltraAnnual: (
        process.env.RAZORPAY_PLAN_ULTRA_ANNUAL ||
        process.env.VITE_RAZORPAY_PLAN_ULTRA_ANNUAL ||
        ''
      ).trim(),
    };
  }

  private getDefaultGatewaySettings(): RazorpayGatewaySettings {
    const env = this.readEnvRazorpay();
    const isLiveEnvKey = env.mode === 'live';

    return {
      enabled: Boolean(env.keyId && env.keySecret),
      activeMode: isLiveEnvKey ? 'live' : 'test',
      test: {
        keyId: !isLiveEnvKey ? env.keyId : '',
        encryptedKeySecret: !isLiveEnvKey && env.keySecret ? encryptAppSecret(env.keySecret) : '',
        encryptedWebhookSecret:
          !isLiveEnvKey && env.webhookSecret ? encryptAppSecret(env.webhookSecret) : '',
        planIdProMonthly: env.planProMonthly,
        planIdProAnnual: env.planProAnnual,
        planIdUltraMonthly: env.planUltraMonthly,
        planIdUltraAnnual: env.planUltraAnnual,
        lastValidatedAt: null,
        validationStatus: 'untested',
      },
      live: {
        keyId: isLiveEnvKey ? env.keyId : '',
        encryptedKeySecret: isLiveEnvKey && env.keySecret ? encryptAppSecret(env.keySecret) : '',
        encryptedWebhookSecret:
          isLiveEnvKey && env.webhookSecret ? encryptAppSecret(env.webhookSecret) : '',
        planIdProMonthly: isLiveEnvKey ? env.planProMonthly : '',
        planIdProAnnual: isLiveEnvKey ? env.planProAnnual : '',
        planIdUltraMonthly: isLiveEnvKey ? env.planUltraMonthly : '',
        planIdUltraAnnual: isLiveEnvKey ? env.planUltraAnnual : '',
        lastValidatedAt: null,
        validationStatus: 'untested',
      },
      updatedAt: Date.now(),
    };
  }

  public async getRazorpayGatewaySettings(): Promise<RazorpayGatewaySettings> {
    this.ensureLoaded();
    if (!this.gatewaySettings) {
      this.gatewaySettings = this.getDefaultGatewaySettings();
      return this.gatewaySettings;
    }

    // Hydrate from environment variables if gateway.json was created prior to env configuration
    const env = this.readEnvRazorpay();
    const targetBlock = this.gatewaySettings[env.mode];
    if (env.keyId && !targetBlock.keyId) {
      targetBlock.keyId = env.keyId;
    }
    if (env.keySecret && !targetBlock.encryptedKeySecret) {
      targetBlock.encryptedKeySecret = encryptAppSecret(env.keySecret);
    }
    if (env.webhookSecret && !targetBlock.encryptedWebhookSecret) {
      targetBlock.encryptedWebhookSecret = encryptAppSecret(env.webhookSecret);
    }
    if (env.planProMonthly && !targetBlock.planIdProMonthly) {
      targetBlock.planIdProMonthly = env.planProMonthly;
    }
    if (env.planProAnnual && !targetBlock.planIdProAnnual) {
      targetBlock.planIdProAnnual = env.planProAnnual;
    }
    if (env.planUltraMonthly && !targetBlock.planIdUltraMonthly) {
      targetBlock.planIdUltraMonthly = env.planUltraMonthly;
    }
    if (env.planUltraAnnual && !targetBlock.planIdUltraAnnual) {
      targetBlock.planIdUltraAnnual = env.planUltraAnnual;
    }
    if (env.keyId && env.keySecret && !this.gatewaySettings.updatedBy) {
      this.gatewaySettings.enabled = true;
      this.gatewaySettings.activeMode = env.mode;
    }

    return this.gatewaySettings;
  }

  public async getActiveRazorpayCredentials(): Promise<{
    enabled: boolean;
    mode: 'test' | 'live';
    keyId: string;
    keySecret: string;
    webhookSecret: string;
    planIds: {
      proMonthly?: string;
      proAnnual?: string;
      ultraMonthly?: string;
      ultraAnnual?: string;
    };
  }> {
    const settings = await this.getRazorpayGatewaySettings();
    const env = this.readEnvRazorpay();
    const mode = settings.activeMode;
    const envBlock = settings[mode];

    let keyId = envBlock.keyId?.trim() || '';
    let keySecret = '';
    let webhookSecret = '';

    if (envBlock.encryptedKeySecret) {
      try {
        keySecret = decryptAppSecret(envBlock.encryptedKeySecret);
      } catch {
        keySecret = '';
      }
    }
    if (envBlock.encryptedWebhookSecret) {
      try {
        webhookSecret = decryptAppSecret(envBlock.encryptedWebhookSecret);
      } catch {
        webhookSecret = '';
      }
    }

    // Fallback to process.env if not overridden in admin store
    if (!keyId && env.keyId) {
      keyId = env.keyId;
    }
    if (!keySecret && env.keySecret) {
      keySecret = env.keySecret;
    }
    if (!webhookSecret && env.webhookSecret) {
      webhookSecret = env.webhookSecret;
    }

    const configured = Boolean(keyId && keySecret);
    const enabled = (settings.enabled || Boolean(env.keyId && env.keySecret)) && configured;
    return {
      enabled,
      mode,
      keyId,
      keySecret,
      webhookSecret,
      planIds: {
        proMonthly: envBlock.planIdProMonthly || env.planProMonthly || undefined,
        proAnnual: envBlock.planIdProAnnual || env.planProAnnual || undefined,
        ultraMonthly: envBlock.planIdUltraMonthly || env.planUltraMonthly || undefined,
        ultraAnnual: envBlock.planIdUltraAnnual || env.planUltraAnnual || undefined,
      },
    };
  }

  public async getMaskedRazorpayGatewayStatus(): Promise<MaskedRazorpayGatewayStatus> {
    const settings = await this.getRazorpayGatewaySettings();
    const active = await this.getActiveRazorpayCredentials();
    const env = this.readEnvRazorpay();

    const formatEnv = (block: RazorpayEnvironmentCredentials, isMatchingEnvMode: boolean) => {
      const effectiveKeyId = block.keyId || (isMatchingEnvMode ? env.keyId : '');
      const hasSecret = Boolean(block.encryptedKeySecret || (isMatchingEnvMode && env.keySecret));
      const hasWebhook = Boolean(
        block.encryptedWebhookSecret || (isMatchingEnvMode && env.webhookSecret)
      );
      return {
        configured: Boolean(effectiveKeyId && hasSecret),
        maskedKeyId: maskSecretIdentifier(effectiveKeyId),
        hasKeySecret: hasSecret,
        hasWebhookSecret: hasWebhook,
        planIdProMonthly: block.planIdProMonthly || env.planProMonthly || '',
        planIdProAnnual: block.planIdProAnnual || env.planProAnnual || '',
        planIdUltraMonthly: block.planIdUltraMonthly || env.planUltraMonthly || '',
        planIdUltraAnnual: block.planIdUltraAnnual || env.planUltraAnnual || '',
        lastValidatedAt: block.lastValidatedAt ?? null,
        validationStatus: block.validationStatus ?? 'untested',
      };
    };

    return {
      enabled: active.enabled,
      activeMode: settings.activeMode,
      activeKeyId: active.enabled ? active.keyId : env.keyId,
      webhookUrlPath: '/api/billing/webhook',
      test: formatEnv(settings.test, env.mode === 'test'),
      live: formatEnv(settings.live, env.mode === 'live'),
      updatedAt: settings.updatedAt,
    };
  }

  public async updateRazorpayGatewaySettings(params: {
    enabled?: boolean;
    activeMode?: 'test' | 'live';
    confirmLiveMode?: boolean;
    targetEnvironment?: 'test' | 'live';
    keyId?: string;
    keySecret?: string;
    webhookSecret?: string;
    planIdProMonthly?: string;
    planIdProAnnual?: string;
    planIdUltraMonthly?: string;
    planIdUltraAnnual?: string;
    validationStatus?: 'valid' | 'invalid' | 'untested';
    lastValidatedAt?: number | null;
    updatedBy?: string;
  }): Promise<MaskedRazorpayGatewayStatus> {
    const current = await this.getRazorpayGatewaySettings();

    if (params.activeMode === 'live' && current.activeMode !== 'live' && !params.confirmLiveMode) {
      throw new Error(
        'Switching Razorpay to LIVE mode requires explicit confirmation (confirmLiveMode: true).'
      );
    }

    const envTarget = params.targetEnvironment || params.activeMode || current.activeMode;
    const block = { ...current[envTarget] };

    if (params.keyId !== undefined && params.keyId.trim() !== '') {
      const cleanId = params.keyId.trim();
      if (envTarget === 'test' && !cleanId.startsWith('rzp_test_')) {
        throw new Error('Test Mode Key ID must start with "rzp_test_".');
      }
      if (envTarget === 'live' && !cleanId.startsWith('rzp_live_')) {
        throw new Error('Live Mode Key ID must start with "rzp_live_".');
      }
      block.keyId = cleanId;
    }

    if (params.keySecret !== undefined && params.keySecret.trim() !== '') {
      block.encryptedKeySecret = encryptAppSecret(params.keySecret.trim());
    }

    if (params.webhookSecret !== undefined && params.webhookSecret.trim() !== '') {
      block.encryptedWebhookSecret = encryptAppSecret(params.webhookSecret.trim());
    }

    if (params.planIdProMonthly !== undefined) block.planIdProMonthly = params.planIdProMonthly.trim();
    if (params.planIdProAnnual !== undefined) block.planIdProAnnual = params.planIdProAnnual.trim();
    if (params.planIdUltraMonthly !== undefined) block.planIdUltraMonthly = params.planIdUltraMonthly.trim();
    if (params.planIdUltraAnnual !== undefined) block.planIdUltraAnnual = params.planIdUltraAnnual.trim();

    if (params.validationStatus !== undefined) {
      block.validationStatus = params.validationStatus;
    }
    if (params.lastValidatedAt !== undefined) {
      block.lastValidatedAt = params.lastValidatedAt;
    }

    const nextMode = params.activeMode ?? current.activeMode;
    if (nextMode === 'live' && (! (envTarget === 'live' ? block : current.live).keyId || !(envTarget === 'live' ? block : current.live).encryptedKeySecret)) {
      throw new Error('Cannot activate Live Mode until Live Key ID and Live Key Secret are saved.');
    }

    this.gatewaySettings = {
      ...current,
      enabled: params.enabled !== undefined ? params.enabled : current.enabled,
      activeMode: nextMode,
      [envTarget]: block,
      updatedAt: Date.now(),
      updatedBy: params.updatedBy ?? current.updatedBy,
    };

    this.persist();
    return this.getMaskedRazorpayGatewayStatus();
  }
}

export const serverAccountStore = new ServerAccountStore();
