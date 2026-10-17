// The project's zod: the tree-shakable zod/mini build with English issue messages.
// Import zod only through this module, as `import * as z from "@kernel/utils/zod"`.
//
// Regular zod puts every method on every schema, so one schema bundles most of zod.
// zod/mini offers checks as functions, so a Lambda bundles only the ones it uses.
// zod/mini reports every issue as "Invalid input" until a locale is loaded.
// English is imported directly, since `z.locales` would bundle every locale.
import { en } from "zod/locales";
import * as z from "zod/mini";

z.config(en());

export * from "zod/mini";
