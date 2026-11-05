-- The long-term history of webhook events, projected from the webhook events table.
-- Its own schema keeps it apart from the platform's other concerns.
-- Each table mirrors one item type, keyed like the item within its event.
-- Statuses stay plain text, so a new status never stops the projection.
-- No foreign keys: streams order changes only per item, so a child may come first.

CREATE SCHEMA history;

-- Each event's latest state, replaced whenever the event changes.
CREATE TABLE history.webhook_events (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  subject_type text,
  subject_id text,
  subscription_id text,
  status text,
  -- The exact request body, gzip-compressed, as receipt stored it.
  payload bytea NOT NULL,
  -- The decoded body for queries, or null when it is not valid JSON.
  payload_json jsonb,
  processing_status text,
  outdated boolean NOT NULL,
  current_attempt_id text,
  current_attempt_deadline timestamptz,
  PRIMARY KEY (provider, provider_event_id)
);

-- Events received in a time interval.
CREATE INDEX webhook_events_received_at ON history.webhook_events (received_at);

-- Events of one payment or subscription in the order they occurred.
CREATE INDEX webhook_events_subject
  ON history.webhook_events (provider, subject_type, subject_id, occurred_at);

CREATE TABLE history.webhook_event_attempts (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  attempt_id text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  outcome text,
  error_code text,
  handler_version text NOT NULL,
  trace_id text,
  PRIMARY KEY (provider, provider_event_id, attempt_id)
);

CREATE TABLE history.webhook_event_deliveries (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  request_id text NOT NULL,
  received_at timestamptz NOT NULL,
  PRIMARY KEY (provider, provider_event_id, request_id)
);

CREATE TABLE history.webhook_event_effects (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  effect text NOT NULL,
  status text NOT NULL,
  business_key text NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (provider, provider_event_id, effect)
);

-- Every change to an event, appended in stream order and never rewritten.
-- The event table keeps only the latest status, so this ledger keeps the rest.
CREATE TABLE history.webhook_event_changes (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  -- Orders the event's changes, and makes a replayed stream record a no-op.
  stream_sequence numeric(40) NOT NULL,
  -- When DynamoDB recorded the change, to the second.
  changed_at timestamptz NOT NULL,
  -- Whether the change created the event or modified it.
  change text NOT NULL,
  processing_status text,
  outdated boolean NOT NULL,
  current_attempt_id text,
  PRIMARY KEY (provider, provider_event_id, stream_sequence)
);
