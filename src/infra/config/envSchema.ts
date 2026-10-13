import * as z from "@kernel/utils/zod";

// The functions' environment variables and their validation, grouped by the code that uses them.
// Must match the variables Terraform gives each function.
export const envSchema = {
  webhooks: z.object({
    GATEWAY_GLOBAL_SIGNING_SECRET: z.string().check(z.minLength(1)),
    GATEWAY_BRAZIL_ACCESS_TOKEN: z.string().check(z.minLength(1)),
  }),
  queues: z.object({
    WEBHOOK_EVENTS_QUEUE_NAME: z.string().check(z.minLength(1)),
  }),
  tables: z.object({
    WEBHOOK_EVENTS_TABLE_NAME: z.string().check(z.minLength(1)),
  }),
};
