-- =====================================================================
-- Cahute – Phần 5: lưu ảnh (đã nén ở client: WebP/JPEG, tối đa 1 MB)
-- Đường dẫn:  tasks/{task_id}/…   chat/{conversation_id}/…   avatars/{user_id}/…
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.storage_object_allowed(p_name text, p_for_write boolean)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_id    uuid;
begin
  if coalesce(array_length(v_parts, 1), 0) < 2 then return false; end if;
  begin
    v_id := v_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return case v_parts[1]
    when 'tasks'   then public.can_access_task(v_id)
    when 'chat'    then public.is_conversation_member(v_id)
    when 'avatars' then (not p_for_write) or v_id = auth.uid()
    else false
  end;
end $$;

create policy attachments_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.storage_object_allowed(name, false));

create policy attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.storage_object_allowed(name, true));
