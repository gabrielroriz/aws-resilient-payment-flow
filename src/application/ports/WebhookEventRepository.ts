/**
 * Driven port for the record of received webhook events. It detects repeated deliveries and
 * keeps each event's processing history, so operators can trace and reprocess events.
 */
export abstract class WebhookEventRepository {
  /**
   * Stores a newly received event once. When an event with the same identity already exists,
   * nothing is written and the stored event is returned instead, marking a duplicate delivery.
   */
  abstract create(event: WebhookEventRepository.Event): Promise<WebhookEventRepository.CreateResult>;

  abstract get(id: WebhookEventRepository.EventId): Promise<WebhookEventRepository.Event | undefined>;

  /** Records another delivery of an event that `create` reported as already stored. */
  abstract recordDuplicateDelivery(
    event: WebhookEventRepository.Event,
    delivery: WebhookEventRepository.Delivery,
  ): Promise<void>;

  /** Returns the event with its processing attempts, business effects, and duplicate deliveries. */
  abstract getTrace(id: WebhookEventRepository.EventId): Promise<WebhookEventRepository.Trace | undefined>;

  /** Lists events received in a time interval, oldest first. */
  abstract listReceived(query: WebhookEventRepository.ReceivedQuery): Promise<WebhookEventRepository.Summary[]>;

  /** Lists the events of one business subject in the order the provider says they occurred. */
  abstract listBySubject(query: WebhookEventRepository.SubjectQuery): Promise<WebhookEventRepository.Summary[]>;
}

export namespace WebhookEventRepository {
  /** Identifies an event; providers are namespaced so their event IDs never collide. */
  export type EventId = {
    provider: string;
    providerEventId: string;
  };

  /** Business object an event affects, in the provider's terms, such as a payment. */
  export type Subject = {
    type: string;
    id: string;
  };

  export type Event = EventId & {
    /** The provider's own event type, such as Stripe's `invoice.paid`. */
    eventType: string;
    /** When the provider says the event happened. */
    occurredAt: Date;
    /** When the webhook reached the API. */
    receivedAt: Date;
    /** Absent when the event affects no payment or subscription. */
    subject?: Subject;
    /** Request body exactly as received, kept for audit and reprocessing. */
    payload: string;
  };

  /** `event` is the stored event: the new one when created, the earlier one otherwise. */
  export type CreateResult = {
    created: boolean;
    event: Event;
  };

  export type Delivery = {
    receivedAt: Date;
    requestId: string;
  };

  export type Attempt = {
    attemptId: string;
    startedAt: Date;
    finishedAt?: Date;
    outcome: "succeeded" | "failed";
    /** Stable machine-readable error code, present when the attempt failed. */
    errorCode?: string;
    /** Code version that ran the attempt, used to select events for reprocessing after a defect. */
    handlerVersion: string;
    traceId?: string;
  };

  export type Effect = {
    effect: string;
    status: "completed" | "failed";
    /** Idempotency key of the business write, linking the effect to the record it changed. */
    businessKey: string;
    updatedAt: Date;
  };

  export type Trace = {
    event: Event;
    attempts: Attempt[];
    effects: Effect[];
    deliveries: Delivery[];
  };

  /** An event without its payload, as returned by listings; `get` returns the full event. */
  export type Summary = Omit<Event, "payload">;

  export type ReceivedQuery = {
    /** Providers to include; pass every supported provider to list all events. */
    providers: readonly string[];
    /** Inclusive start of the interval. */
    from: Date;
    /** Exclusive end of the interval, so consecutive intervals never overlap. */
    to: Date;
    /** Only events of this provider type. */
    eventType?: string;
  };

  export type SubjectQuery = {
    provider: string;
    subject: Subject;
  };
}
