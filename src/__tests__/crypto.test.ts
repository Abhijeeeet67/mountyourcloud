import { describe, expect, it } from 'vitest';
import {
  computeBlobSha256,
  generateSaltHex,
  hashPasswordPBKDF2,
} from '../lib/crypto';

describe('Web Crypto & Password Security', () => {
  describe('generateSaltHex', () => {
    it('generates a 32-character hex string for 16 bytes default salt', () => {
      const salt = generateSaltHex();
      expect(salt).toMatch(/^[0-9a-f]{32}$/);
    });

    it('generates unique cryptographic salts on successive calls', () => {
      const s1 = generateSaltHex();
      const s2 = generateSaltHex();
      expect(s1).not.toBe(s2);
    });

    it('supports custom byte lengths', () => {
      const salt32 = generateSaltHex(32);
      expect(salt32).toHaveLength(64);
    });
  });

  describe('hashPasswordPBKDF2', () => {
    it('generates a 64-character (256-bit) hex hash', async () => {
      const salt = generateSaltHex();
      // Use lower iteration count in test for execution speed
      const hash = await hashPasswordPBKDF2('MasterKey@2026', salt, 10_000);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces deterministic output for the same password and salt', async () => {
      const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const hash1 = await hashPasswordPBKDF2('SecurePassword123!', salt, 5_000);
      const hash2 = await hashPasswordPBKDF2('SecurePassword123!', salt, 5_000);
      expect(hash1).toBe(hash2);
    });

    it('produces completely different hashes for different passwords', async () => {
      const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const hashA = await hashPasswordPBKDF2('PasswordA', salt, 5_000);
      const hashB = await hashPasswordPBKDF2('PasswordB', salt, 5_000);
      expect(hashA).not.toBe(hashB);
    });

    it('produces completely different hashes for different salts with same password', async () => {
      const saltA = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const saltB = 'ffffffffffffffffffffffffffffffff';
      const hashA = await hashPasswordPBKDF2('IdenticalPassword', saltA, 5_000);
      const hashB = await hashPasswordPBKDF2('IdenticalPassword', saltB, 5_000);
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('computeBlobSha256', () => {
    it('computes expected SHA-256 hash for text blob', async () => {
      const text = 'hello world';
      const blob = new Blob([text], { type: 'text/plain' });
      // Known SHA-256 for "hello world": b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
      const hash = await computeBlobSha256(blob);
      expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('returns null if blob exceeds MAX_SHA256_SIZE_BYTES', async () => {
      // Mock large blob size (> 64 MB)
      const largeBlob = new Blob(['short content']);
      Object.defineProperty(largeBlob, 'size', { value: 70 * 1_000_000 }); // 70 MB > 64 MB limit
      const hash = await computeBlobSha256(largeBlob);
      expect(hash).toBeNull();
    });
  });
});
