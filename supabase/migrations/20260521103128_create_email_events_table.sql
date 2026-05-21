-- Create email_events table to track email activity
create table if not exists email_events (
  id uuid default gen_random_uuid() primary key,
  message_id text not null unique,
  note_id uuid not null references notes(id) on delete cascade,
  recipient text not null,
  event_type text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes for faster lookups
create index if not exists idx_email_events_message_id on email_events(message_id);
create index if not exists idx_email_events_note_id on email_events(note_id);
create index if not exists idx_email_events_created_at on email_events(created_at desc);
