// The input of each durable workflow, by workflow name.
// Inputs name business objects, and the event behind them only as metadata.
export type WorkflowInputs = {
  subscription_grant_access: SubscriptionGrantAccess;
};

export type WorkflowName = keyof WorkflowInputs;

// Grants a subscription access for the payment that paid for it.
export type SubscriptionGrantAccess = {
  // The gateway that issued the IDs below.
  provider: string;
  subscriptionId: string;
  paymentId: string;
  metadata: WorkflowMetadata;
};

// The event that caused the workflow.
export type WorkflowMetadata = {
  eventId: string;
  // When the event was received, so its effects can expire with it.
  receivedAt: Date;
};
