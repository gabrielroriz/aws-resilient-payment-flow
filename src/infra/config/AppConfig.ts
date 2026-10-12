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
    const env = this.parseGroup("webhooks", envSchema.webhooks);
    return {
      gatewayGlobal: { signingSecret: env.GATEWAY_GLOBAL_SIGNING_SECRET },
      gatewayBrazil: { accessToken: env.GATEWAY_BRAZIL_ACCESS_TOKEN },
    };
  }

  get queues(): AppConfig.Queues {
    const env = this.parseGroup("queues", envSchema.queues);
    return { webhookEvents: { name: env.WEBHOOK_EVENTS_QUEUE_NAME } };
  }

  get tables(): AppConfig.Tables {
    const env = this.parseGroup("tables", envSchema.tables);
    return { webhookEvents: { name: env.WEBHOOK_EVENTS_TABLE_NAME } };
  }

  // Parsing on every read costs microseconds and keeps no state, so tests can change the environment.
  private parseGroup<Schema extends z.ZodType>(group: string, schema: Schema): z.output<Schema> {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      throw new Error(`Invalid environment variables for ${group}:\n${z.prettifyError(result.error)}`);
    }
    return result.data;
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

  /** The SQS queues the function sends messages to, by name. */
  export type Queues = {
    /** Queue of stored webhook events waiting to be processed. */
    webhookEvents: { name: string };
  };

  /** The DynamoDB tables the function reads or writes, by name. */
  export type Tables = {
    /** Table of received webhook events and their history. */
    webhookEvents: { name: string };
  };
}
