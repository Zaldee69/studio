-- Perawatan fasilitas (HVAC, autoclave servis, dll.) khusus manajer: kapster & nail artist tidak lagi melihat atau
-- menandai tugas perawatan (keputusan pemilik; SOP sterilisasi harian tetap diisi kapster).
drop policy staff_read on maintenance_tasks;

create or replace function maintenance_status(p_today date default null)
returns table (task_id uuid, name text, interval_days int, procedure text, assignee_staff_id uuid, assignee text, active boolean,
               last_done_at timestamptz, next_due date, days_left int, status text, history jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare today date := coalesce(p_today, jkt_today()); mgr boolean;
begin
  perform require_role('manager');
  mgr := true;
  return query
  with last as (
    select t.id, (select max(m.created_at) from maintenance_logs m where m.task_id = t.id) as at from maintenance_tasks t
  )
  select t.id, t.name, t.interval_days, t.procedure, t.assignee_staff_id, s.name, t.active, last.at,
         (coalesce((last.at at time zone 'Asia/Jakarta')::date, (t.created_at at time zone 'Asia/Jakarta')::date) + t.interval_days),
         (coalesce((last.at at time zone 'Asia/Jakarta')::date, (t.created_at at time zone 'Asia/Jakarta')::date) + t.interval_days - today),
         maintenance_state(coalesce((last.at at time zone 'Asia/Jakarta')::date, (t.created_at at time zone 'Asia/Jakarta')::date) + t.interval_days - today),
         coalesce((select jsonb_agg(x) from (
           select jsonb_build_object('id', m.id, 'at', m.created_at, 'by', p.full_name, 'note', m.note, 'vendor', m.vendor, 'photo', m.photo_path,
                                     'cost', case when mgr then m.cost end) as x
           from maintenance_logs m left join profiles p on p.id = m.done_by where m.task_id = t.id order by m.created_at desc limit 3) h), '[]')
  from maintenance_tasks t join last on last.id = t.id left join staff s on s.id = t.assignee_staff_id
  where t.active or mgr
  order by 10, t.name;
end $$;

create or replace function maintenance_mark_done(p_task_id uuid, p_note text default null, p_photo_path text default null,
                                      p_cost bigint default null, p_vendor text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare lid uuid;
begin
  perform require_role('manager');
  if not exists (select 1 from maintenance_tasks where id = p_task_id and active) then raise exception 'Tugas tidak ditemukan'; end if;
  insert into maintenance_logs (task_id, done_by, note, photo_path, cost, vendor)
  values (p_task_id, auth.uid(), coalesce(trim(p_note), ''), nullif(p_photo_path, ''), p_cost, nullif(trim(coalesce(p_vendor, '')), ''))
  returning id into lid;
  update notifications set read_at = now() where kind in ('maintenance_due', 'maintenance_overdue') and read_at is null
    and payload ->> 'task_id' = p_task_id::text;
  return lid;
end $$;
