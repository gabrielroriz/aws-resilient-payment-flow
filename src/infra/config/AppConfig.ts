import { envSchema } from "@infra/config/envSchema";
import { Injectable } from "@kernel/decorators/injectable";
import * as z from "zod";

/**
 * Typed configuration from the function's environment variables, validated against their schema.
 * Each group is validated when it is read, not when the function starts: a function needs only
 * the variables of the groups it uses, and a missing variable fails only the code that needs it,
 * such as webhook receipt, with an error naming the variable.
 */
@Injectable()
export class AppConfig {
  get webhooks(): AppConfig.Webhooks {
    const env = parseGroup("webhooks", envSchema.webhooks);
    return {
      gatewayGlobal: { signingSecret: env.GATEWAY_GLOBAL_SIGNING_SECRET },
      gatewayBrazil: { accessToken: env.GATEWAY_BRAZIL_ACCESS_TOKEN },
    };
  }
}

export namespace AppConfig {
  /** Credentials of the webhook providers. */
  export type Webhooks = {
    gatewayGlobal: {
      /** Secret gatewayGlobal signs its webhooks with. */
      signingSecret: string;
    };
    gatewayBrazil: {
      /** Token gatewayBrazil sends with its webhooks. */
      accessToken: string;
    };
  };
}

// Parsing on every read costs microseconds and keeps no state, so tests can change the environment.
function parseGroup<Schema extends z.ZodType>(group: string, schema: Schema): z.output<Schema> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment variables for ${group}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
