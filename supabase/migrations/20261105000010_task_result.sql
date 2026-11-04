-- =====================================================================
-- Cahute – Phần 10: trường "Kết quả" của công việc
-- Nhân viên được giao được sửa: status + result. Các cột khác chỉ quản lý.
-- =====================================================================

alter table public.tasks
  add column result text not null default '' check (length(result) <= 4000);

create or replace function public.tasks_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();

  if auth.uid() is null then return new; end if;  -- service role / SQL Editor

  if public.manages_team(old.team_id) then
    if new.team_id <> old.team_id and not public.manages_team(new.team_id) then
      raise exception 'Không thể chuyển việc sang nhóm bạn không quản lý';
    end if;
    return new;  -- quản lý: mọi thay đổi
  end if;

  -- Nhân viên được giao: chỉ được đổi status và result
  if (new.title, new.description, new.team_id, new.due_at, new.created_by, new.created_at)
     is distinct from
     (old.title, old.description, old.team_id, old.due_at, old.created_by, old.created_at) then
    raise exception 'Nhân viên chỉ được đổi trạng thái và kết quả công việc';
  end if;

  if new.status <> old.status and (old.status, new.status) not in (
    ('todo'::public.task_status,        'in_progress'::public.task_status),
    ('in_progress'::public.task_status, 'paused'::public.task_status),
    ('paused'::public.task_status,      'in_progress'::public.task_status),
    ('in_progress'::public.task_status, 'done'::public.task_status),
    ('paused'::public.task_status,      'done'::public.task_status)
  ) then
    raise exception 'Không được chuyển trạng thái từ % sang %', old.status, new.status;
  end if;

  return new;
end $$;
