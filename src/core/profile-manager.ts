import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FingerprintProfile, ProxyConfig } from '../types.js';
import type { ProfileMetadata } from './types.js';

export class ProfileManager {
  constructor(private readonly baseDir: string) {}

  /**
   * Resolve the full profile path: {baseDir}/{workflow}/{profile}/
   * If no workflow given, falls back to flat layout for backward compat.
   */
  private profilePath(workflow: string | undefined, profile: string): string {
    if (workflow) {
      return path.join(this.baseDir, workflow, profile);
    }
    return path.join(this.baseDir, profile);
  }

  getProfileDir(workflow: string | undefined, profile: string): string {
    return path.join(this.profilePath(workflow, profile), 'chrome');
  }

  profileExists(workflow: string | undefined, profile: string): boolean {
    return fs.existsSync(this.metadataPath(workflow, profile));
  }

  saveMetadata(
    workflow: string | undefined,
    profile: string,
    fingerprint: FingerprintProfile,
    proxy?: ProxyConfig,
  ): void {
    const dir = this.profilePath(workflow, profile);
    const chromeDir = path.join(dir, 'chrome');
    fs.mkdirSync(chromeDir, { recursive: true });

    const existing = this.loadMetadata(workflow, profile);
    const now = new Date().toISOString();

    const metadata: ProfileMetadata = {
      name: profile,
      fingerprint,
      proxy,
      createdAt: existing?.createdAt ?? now,
      lastUsedAt: now,
    };

    fs.writeFileSync(this.metadataPath(workflow, profile), JSON.stringify(metadata, null, 2));
  }

  loadMetadata(workflow: string | undefined, profile: string): ProfileMetadata | null {
    const metaPath = this.metadataPath(workflow, profile);
    if (!fs.existsSync(metaPath)) return null;
    const raw = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(raw) as ProfileMetadata;
  }

  updateLastUsed(workflow: string | undefined, profile: string): void {
    const metadata = this.loadMetadata(workflow, profile);
    if (!metadata) return;
    metadata.lastUsedAt = new Date().toISOString();
    fs.writeFileSync(this.metadataPath(workflow, profile), JSON.stringify(metadata, null, 2));
  }

  /** List all profiles under a workflow namespace */
  listProfiles(workflow?: string): string[] {
    const dir = workflow ? path.join(this.baseDir, workflow) : this.baseDir;
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((name: string) => this.profileExists(workflow, name));
  }

  /** List all workflow namespaces */
  listWorkflows(): string[] {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir).filter((name: string) => {
      const fullPath = path.join(this.baseDir, name);
      return fs.statSync(fullPath).isDirectory();
    });
  }

  deleteProfile(workflow: string | undefined, profile: string): void {
    const dir = this.profilePath(workflow, profile);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  private metadataPath(workflow: string | undefined, profile: string): string {
    return path.join(this.profilePath(workflow, profile), 'metadata.json');
  }
}