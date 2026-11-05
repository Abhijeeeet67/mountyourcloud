import fs from 'node:fs';
import path from 'node:path';
import { decryptToken, encryptToken } from './crypto.ts';

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
  accessToken: string;
  encryptedRefreshToken?: string;
  tokenExpiresAt: number | null;
  scopes: string[];
  updatedAt: number;
}

export class ServerAccountStore {
  private dataDir: string;
  private accountsFile: string;
  private tokensFile: string;
  private accounts = new Map<string, ConnectedCloudAccount>();
  private tokens = new Map<string, EncryptedTokenRecord>();
  private initialized = false;

  constructor() {
    this.dataDir = path.resolve(process.cwd(), '.data');
    this.accountsFile = path.join(this.dataDir, 'accounts.json');
    this.tokensFile = path.join(this.dataDir, 'tokens.json');
  }

  private ensureLoaded(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      if (fs.existsSync(this.accountsFile)) {
        const raw = fs.readFileSync(this.accountsFile, 'utf8');
        const list: ConnectedCloudAccount[] = JSON.parse(raw);
        for (const acc of list) {
          this.accounts.set(acc.id, acc);
        }
      }

      if (fs.existsSync(this.tokensFile)) {
        const raw = fs.readFileSync(this.tokensFile, 'utf8');
        const list: EncryptedTokenRecord[] = JSON.parse(raw);
        for (const tok of list) {
          this.tokens.set(tok.accountId, tok);
        }
      }
    } catch (err) {
      console.warn('ServerAccountStore: Using in-memory fallback store:', err);
    }
  }

  private persist(): void {
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
    } catch (err) {
      console.warn('ServerAccountStore: Failed to write to disk:', err);
    }
  }

  public async listAccounts(userId: string): Promise<ConnectedCloudAccount[]> {
    this.ensureLoaded();
    return Array.from(this.accounts.values())
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
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

    this.accounts.set(account.id, account);
    this.tokens.set(account.id, {
      accountId: account.id,
      userId: account.userId,
      provider: account.provider,
      accessToken: tokens.accessToken,
      encryptedRefreshToken,
      tokenExpiresAt: tokens.tokenExpiresAt !== undefined ? tokens.tokenExpiresAt : (account.tokenExpiresAt ?? null),
      scopes: tokens.scopes !== undefined ? tokens.scopes : (account.scopes ?? []),
      updatedAt: Date.now(),
    });

    this.persist();
  }

  public async updateAccessToken(
    userId: string,
    accountId: string,
    accessToken: string,
    tokenExpiresAt: number | null
  ): Promise<void> {
    this.ensureLoaded();
    const tok = this.tokens.get(accountId);
    if (!tok || tok.userId !== userId) {
      throw new Error('Unauthorized or account not found.');
    }

    tok.accessToken = accessToken;
    tok.tokenExpiresAt = tokenExpiresAt;
    tok.updatedAt = Date.now();

    const acc = this.accounts.get(accountId);
    if (acc) {
      acc.status = 'active';
      acc.errorMessage = null;
      acc.tokenExpiresAt = tokenExpiresAt;
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
}

export const serverAccountStore = new ServerAccountStore();
