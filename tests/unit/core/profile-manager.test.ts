import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProfileManager } from '../../../src/core/profile-manager.js';
import type { FingerprintProfile } from '../../../src/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const WORKFLOW = 'test-workflow';

const testFingerprint: FingerprintProfile = {
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
    it('returns the chrome user data path for a workflow/profile', () => {
      const dir = manager.getProfileDir(WORKFLOW, 'default');
      expect(dir).toBe(path.join(tmpDir, WORKFLOW, 'default', 'chrome'));
    });
  });

  describe('profileExists', () => {
    it('returns false for non-existent profile', () => {
      expect(manager.profileExists(WORKFLOW, 'nope')).toBe(false);
    });

    it('returns true after saving metadata', () => {
      manager.saveMetadata(WORKFLOW, 'default', testFingerprint);
      expect(manager.profileExists(WORKFLOW, 'default')).toBe(true);
    });
  });

  describe('saveMetadata / loadMetadata', () => {
    it('round-trips metadata to disk', () => {
      manager.saveMetadata(WORKFLOW, 'default', testFingerprint, { server: 'socks5://proxy' });
      const loaded = manager.loadMetadata(WORKFLOW, 'default');

      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe('default');
      expect(loaded!.fingerprint.userAgent).toBe('Mozilla/5.0 Test');
      expect(loaded!.proxy?.server).toBe('socks5://proxy');
      expect(loaded!.createdAt).toBeTruthy();
      expect(loaded!.lastUsedAt).toBeTruthy();
    });

    it('returns null for non-existent profile', () => {
      expect(manager.loadMetadata(WORKFLOW, 'missing')).toBeNull();
    });
  });

  describe('updateLastUsed', () => {
    it('updates the lastUsedAt timestamp', () => {
      manager.saveMetadata(WORKFLOW, 'default', testFingerprint);
      const before = manager.loadMetadata(WORKFLOW, 'default')!.lastUsedAt;
      manager.updateLastUsed(WORKFLOW, 'default');
      const after = manager.loadMetadata(WORKFLOW, 'default')!.lastUsedAt;
      expect(after).toBeTruthy();
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  describe('listProfiles', () => {
    it('returns empty array when no profiles exist', () => {
      expect(manager.listProfiles(WORKFLOW)).toEqual([]);
    });

    it('lists all profiles under a workflow', () => {
      manager.saveMetadata(WORKFLOW, 'alice', testFingerprint);
      manager.saveMetadata(WORKFLOW, 'bob', testFingerprint);
      const profiles = manager.listProfiles(WORKFLOW);
      expect(profiles.sort()).toEqual(['alice', 'bob']);
    });
  });

  describe('listWorkflows', () => {
    it('lists all workflow namespaces', () => {
      manager.saveMetadata('workflow-a', 'default', testFingerprint);
      manager.saveMetadata('workflow-b', 'default', testFingerprint);
      const workflows = manager.listWorkflows();
      expect(workflows.sort()).toEqual(['workflow-a', 'workflow-b']);
    });
  });

  describe('deleteProfile', () => {
    it('removes a profile directory', () => {
      manager.saveMetadata(WORKFLOW, 'doomed', testFingerprint);
      expect(manager.profileExists(WORKFLOW, 'doomed')).toBe(true);
      manager.deleteProfile(WORKFLOW, 'doomed');
      expect(manager.profileExists(WORKFLOW, 'doomed')).toBe(false);
    });
  });
});
