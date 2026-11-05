import crypto from 'node:crypto';

// Default fallback key for development; in production, OAUTH_ENCRYPTION_KEY must be provided
const DEFAULT_DEV_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function getEncryptionKey(): Buffer {
  const envKey = process.env.OAUTH_ENCRYPTION_KEY?.trim() || DEFAULT_DEV_KEY;
  // If hex string (64 chars), parse as hex; otherwise hash with SHA-256 to guarantee 32 bytes (256 bits)
  if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }
  return crypto.createHash('sha256').update(envKey).digest();
}

function getHmacSecret(): string {
  return process.env.SESSION_SECRET?.trim() || process.env.OAUTH_ENCRYPTION_KEY?.trim() || 'myc_hmac_secret_key_default';
}

/**
 * Encrypts sensitive tokens at rest using AES-256-GCM authenticated encryption.
 * Output format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  return `${iv.toString('base64')}:${authTag}:${ciphertext}`;
}

/**
 * Decrypts tokens encrypted with AES-256-GCM.
 * Validates the authentication tag to guarantee ciphertext integrity and authenticity.
 */
export function decryptToken(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted token payload.');
  }

  const [ivBase64, authTagBase64, ciphertextBase64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextBase64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Generates an HMAC-signed, tamper-proof state parameter with timestamp and userId to prevent CSRF.
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
 * Validates and unpacks the signed OAuth state.
 * Throws if the state has expired (>10 minutes) or has been tampered with.
 */
export function verifyAndUnpackOAuthState(stateString: string): {
  userId: string;
  provider: string;
  timestamp: number;
  codeVerifier?: string;
} {
  const parts = stateString.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid OAuth state format.');
  }

  const [encodedPayload, signature] = parts;
  const payloadJson = Buffer.from(encodedPayload, 'base64url').toString('utf8');

  // Verify signature
  const hmac = crypto.createHmac('sha256', getHmacSecret());
  hmac.update(payloadJson);
  const expectedSignature = hmac.digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error('OAuth state signature validation failed (possible CSRF attempt).');
  }

  const data = JSON.parse(payloadJson);
  const now = Date.now();
  const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

  if (now - data.t > MAX_AGE_MS) {
    throw new Error('OAuth state has expired. Please initiate sign-in again.');
  }

  let codeVerifier: string | undefined = undefined;
  if (data.cv) {
    codeVerifier = decryptToken(data.cv);
  }

  return {
    userId: data.uid,
    provider: data.p,
    timestamp: data.t,
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
