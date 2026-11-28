export type FetchLike = (
  url: URL,
  init: { headers: Record<string, string> },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export function installable(
  name: string,
  version: string,
  options?: { registry?: string; fetchImpl?: FetchLike },
): Promise<boolean>;

export function waitForInstallable(
  packages: readonly (readonly [name: string, version: string])[],
  options: {
    attempts: number;
    intervalMs: number;
    registry?: string;
    fetchImpl?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
    log?: (line: string) => void;
  },
): Promise<void>;
