import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DropboxAdapter,
  GoogleDriveAdapter,
  OneDriveAdapter,
} from '../storage/adapters';
import { vaultRepository } from '../storage/repository';
import type { ProviderMount } from '../types/domain';

describe('OAuth Storage Providers Real API Adapters', () => {
  let mockMount: ProviderMount;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockMount = {
      id: 'mount_test_1',
      kind: 'gdrive',
      name: 'Test Cloud',
      allocatedBytes: 100 * 1024 * 1024 * 1024,
      latencyMs: 40,
      mode: 'real',
      status: 'connected',
      zeroEgress: true,
      endpoint: null,
      region: null,
      bucket: null,
      lastSyncedAt: Date.now(),
      createdAt: Date.now(),
      credentials: {
        oauthToken: {
          accessToken: 'mock_test_access_token_123',
        },
      },
    };
  });

  describe('GoogleDriveAdapter', () => {
    it('executes listFiles query with parents and trashed filter', async () => {
      const adapter = new GoogleDriveAdapter(vaultRepository);
      const fakeFiles = [
        { id: 'file_1', name: 'Document.pdf', mimeType: 'application/pdf', size: '1024' },
        { id: 'folder_1', name: 'Projects', mimeType: 'application/vnd.google-apps.folder', size: '0' },
      ];

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url) => {
        expect(String(url)).toContain('drive/v3/files');
        return new Response(JSON.stringify({ files: fakeFiles }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const items = await adapter.listFiles(mockMount);
      expect(items).toHaveLength(2);
      expect(items[0].name).toBe('Document.pdf');
      expect(items[0].isFolder).toBe(false);
      expect(items[1].name).toBe('Projects');
      expect(items[1].isFolder).toBe(true);
    });

    it('creates folders with application/vnd.google-apps.folder mimeType', async () => {
      const adapter = new GoogleDriveAdapter(vaultRepository);
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init) => {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body));
        expect(body.mimeType).toBe('application/vnd.google-apps.folder');
        expect(body.name).toBe('NewFolder');
        return new Response(
          JSON.stringify({ id: 'created_fld_99', name: 'NewFolder', mimeType: 'application/vnd.google-apps.folder' }),
          { status: 200 }
        );
      });

      const folder = await adapter.createFolder(mockMount, 'NewFolder');
      expect(folder.id).toBe('created_fld_99');
      expect(folder.isFolder).toBe(true);
    });

    it('renames files via PATCH request', async () => {
      const adapter = new GoogleDriveAdapter(vaultRepository);
      let capturedBody = '';
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init) => {
        expect(init?.method).toBe('PATCH');
        expect(String(url)).toContain('file_123');
        capturedBody = String(init?.body);
        return new Response(JSON.stringify({ id: 'file_123', name: 'Renamed.pdf' }), { status: 200 });
      });

      await adapter.renameObject(mockMount, 'file_123', 'Renamed.pdf');
      expect(JSON.parse(capturedBody).name).toBe('Renamed.pdf');
    });

    it('fetches storage quota usage from about endpoint', async () => {
      const adapter = new GoogleDriveAdapter(vaultRepository);
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url) => {
        expect(String(url)).toContain('storageQuota');
        return new Response(
          JSON.stringify({ storageQuota: { usage: '5368709120', limit: '16106127360' } }),
          { status: 200 }
        );
      });

      const usage = await adapter.getUsage(mockMount);
      expect(usage.usedBytes).toBe(5368709120);
    });
  });

  describe('OneDriveAdapter', () => {
    beforeEach(() => {
      mockMount.kind = 'onedrive';
    });

    it('tests connection via Microsoft Graph API /me/drive', async () => {
      const adapter = new OneDriveAdapter(vaultRepository);
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init) => {
        expect(String(url)).toBe('https://graph.microsoft.com/v1.0/me/drive');
        expect((init?.headers as any)?.Authorization).toBe('Bearer mock_test_access_token_123');
        return new Response(
          JSON.stringify({
            quota: { used: 10485760 },
            owner: { user: { displayName: 'John Doe' } },
          }),
          { status: 200 }
        );
      });

      const report = await adapter.testConnection(mockMount);
      expect(report.ok).toBe(true);
      expect(report.message).toContain('John Doe');
    });

    it('lists files and folders from children endpoint', async () => {
      const adapter = new OneDriveAdapter(vaultRepository);
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url) => {
        expect(String(url)).toBe('https://graph.microsoft.com/v1.0/me/drive/root/children');
        return new Response(
          JSON.stringify({
            value: [
              { id: 'ms_f1', name: 'Report.docx', size: 2048, file: { mimeType: 'application/msword' } },
              { id: 'ms_d1', name: 'Shared', size: 0, folder: { childCount: 4 } },
            ],
          }),
          { status: 200 }
        );
      });

      const items = await adapter.listFiles(mockMount);
      expect(items).toHaveLength(2);
      expect(items[0].isFolder).toBe(false);
      expect(items[1].isFolder).toBe(true);
    });

    it('creates a new folder via Microsoft Graph API', async () => {
      const adapter = new OneDriveAdapter(vaultRepository);
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body));
        expect(body.folder).toBeDefined();
        return new Response(JSON.stringify({ id: 'new_ms_folder', name: 'WorkDocs' }), { status: 200 });
      });

      const folder = await adapter.createFolder(mockMount, 'WorkDocs');
      expect(folder.id).toBe('new_ms_folder');
      expect(folder.isFolder).toBe(true);
    });
  });

  describe('DropboxAdapter', () => {
    beforeEach(() => {
      mockMount.kind = 'dropbox';
    });

    it('tests connection via users/get_space_usage endpoint', async () => {
      const adapter = new DropboxAdapter(vaultRepository);
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url) => {
        expect(String(url)).toBe('https://api.dropboxapi.com/2/users/get_space_usage');
        return new Response(JSON.stringify({ used: 4294967296 }), { status: 200 });
      });

      const report = await adapter.testConnection(mockMount);
      expect(report.ok).toBe(true);
      expect(report.message).toContain('4295 MB used');
    });

    it('lists files via files/list_folder', async () => {
      const adapter = new DropboxAdapter(vaultRepository);
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init) => {
        expect(String(url)).toBe('https://api.dropboxapi.com/2/files/list_folder');
        const body = JSON.parse(String(init?.body));
        expect(body.path).toBe('');
        return new Response(
          JSON.stringify({
            entries: [
              { '.tag': 'file', id: 'id:123', name: 'photo.jpg', size: 500000 },
              { '.tag': 'folder', id: 'id:456', name: 'Backup' },
            ],
          }),
          { status: 200 }
        );
      });

      const items = await adapter.listFiles(mockMount);
      expect(items).toHaveLength(2);
      expect(items[0].name).toBe('photo.jpg');
      expect(items[0].isFolder).toBe(false);
      expect(items[1].name).toBe('Backup');
      expect(items[1].isFolder).toBe(true);
    });

    it('creates folder via files/create_folder_v2', async () => {
      const adapter = new DropboxAdapter(vaultRepository);
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init) => {
        expect(String(url)).toBe('https://api.dropboxapi.com/2/files/create_folder_v2');
        const body = JSON.parse(String(init?.body));
        expect(body.path).toBe('/Archive');
        return new Response(
          JSON.stringify({
            metadata: { id: 'id:archived', name: 'Archive', '.tag': 'folder' },
          }),
          { status: 200 }
        );
      });

      const folder = await adapter.createFolder(mockMount, 'Archive');
      expect(folder.name).toBe('Archive');
      expect(folder.isFolder).toBe(true);
    });
  });
});
