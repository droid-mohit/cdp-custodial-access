import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface CredentialField {
  selector: string;
  label: string;
  type: 'text' | 'password';
  value: string;
}

export interface CredentialEntry {
  loginUrl: string;
  fields: CredentialField[];
  requires2FA: boolean;
  savedAt: string;
}

const DEFAULT_BASE_DIR = path.join(os.homedir(), '.cdp-custodial-access', 'credentials');

export class CredentialStore {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? DEFAULT_BASE_DIR;
  }

  private filePath(workflow: string, profile: string): string {
    return path.join(this.baseDir, workflow, `${profile}.json`);
  }

  get(workflow: string, profile: string): CredentialEntry | null {
    const fp = this.filePath(workflow, profile);
    if (!fs.existsSync(fp)) return null;
    const raw = fs.readFileSync(fp, 'utf-8');
    return JSON.parse(raw) as CredentialEntry;
  }

  save(workflow: string, profile: string, entry: CredentialEntry): void {
    const fp = this.filePath(workflow, profile);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(entry, null, 2), 'utf-8');
  }

  delete(workflow: string, profile: string): void {
    const fp = this.filePath(workflow, profile);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
    }
  }

  exists(workflow: string, profile: string): boolean {
    return fs.existsSync(this.filePath(workflow, profile));
  }
}
