-- Fix email_events unique constraint
-- The message_id should not be unique on its own because a single email
-- can have multiple events (sent, delivered, opened, clicked, bounced)
-- Instead, use a composite unique constraint on (message_id, event_type)
-- to prevent duplicate events of the same type for the same message

alter table email_events drop constraint email_events_message_id_key;

alter table email_events add constraint email_events_message_id_event_type_unique 
  unique (message_id, event_type);
