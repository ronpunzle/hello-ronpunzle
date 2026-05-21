-- Disable RLS on email_events table to allow webhook inserts
alter table email_events disable row level security;

-- Allow anyone to read email events (for loading activity feed on frontend)
alter table email_events enable row level security;

create policy "Anyone can read email_events"
  on email_events for select
  using (true);

create policy "Anyone can insert email_events"
  on email_events for insert
  with check (true);
