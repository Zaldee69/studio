-- Audit BOOK-7 (1 Nov): walk-in dibuat lewat 3 RPC terpisah (buat booking → catat giliran → ubah status). Koneksi putus di
-- tengah = booking tertinggal "Terjadwal" tanpa tanda giliran (dugaan penyebab 2 walk-in basi 3 Okt). Satu fungsi, satu transaksi.
create function start_walk_in(p_resource_id uuid, p_staff_id uuid, p_start_at timestamptz, p_service_ids uuid[],
  p_customer_id uuid default null, p_guest_name text default null, p_force boolean default false,
  p_requested boolean default null, p_queue boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; aid uuid;
begin
  perform require_role('manager', 'cashier');
  r := create_booking_admin(p_resource_id => p_resource_id, p_staff_id => p_staff_id, p_start_at => p_start_at,
         p_service_ids => p_service_ids, p_customer_id => p_customer_id, p_source => 'walk_in',
         p_force => p_force and not p_queue, p_guest_name => p_guest_name);
  if not (r ->> 'saved')::boolean then return r; end if;
  aid := (r ->> 'appointment_id')::uuid;
  if p_requested is not null then perform mark_walk_in_turn(aid, p_requested); end if;
  -- antre: Datang (jam datang tercatat); langsung: Dilayani
  perform set_appointment_status(aid, case when p_queue then 'arrived' else 'in_service' end::appt_status);
  return r;
end $$;
revoke execute on function start_walk_in(uuid, uuid, timestamptz, uuid[], uuid, text, boolean, boolean, boolean) from public, anon;
grant execute on function start_walk_in(uuid, uuid, timestamptz, uuid[], uuid, text, boolean, boolean, boolean) to authenticated;
