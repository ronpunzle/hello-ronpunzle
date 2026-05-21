-- Drop the foreign key constraint on user_id to allow anonymous posts
alter table notes drop constraint if exists notes_user_id_fkey;

-- Make user_id nullable so anonymous users can post notes
alter table notes alter column user_id drop not null;
