-- Drop existing user-specific policies
drop policy if exists "Users can view their own notes" on notes;
drop policy if exists "Users can insert their own notes" on notes;
drop policy if exists "Users can update their own notes" on notes;
drop policy if exists "Users can delete their own notes" on notes;

-- Create new permissive policies for anyone to read and write
create policy "anyone can read notes"
  on notes for select
  using (true);

create policy "anyone can write a note"
  on notes for insert
  with check (true);
