import { describe, expect, it } from 'vitest';
import {
  resolveUniqueSiblingName,
  splitNameAndExt,
  validateNodeName,
} from '../storage/orchestrator';
import { collectSubtreeIds, isEffectivelyTrashed } from '../storage/repository';
import type { FileNode, FolderNode, VaultNode } from '../types/domain';

describe('Storage Orchestrator & Hierarchy Logic', () => {
  describe('validateNodeName', () => {
    it('rejects empty or whitespace-only names', () => {
      expect(validateNodeName('').valid).toBe(false);
      expect(validateNodeName('   ').valid).toBe(false);
      expect(validateNodeName('').error).toBe('Name cannot be empty.');
    });

    it('rejects names with slashes', () => {
      expect(validateNodeName('folder/subfolder').valid).toBe(false);
      expect(validateNodeName('folder/subfolder').error).toContain('cannot contain "/"');
    });

    it('rejects names exceeding 255 characters', () => {
      const longName = 'a'.repeat(256);
      expect(validateNodeName(longName).valid).toBe(false);
      expect(validateNodeName(longName).error).toContain('255 characters or fewer');
    });

    it('accepts and trims valid names', () => {
      const result = validateNodeName('  Project Documents  ');
      expect(result.valid).toBe(true);
      expect(result.trimmed).toBe('Project Documents');
      expect(result.error).toBeNull();
    });
  });

  describe('splitNameAndExt', () => {
    it('returns full name as base for folders', () => {
      expect(splitNameAndExt('Photos.2024', true)).toEqual({
        base: 'Photos.2024',
        extWithDot: '',
      });
    });

    it('splits files with simple and compound extensions', () => {
      expect(splitNameAndExt('report.pdf', false)).toEqual({
        base: 'report',
        extWithDot: '.pdf',
      });
      expect(splitNameAndExt('archive.tar.gz', false)).toEqual({
        base: 'archive.tar',
        extWithDot: '.gz',
      });
    });

    it('handles files with no extension or leading dot (dotfiles)', () => {
      expect(splitNameAndExt('README', false)).toEqual({
        base: 'README',
        extWithDot: '',
      });
      expect(splitNameAndExt('.gitignore', false)).toEqual({
        base: '.gitignore',
        extWithDot: '',
      });
    });
  });

  describe('resolveUniqueSiblingName', () => {
    it('returns original name if no collision exists', () => {
      const siblings = new Set(['notes.txt', 'image.png']);
      expect(resolveUniqueSiblingName('document.pdf', false, siblings)).toBe('document.pdf');
    });

    it('increments suffix for colliding file names case-insensitively', () => {
      const siblings = new Set(['document.pdf', 'document (1).pdf']);
      expect(resolveUniqueSiblingName('Document.pdf', false, siblings)).toBe('Document (2).pdf');
    });

    it('increments suffix for colliding folder names', () => {
      const siblings = new Set(['projects', 'projects (1)']);
      expect(resolveUniqueSiblingName('Projects', true, siblings)).toBe('Projects (2)');
    });
  });

  describe('isEffectivelyTrashed', () => {
    const rootFolder: FolderNode = {
      id: 'f-root',
      parentId: null,
      name: 'Root',
      type: 'folder',
      starred: false,
      trashedAt: null,
      trashedFromParentId: null,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const trashedFolder: FolderNode = {
      id: 'f-trash',
      parentId: 'f-root',
      name: 'Archived',
      type: 'folder',
      starred: false,
      trashedAt: 2000,
      trashedFromParentId: 'f-root',
      createdAt: 1000,
      updatedAt: 2000,
    };

    const childFile: FileNode = {
      id: 'file-1',
      parentId: 'f-trash',
      name: 'doc.txt',
      type: 'file',
      providerId: 'mega-vault',
      mimeType: 'text/plain',
      extension: 'txt',
      sizeBytes: 1024,
      checksumSha256: null,
      hasBlob: false,
      hasThumb: false,
      starred: false,
      trashedAt: null, // file itself is not explicitly trashed
      trashedFromParentId: null,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const map = new Map<string, VaultNode>([
      [rootFolder.id, rootFolder],
      [trashedFolder.id, trashedFolder],
      [childFile.id, childFile],
    ]);

    it('returns false for normal non-trashed nodes', () => {
      expect(isEffectivelyTrashed(rootFolder, map)).toBe(false);
    });

    it('returns true for directly trashed nodes', () => {
      expect(isEffectivelyTrashed(trashedFolder, map)).toBe(true);
    });

    it('returns true for children of trashed ancestors (cascade)', () => {
      expect(isEffectivelyTrashed(childFile, map)).toBe(true);
    });

    it('handles cyclic parent references without infinite looping', () => {
      const cyclicA: FolderNode = {
        ...rootFolder,
        id: 'cycle-a',
        parentId: 'cycle-b',
      };
      const cyclicB: FolderNode = {
        ...rootFolder,
        id: 'cycle-b',
        parentId: 'cycle-a',
      };
      const cyclicMap = new Map<string, VaultNode>([
        ['cycle-a', cyclicA],
        ['cycle-b', cyclicB],
      ]);
      expect(isEffectivelyTrashed(cyclicA, cyclicMap)).toBe(false);
    });
  });

  describe('collectSubtreeIds (with cycle safety)', () => {
    it('collects isolated file nodes', () => {
      const file: FileNode = {
        id: 'f-1',
        parentId: null,
        name: 'a.txt',
        type: 'file',
        providerId: 'local-vault',
        mimeType: 'text/plain',
        extension: 'txt',
        sizeBytes: 50,
        checksumSha256: null,
        hasBlob: true,
        hasThumb: false,
        starred: false,
        trashedAt: null,
        trashedFromParentId: null,
        createdAt: 1000,
        updatedAt: 1000,
      };
      const { nodeIds, fileNodes } = collectSubtreeIds('f-1', [file]);
      expect(nodeIds).toEqual(['f-1']);
      expect(fileNodes).toHaveLength(1);
      expect(fileNodes[0].id).toBe('f-1');
    });

    it('collects full hierarchy including nested folders and descendant files', () => {
      const rootFolder: FolderNode = {
        id: 'root',
        parentId: null,
        name: 'Root',
        type: 'folder',
        starred: false,
        trashedAt: null,
        trashedFromParentId: null,
        createdAt: 1000,
        updatedAt: 1000,
      };
      const subFolder: FolderNode = {
        id: 'sub',
        parentId: 'root',
        name: 'Sub',
        type: 'folder',
        starred: false,
        trashedAt: null,
        trashedFromParentId: null,
        createdAt: 1000,
        updatedAt: 1000,
      };
      const leafFile: FileNode = {
        id: 'leaf',
        parentId: 'sub',
        name: 'leaf.png',
        type: 'file',
        providerId: 'local-vault',
        mimeType: 'image/png',
        extension: 'png',
        sizeBytes: 2048,
        checksumSha256: null,
        hasBlob: true,
        hasThumb: true,
        starred: false,
        trashedAt: null,
        trashedFromParentId: null,
        createdAt: 1000,
        updatedAt: 1000,
      };

      const { nodeIds, fileNodes } = collectSubtreeIds('root', [rootFolder, subFolder, leafFile]);
      expect(nodeIds).toEqual(expect.arrayContaining(['root', 'sub', 'leaf']));
      expect(fileNodes).toHaveLength(1);
      expect(fileNodes[0].id).toBe('leaf');
    });

    it('terminates safely and avoids infinite loops on cyclic parent graphs', () => {
      const folderA: FolderNode = {
        id: 'cyc-1',
        parentId: 'cyc-2',
        name: 'Cycle A',
        type: 'folder',
        starred: false,
        trashedAt: null,
        trashedFromParentId: null,
        createdAt: 1000,
        updatedAt: 1000,
      };
      const folderB: FolderNode = {
        id: 'cyc-2',
        parentId: 'cyc-1',
        name: 'Cycle B',
        type: 'folder',
        starred: false,
        trashedAt: null,
        trashedFromParentId: null,
        createdAt: 1000,
        updatedAt: 1000,
      };

      const { nodeIds } = collectSubtreeIds('cyc-1', [folderA, folderB]);
      expect(nodeIds).toContain('cyc-1');
      expect(nodeIds).toContain('cyc-2');
      expect(nodeIds.length).toBe(2); // exactly 2, no duplicate loop
    });
  });
});
