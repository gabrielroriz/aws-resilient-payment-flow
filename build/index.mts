import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { extractAndValidateLambdas } from './lambdas.mts';
import { bundleLambdas } from './bundle.mts';

// Resolve paths from the project so local and temporary builds behave alike.
const root = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = path.join(root, 'dist/bundles');
// Local debug runs pass --debug; deployment builds never do.
const { values } = parseArgs({ options: { debug: { type: 'boolean', default: false } } });

// Reject invalid configuration before clearing old bundles; keep archived releases.
const registry = await extractAndValidateLambdas(root);
await rm(outputRoot, { recursive: true, force: true });
await bundleLambdas(root, registry, outputRoot, values.debug);
