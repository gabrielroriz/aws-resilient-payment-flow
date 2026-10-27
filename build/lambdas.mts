import { readFile } from 'node:fs/promises';
import path from 'node:path';

// The build settings of one registered function; Terraform reads its other fields.
export type LambdaConfig = { entry: string };

// Registered functions keyed by their AWS function name.
export type LambdaRegistry = Record<string, LambdaConfig>;

export async function extractAndValidateLambdas(root: string): Promise<LambdaRegistry> {
  // Terraform reads the same registry, so build targets match deployed functions.
  const registry: unknown = JSON.parse(await readFile(path.join(root, 'lambdas.json'), 'utf8'));

  if (
    !registry ||
    Array.isArray(registry) ||
    typeof registry !== 'object' ||
    !Object.keys(registry).length
  ) {
    throw new Error('lambdas.json must contain at least one Lambda.');
  }

  // Names become AWS identities and output folders, so they must be safe for both.
  for (const [name, config] of Object.entries(registry)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
      throw new Error(`Invalid Lambda name: ${name}`);
    }
    // Terraform creates HTTP resources only for `http` functions.
    // A route on a queue worker or a durable function would be silently ignored.
    if (config?.trigger !== undefined && !['http', 'sqs', 'durable'].includes(config.trigger)) {
      throw new Error(`Invalid trigger for ${name}: expected http, sqs, or durable`);
    }
    if (
      config?.trigger === 'sqs' &&
      (config.http_method !== undefined || config.path !== undefined)
    ) {
      throw new Error(`SQS Lambda ${name} must not declare an HTTP route.`);
    }
    if (
      config?.trigger === 'durable' &&
      (config.http_method !== undefined || config.path !== undefined)
    ) {
      throw new Error(`Durable Lambda ${name} must not declare an HTTP route.`);
    }
    // Callers derive a workflow's function name as `wf_<workflow>`.
    if ((config?.trigger === 'durable') !== name.startsWith('wf_')) {
      throw new Error(`Lambda ${name} must be durable exactly when its name starts with wf_.`);
    }
    // Terraform applies these only to durable functions and ignores them elsewhere.
    for (const field of ['execution_timeout', 'retention_period']) {
      const value: unknown = config?.[field];
      if (value === undefined) continue;
      if (config.trigger !== 'durable') {
        throw new Error(`Lambda ${name} declares ${field}, which only durable functions use.`);
      }
      if (!Number.isInteger(value) || (value as number) < 1) {
        throw new Error(`Invalid ${field} for ${name}: expected a positive integer`);
      }
    }
    // Catch invalid entry paths here; esbuild later checks the files and imports.
    const entry: unknown = config?.entry;
    if (
      typeof entry !== 'string' ||
      !entry.startsWith('src/') ||
      !entry.endsWith('.ts') ||
      path.relative(root, path.resolve(root, entry)).startsWith('..')
    ) {
      throw new Error(`Invalid TypeScript entry for ${name}`);
    }
  }

  return registry as LambdaRegistry;
}
