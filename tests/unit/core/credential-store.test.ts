import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CredentialStore } from '../../../src/core/credential-store.js';
import type { CredentialEntry } from '../../../src/core/credential-store.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('CredentialStore', () => {
  let tmpDir: string;
  let store: CredentialStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-test-'));
    store = new CredentialStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleEntry: CredentialEntry = {
    loginUrl: 'https://www.linkedin.com/login',
    fields: [
      { selector: 'input#username', label: 'Email', type: 'text', value: 'user@example.com' },
      { selector: 'input#password', label: 'Password', type: 'password', value: 's3cret' },
    ],
    requires2FA: false,
    savedAt: '2026-04-14T10:30:00Z',
  };

  describe('exists', () => {
    it('returns false when no credentials saved', () => {
      expect(store.exists('linkedin-feed', 'default')).toBe(false);
    });

    it('returns true after saving credentials', () => {
      store.save('linkedin-feed', 'default', sampleEntry);
      expect(store.exists('linkedin-feed', 'default')).toBe(true);
    });
  });

  describe('save and get', () => {
    it('saves and retrieves credential entry', () => {
      store.save('linkedin-feed', 'default', sampleEntry);
      const loaded = store.get('linkedin-feed', 'default');
      expect(loaded).toEqual(sampleEntry);
    });

    it('creates nested directories automatically', () => {
      store.save('deep-workflow', 'custom-profile', sampleEntry);
      const filePath = path.join(tmpDir, 'deep-workflow', 'custom-profile.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('returns null when no credentials exist', () => {
      expect(store.get('nonexistent', 'default')).toBeNull();
    });

    it('overwrites existing credentials on re-save', () => {
      store.save('linkedin-feed', 'default', sampleEntry);
      const updated = { ...sampleEntry, requires2FA: true };
      store.save('linkedin-feed', 'default', updated);
      const loaded = store.get('linkedin-feed', 'default');
      expect(loaded?.requires2FA).toBe(true);
    });
  });

  describe('delete', () => {
    it('removes saved credentials', () => {
      store.save('linkedin-feed', 'default', sampleEntry);
      store.delete('linkedin-feed', 'default');
      expect(store.exists('linkedin-feed', 'default')).toBe(false);
      expect(store.get('linkedin-feed', 'default')).toBeNull();
    });

    it('does not throw when deleting nonexistent credentials', () => {
      expect(() => store.delete('nonexistent', 'default')).not.toThrow();
    });
  });
});
