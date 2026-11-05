-- Tìm nhanh công việc theo tiêu đề: không phân biệt dấu (có dấu/không dấu, đ → d) và gần đúng (gõ sai nhẹ).
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent() không immutable nên không dùng được trong index → bọc lại, cố định từ điển.
-- Bỏ dấu trước rồi mới lower() để không phụ thuộc locale của DB.
create or replace function public.search_normalize(t text)
returns text
language sql immutable parallel safe strict
set search_path = ''
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, t)) $$;

-- Dùng index biểu thức (không thêm cột) để không ảnh hưởng trigger kiểm tra cột của tasks.
create index tasks_title_search_idx on public.tasks
  using gin (public.search_normalize(title) extensions.gin_trgm_ops);

-- security invoker: RLS của tasks vẫn áp dụng, mỗi người chỉ thấy việc mình được xem.
-- Ưu tiên tiêu đề chứa đúng chuỗi đã gõ, sau đó tới kết quả gần giống (word_similarity).
create or replace function public.search_tasks(q text, p_team_id uuid default null, max_results int default 8)
returns table (id uuid, title text, status public.task_status)
language sql stable security invoker
set search_path = public, extensions
as $$
  with s as (
    select n as term,
           '%' || replace(replace(replace(n, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
    from (select public.search_normalize(trim(q)) as n) x
  )
  select t.id, t.title, t.status
  from public.tasks t, s
  where length(s.term) >= 2
    and (p_team_id is null or t.team_id = p_team_id)
    and (public.search_normalize(t.title) like s.pattern or s.term <% public.search_normalize(t.title))
  order by public.search_normalize(t.title) like s.pattern desc,
           word_similarity(s.term, public.search_normalize(t.title)) desc,
           t.updated_at desc
  limit least(greatest(max_results, 1), 20)
$$;

revoke execute on function public.search_normalize(text) from public, anon;
revoke execute on function public.search_tasks(text, uuid, int) from public, anon;
grant execute on function public.search_normalize(text) to authenticated, service_role;
grant execute on function public.search_tasks(text, uuid, int) to authenticated, service_role;
