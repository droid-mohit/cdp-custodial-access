import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FingerprintProfile, ProxyConfig } from '../types.js';
import type { ProfileMetadata } from './types.js';

export class ProfileManager {
  constructor(private readonly baseDir: string) {}

  getProfileDir(profileName: string): string {
    return path.join(this.baseDir, profileName, 'chrome');
  }

  profileExists(profileName: string): boolean {
    const metadataPath = this.metadataPath(profileName);
    return fs.existsSync(metadataPath);
  }

  saveMetadata(profileName: string, fingerprint: FingerprintProfile, proxy?: ProxyConfig): void {
    const profileDir = path.join(this.baseDir, profileName);
    const chromeDir = path.join(profileDir, 'chrome');
    fs.mkdirSync(chromeDir, { recursive: true });

    const existing = this.loadMetadata(profileName);
    const now = new Date().toISOString();

    const metadata: ProfileMetadata = {
      name: profileName,
      fingerprint,
      proxy,
      createdAt: existing?.createdAt ?? now,
      lastUsedAt: now,
    };

    fs.writeFileSync(this.metadataPath(profileName), JSON.stringify(metadata, null, 2));
  }

  loadMetadata(profileName: string): ProfileMetadata | null {
    const metadataPath = this.metadataPath(profileName);
    if (!fs.existsSync(metadataPath)) return null;
    const raw = fs.readFileSync(metadataPath, 'utf-8');
    return JSON.parse(raw) as ProfileMetadata;
  }

  updateLastUsed(profileName: string): void {
    const metadata = this.loadMetadata(profileName);
    if (!metadata) return;
    metadata.lastUsedAt = new Date().toISOString();
    fs.writeFileSync(this.metadataPath(profileName), JSON.stringify(metadata, null, 2));
  }

  listProfiles(): string[] {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir).filter((name: string) => this.profileExists(name));
  }

  deleteProfile(profileName: string): void {
    const profileDir = path.join(this.baseDir, profileName);
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  }

  private metadataPath(profileName: string): string {
    return path.join(this.baseDir, profileName, 'metadata.json');
  }
}