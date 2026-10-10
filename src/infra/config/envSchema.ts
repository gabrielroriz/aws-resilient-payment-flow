// The namespace import lets esbuild drop the unused parts of zod; `import { z }` bundles all of it.
import * as z from "zod";

/**
 * The functions' environment variables and their validation, grouped by the code that uses them.
 * Must match the variables Terraform gives each function.
 */
export const envSchema = {
  webhooks: z.object({
    GATEWAY_GLOBAL_SIGNING_SECRET: z.string().min(1),
    GATEWAY_BRAZIL_ACCESS_TOKEN: z.string().min(1),
  }),
};
