// The project's zod: the tree-shakable zod/mini build with English issue messages. Import zod only
// through this module, as `import * as z from "@kernel/utils/zod"`.
//
// Regular zod attaches every method to every schema, so a single schema bundles most of the
// library. zod/mini offers its checks as functions, such as `z.minLength`, so each Lambda bundles
// only the ones its schemas use. zod/mini reports every issue as "Invalid input" until a locale is
// loaded, and the English one is imported directly because the `z.locales` namespace bundles all
// of them.
import { en } from "zod/locales";
import * as z from "zod/mini";

z.config(en());

export * from "zod/mini";
