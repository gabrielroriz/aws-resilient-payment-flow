/** Area an error belongs to, logged with it so monitoring can measure errors per area. */
export enum ErrorCategory {
  /** Problems with the request itself, such as a malformed body, in any function. */
  HTTP = "http",
  WEBHOOKS = "webhooks",
}
