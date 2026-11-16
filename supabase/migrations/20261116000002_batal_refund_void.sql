-- Koreksi void yang salah centang refund: manajer boleh mengosongkan refund_date (jejak di audit_log).
-- cash_closings lama TIDAK diubah; ringkasan kas tanggal refund_date dihitung ulang dari transactions.
create or replace function guard_tx_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Transaksi tidak bisa dihapus; gunakan void'; end if;
  -- jalur sempit batalkan_refund_void: hanya refund_date -> null pada transaksi void
  if current_setting('app.batal_refund', true) = 'on' and old.voided_at is not null
     and old.refund_date is not null and new.refund_date is null
     and (to_jsonb(new) - 'refund_date') = (to_jsonb(old) - 'refund_date') then
    return new;
  end if;
  if old.voided_at is not null and new.customer_id is not distinct from old.customer_id then raise exception 'Transaksi sudah di-void'; end if;
  if (to_jsonb(new) - 'voided_at' - 'void_reason' - 'customer_id' - 'refund_date') <> (to_jsonb(old) - 'voided_at' - 'void_reason' - 'customer_id' - 'refund_date') then
    raise exception 'Transaksi immutable';
  end if;
  if new.refund_date is distinct from old.refund_date and (old.voided_at is not null or new.voided_at is null) then
    raise exception 'Transaksi immutable';
  end if;
  if new.customer_id is distinct from old.customer_id
     and (new.customer_id is not null or current_setting('app.forget_customer', true) is distinct from 'on') then
    raise exception 'Transaksi immutable';
  end if;
  return new;
end $$;

create function batalkan_refund_void(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = public as $$
declare old_date date;
begin
  perform require_role('manager');
  if length(trim(coalesce(p_alasan, ''))) = 0 then raise exception 'Alasan wajib diisi'; end if;
  select refund_date into old_date from transactions where id = p_id and voided_at is not null and refund_date is not null;
  if not found then raise exception 'Transaksi tidak di-void atau tidak punya refund'; end if;
  perform set_config('app.batal_refund', 'on', true);
  update transactions set refund_date = null where id = p_id;
  perform set_config('app.batal_refund', 'off', true);
  insert into audit_log (entity, entity_id, action, changes)
  values ('transactions', p_id, 'batal_refund', jsonb_build_object('reason', trim(p_alasan), 'refund_date', old_date));
end $$;
revoke execute on function batalkan_refund_void(uuid, text) from public, anon;
grant execute on function batalkan_refund_void(uuid, text) to authenticated;
