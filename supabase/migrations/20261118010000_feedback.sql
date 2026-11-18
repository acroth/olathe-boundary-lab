-- Feedback from the /contact page. Written only by the server (service role); read it in the Supabase dashboard.
create table if not exists feedback (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  topic      text,
  message    text not null check (char_length(message) between 1 and 5000),
  plan_url   text,
  name       text,
  email      text,
  user_agent text,
  status     text not null default 'new' check (status in ('new', 'read', 'done', 'spam'))
);
create index if not exists feedback_created on feedback (created_at desc);
alter table feedback enable row level security;   -- no policies: not readable or writable with the public key
