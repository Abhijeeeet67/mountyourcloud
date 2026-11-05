import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatEta,
  formatRelativeOrShortDate,
  formatSpeed,
  SI_GB,
  SI_KB,
  SI_MB,
  SI_TB,
} from '../lib/format';

describe('Format Utilities (SI standard)', () => {
  describe('formatBytes', () => {
    it('handles zero and negative or invalid values', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(-100)).toBe('0 B');
      expect(formatBytes(NaN)).toBe('0 B');
      expect(formatBytes(Infinity)).toBe('0 B');
    });

    it('formats bytes below 1 KB', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(999)).toBe('999 B');
    });

    it('formats exact SI boundaries and fractional values', () => {
      expect(formatBytes(SI_KB)).toBe('1.0 KB');
      expect(formatBytes(1500)).toBe('1.5 KB');
      expect(formatBytes(SI_MB)).toBe('1.0 MB');
      expect(formatBytes(25 * SI_MB)).toBe('25.0 MB');
      expect(formatBytes(SI_GB)).toBe('1.0 GB');
      expect(formatBytes(500 * SI_GB)).toBe('500.0 GB');
      expect(formatBytes(SI_TB)).toBe('1.0 TB');
      expect(formatBytes(2.5 * SI_TB)).toBe('2.5 TB');
    });
  });

  describe('formatSpeed', () => {
    it('formats zero or invalid speeds to 0.0 MB/s', () => {
      expect(formatSpeed(0)).toBe('0.0 MB/s');
      expect(formatSpeed(-5)).toBe('0.0 MB/s');
      expect(formatSpeed(NaN)).toBe('0.0 MB/s');
    });

    it('formats sub-0.1 MB/s in KB/s', () => {
      expect(formatSpeed(50 * SI_KB)).toBe('50 KB/s');
      expect(formatSpeed(80 * SI_KB)).toBe('80 KB/s');
    });

    it('formats speeds >= 0.1 MB/s in MB/s', () => {
      expect(formatSpeed(200 * SI_KB)).toBe('0.2 MB/s');
      expect(formatSpeed(12.4 * SI_MB)).toBe('12.4 MB/s');
      expect(formatSpeed(45 * SI_MB)).toBe('45.0 MB/s');
    });
  });

  describe('formatEta', () => {
    it('returns em-dash for null, non-positive, or non-finite values', () => {
      expect(formatEta(null)).toBe('—');
      expect(formatEta(0)).toBe('—');
      expect(formatEta(-10)).toBe('—');
      expect(formatEta(NaN)).toBe('—');
      expect(formatEta(Infinity)).toBe('—');
    });

    it('formats seconds < 60s', () => {
      expect(formatEta(1)).toBe('1s');
      expect(formatEta(45.2)).toBe('46s');
      expect(formatEta(59)).toBe('59s');
    });

    it('formats minutes and seconds for < 60 mins', () => {
      expect(formatEta(60)).toBe('1m');
      expect(formatEta(95)).toBe('1m 35s');
      expect(formatEta(600)).toBe('10m');
    });

    it('formats hours and minutes for >= 60 mins', () => {
      expect(formatEta(3600)).toBe('1h 0m');
      expect(formatEta(3660)).toBe('1h 1m');
      expect(formatEta(7320)).toBe('2h 2m');
    });
  });

  describe('formatRelativeOrShortDate', () => {
    it('returns "Just now" for timestamps within 60 seconds', () => {
      const now = 1_700_000_000_000;
      expect(formatRelativeOrShortDate(now - 15_000, now)).toBe('Just now');
      expect(formatRelativeOrShortDate(now, now)).toBe('Just now');
    });

    it('formats minutes ago within 1 hour', () => {
      const now = 1_700_000_000_000;
      expect(formatRelativeOrShortDate(now - 5 * 60 * 1000, now)).toBe('5m ago');
      expect(formatRelativeOrShortDate(now - 59 * 60 * 1000, now)).toBe('59m ago');
    });

    it('formats hours ago within 24 hours', () => {
      const now = 1_700_000_000_000;
      expect(formatRelativeOrShortDate(now - 2 * 3600 * 1000, now)).toBe('2h ago');
      expect(formatRelativeOrShortDate(now - 23 * 3600 * 1000, now)).toBe('23h ago');
    });

    it('formats days ago within 7 days', () => {
      const now = 1_700_000_000_000;
      expect(formatRelativeOrShortDate(now - 3 * 86400 * 1000, now)).toBe('3d ago');
      expect(formatRelativeOrShortDate(now - 6 * 86400 * 1000, now)).toBe('6d ago');
    });

    it('formats absolute short date for older timestamps', () => {
      const date = new Date('2024-05-15T12:00:00Z').getTime();
      const now = date + 30 * 86400 * 1000;
      const formatted = formatRelativeOrShortDate(date, now);
      expect(formatted).toMatch(/May 15/);
    });
  });
});
