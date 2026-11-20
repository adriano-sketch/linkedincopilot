-- Optional note sent with each invitation of an audience. {first_name} is replaced per person.
alter table public.icps add column if not exists invite_note text;
alter table public.icps drop constraint if exists icps_invite_note_len;
alter table public.icps add constraint icps_invite_note_len check (invite_note is null or char_length(invite_note) <= 300);
