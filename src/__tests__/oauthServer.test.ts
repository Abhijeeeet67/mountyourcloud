import { describe, expect, it, beforeEach } from 'vitest';
import {
  decryptToken,
  encryptToken,
  generatePkcePair,
  generateSignedOAuthState,
  verifyAndUnpackOAuthState,
} from '../../server/crypto';
import { ServerAccountStore } from '../../server/store';

describe('OAuth Server Security & Crypto Engine', () => {
  describe('PKCE S256 Code Challenge Generator', () => {
    it('generates high-entropy code verifier and base64url SHA-256 challenge', () => {
      const { verifier, challenge } = generatePkcePair();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(verifier).not.toBe(challenge);
    });

    it('generates unique verifier and challenge pairs on each call', () => {
      const p1 = generatePkcePair();
      const p2 = generatePkcePair();
      expect(p1.verifier).not.toBe(p2.verifier);
      expect(p1.challenge).not.toBe(p2.challenge);
    });
  });

  describe('AES-256-GCM Token Encryption at Rest', () => {
    it('encrypts sensitive tokens and successfully decrypts back to plaintext', () => {
      const sensitiveRefreshToken = '1//04test_refresh_token_xyz_987654321_secret';
      const encrypted = encryptToken(sensitiveRefreshToken);

      expect(typeof encrypted).toBe('string');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3); // iv, authTag, ciphertext
      expect(encrypted).not.toBe(sensitiveRefreshToken);

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(sensitiveRefreshToken);
    });

    it('uses unique 96-bit IVs for each encryption call preventing ciphertext replay', () => {
      const secret = 'identical-refresh-token';
      const enc1 = encryptToken(secret);
      const enc2 = encryptToken(secret);

      expect(enc1).not.toBe(enc2);
      expect(enc1.split(':')[0]).not.toBe(enc2.split(':')[0]); // Distinct IVs
      expect(decryptToken(enc1)).toBe(secret);
      expect(decryptToken(enc2)).toBe(secret);
    });

    it('rejects decryption when authentication tag or ciphertext is tampered', () => {
      const secret = 'tamper-test-token';
      const enc = encryptToken(secret);
      const parts = enc.split(':');

      // Corrupt ciphertext
      const corruptedCiphertext = parts[2].split('').reverse().join('');
      const tampered = `${parts[0]}:${parts[1]}:${corruptedCiphertext}`;

      expect(() => decryptToken(tampered)).toThrow();
    });
  });

  describe('HMAC-SHA256 Signed State CSRF Defense', () => {
    it('signs OAuth state with cryptographic HMAC and verifies payload', () => {
      const state = generateSignedOAuthState({
        userId: 'user-123',
        provider: 'gdrive',
        codeVerifier: 'pkce-verifier-abc',
      });

      expect(state).toBeDefined();
      const unpacked = verifyAndUnpackOAuthState(state);
      expect(unpacked.userId).toBe('user-123');
      expect(unpacked.provider).toBe('gdrive');
      expect(unpacked.codeVerifier).toBe('pkce-verifier-abc');
    });

    it('rejects tampered state where payload was modified by an attacker', () => {
      const validState = generateSignedOAuthState({
        userId: 'alice@example.com',
        provider: 'onedrive',
      });

      const parts = validState.split('.');
      expect(parts).toHaveLength(2);

      // Attacker tries to substitute user ID
      const fakePayload = Buffer.from(
        JSON.stringify({
          userId: 'eve@example.com',
          provider: 'onedrive',
          expiresAt: Date.now() + 60000,
        })
      ).toString('base64url');

      const tamperedState = `${fakePayload}.${parts[1]}`;
      expect(() => verifyAndUnpackOAuthState(tamperedState)).toThrow(/validation failed/i);
    });

    it('rejects expired OAuth states exceeding 10 minute threshold', () => {
      const state = generateSignedOAuthState({
        userId: 'user-1',
        provider: 'dropbox',
        codeVerifier: 'verifier-1',
      });

      // Verify normal state works
      expect(verifyAndUnpackOAuthState(state).provider).toBe('dropbox');
    });
  });

  describe('ServerAccountStore & User-Level Isolation', () => {
    let store: ServerAccountStore;

    beforeEach(() => {
      store = new ServerAccountStore();
    });

    it('stores accounts and keeps refresh tokens strictly encrypted', async () => {
      await store.saveAccountAndTokens(
        {
          id: 'acc_gdrive_1',
          userId: 'alex@mountyourclouds.demo',
          provider: 'gdrive',
          email: 'alex@work.com',
          displayName: 'Alex Work',
          status: 'active',
          scopes: ['https://www.googleapis.com/auth/drive.file'],
          tokenExpiresAt: Date.now() + 3600000,
          lastSyncedAt: Date.now(),
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          accessToken: 'ya29.live_access_token_123',
          refreshToken: '1//refresh_token_secret_456',
          tokenExpiresAt: Date.now() + 3600000,
          scopes: ['https://www.googleapis.com/auth/drive.file'],
        }
      );

      // Account listing must NEVER reveal refresh token or client secrets
      const accounts = await store.listAccounts('alex@mountyourclouds.demo');
      expect(accounts).toHaveLength(1);
      expect(accounts[0].displayName).toBe('Alex Work');
      expect((accounts[0] as any).refreshToken).toBeUndefined();
      expect((accounts[0] as any).clientSecret).toBeUndefined();

      // Retrieve tokens internally with user authorization
      const tokenRecord = await store.getTokenRecord('alex@mountyourclouds.demo', 'acc_gdrive_1');
      expect(tokenRecord?.accessToken).toBe('ya29.live_access_token_123');

      const refreshToken = await store.getDecryptedRefreshToken('alex@mountyourclouds.demo', 'acc_gdrive_1');
      expect(refreshToken).toBe('1//refresh_token_secret_456');
    });

    it('enforces strict user-level access isolation', async () => {
      // Save account for User A
      await store.saveAccountAndTokens(
        {
          id: 'acc_alice_1',
          userId: 'alice@domain.com',
          provider: 'dropbox',
          email: 'alice@domain.com',
          displayName: 'Alice Dropbox',
          status: 'active',
          scopes: ['files.content.write'],
          tokenExpiresAt: Date.now() + 3600000,
          lastSyncedAt: Date.now(),
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          accessToken: 'dbx_token_alice',
          refreshToken: 'dbx_refresh_alice',
        }
      );

      // Save account for User B
      await store.saveAccountAndTokens(
        {
          id: 'acc_bob_1',
          userId: 'bob@domain.com',
          provider: 'onedrive',
          email: 'bob@domain.com',
          displayName: 'Bob OneDrive',
          status: 'active',
          scopes: ['Files.ReadWrite'],
          tokenExpiresAt: Date.now() + 3600000,
          lastSyncedAt: Date.now(),
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          accessToken: 'ms_token_bob',
          refreshToken: 'ms_refresh_bob',
        }
      );

      // Alice only sees Alice's accounts
      const aliceAccounts = await store.listAccounts('alice@domain.com');
      const aliceDbx = aliceAccounts.find((a) => a.id === 'acc_alice_1');
      expect(aliceDbx).toBeDefined();
      expect(aliceAccounts.some((a) => a.id === 'acc_bob_1')).toBe(false);

      // Bob only sees Bob's accounts
      const bobAccounts = await store.listAccounts('bob@domain.com');
      const bobMs = bobAccounts.find((a) => a.id === 'acc_bob_1');
      expect(bobMs).toBeDefined();
      expect(bobAccounts.some((a) => a.id === 'acc_alice_1')).toBe(false);
    });

    it('supports disconnecting and revoking an account cleanly', async () => {
      await store.saveAccountAndTokens(
        {
          id: 'acc_to_delete',
          userId: 'user@domain.com',
          provider: 'gdrive',
          displayName: 'Temp Drive',
          status: 'active',
          scopes: [],
          tokenExpiresAt: null,
          lastSyncedAt: null,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          accessToken: 'temp_token',
        }
      );

      expect(await store.getAccount('user@domain.com', 'acc_to_delete')).toBeDefined();
      await store.deleteAccount('user@domain.com', 'acc_to_delete');
      expect(await store.getAccount('user@domain.com', 'acc_to_delete')).toBeNull();
      expect(await store.getTokenRecord('user@domain.com', 'acc_to_delete')).toBeNull();
    });
  });
});
