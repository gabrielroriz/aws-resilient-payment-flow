import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { ErrorCategory } from "../../enums/ErrorCategory";
import { ErrorCode } from "../../enums/ErrorCode";
import { ErrorKind } from "../../enums/ErrorKind";
import { ApplicationError } from "../ApplicationError";

// Another attempt holds the event, so this delivery waits for the queue to retry it.
// Each subject's events arrive one at a time, so this signals a stuck attempt.
export class ErrorWebhookEventInProgress extends ApplicationError {
  constructor({ provider, providerEventId }: WebhookEventRepository.EventId) {
    super(`Webhook event already being processed: ${provider}/${providerEventId}`, {
      statusCode: 409,
      code: ErrorCode.WEBHOOK_EVENT_IN_PROGRESS,
      category: ErrorCategory.WEBHOOKS,
      kind: ErrorKind.UNEXPECTED,
    });
  }
}
