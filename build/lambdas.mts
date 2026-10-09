import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** The build settings of one function in lambdas.json; Terraform reads its other fields. */
export type LambdaConfig = { entry: string };

/** Registered functions keyed by their AWS function name. */
export type LambdaRegistry = Record<string, LambdaConfig>;

export async function extractAndValidateLambdas(root: string): Promise<LambdaRegistry> {
  // Terraform reads this same registry, keeping build targets and deployed functions aligned.
  const registry: unknown = JSON.parse(await readFile(path.join(root, 'lambdas.json'), 'utf8'));

  if (!registry || Array.isArray(registry) || typeof registry !== 'object' || !Object.keys(registry).length) {
    throw new Error('lambdas.json must contain at least one Lambda.');
  }

  // Names become both AWS identities and output folders, so they must be safe for both.
  for (const [name, config] of Object.entries(registry)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
      throw new Error(`Invalid Lambda name: ${name}`);
    }
    // Catch invalid entry paths here; esbuild checks file availability and imports later.
    const entry: unknown = config?.entry;
    if (typeof entry !== 'string' || !entry.startsWith('src/') ||
        !entry.endsWith('.ts') || path.relative(root, path.resolve(root, entry)).startsWith('..')) {
      throw new Error(`Invalid TypeScript entry for ${name}`);
    }
  }

  return registry as LambdaRegistry;
}
