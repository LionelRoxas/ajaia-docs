-- Unshare in one transaction: delete the share and bump share_epoch together, so two
-- concurrent unshares can't both report the same old epoch. Returns the old epoch
-- (null if the doc doesn't exist). Called only by the server with the service role.

create or replace function public.unshare_document(doc uuid, target uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  old_epoch int;
begin
  delete from document_shares where document_id = doc and user_id = target;
  update documents set share_epoch = share_epoch + 1 where id = doc
    returning share_epoch - 1 into old_epoch;
  return old_epoch;
end;
$$;

revoke execute on function public.unshare_document(uuid, uuid) from public, anon, authenticated;
grant execute on function public.unshare_document(uuid, uuid) to service_role;
