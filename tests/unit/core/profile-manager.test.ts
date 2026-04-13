import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProfileManager } from '../../../src/core/profile-manager.js';
import type { ProfileMetadata } from '../../../src/core/types.js';
import type { FingerprintProfile } from '../../../src/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('ProfileManager', () => {
  let tmpDir: string;
  let manager: ProfileManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-test-'));
    manager = new ProfileManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getProfileDir', () => {
    it('returns the chrome user data path for a profile', () => {
      const dir = manager.getProfileDir('test-user');
      expect(dir).toBe(path.join(tmpDir, 'test-user', 'chrome'));
    });
  });

  describe('profileExists', () => {
    it('returns false for non-existent profile', () => {
      expect(manager.profileExists('nope')).toBe(false);
    });

    it('returns true after saving metadata', () => {
      const fingerprint: FingerprintProfile = {
        userAgent: 'Mozilla/5.0 Test',
        viewport: { width: 1920, height: 1080 },
        webglVendor: 'NVIDIA',
        webglRenderer: 'RTX 3060',
        canvasSeed: 0x1234,
        audioSeed: 0x5678,
        timezone: 'America/New_York',
        locale: 'en-US',
        platform: 'Win32',
      };
      manager.saveMetadata('test-user', fingerprint);
      expect(manager.profileExists('test-user')).toBe(true);
    });
  });

  describe('saveMetadata / loadMetadata', () => {
    it('round-trips metadata to disk', () => {
      const fingerprint: FingerprintProfile = {
        userAgent: 'Mozilla/5.0 Test',
        viewport: { width: 1920, height: 1080 },
        webglVendor: 'NVIDIA',
        webglRenderer: 'RTX 3060',
        canvasSeed: 0x1234,
        audioSeed: 0x5678,
        timezone: 'America/New_York',
        locale: 'en-US',
        platform: 'Win32',
      };
      manager.saveMetadata('user-1', fingerprint, { server: 'socks5://proxy' });
      const loaded = manager.loadMetadata('user-1');

      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe('user-1');
      expect(loaded!.fingerprint.userAgent).toBe('Mozilla/5.0 Test');
      expect(loaded!.proxy?.server).toBe('socks5://proxy');
      expect(loaded!.createdAt).toBeTruthy();
      expect(loaded!.lastUsedAt).toBeTruthy();
    });

    it('returns null for non-existent profile', () => {
      expect(manager.loadMetadata('missing')).toBeNull();
    });
  });

  describe('updateLastUsed', () => {
    it('updates the lastUsedAt timestamp', () => {
      const fingerprint: FingerprintProfile = {
        userAgent: 'Test', viewport: { width: 1920, height: 1080 },
        webglVendor: 'NVIDIA', webglRenderer: 'RTX 3060',
        canvasSeed: 1, audioSeed: 2, timezone: 'UTC', locale: 'en-US', platform: 'Win32',
      };
      manager.saveMetadata('user-1', fingerprint);
      const before = manager.loadMetadata('user-1')!.lastUsedAt;
      manager.updateLastUsed('user-1');
      const after = manager.loadMetadata('user-1')!.lastUsedAt;
      expect(after).toBeTruthy();
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  describe('listProfiles', () => {
    it('returns empty array when no profiles exist', () => {
      expect(manager.listProfiles()).toEqual([]);
    });

    it('lists all saved profiles', () => {
      const fingerprint: FingerprintProfile = {
        userAgent: 'Test', viewport: { width: 1920, height: 1080 },
        webglVendor: 'NVIDIA', webglRenderer: 'RTX 3060',
        canvasSeed: 1, audioSeed: 2, timezone: 'UTC', locale: 'en-US', platform: 'Win32',
      };
      manager.saveMetadata('alice', fingerprint);
      manager.saveMetadata('bob', fingerprint);
      const profiles = manager.listProfiles();
      expect(profiles.sort()).toEqual(['alice', 'bob']);
    });
  });

  describe('deleteProfile', () => {
    it('removes a profile directory', () => {
      const fingerprint: FingerprintProfile = {
        userAgent: 'Test', viewport: { width: 1920, height: 1080 },
        webglVendor: 'NVIDIA', webglRenderer: 'RTX 3060',
        canvasSeed: 1, audioSeed: 2, timezone: 'UTC', locale: 'en-US', platform: 'Win32',
      };
      manager.saveMetadata('doomed', fingerprint);
      expect(manager.profileExists('doomed')).toBe(true);
      manager.deleteProfile('doomed');
      expect(manager.profileExists('doomed')).toBe(false);
    });
  });
});