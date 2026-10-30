import { envSchema } from "@infra/config/envSchema";
import { Injectable } from "@kernel/decorators/injectable";
import * as z from "@kernel/utils/zod";

// Typed configuration from environment variables, validated against their schema.
// Each group is validated when read, so a function needs only the groups it uses.
// A missing variable fails only the code that needs it, with an error naming it.
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

  get deadLetterQueues(): AppConfig.DeadLetterQueues {
    const env = this.parseGroup("deadLetterQueues", envSchema.deadLetterQueues);
    return { webhookEvents: { name: env.WEBHOOK_EVENTS_DLQ_NAME } };
  }

  get tables(): AppConfig.Tables {
    const env = this.parseGroup("tables", envSchema.tables);
    return { webhookEvents: { name: env.WEBHOOK_EVENTS_TABLE_NAME } };
  }

  get historyDatabase(): AppConfig.HistoryDatabase {
    const env = this.parseGroup("historyDatabase", envSchema.historyDatabase);
    return {
      host: env.HISTORY_DB_HOST,
      database: env.HISTORY_DB_NAME,
      user: env.HISTORY_DB_USER,
      password: env.HISTORY_DB_PASSWORD,
    };
  }

  get deployment(): AppConfig.Deployment {
    const env = this.parseGroup("deployment", envSchema.deployment);
    return { codeVersion: env.CODE_VERSION };
  }

  // Parsing every read is cheap and stateless, so tests can change the environment.
  private parseGroup<Schema extends z.ZodMiniType>(
    group: string,
    schema: Schema,
  ): z.output<Schema> {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      throw new Error(
        `Invalid environment variables for ${group}:\n${z.prettifyError(result.error)}`,
      );
    }
    return result.data;
  }
}

export namespace AppConfig {
  // Credentials of the webhook providers.
  export type Webhooks = {
    gatewayGlobal: {
      // Secret gatewayGlobal signs its webhooks with.
      signingSecret: string;
    };
    gatewayBrazil: {
      // Token gatewayBrazil sends with its webhooks.
      accessToken: string;
    };
  };

  // The SQS queues the function sends messages to, by name.
  export type Queues = {
    // Queue of stored webhook events waiting to be processed.
    webhookEvents: { name: string };
  };

  // The SQS dead-letter queues a consumer parks failed messages in, by name.
  export type DeadLetterQueues = {
    // Where webhook events that can never succeed wait for operators.
    webhookEvents: { name: string };
  };

  // The DynamoDB tables the function reads or writes, by name.
  export type Tables = {
    // Table of received webhook events and their history.
    webhookEvents: { name: string };
  };

  // The PostgreSQL database that keeps the webhook events' long-term history.
  export type HistoryDatabase = {
    // Host name of the database server.
    host: string;
    // Name of the database on that server.
    database: string;
    // Database role the function connects as, which decides what it may change.
    user: string;
    password: string;
  };

  // What the deployment says about the code the function runs.
  export type Deployment = {
    // Deploy time and commit SHA, such as `20261017110316-339fc51a2130`, or `local`.
    codeVersion: string;
  };
}
