import { build, formatMessages, type Message } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import options, { debugOptions } from './esbuild.config.mts';
import type { LambdaRegistry } from './lambdas.mts';

// The esbuild externals end in `*` and match by prefix, such as `@aws-sdk/*`.
const runtimePackagePrefixes = options.external.map((pattern) => pattern.replace(/\*$/, ''));

function isRuntimeProvided(specifier: string): boolean {
  return (
    isBuiltin(specifier) || runtimePackagePrefixes.some((prefix) => specifier.startsWith(prefix))
  );
}

// The durable execution SDK imports the plugins DURABLE_EXECUTION_PLUGINS lists.
// No function sets that variable, so the SDK's computed import never runs.
const unusedComputedImports = ['node_modules/@aws/durable-execution-sdk-js/'];

function isUnusedComputedImport(warning: Message): boolean {
  return (
    warning.id === 'unsupported-dynamic-import' &&
    unusedComputedImports.some((prefix) => warning.location?.file.startsWith(prefix) ?? false)
  );
}

export async function bundleLambdas(
  root: string,
  registry: LambdaRegistry,
  outputRoot: string,
  debug = false,
): Promise<void> {
  // Separate dependency graphs keep unrelated handlers out of each Lambda's package.
  for (const [name, config] of Object.entries(registry)) {
    // Every ZIP uses index.handler, regardless of the original source filename.
    const outfile = path.join(outputRoot, name, 'index.js');
    const result = await build({
      ...options,
      ...(debug && debugOptions(outfile)),
      absWorkingDir: root,
      entryPoints: [config.entry],
      outfile,
    });

    // A computed import stays outside index.js and fails when it runs.
    const warnings = result.warnings.filter((warning) => !isUnusedComputedImport(warning));
    const unbundled = warnings.filter((warning) => warning.id === 'unsupported-dynamic-import');
    if (unbundled.length) {
      const details = await formatMessages(unbundled, { kind: 'error' });
      throw new Error(`${name} has imports esbuild cannot bundle:\n${details.join('')}`);
    }
    if (warnings.length) {
      const details = await formatMessages(warnings, { kind: 'warning' });
      process.stderr.write(details.join(''));
    }

    // Deployment ships only index.js.
    // Only Node built-ins and runtime-provided packages may remain external.
    const outputs = Object.values(result.metafile.outputs);
    if (
      result.outputFiles.length !== 1 ||
      result.outputFiles[0].path !== outfile ||
      outputs.some((output) =>
        output.imports.some((item) => item.external && !isRuntimeProvided(item.path)),
      )
    ) {
      throw new Error(
        `${name} requires files outside index.js; single-file packaging is not supported for this entry.`,
      );
    }

    await mkdir(path.dirname(outfile), { recursive: true });
    await writeFile(outfile, result.outputFiles[0].contents);
    console.log(`Bundled ${name}: ${path.relative(root, outfile)}`);
  }
}
