-- Revocation for live channels. Realtime checks these policies when a client joins, so a user
-- removed from a doc would stay on doc:{id} until they reconnect. The topic now carries a
-- per-doc epoch, doc:{id}:{epoch}; unsharing bumps it, the remaining members move to the new
-- topic, and the removed user can join neither the new topic nor the stale one again.

alter table public.documents add column share_epoch int not null default 0;

create or replace function public.can_join_doc(doc uuid, epoch int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from documents d where d.id = doc and d.share_epoch = epoch)
     and public.can_access_doc(doc);
$$;

revoke execute on function public.can_join_doc(uuid, int) from public, anon;
grant execute on function public.can_join_doc(uuid, int) to authenticated;

drop policy if exists "doc members receive broadcasts" on realtime.messages;
drop policy if exists "doc members send broadcasts" on realtime.messages;

-- case guarantees the casts only run on a well-formed topic: doc:<uuid>:<1-9 digits>
-- (9 digits always fits in int).
create policy "doc members receive broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast')
  and case
    when (select realtime.topic()) ~* '^doc:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]{1,9}$'
      then public.can_join_doc(
        substring((select realtime.topic()) from 5 for 36)::uuid,
        substring((select realtime.topic()) from 42)::int
      )
    else false
  end
);

create policy "doc members send broadcasts"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast')
  and case
    when (select realtime.topic()) ~* '^doc:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]{1,9}$'
      then public.can_join_doc(
        substring((select realtime.topic()) from 5 for 36)::uuid,
        substring((select realtime.topic()) from 42)::int
      )
    else false
  end
);
