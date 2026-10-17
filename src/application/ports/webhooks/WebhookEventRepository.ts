// Driven port for received webhook events, detecting repeated deliveries.
// Keeps each event's processing history for tracing and reprocessing.
// Tracks each subject's latest status.
export abstract class WebhookEventRepository {
  // Stores a newly received event once, as `received`.
  // If an event with the same identity exists, nothing is written.
  // The stored event is returned instead, marking a duplicate delivery.
  abstract create(
    event: WebhookEventRepository.NewEvent,
  ): Promise<WebhookEventRepository.CreateResult>;

  abstract get(
    id: WebhookEventRepository.EventId,
  ): Promise<WebhookEventRepository.Event | undefined>;

  // Records that the event is on the processing queue.
  // Only a `received` event moves to `enqueued`, so the status never moves back.
  abstract recordEnqueued(id: WebhookEventRepository.EventId): Promise<void>;

  // Records another delivery of an event that `create` reported as already stored.
  abstract recordDuplicateDelivery(
    event: WebhookEventRepository.Event,
    delivery: WebhookEventRepository.Delivery,
  ): Promise<void>;

  // Flags the event as outdated after `recordStatus` reports it is outranked.
  abstract recordOutdated(id: WebhookEventRepository.EventId): Promise<void>;

  // Records the status as its subject's latest unless another event outranks it.
  // Higher `precedence` wins, then later occurrence, then greater ID.
  // Arrival order therefore never matters.
  // Recording the same event again changes nothing.
  abstract recordStatus(
    event: WebhookEventRepository.StatusEvent,
    precedence: number,
  ): Promise<WebhookEventRepository.RecordStatusResult>;

  // Returns the event with its attempts, business effects, and duplicate deliveries.
  abstract getTrace(
    id: WebhookEventRepository.EventId,
  ): Promise<WebhookEventRepository.Trace | undefined>;

  // Lists events received in a time interval, oldest first.
  abstract listReceived(
    query: WebhookEventRepository.ReceivedQuery,
  ): Promise<WebhookEventRepository.Summary[]>;

  // Lists a business subject's events by when the provider says they occurred.
  abstract listBySubject(
    query: WebhookEventRepository.SubjectQuery,
  ): Promise<WebhookEventRepository.Summary[]>;
}

export namespace WebhookEventRepository {
  // Identifies an event; providers are namespaced so their event IDs never collide.
  export type EventId = {
    provider: string;
    providerEventId: string;
  };

  // Business object an event affects, in the provider's terms, such as a payment.
  export type Subject = {
    type: string;
    id: string;
  };

  // Provider-neutral payment status; only payment events report one so far.
  export type SubjectStatus =
    "pending" | "overdue" | "failed" | "succeeded" | "refunded" | "charged_back";

  // How far the platform has handled the event, unlike the reported `SubjectStatus`.
  // `received`: stored at receipt, but not yet dispatched to the processing queue.
  // `enqueued`: dispatched to the processing queue.
  export type ProcessingStatus = "received" | "enqueued";

  export type Event = EventId & {
    // The provider's own event type, such as Stripe's `invoice.paid`.
    eventType: string;
    // When the provider says the event happened.
    occurredAt: Date;
    // When the webhook reached the API.
    receivedAt: Date;
    // Absent when the event affects no payment or subscription.
    subject?: Subject;
    // The subscription the payment bills, when the provider names it.
    // A subscription's status comes from its payments, not from ranking its events.
    subscriptionId?: string;
    // Absent when the event reports no status the business rules use.
    status?: SubjectStatus;
    // Request body exactly as received, kept for audit and reprocessing.
    payload: string;
    processingStatus: ProcessingStatus;
    // True when the event arrived after an event of its subject that outranks it.
    outdated: boolean;
  };

  // An event as receipt reads it, before storage records how it was handled.
  export type NewEvent = Omit<Event, "processingStatus" | "outdated">;

  // An event that reports its subject's status.
  export type StatusEvent = Event & { subject: Subject; status: SubjectStatus };

  // `event` is the stored event: the new one when created, else the earlier one.
  export type CreateResult = {
    created: boolean;
    event: Event;
  };

  export type RecordStatusResult = {
    // True when another event outranks this one, so it must not change the status.
    outdated: boolean;
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
    // Stable machine-readable error code, present when the attempt failed.
    errorCode?: string;
    // Code version that ran the attempt, to find events to reprocess after a defect.
    handlerVersion: string;
    traceId?: string;
  };

  export type Effect = {
    effect: string;
    status: "completed" | "failed";
    // Business write's idempotency key, linking the effect to the record it changed.
    businessKey: string;
    updatedAt: Date;
  };

  export type Trace = {
    event: Event;
    attempts: Attempt[];
    effects: Effect[];
    deliveries: Delivery[];
  };

  // A listed event: indexes omit the payload, subscription, and how it was handled.
  // `get` returns them.
  export type Summary = Omit<
    Event,
    "payload" | "status" | "subscriptionId" | "processingStatus" | "outdated"
  >;

  export type ReceivedQuery = {
    // Providers to include; pass every supported provider to list all events.
    providers: readonly string[];
    // Inclusive start of the interval.
    from: Date;
    // Exclusive end of the interval, so consecutive intervals never overlap.
    to: Date;
    // Only events of this provider type.
    eventType?: string;
  };

  export type SubjectQuery = {
    provider: string;
    subject: Subject;
  };
}
