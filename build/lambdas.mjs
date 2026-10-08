import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function extractAndValidateLambdas(root) {
  // Terraform reads this same registry, keeping build targets and deployed functions aligned.
  const registry = JSON.parse(await readFile(path.join(root, 'lambdas.json'), 'utf8'));

  if (!registry || Array.isArray(registry) || typeof registry !== 'object' || !Object.keys(registry).length) {
    throw new Error('lambdas.json must contain at least one Lambda.');
  }

  // Names become both AWS identities and output folders, so they must be safe for both.
  for (const [name, config] of Object.entries(registry)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
      throw new Error(`Invalid Lambda name: ${name}`);
    }
    // Catch invalid entry paths here; esbuild checks file availability and imports later.
    if (typeof config?.entry !== 'string' || !config.entry.startsWith('src/') ||
        !config.entry.endsWith('.ts') || path.relative(root, path.resolve(root, config.entry)).startsWith('..')) {
      throw new Error(`Invalid TypeScript entry for ${name}`);
    }
  }

  return registry;
}
