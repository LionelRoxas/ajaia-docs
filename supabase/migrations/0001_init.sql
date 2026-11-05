create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  name text not null
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  title text not null default 'Untitled document'
    check (char_length(title) between 1 and 200),
  content jsonb not null default '{"type":"doc","content":[]}',
  version int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.document_shares (
  document_id uuid references public.documents on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  created_at timestamptz default now(),
  primary key (document_id, user_id)
);

create index documents_owner_id_idx on public.documents (owner_id);
create index document_shares_user_id_idx on public.document_shares (user_id);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;
