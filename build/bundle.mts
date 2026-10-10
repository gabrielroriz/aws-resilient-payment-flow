import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import options from './esbuild.config.mts';
import type { LambdaRegistry } from './lambdas.mts';

// The esbuild externals end in `*` and match by prefix, such as `@aws-sdk/*`.
const runtimePackagePrefixes = options.external.map(pattern => pattern.replace(/\*$/, ''));

function isRuntimeProvided(specifier: string): boolean {
  return isBuiltin(specifier) || runtimePackagePrefixes.some(prefix => specifier.startsWith(prefix));
}

export async function bundleLambdas(root: string, registry: LambdaRegistry, outputRoot: string): Promise<void> {
  // Separate dependency graphs keep unrelated handlers out of each Lambda's package.
  for (const [name, config] of Object.entries(registry)) {
    // Every ZIP uses index.handler, regardless of the original source filename.
    const outfile = path.join(outputRoot, name, 'index.js');
    const result = await build({
      ...options,
      absWorkingDir: root,
      entryPoints: [config.entry],
      outfile,
    });

    // Deployment ships only index.js. Only Node built-ins and packages the runtime provides may remain external.
    const outputs = Object.values(result.metafile.outputs);
    if (result.outputFiles.length !== 1 || result.outputFiles[0].path !== outfile ||
        outputs.some(output => output.imports.some(item => item.external && !isRuntimeProvided(item.path)))) {
      throw new Error(`${name} requires files outside index.js; single-file packaging is not supported for this entry.`);
    }

    await mkdir(path.dirname(outfile), { recursive: true });
    await writeFile(outfile, result.outputFiles[0].contents);
    console.log(`Bundled ${name}: ${path.relative(root, outfile)}`);
  }
}
