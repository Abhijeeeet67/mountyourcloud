import crypto from 'node:crypto';

const DEV_FALLBACK_TOKEN_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DEV_FALLBACK_SECRETS_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

const consumedOAuthNonces = new Map<string, number>();

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

function deriveKeyBuffer(rawKey: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }
  return crypto.createHash('sha256').update(rawKey).digest();
}

function getTokenEncryptionKey(): Buffer {
  const raw =
    process.env.TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.OAUTH_ENCRYPTION_KEY?.trim();

  if (!raw) {
    if (isProductionEnv()) {
      throw new Error(
        'CRITICAL SECURITY ERROR: TOKEN_ENCRYPTION_KEY (or OAUTH_ENCRYPTION_KEY) is required in production.'
      );
    }
    return deriveKeyBuffer(DEV_FALLBACK_TOKEN_KEY);
  }
  return deriveKeyBuffer(raw);
}

function getPreviousTokenEncryptionKey(): Buffer | null {
  const prev = process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS?.trim();
  if (!prev) return null;
  return deriveKeyBuffer(prev);
}

function getAppSecretsEncryptionKey(): Buffer {
  const raw =
    process.env.APP_SECRETS_ENCRYPTION_KEY?.trim() ||
    process.env.TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.OAUTH_ENCRYPTION_KEY?.trim();

  if (!raw) {
    if (isProductionEnv()) {
      throw new Error(
        'CRITICAL SECURITY ERROR: APP_SECRETS_ENCRYPTION_KEY is required in production to encrypt payment gateway and integration secrets.'
      );
    }
    return deriveKeyBuffer(DEV_FALLBACK_SECRETS_KEY);
  }
  return deriveKeyBuffer(raw);
}

function getHmacSecret(): string {
  const secret =
    process.env.SESSION_SECRET?.trim() ||
    process.env.TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.OAUTH_ENCRYPTION_KEY?.trim();

  if (!secret) {
    if (isProductionEnv()) {
      throw new Error('CRITICAL SECURITY ERROR: SESSION_SECRET is required in production.');
    }
    return 'myc_dev_session_hmac_secret_key_only';
  }
  return secret;
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  return `${iv.toString('base64')}:${authTag}:${ciphertext}`;
}

function decryptWithKey(encryptedPayload: string, primaryKey: Buffer, fallbackKey?: Buffer | null): string {
  if (!encryptedPayload) return '';
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload.');
  }

  const [ivBase64, authTagBase64, ciphertextBase64] = parts;
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  const attemptDecrypt = (key: Buffer): string => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertextBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  };

  try {
    return attemptDecrypt(primaryKey);
  } catch (err) {
    if (fallbackKey) {
      return attemptDecrypt(fallbackKey);
    }
    throw err;
  }
}

/**
 * Encrypts OAuth access/refresh tokens at rest using AES-256-GCM.
 */
export function encryptToken(plaintext: string): string {
  return encryptWithKey(plaintext, getTokenEncryptionKey());
}

/**
 * Decrypts OAuth access/refresh tokens encrypted with AES-256-GCM.
 * Supports key rotation via OAUTH_ENCRYPTION_KEY_PREVIOUS.
 */
export function decryptToken(encryptedPayload: string): string {
  return decryptWithKey(encryptedPayload, getTokenEncryptionKey(), getPreviousTokenEncryptionKey());
}

/**
 * Encrypts platform-level integration secrets (e.g. Razorpay Key Secret & Webhook Secret)
 * using APP_SECRETS_ENCRYPTION_KEY (AES-256-GCM).
 */
export function encryptAppSecret(plaintext: string): string {
  return encryptWithKey(plaintext, getAppSecretsEncryptionKey());
}

/**
 * Decrypts platform-level integration secrets encrypted with APP_SECRETS_ENCRYPTION_KEY.
 */
export function decryptAppSecret(encryptedPayload: string): string {
  return decryptWithKey(encryptedPayload, getAppSecretsEncryptionKey(), getTokenEncryptionKey());
}

/**
 * Masks a sensitive identifier (e.g. rzp_test_1234567890 -> rzp_test_••••7890)
 */
export function maskSecretIdentifier(value?: string | null): string {
  if (!value) return '';
  const clean = value.trim();
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 8)}••••${clean.slice(-4)}`;
}

/**
 * Generates an HMAC-signed, tamper-proof OAuth state parameter with single-use nonce and userId.
 */
export function generateSignedOAuthState(params: {
  userId: string;
  provider: string;
  codeVerifier?: string;
}): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  const payload = JSON.stringify({
    uid: params.userId,
    p: params.provider,
    t: timestamp,
    n: nonce,
    cv: params.codeVerifier ? encryptToken(params.codeVerifier) : undefined,
  });

  const hmac = crypto.createHmac('sha256', getHmacSecret());
  hmac.update(payload);
  const signature = hmac.digest('base64url');

  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encodedPayload}.${signature}`;
}

/**
 * Validates and unpacks the signed OAuth state, enforcing 10-minute expiry and single-use nonce.
 */
export function verifyAndUnpackOAuthState(stateString: string): {
  userId: string;
  provider: string;
  timestamp: number;
  nonce: string;
  codeVerifier?: string;
} {
  const parts = stateString.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid OAuth state format.');
  }

  const [encodedPayload, signature] = parts;
  const payloadJson = Buffer.from(encodedPayload, 'base64url').toString('utf8');

  const hmac = crypto.createHmac('sha256', getHmacSecret());
  hmac.update(payloadJson);
  const expectedSignature = hmac.digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('OAuth state signature validation failed (possible CSRF attempt).');
  }

  const data = JSON.parse(payloadJson);
  const now = Date.now();
  const MAX_AGE_MS = 10 * 60 * 1000;

  if (now - data.t > MAX_AGE_MS) {
    throw new Error('OAuth state has expired. Please initiate sign-in again.');
  }

  // Cleanup old nonces
  for (const [n, ts] of consumedOAuthNonces.entries()) {
    if (now - ts > MAX_AGE_MS) consumedOAuthNonces.delete(n);
  }

  if (consumedOAuthNonces.has(data.n)) {
    throw new Error('OAuth state token has already been used (replay attempt blocked).');
  }
  consumedOAuthNonces.set(data.n, now);

  let codeVerifier: string | undefined = undefined;
  if (data.cv) {
    codeVerifier = decryptToken(data.cv);
  }

  return {
    userId: data.uid,
    provider: data.p,
    timestamp: data.t,
    nonce: data.n,
    codeVerifier,
  };
}

/**
 * Generates standard PKCE code_verifier and code_challenge (S256).
 */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * Creates a signed session JWT for backend-authenticated sessions.
 */
export function createSessionToken(payload: {
  userId: string;
  email: string;
  displayName: string;
  expiresInMs?: number;
}): string {
  const exp = Date.now() + (payload.expiresInMs ?? 7 * 24 * 60 * 60 * 1000);
  const body = Buffer.from(
    JSON.stringify({
      sub: payload.userId,
      email: payload.email.toLowerCase(),
      name: payload.displayName,
      exp,
      iat: Date.now(),
    }),
    'utf8'
  ).toString('base64url');

  const sig = crypto.createHmac('sha256', getHmacSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/**
 * Verifies a signed session token and returns the authenticated user identity.
 */
export function verifySessionToken(token: string): {
  userId: string;
  email: string;
  displayName: string;
} | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', getHmacSecret()).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!decoded.exp || Date.now() > decoded.exp) {
      return null;
    }
    return {
      userId: decoded.sub || decoded.email,
      email: decoded.email,
      displayName: decoded.name || decoded.email,
    };
  } catch {
    return null;
  }
}

/**
 * Verifies Razorpay order payment signature: HMAC_SHA256(orderId + "|" + paymentId, keySecret)
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): boolean {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay subscription payment signature: HMAC_SHA256(paymentId + "|" + subscriptionId, keySecret)
 */
export function verifyRazorpaySubscriptionSignature(
  subscriptionId: string,
  paymentId: string,
  signature: string,
  secret: string
): boolean {
  if (!subscriptionId || !paymentId || !signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex');
  try {
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay raw webhook payload signature using Webhook Secret.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string,
  webhookSecret: string
): boolean {
  if (!rawBody || !signature || !webhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  try {
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
