/**
 * A class usable as a DI token. Ports are abstract classes rather than interfaces
 * because tokens must exist at runtime.
 */
export type Token<T = unknown> = abstract new (...args: any[]) => T;

/** A concrete class the registry can instantiate. */
export type Implementation<T = unknown> = new (...args: any[]) => T;

/**
 * Process-wide dependency container.
 *
 * `@Injectable` registers each class with its constructor dependencies, a function's
 * composition root binds ports to infrastructure adapters, and `resolve` builds the
 * graph. Instances are cached, so each Lambda execution environment builds every
 * object once and shares it across invocations.
 */
export class Registry {
  private static instance: Registry | undefined;

  public static getInstance(): Registry {
    return (this.instance ??= new Registry());
  }

  private constructor() {}

  private readonly providers = new Map<Token, Registry.Provider>();
  private readonly bindings = new Map<Token, Token>();
  private readonly instances = new Map<Token, unknown>();

  register(implementation: Implementation, dependencies: readonly Token[]): void {
    // A dependency that is undefined at decoration time usually means a circular import.
    const missing = dependencies.findIndex((dependency) => !dependency);
    if (missing !== -1) {
      throw new Error(
        `${implementation.name} dependency #${missing} is undefined; check for circular imports.`,
      );
    }

    this.providers.set(implementation, { implementation, dependencies });
  }

  /** Point a port at the adapter that implements it. Bind before resolving dependents. */
  bind<T>(port: Token<T>, adapter: Implementation<T>): void {
    this.bindings.set(port, adapter);
  }

  resolve<T>(token: Token<T>): T {
    const target = this.bindings.get(token) ?? token;
    if (this.instances.has(target)) {
      return this.instances.get(target) as T;
    }

    const provider = this.providers.get(target);
    if (!provider) {
      throw new Error(
        `No provider for ${token.name}. Decorate it with @Injectable or bind the port to an adapter.`,
      );
    }

    const instance = new provider.implementation(
      ...provider.dependencies.map((dependency) => this.resolve(dependency)),
    );
    this.instances.set(target, instance);
    return instance as T;
  }
}

export namespace Registry {
  export type Provider = {
    implementation: Implementation;
    dependencies: readonly Token[];
  };
}
