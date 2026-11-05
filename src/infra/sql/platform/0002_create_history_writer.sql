-- The role the projection connects as, which can add history but never remove it.
-- It cannot log in until the migration function gives it a password.
-- Roles belong to the server, so a recreated database finds the role already there.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'history_writer') THEN
    CREATE ROLE history_writer;
  END IF;
END
$$;

-- The writer reaches only the history schema, not the platform's other concerns.
GRANT USAGE ON SCHEMA history TO history_writer;

-- Conflict checks read rows, so every grant includes selecting.
-- These tables hold each item's latest state, which upserts replace.
GRANT SELECT, INSERT, UPDATE
  ON history.webhook_events, history.webhook_event_attempts, history.webhook_event_effects
  TO history_writer;

-- These tables only grow, so the writer cannot rewrite a recorded row.
GRANT SELECT, INSERT
  ON history.webhook_event_deliveries, history.webhook_event_changes
  TO history_writer;
