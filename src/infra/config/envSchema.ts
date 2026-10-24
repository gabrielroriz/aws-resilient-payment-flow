import * as z from "@kernel/utils/zod";

// Environment variables, validated and grouped by the code that uses them.
// Must match the variables Terraform gives each function.
export const envSchema = {
  webhooks: z.object({
    GATEWAY_GLOBAL_SIGNING_SECRET: z.string().check(z.minLength(1)),
    GATEWAY_BRAZIL_ACCESS_TOKEN: z.string().check(z.minLength(1)),
  }),
  queues: z.object({
    WEBHOOK_EVENTS_QUEUE_NAME: z.string().check(z.minLength(1)),
  }),
  deadLetterQueues: z.object({
    WEBHOOK_EVENTS_DLQ_NAME: z.string().check(z.minLength(1)),
  }),
  tables: z.object({
    WEBHOOK_EVENTS_TABLE_NAME: z.string().check(z.minLength(1)),
  }),
  deployment: z.object({
    CODE_VERSION: z.string().check(z.minLength(1)),
  }),
};
