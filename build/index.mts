import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAndValidateLambdas } from './lambdas.mts';
import { bundleLambdas } from './bundle.mts';

// Resolve paths from the project so local and temporary deployment builds behave alike.
const root = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = path.join(root, 'dist/bundles');

// Reject invalid configuration before clearing previous bundles; keep archived releases.
const registry = await extractAndValidateLambdas(root);
await rm(outputRoot, { recursive: true, force: true });
await bundleLambdas(root, registry, outputRoot);
