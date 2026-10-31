-- Audit BOOK-5 (1 Nov): status booking bisa lompat (Terjadwal → Selesai tanpa jam layanan), "Tidak datang" bisa dihidupkan
-- lagi oleh kasir, dan "Tidak datang" bisa untuk pelanggan yang sudah datang. Aturan = MOVES di src/lib/domain/status.ts.
create or replace function set_appointment_status(p_id uuid, p_status appt_status) returns void
language plpgsql security definer set search_path = public as $$
declare cur appt_status;
begin
  perform require_role('manager', 'cashier');
  if p_status in ('paid', 'cancelled', 'pending_review', 'no_show') then raise exception 'Gunakan kasir / batalkan / terima booking / tidak datang'; end if;
  select status into cur from appointments where id = p_id for update;
  if not found or cur in ('paid', 'cancelled', 'pending_review') then
    raise exception 'Booking tidak ditemukan, sudah lunas, dibatalkan, atau menunggu persetujuan';
  end if;
  if cur = p_status then return; end if;
  if not ((cur = 'booked' and p_status in ('arrived', 'in_service')) or (cur = 'arrived' and p_status in ('booked', 'in_service'))
          or (cur = 'in_service' and p_status in ('arrived', 'completed')) or (cur = 'completed' and p_status = 'in_service')
          or (cur = 'no_show' and p_status = 'booked' and auth_role() = 'manager')) then
    raise exception 'Status % → % tidak bisa langsung. Ubah satu langkah: Terjadwal → Datang → Mulai → Selesai.%', cur, p_status,
      case when cur = 'no_show' then ' Membatalkan "tidak datang" hanya manajer.' else '' end;
  end if;
  update appointments set status = p_status where id = p_id;
end $$;

do $$
declare def text; old text;
begin
  select pg_get_functiondef('mark_no_show'::regproc) into def; old := def;
  def := replace(def, $a$and status in ('booked', 'arrived') and start_at < now();$a$, $a$and status = 'booked' and start_at < now();$a$);
  def := replace(def, $a$'Hanya booking yang jamnya sudah lewat & belum dilayani yang bisa ditandai tidak datang'$a$,
                      $a$'Hanya booking yang jamnya sudah lewat & pelanggannya belum datang yang bisa ditandai tidak datang (sudah datang lalu pergi = Pulang sebelum dilayani)'$a$);
  if def = old then raise exception 'Patch mark_no_show tidak menemukan teks'; end if;
  execute def;
end $$;
