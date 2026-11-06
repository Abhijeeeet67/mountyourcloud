import crypto from 'node:crypto';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  decryptAppSecret,
  decryptToken,
  encryptAppSecret,
  encryptToken,
  generatePkcePair,
  generateSignedOAuthState,
  maskSecretIdentifier,
  verifyAndUnpackOAuthState,
  verifyRazorpaySignature,
  verifyRazorpaySubscriptionSignature,
  verifyRazorpayWebhookSignature,
} from '../../server/crypto';
import { ServerAccountStore } from '../../server/store';

describe('OAuth Server Security, App Secrets & Razorpay Verification Engine', () => {
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

  describe('AES-256-GCM Token & App Secret Encryption at Rest', () => {
    it('encrypts sensitive OAuth tokens and successfully decrypts back to plaintext', () => {
      const sensitiveRefreshToken = '1//04test_refresh_token_xyz_987654321_secret';
      const encrypted = encryptToken(sensitiveRefreshToken);

      expect(typeof encrypted).toBe('string');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3); // iv, authTag, ciphertext
      expect(encrypted).not.toBe(sensitiveRefreshToken);

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(sensitiveRefreshToken);
    });

    it('encrypts admin Razorpay secrets with APP_SECRETS_ENCRYPTION_KEY and masks identifiers', () => {
      const razorpayKeySecret = 'rzp_secret_live_9876543210abcdef';
      const cipher = encryptAppSecret(razorpayKeySecret);
      expect(cipher).not.toBe(razorpayKeySecret);
      expect(cipher.split(':')).toHaveLength(3);
      expect(decryptAppSecret(cipher)).toBe(razorpayKeySecret);

      const masked = maskSecretIdentifier(razorpayKeySecret);
      expect(masked).toContain('cdef');
      expect(masked).not.toContain('9876543210');
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

      const corruptedCiphertext = parts[2].split('').reverse().join('');
      const tampered = `${parts[0]}:${parts[1]}:${corruptedCiphertext}`;

      expect(() => decryptToken(tampered)).toThrow();
    });
  });

  describe('HMAC-SHA256 Signed State CSRF Defense & Single-Use Transactions', () => {
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
      expect(unpacked.nonce).toBeTruthy();
    });

    it('rejects tampered state where payload was modified by an attacker', () => {
      const validState = generateSignedOAuthState({
        userId: 'alice@example.com',
        provider: 'onedrive',
      });

      const parts = validState.split('.');
      expect(parts).toHaveLength(2);

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

    it('enforces single-use OAuth state consumption in ServerAccountStore', async () => {
      const store = new ServerAccountStore();
      await store.saveOAuthStateTransaction({
        nonce: 'nonce_abc_123',
        userId: 'user-1',
        provider: 'gdrive',
        encryptedCodeVerifier: encryptToken('verifier_xyz'),
        expiresAt: Date.now() + 60_000,
        consumedAt: null,
        createdAt: Date.now(),
      });

      const firstConsume = await store.consumeOAuthStateTransaction('nonce_abc_123', 'gdrive');
      expect(firstConsume).toBeDefined();
      expect(firstConsume.userId).toBe('user-1');

      // Replay attempt with same nonce must throw
      await expect(store.consumeOAuthStateTransaction('nonce_abc_123', 'gdrive')).rejects.toThrow(
        /already been consumed/i
      );
    });
  });

  describe('Razorpay HMAC Signature & Webhook Idempotency Verification', () => {
    it('verifies valid Razorpay Order, Subscription, and Webhook HMAC-SHA256 signatures', () => {
      const secret = 'rzp_webhook_and_key_secret_test';
      const orderId = 'order_P123456';
      const paymentId = 'pay_Q987654';
      const subId = 'sub_S555555';

      const orderSig = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
      expect(verifyRazorpaySignature(orderId, paymentId, orderSig, secret)).toBe(true);
      expect(verifyRazorpaySignature(orderId, paymentId, '0000bad', secret)).toBe(false);

      const subSig = crypto
        .createHmac('sha256', secret)
        .update(`${paymentId}|${subId}`)
        .digest('hex');
      expect(verifyRazorpaySubscriptionSignature(subId, paymentId, subSig, secret)).toBe(true);

      const rawBody = JSON.stringify({ event: 'payment.captured', payload: {} });
      const webhookSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      expect(verifyRazorpayWebhookSignature(rawBody, webhookSig, secret)).toBe(true);
    });

    it('prevents duplicate webhook replay via idempotency ledger and masks admin secrets', async () => {
      const store = new ServerAccountStore();

      const maskedStatus = await store.updateRazorpayGatewaySettings({
        enabled: true,
        activeMode: 'test',
        targetEnvironment: 'test',
        keyId: 'rzp_test_11223344',
        keySecret: 'super_secret_test_key_9988',
        webhookSecret: 'webhook_secret_test_7766',
        updatedBy: 'admin-1',
      });

      expect(maskedStatus.enabled).toBe(true);
      expect(maskedStatus.test.configured).toBe(true);
      expect(maskedStatus.test.hasKeySecret).toBe(true);
      expect(maskedStatus.test.hasWebhookSecret).toBe(true);
      expect(JSON.stringify(maskedStatus)).not.toContain('super_secret_test_key_9988');

      const activeCreds = await store.getActiveRazorpayCredentials();
      expect(activeCreds.enabled).toBe(true);
      expect(activeCreds.keySecret).toBe('super_secret_test_key_9988');

      expect(await store.hasProcessedWebhookEvent('evt_razorpay_001')).toBe(false);
      await store.recordWebhookEvent('evt_razorpay_001', 'payment.captured');
      expect(await store.hasProcessedWebhookEvent('evt_razorpay_001')).toBe(true);
    });
  });

  describe('ServerAccountStore & User-Level Isolation', () => {
    let store: ServerAccountStore;

    beforeEach(() => {
      store = new ServerAccountStore();
    });

    it('stores accounts and keeps access & refresh tokens strictly encrypted', async () => {
      await store.saveAccountAndTokens(
        {
          id: 'acc_gdrive_1',
          userId: 'user-uuid-1',
          provider: 'gdrive',
          email: 'user@work.com',
          displayName: 'Work Drive',
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

      const accounts = await store.listAccounts('user-uuid-1');
      expect(accounts).toHaveLength(1);
      expect(accounts[0].displayName).toBe('Work Drive');
      expect((accounts[0] as any).refreshToken).toBeUndefined();
      expect((accounts[0] as any).clientSecret).toBeUndefined();

      const decryptedAccess = await store.getDecryptedAccessToken('user-uuid-1', 'acc_gdrive_1');
      expect(decryptedAccess).toBe('ya29.live_access_token_123');

      const refreshToken = await store.getDecryptedRefreshToken('user-uuid-1', 'acc_gdrive_1');
      expect(refreshToken).toBe('1//refresh_token_secret_456');
    });

    it('enforces strict user-level access isolation', async () => {
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

      const aliceAccounts = await store.listAccounts('alice@domain.com');
      expect(aliceAccounts.some((a) => a.id === 'acc_alice_1')).toBe(true);
      expect(aliceAccounts.some((a) => a.id === 'acc_bob_1')).toBe(false);

      const bobAccounts = await store.listAccounts('bob@domain.com');
      expect(bobAccounts.some((a) => a.id === 'acc_bob_1')).toBe(true);
      expect(bobAccounts.some((a) => a.id === 'acc_alice_1')).toBe(false);
    });
  });
});
