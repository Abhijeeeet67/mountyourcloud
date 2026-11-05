import { describe, expect, it } from 'vitest';
import { MOUNTABLE_PROVIDER_KINDS, PROVIDER_KIND_META } from '../lib/constants';
import { validateBucketName, validateWebdavUrl } from '../pages/ProvidersPage';

describe('Storage Provider Configuration Validators & Metadata Registry', () => {
  describe('Provider Metadata Registry', () => {
    it('registers exactly 39 external mountable providers and 1 local vault', () => {
      expect(MOUNTABLE_PROVIDER_KINDS.length).toBe(39);
      expect(Object.keys(PROVIDER_KIND_META).length).toBe(40);
      expect(PROVIDER_KIND_META.local.category).toBe('Built-In Browser');
    });

    it('classifies restricted consumer clouds honestly with api_restricted', () => {
      const restrictedKinds = ['mega', 'terabox', 'proton', 'icloud', 'sync', 'filen'] as const;
      for (const kind of restrictedKinds) {
        expect(PROVIDER_KIND_META[kind].integrationStatus).toBe('api_restricted');
        expect(PROVIDER_KIND_META[kind].apiNote).toBeDefined();
      }
    });

    it('flags raw socket protocols as requiring backend proxies', () => {
      const proxyKinds = ['sftp', 'smb', 'ftp'] as const;
      for (const kind of proxyKinds) {
        expect(PROVIDER_KIND_META[kind].requiresBackendProxy).toBe(true);
        expect(PROVIDER_KIND_META[kind].integrationStatus).toBe('proxy_required');
      }
    });

    it('marks live API providers with fully_integrated status', () => {
      expect(PROVIDER_KIND_META.gdrive.integrationStatus).toBe('fully_integrated');
      expect(PROVIDER_KIND_META.s3.integrationStatus).toBe('fully_integrated');
      expect(PROVIDER_KIND_META.r2.integrationStatus).toBe('fully_integrated');
      expect(PROVIDER_KIND_META.webdav.integrationStatus).toBe('fully_integrated');
      expect(PROVIDER_KIND_META.nextcloud.integrationStatus).toBe('fully_integrated');
    });
  });

  describe('validateBucketName', () => {
    it('enforces length constraints (3 to 63 chars)', () => {
      expect(validateBucketName('s3', 'ab')).toBe('Bucket name must be between 3 and 63 characters.');
      expect(validateBucketName('s3', 'a'.repeat(64))).toBe('Bucket name must be between 3 and 63 characters.');
      expect(validateBucketName('s3', 'abc')).toBeNull();
    });

    it('requires bucket to start and end with lowercase letter or digit', () => {
      expect(validateBucketName('s3', '-invalid-')).toBe(
        'Bucket name must start and end with a lowercase letter or digit.'
      );
      expect(validateBucketName('s3', '.invalid')).toBe(
        'Bucket name must start and end with a lowercase letter or digit.'
      );
      expect(validateBucketName('s3', 'valid-name-123')).toBeNull();
    });

    it('enforces provider-specific character sets', () => {
      // S3 allows lowercase, digits, dots, hyphens
      expect(validateBucketName('s3', 'my.valid-bucket.01')).toBeNull();
      expect(validateBucketName('s3', 'invalid_underscore')).toBe(
        'S3 bucket name may only contain lowercase letters, digits, dots (.), and hyphens (-).'
      );
      expect(validateBucketName('s3', 'UPPERCASE')).toBe(
        'Bucket name must start and end with a lowercase letter or digit.'
      );

      // Cloudflare R2 disallows dots (lowercase, digits, hyphens only)
      expect(validateBucketName('r2', 'my-r2-bucket')).toBeNull();
      expect(validateBucketName('r2', 'my.r2.bucket')).toBe(
        'Cloudflare R2 bucket name may only contain lowercase letters, digits, and hyphens (-).'
      );

      // GCS allows dots, hyphens, and underscores
      expect(validateBucketName('gcs', 'my_gcs-bucket.01')).toBeNull();
      expect(validateBucketName('gcs', 'invalid@bucket')).toBe(
        'GCS bucket name may only contain lowercase letters, digits, dots (.), hyphens (-), and underscores (_).'
      );
    });
  });

  describe('validateWebdavUrl', () => {
    it('accepts valid HTTP and HTTPS URLs', () => {
      expect(validateWebdavUrl('https://dav.example.com/webdav')).toBeNull();
      expect(validateWebdavUrl('http://192.168.1.100:8080/remote.php/dav')).toBeNull();
    });

    it('rejects unsupported protocols', () => {
      expect(validateWebdavUrl('ftp://example.com/files')).toBe(
        'Endpoint URL must start with http:// or https://'
      );
      expect(validateWebdavUrl('ws://example.com')).toBe(
        'Endpoint URL must start with http:// or https://'
      );
    });

    it('rejects malformed URLs', () => {
      expect(validateWebdavUrl('not-a-url')).toBe('Please enter a valid http(s) endpoint URL.');
      expect(validateWebdavUrl('')).toBe('Please enter a valid http(s) endpoint URL.');
    });
  });
});
