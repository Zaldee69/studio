-- Hapus / anonimkan pelanggan (manajer; UU PDP & data asal-isi kasir). Riwayat keuangan tetap utuh:
--   • transaksi dilepas dari pelanggan (tampil "Pelanggan umum"), booking lama ikut lepas, booking mendatang dibatalkan;
--   • tanpa riwayat top-up deposit → baris pelanggan DIHAPUS; ada top-up → DIANONIMKAN & disembunyikan (deleted_at);
--   • ditolak bila saldo deposit masih ada.
-- Satu-satunya pengecualian immutability: customer_id transaksi/booking lunas boleh dikosongkan, hanya dari fungsi ini
-- (app.forget_customer), dan tercatat di audit.

alter table customers add column deleted_at timestamptz;

create or replace function guard_tx_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Transaksi tidak bisa dihapus; gunakan void'; end if;
  if old.voided_at is not null and new.customer_id is not distinct from old.customer_id then raise exception 'Transaksi sudah di-void'; end if;
  if (to_jsonb(new) - 'voided_at' - 'void_reason' - 'customer_id') <> (to_jsonb(old) - 'voided_at' - 'void_reason' - 'customer_id') then
    raise exception 'Transaksi immutable';
  end if;
  if new.customer_id is distinct from old.customer_id
     and (new.customer_id is not null or current_setting('app.forget_customer', true) is distinct from 'on') then
    raise exception 'Transaksi immutable';
  end if;
  return new;
end $$;

do $$
declare def text; old text;
begin
  select pg_get_functiondef('guard_appt_paid'::regproc) into def;
  old := def;
  def := replace(def, $a$and current_setting('app.via_void', true) is distinct from 'on' then$a$,
    $a$and current_setting('app.via_void', true) is distinct from 'on'
     and not (current_setting('app.forget_customer', true) = 'on' and new.customer_id is null
              and (new.status, new.start_at, new.duration_min, new.resource_id, new.staff_id)
                  is not distinct from (old.status, old.start_at, old.duration_min, old.resource_id, old.staff_id)) then$a$);
  if def = old then raise exception 'Patch guard_appt_paid tidak menemukan teks'; end if;
  execute def;

  select pg_get_functiondef('delete_my_account'::regproc) into def;
  old := def;
  def := replace(def, $a$notes = '' where id = cid;$a$, $a$notes = '', deleted_at = now() where id = cid;$a$);
  if def = old then raise exception 'Patch delete_my_account tidak menemukan teks'; end if;
  execute def;
end $$;

-- Inti (tanpa cek peran; dipakai RPC manajer & pembersihan di bawah). Kembalikan 'deleted' / 'anonymized'.
create function forget_customer_core(p_id uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare bal bigint;
begin
  if not exists (select 1 from customers where id = p_id and deleted_at is null) then raise exception 'Pelanggan tidak ditemukan'; end if;
  bal := coalesce((select deposit_balance from customer_stats where customer_id = p_id), 0);
  if bal > 0 then raise exception 'Saldo deposit masih Rp% — habiskan/kembalikan dulu', to_char(bal, 'FM999G999G999'); end if;
  -- alasan dicatat terpisah; penghapusan/anonimisasi barisnya sendiri dicatat oleh trigger audit_customers
  insert into audit_log (entity, entity_id, action, changes)
  values ('customers', p_id, 'forget', jsonb_build_object('reason', trim(p_reason)));
  update appointments set status = 'cancelled', cancel_reason = 'Data pelanggan dihapus'
  where customer_id = p_id and status in ('pending_review', 'booked') and start_at > now();
  perform set_config('app.forget_customer', 'on', true);
  update transactions set customer_id = null where customer_id = p_id;
  update appointments set customer_id = null where customer_id = p_id;
  update profiles set active = false, full_name = '', email = null, phone = null, customer_id = null where customer_id = p_id;
  perform set_config('app.forget_customer', 'off', true);
  if exists (select 1 from deposit_topups where customer_id = p_id) then
    update customers set name = 'Pelanggan dihapus', whatsapp = null, email = null, notes = '', promo_opt_out = true, deleted_at = now()
    where id = p_id;
    return 'anonymized';
  end if;
  delete from customers where id = p_id;
  return 'deleted';
end $$;
revoke execute on function forget_customer_core(uuid, text) from public, anon, authenticated;

create function forget_customer(p_id uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Alasan wajib diisi'; end if;
  return forget_customer_core(p_id, p_reason);
end $$;
revoke execute on function forget_customer(uuid, text) from public, anon;

-- Pembersihan data asal-isi dari kasir: nama satu huruf berulang ("A", "Aa", "Aaa", "B", "Bb", …), tanpa akun,
-- tanpa catatan, tanpa saldo deposit. Nama sungguhan (mis. "Ama", "Agung") tidak tersentuh.
do $$
declare c record; n int := 0;
begin
  for c in select cu.id from customers cu
           where cu.deleted_at is null and lower(trim(cu.name)) ~ '^([a-z])\1{0,2}$' and coalesce(cu.notes, '') = ''
             and not exists (select 1 from profiles p where p.customer_id = cu.id)
             and coalesce((select deposit_balance from customer_stats s where s.customer_id = cu.id), 0) <= 0
  loop
    perform forget_customer_core(c.id, 'Pembersihan nama asal-isi (walk-in)');
    n := n + 1;
  end loop;
  raise notice 'Pelanggan asal-isi dibersihkan: %', n;
end $$;
