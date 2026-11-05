-- Live co-editing: only a doc's owner or a user it is shared with may join/send on channel doc:{id}.

create or replace function public.can_access_doc(doc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from documents d where d.id = doc and d.owner_id = auth.uid())
      or exists (select 1 from document_shares s where s.document_id = doc and s.user_id = auth.uid());
$$;

revoke execute on function public.can_access_doc(uuid) from public, anon;
grant execute on function public.can_access_doc(uuid) to authenticated;

-- case guarantees the uuid cast only runs on a well-formed suffix.
create policy "doc members receive broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast')
  and case
    when (select realtime.topic()) ~* '^doc:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_access_doc(substring((select realtime.topic()) from 5)::uuid)
    else false
  end
);

create policy "doc members send broadcasts"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast')
  and case
    when (select realtime.topic()) ~* '^doc:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_access_doc(substring((select realtime.topic()) from 5)::uuid)
    else false
  end
);
