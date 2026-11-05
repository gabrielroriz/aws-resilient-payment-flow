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

-- Conflict checks read rows, so every grant includes selecting.
-- These tables hold each item's latest state, which upserts replace.
GRANT SELECT, INSERT, UPDATE
  ON webhook_events, webhook_event_attempts, webhook_event_effects
  TO history_writer;

-- These tables only grow, so the writer cannot rewrite a recorded row.
GRANT SELECT, INSERT ON webhook_event_deliveries, webhook_event_changes TO history_writer;
