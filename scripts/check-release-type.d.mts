export interface Commit {
  readonly hash: string;
  readonly message: string;
}

export interface Decision {
  readonly type: 'major' | 'minor' | 'patch' | null;
  readonly ok: boolean;
  readonly offenders: readonly { readonly hash: string; readonly lines: readonly string[] }[];
}

export function analyzerConfig(releaseConfig: { plugins: unknown[] }): Record<string, unknown>;

export function decide(input: {
  version: string;
  commits: readonly Commit[];
  config?: Record<string, unknown>;
  cwd?: string;
}): Promise<Decision>;
