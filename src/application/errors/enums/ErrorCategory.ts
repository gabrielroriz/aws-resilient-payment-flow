/** Area an error belongs to, logged with it so monitoring can measure errors per area. */
export enum ErrorCategory {
  /** Problems with the request itself, such as a malformed body, in any function. */
  HTTP = "http",
  /** Problems with the queue message itself, before a business handler can read it. */
  QUEUE = "queue",
  WEBHOOKS = "webhooks",
}
