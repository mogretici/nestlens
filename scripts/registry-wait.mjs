/**
 * Waits until npm would install a version, not merely list it.
 *
 * `npm view` reads the full packument; `npm install` and `npx` read the
 * abbreviated one (`Accept: application/vnd.npm.install-v1+json`), and the
 * registry's CDN caches the two separately. The 0.20.0 release saw
 * `npm view nestlens-mcp@0.20.0` succeed and `npx nestlens-mcp@0.20.0` fail
 * with ETARGET ten seconds later, on both runners. So the wait asks the
 * document install asks for, for every package install will need.
 */

const INSTALL_METADATA = 'application/vnd.npm.install-v1+json';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

const registryUrl = (registry, name) =>
  new URL(name.replaceAll('/', '%2f'), registry.endsWith('/') ? registry : `${registry}/`);

/** Whether the abbreviated packument for `name` lists `version`. */
export async function installable(
  name,
  version,
  { registry = DEFAULT_REGISTRY, fetchImpl = fetch } = {},
) {
  const response = await fetchImpl(registryUrl(registry, name), {
    headers: { accept: INSTALL_METADATA },
  });
  if (!response.ok) return false;

  const packument = await response.json();
  return Boolean(packument?.versions?.[version]);
}

/**
 * Resolves once every `[name, version]` is installable, polling every
 * `intervalMs`; rejects after `attempts` rounds with the packages still missing.
 */
export async function waitForInstallable(
  packages,
  {
    attempts,
    intervalMs,
    registry = process.env.npm_config_registry || DEFAULT_REGISTRY,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = console.log,
  },
) {
  let missing = packages;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const ready = await Promise.all(
      missing.map(([name, version]) =>
        installable(name, version, { registry, fetchImpl }).catch(() => false),
      ),
    );
    missing = missing.filter((_, index) => !ready[index]);
    if (missing.length === 0) return;

    log(
      `  … waiting for ${missing.map(([name, version]) => `${name}@${version}`).join(', ')} ` +
        `to be installable (${attempt}/${attempts})`,
    );
    if (attempt < attempts) await sleep(intervalMs);
  }

  throw new Error(
    `${missing.map(([name, version]) => `${name}@${version}`).join(', ')} never became installable`,
  );
}
