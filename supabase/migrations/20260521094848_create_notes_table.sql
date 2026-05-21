-- Create notes table for note-taking app
create table if not exists notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index on user_id for faster queries
create index if not exists idx_notes_user_id on notes(user_id);

-- Create index on created_at for sorting
create index if not exists idx_notes_created_at on notes(created_at desc);

-- Enable Row Level Security
alter table notes enable row level security;

-- Create RLS policy: users can only see their own notes
create policy "Users can view their own notes"
  on notes for select
  using (auth.uid() = user_id);

-- Create RLS policy: users can insert their own notes
create policy "Users can insert their own notes"
  on notes for insert
  with check (auth.uid() = user_id);

-- Create RLS policy: users can update their own notes
create policy "Users can update their own notes"
  on notes for update
  using (auth.uid() = user_id);

-- Create RLS policy: users can delete their own notes
create policy "Users can delete their own notes"
  on notes for delete
  using (auth.uid() = user_id);
