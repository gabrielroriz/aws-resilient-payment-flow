import type * as z from "@kernel/utils/zod";

// The runtime has no decorator metadata, so schemas are kept per class here instead.
const schemas = new WeakMap<object, z.ZodMiniType>();

// Declares the zod schema of a handler's request body or queue message.
// Driving adapters validate each payload against it before calling `handle`.
// Handlers thus receive the schema's output instead of checking fields themselves.
//
// Type the payload as `z.output` of the same schema, so the two cannot drift apart.
export function Schema(schema: z.ZodMiniType) {
  return <TClass extends abstract new (...args: any[]) => unknown>(
    target: TClass,
    _context: ClassDecoratorContext<TClass>,
  ): void => {
    schemas.set(target, schema);
  };
}

// Validates a payload against the schema declared on the handler's class.
// A handler without a schema receives the payload unchanged.
// On success the data is the schema's output, so defaults and transforms apply.
// Undeclared fields are dropped.
export function validatePayload(handler: object, payload: unknown): ValidationResult {
  const schema = schemas.get(handler.constructor);
  if (!schema) {
    return { success: true, data: payload };
  }

  const result = schema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // zod's messages describe what was expected, not the received value.
  // Payment data thus stays out of the logs and responses that include them.
  return {
    success: false,
    issues: result.error.issues.map(({ path, message }) =>
      path.length ? `${path.map(String).join(".")}: ${message}` : message,
    ),
  };
}

type ValidationResult = { success: true; data: unknown } | { success: false; issues: string[] };
