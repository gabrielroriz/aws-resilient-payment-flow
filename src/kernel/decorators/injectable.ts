import { Registry, type Token } from "@kernel/di/Registry";

type Instances<TDependencies extends readonly Token[]> = {
  [K in keyof TDependencies]: TDependencies[K] extends Token<infer T> ? T : never;
};

/**
 * Registers a class with the DI registry.
 *
 * List the constructor dependencies in order. esbuild cannot emit decorator metadata,
 * so the list replaces it, and TypeScript rejects a list that does not match the
 * constructor's parameters.
 */
export function Injectable<const TDependencies extends readonly Token[]>(
  ...dependencies: TDependencies
) {
  return <TClass extends new (...args: Instances<TDependencies>) => unknown>(
    target: TClass,
    _context: ClassDecoratorContext<TClass>,
  ): void => {
    Registry.getInstance().register(target, dependencies);
  };
}
