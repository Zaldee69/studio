-- Nama panggilan walk-in: opsional, disimpan di booking saja (bukan data pelanggan → tidak mengotori CRM/statistik).
-- Tampil di jadwal, HP kapster, peringatan bentrok, dan struk ("Budi (walk-in)"). Pelanggan terdaftar tetap memakai namanya.
alter table appointments add column guest_name text check (length(guest_name) between 1 and 40);

-- HP kapster: nama pelanggan, atau nama panggilan walk-in
create or replace view staff_my_appointments as
SELECT a.id, a.start_at, a.end_at, a.duration_min, a.status, a.source, a.notes, a.resource_id, r.name AS resource_name, a.customer_id,
    coalesce(c.name, a.guest_name) AS customer_name, c.notes AS customer_notes, a.arrived_at, a.service_started_at, a.service_ended_at,
    a.status_changed_at, (a.status_changed_by = auth.uid()) AS changed_by_me, a.change_request, a.change_requested_at,
    ARRAY(SELECT s.service_id FROM appointment_services s WHERE s.appointment_id = a.id) AS service_ids
FROM appointments a JOIN resources r ON r.id = a.resource_id LEFT JOIN customers c ON c.id = a.customer_id
WHERE a.staff_id = my_staff_id();

do $$
declare def text; old text;
begin
  -- create_booking_admin: parameter baru p_guest_name (hanya dipakai bila tanpa pelanggan)
  select pg_get_functiondef('create_booking_admin'::regproc) into def;
  old := def;
  def := replace(def, 'p_duration integer DEFAULT NULL::integer)', 'p_duration integer DEFAULT NULL::integer, p_guest_name text DEFAULT NULL::text)');
  def := replace(def, $a$  insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, notes)
  values (cid, p_resource_id, p_staff_id, p_start_at, dur, p_source, coalesce(p_notes, ''))$a$,
    $a$  insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, notes, guest_name)
  values (cid, p_resource_id, p_staff_id, p_start_at, dur, p_source, coalesce(p_notes, ''),
          case when cid is null then nullif(left(trim(coalesce(p_guest_name, '')), 40), '') end)$a$);
  if def = old or position('p_guest_name text' in def) = 0 or position(', guest_name)' in def) = 0 then
    raise exception 'Patch create_booking_admin tidak menemukan teks';
  end if;
  drop function create_booking_admin(uuid, uuid, timestamptz, uuid[], uuid, text, text, appt_source, text, boolean, integer);
  execute def;

  select pg_get_functiondef('booking_conflicts'::regproc) into def;
  old := def;
  def := replace(def, $a$coalesce(c.name, 'Walk-in')$a$, $a$coalesce(c.name, a.guest_name, 'Walk-in')$a$);
  if def = old then raise exception 'Patch booking_conflicts tidak menemukan teks'; end if;
  execute def;
end $$;
