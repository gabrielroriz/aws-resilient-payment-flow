import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { ErrorCategory } from "../../enums/ErrorCategory";
import { ErrorCode } from "../../enums/ErrorCode";
import { ErrorKind } from "../../enums/ErrorKind";
import { ApplicationError } from "../ApplicationError";

// The queued identity has no stored event, so processing cannot safely acknowledge it.
export class ErrorWebhookEventNotFound extends ApplicationError {
  constructor({ provider, providerEventId }: WebhookEventRepository.EventId) {
    super(`Stored webhook event not found: ${provider}/${providerEventId}`, {
      statusCode: 404,
      code: ErrorCode.WEBHOOK_EVENT_NOT_FOUND,
      category: ErrorCategory.WEBHOOKS,
      kind: ErrorKind.UNEXPECTED,
    });
  }
}
